import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import * as process from 'process'
import {
  artifactsRetry,
  artifactsIndexRequestRetry,
  getCommitSha1,
  workflowRunResponseDataType,
  workflowRunResponseType
} from './utils'
import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios'
import {GitHub} from '@actions/github/lib/utils'
import {InputsArtifacts} from './inputs-helper'
import fs from 'fs'
import https from 'https'

// Files larger than this threshold use multipart upload instead of a single PUT.
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024 // 100 MB
// Each part is 64 MB. Smaller parts reduce the risk of a single stalled TCP
// stream blocking progress, and give more granular retry surface.
const MULTIPART_PART_SIZE = 64 * 1024 * 1024 // 64 MB
// Number of parts uploaded concurrently per file.
// 4 concurrent parts × 8 concurrent files = 32 peak S3 connections.
const MULTIPART_CONCURRENCY = 4

export async function workflowName(
  workflow?: string | undefined
): Promise<string> {
  if (workflow === undefined) {
    workflow = github.context.workflow
  }
  return workflow.replace(/\W/g, '-').replace(/^-/, '')
}

export async function artifactsName(): Promise<string> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo
  const workflow: string = await workflowName()
  const commit: string = (await getCommitSha1('HEAD')).slice(0, 10)
  const runNumber: number = github.context.runNumber

  return `github:${owner}:${repo}:staging-${commit}.${workflow}.${runNumber}`
}

export async function artifactsPatternName(workflow: string): Promise<string> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo
  const commit: string = (await getCommitSha1('HEAD')).slice(0, 10)
  workflow = await workflowName(workflow)

  return `github:${owner}:${repo}:staging-${commit}.${workflow}`
}

export async function setOutputs(name: string, url: string): Promise<void> {
  core.setOutput('name', name)
  core.setOutput('link', `${url}/builds/${name}`)
  core.setOutput('redirect-link', `${url}/redirect/${name}`)
}

export async function setNotice(name: string, url: string): Promise<void> {
  core.info(
    `::notice:: Your artifacts has been uploaded here: ${url}/builds/${name}`
  )
}

export async function fileUpload(
  client: AxiosInstance,
  url: string,
  file: string,
  retries = 10
): Promise<AxiosResponse> {
  const body_size: number = fs.statSync(file).size
  const fileStream: fs.ReadStream = fs.createReadStream(file)
  const request_config: AxiosRequestConfig = {
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    // Workaround regarding Axios memory consuption when
    // uploading large files.
    // To be reverted once the library has provided a better
    // solution
    // https://github.com/axios/axios/issues/4423
    maxRedirects: 0,
    headers: {
      'Content-Length': body_size.toString()
    }
  }
  artifactsRetry(client, retries)

  return client.put(url, fileStream, request_config)
}

// Upload a file directly to S3 using a presigned PUT URL obtained from nginx.
// The data goes runner → S3 without transiting through the nginx proxy.
export async function fileUploadPresigned(
  client: AxiosInstance,
  baseUrl: string,
  buildName: string,
  file: string,
  filePath: string
): Promise<void> {
  const presignUrl = new URL(
    path.join('/presign-upload/', buildName, filePath),
    baseUrl
  ).toString()
  const presignResp = await client.get(presignUrl, {timeout: 30000})
  const s3PutUrl = (presignResp.data as string).trim()
  core.info(`Presigned upload: sending ${file} directly to S3 (bypassing proxy)`)

  const body_size = fs.statSync(file).size
  const fileStream = fs.createReadStream(file)
  // Use raw https.request instead of axios.put to preserve the presigned URL
  // query string exactly. Axios parses URLs via the URL API which decodes
  // %2B → + and re-encodes it as + (space in query strings), corrupting the
  // AWS Signature V2 and causing 403 SignatureDoesNotMatch at Scaleway.
  const s3Url = new URL(s3PutUrl)
  await new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        method: 'PUT',
        hostname: s3Url.hostname,
        port: s3Url.port ? parseInt(s3Url.port) : 443,
        path: s3Url.pathname + s3Url.search,
        headers: {'Content-Length': String(body_size)}
      },
      res => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve()
          } else {
            core.error(
              `Presigned upload: ${file} failed with status ${res.statusCode}: ${body}`
            )
            reject(
              new Error(
                `Presigned upload: ${file} failed with status ${res.statusCode}: ${body}`
              )
            )
          }
        })
      }
    )
    req.on('error', reject)
    fileStream.pipe(req)
  })
}

export type ServerCapabilities = {
  presigned: boolean
  multipart: boolean
}

// Probe the server once to detect which upload routes are available.
// Old nginx deployments (e.g. GCP) return 404 for unknown routes; new ones
// return any other status (200, 400, 401, …) even on invalid probe parameters.
// Both probes run in parallel to minimise latency.
export async function probeServerCapabilities(
  client: AxiosInstance,
  baseUrl: string
): Promise<ServerCapabilities> {
  const probe = async (url: string, params?: object): Promise<boolean> => {
    try {
      const resp = await client.get(url, {
        params,
        validateStatus: () => true,
        timeout: 10000
      })
      return resp.status !== 404
    } catch {
      return false
    }
  }

  const [presigned, multipart] = await Promise.all([
    probe(new URL('/presign-upload/capability-probe/probe.bin', baseUrl).toString()),
    probe(new URL('/presign-upload-part/capability-probe/probe.bin', baseUrl).toString(), {
      partNumber: 1,
      uploadId: 'probe'
    })
  ])

  return {presigned, multipart}
}

export async function fileUploadMultipart(
  client: AxiosInstance,
  baseUrl: string,
  buildName: string,
  file: string,
  filePath: string
): Promise<void> {
  const fileSize = fs.statSync(file).size

  // 1. Initiate multipart upload → get uploadId from S3 XML response.
  const partCount = Math.ceil(fileSize / MULTIPART_PART_SIZE)
  core.info(`Multipart: initiating upload (${partCount} parts) for ${file}`)
  const initiateUrl = new URL(
    path.join('/upload-multipart/initiate/', buildName, filePath),
    baseUrl
  ).toString()
  const initiateResp = await client.post(initiateUrl, null, {
    headers: {'Content-Length': '0'},
    timeout: 60000
  })
  const uploadId = (initiateResp.data as string).match(
    /<UploadId>([^<]+)<\/UploadId>/
  )?.[1]
  if (!uploadId) {
    throw new Error(
      `Multipart initiate failed for ${file}: could not extract uploadId`
    )
  }
  core.info(`Multipart: initiated, uploadId obtained for ${file}`)

  // 2. Upload all parts in parallel (MULTIPART_CONCURRENCY at a time).
  // Each part: GET a presigned S3 URL from the proxy (auth + tiny payload),
  // then PUT the part body directly to S3 — data bypasses the nginx proxy
  // and the node NIC entirely.
  const etags: {partNumber: number; etag: string}[] = []
  const presignPartBaseUrl = new URL(
    path.join('/presign-upload-part/', buildName, filePath),
    baseUrl
  ).toString()

  const uploadPart = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * MULTIPART_PART_SIZE
    const end = Math.min(start + MULTIPART_PART_SIZE, fileSize) - 1
    const partSize = end - start + 1
    core.info(
      `Multipart: uploading part ${partNumber}/${partCount} (${Math.round(partSize / 1e6)}MB) for ${file}`
    )

    // Step 2a — get presigned URL (authenticated, lightweight).
    const presignResp = await client.get(presignPartBaseUrl, {
      params: {partNumber, uploadId},
      timeout: 30000
    })
    const s3PartUrl = (presignResp.data as string).trim()
    core.info(
      `Multipart: part ${partNumber}/${partCount} uploading directly to S3 (bypassing proxy): ${new URL(s3PartUrl).hostname}`
    )

    // Step 2b — PUT part directly to S3 using raw https.request.
    // Axios re-encodes presigned URL query strings via the URL API, which
    // decodes %2B → + and re-serialises it as + (space in query strings).
    // This corrupts the AWS Signature V2 and causes 403 at Scaleway.
    // Using https.request preserves the query string exactly as returned
    // by the proxy.
    const partStream = fs.createReadStream(file, {start, end})
    const s3Url = new URL(s3PartUrl)
    const etag = await new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          method: 'PUT',
          hostname: s3Url.hostname,
          port: s3Url.port ? parseInt(s3Url.port) : 443,
          path: s3Url.pathname + s3Url.search,
          headers: {'Content-Length': String(partSize)}
        },
        res => {
          let body = ''
          res.on('data', (chunk: Buffer) => {
            body += chunk.toString()
          })
          res.on('end', () => {
            if (res.statusCode === 200) {
              const tag = res.headers['etag'] as string
              if (!tag) {
                reject(
                  new Error(`No ETag returned for part ${partNumber} of ${file}`)
                )
              } else {
                resolve(tag)
              }
            } else {
              reject(
                new Error(
                  `Multipart: part ${partNumber}/${partCount} failed with status ${res.statusCode}: ${body}`
                )
              )
            }
          })
        }
      )
      req.on('error', reject)
      partStream.pipe(req)
    })
    etags.push({partNumber, etag})
    core.info(`Multipart: part ${partNumber}/${partCount} done for ${file}`)
  }

  try {
    const queue = Array.from({length: partCount}, (_, i) => i + 1)
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const partNumber = queue.shift()
        if (partNumber === undefined) break
        await uploadPart(partNumber)
      }
    }
    await Promise.all(
      Array.from({length: Math.min(MULTIPART_CONCURRENCY, partCount)}, worker)
    )
  } catch (e) {
    // Abort the multipart upload so S3 does not keep orphaned parts.
    const abortUrl = new URL(
      path.join('/upload-multipart/abort/', buildName, filePath),
      baseUrl
    ).toString()
    try {
      await client.delete(abortUrl, {params: {uploadId}, timeout: 60000})
    } catch (err) {
      core.warning(`Multipart abort failed: ${err}`)
    }
    throw e
  }

  // 3. Complete the multipart upload with sorted part list.
  core.info(`Multipart: completing upload for ${file}`)
  const xml = `<CompleteMultipartUpload>${etags
    .sort((a, b) => a.partNumber - b.partNumber)
    .map(
      p =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`
    )
    .join('')}</CompleteMultipartUpload>`

  const completeUrl = new URL(
    path.join('/upload-multipart/complete/', buildName, filePath),
    baseUrl
  ).toString()
  await client.post(completeUrl, xml, {
    params: {uploadId},
    headers: {'Content-Type': 'application/xml'},
    timeout: 120000
  })
}

export async function fileVersion(
  url: string,
  name: string,
  client: AxiosInstance,
  file: string,
  build_attempt: string
): Promise<void> {
  const final_url: string = new URL(
    path.join('/version/', build_attempt, name, file),
    url
  ).toString()

  const response = await client.get(final_url)
  if (response.status !== 200 || !response.data.endsWith('PASSED\n')) {
    throw Error(`Could not version file: ${file}`)
  }
}

export async function setDefaultIndex(inputs: InputsArtifacts): Promise<void> {
  const client: AxiosInstance = axios.create({
    auth: {
      username: inputs.user,
      password: inputs.password
    },
    httpsAgent: new https.Agent({
      keepAlive: true,
      maxSockets: 20
    })
  })
  let branch: string
  let sha: string

  if (github.context.eventName === 'pull_request') {
    branch = github.context.payload.pull_request?.head?.ref as string
    sha = github.context.payload.pull_request?.head?.sha as string
  } else {
    branch = github.context.ref
      .replace('refs/heads/', '')
      .replace('refs/tags/', '')
    sha = github.context.sha
  }
  // Is the build reference on a tag or a branch
  const shortSha: string = sha.substring(0, 10)
  const refType: string = process.env['GITHUB_REF_TYPE'] || 'branch'
  const metadata: object = {
    commit: sha,
    shortcommit: shortSha,
    branch
  }
  // Adding another set of metadata that are equal to action
  // in terms of key naming or without any modification to the value
  const actionsMetadata: object = {
    ref: github.context.ref,
    [refType]: github.context.ref,
    sha,
    event_name: github.context.eventName,
    actor: github.context.actor.replace('[bot]', ''),
    run_number: github.context.runNumber
  }
  core.debug(JSON.stringify(metadata))
  core.debug(JSON.stringify(actionsMetadata))
  core.info('Uploading default index...')
  await setIndex(client, inputs.url, metadata)
  await setIndex(client, inputs.url, actionsMetadata)

  core.info('Index has been uploaded')
}

export async function getWorkflowRun(): Promise<workflowRunResponseDataType> {
  const token: string = core.getInput('token')
  const octokit: InstanceType<typeof GitHub> = github.getOctokit(token)

  const workflowRun: workflowRunResponseType =
    await octokit.rest.actions.getWorkflowRun({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      run_id: github.context.runId
    })

  return workflowRun.data
}

export async function setIndex(
  client: AxiosInstance,
  url: string,
  metadata: object
): Promise<AxiosResponse> {
  const owner: string = github.context.repo.owner.toLowerCase()
  const repo: string = github.context.repo.repo.toLowerCase()
  const name: string = await artifactsName()
  const workflow: string = await workflowName()
  const workflowRun: workflowRunResponseDataType = await getWorkflowRun()
  const createdAt: string = workflowRun.created_at
  const metadataUrl: string = new URL(
    path.join(
      '/add_metadata/',
      'github',
      owner,
      repo,
      workflow,
      createdAt,
      name
    ),
    url
  )
    .toString()
    .concat('/')
    .replace(/\/$/, '')

  core.debug(metadataUrl)
  const requestConfig: AxiosRequestConfig = {
    params: metadata,
    validateStatus(status: number): boolean {
      return status === 200
    }
  }
  artifactsIndexRequestRetry(client, 10)
  return await client.get(metadataUrl, requestConfig)
}
