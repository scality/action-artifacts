import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import axios, {AxiosError, AxiosRequestConfig, AxiosResponse} from 'axios'
import axiosRetry, {
  exponentialDelay,
  isNetworkOrIdempotentRequestError
} from 'axios-retry'
import fs from 'fs'
import https from 'https'

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
  const commit: string = github.context.sha.slice(0, 10)
  const runNumber: number = github.context.runNumber

  return `github:${owner}:${repo}:staging-${commit}.${workflow}.${runNumber}`
}

export async function artifactsPatternName(workflow: string): Promise<string> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo
  const commit: string = github.context.sha.slice(0, 10)
  workflow = await workflowName(workflow)

  return `github:${owner}:${repo}:staging-${commit}.${workflow}`
}

export async function setOutputs(name: string, url: string): Promise<void> {
  core.setOutput('name', name)
  core.setOutput('link', `${url}/builds/${name}`)
}

export async function setNotice(name: string, url: string): Promise<void> {
  core.info(
    `::notice:: Your artifacts has been uploaded here: ${url}/builds/${name}`
  )
}

export function isUploadStatusError(error: AxiosError): boolean {
  return !error.response || error.response.status !== 200
}

export function debugAxiosError(error: AxiosError): void {
  const debug: string =
    `Request on ${error.config.url} failed with ` +
    `code: ${error.code} ` +
    `status: ${error.response?.status} ` +
    `data: ${error.response?.data}`
  core.info(debug)
}

export function retryArtifactsUpload(error: AxiosError): boolean {
  debugAxiosError(error)
  if (isNetworkOrIdempotentRequestError(error) || isUploadStatusError(error)) {
    core.info(`Request on ${error.config.url} can be retried`)
    return true
  }
  return false
}

export async function fileUpload(
  url: string,
  username: string,
  password: string,
  file: string,
  retries = 10
): Promise<AxiosResponse> {
  const body_size: number = fs.statSync(file).size
  const fileStream: fs.ReadStream = fs.createReadStream(file)
  const request_config: AxiosRequestConfig = {
    auth: {
      username,
      password
    },
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
    },
    httpsAgent: new https.Agent({
      keepAlive: true,
      maxSockets: 20
    })
  }
  axiosRetry(axios, {
    retries,
    retryCondition: retryArtifactsUpload,
    shouldResetTimeout: true,
    retryDelay: exponentialDelay
  })

  return axios.put(url, fileStream, request_config)
}

export async function fileVersion(
  url: string,
  name: string,
  username: string,
  password: string,
  file: string,
  build_attempt: string
): Promise<void> {
  const request_config: AxiosRequestConfig = {
    auth: {
      username,
      password
    }
  }

  const final_url: string = new URL(
    path.join('/version/', build_attempt, name, file),
    url
  ).toString()

  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.endsWith('PASSED\n')) {
    throw Error(`Could not version file: ${file}`)
  }
}
