import * as core from '@actions/core'
import * as github from '@actions/github'
import * as path from 'path'
import * as process from 'process'
import {
  artifactsRetry,
  workflowRunResponseDataType,
  workflowRunResponseType
} from './utils'
import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios'
import {GitHub} from '@actions/github/lib/utils'
import {InputsArtifacts} from './inputs-helper'
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
  const sha: string = github.context.sha
  const shortSha: string = sha.substring(0, 10)
  const ref: string = github.context.ref
    .replace('refs/heads/', '')
    .replace('refs/tags/', '')
  // Is the build on a tag or a branch
  const refType: string = process.env['GITHUB_REF_TYPE'] || 'branch'
  const metadata: object = {
    commit: sha,
    shortcommit: shortSha,
    [refType]: ref
  }
  // Adding another set of metadata that are equal to action
  // in terms of key naming or without any modification to the value
  const actionsMetadata: object = {
    ref: github.context.ref,
    [refType]: github.context.ref,
    sha,
    event_name: github.context.eventName,
    actor: github.context.actor,
    run_number: github.context.runNumber
  }
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
  const response: AxiosResponse = await client.get(metadataUrl, requestConfig)
  if (!response.data.endsWith('PASSED\n')) {
    throw Error(`Indexing failed`)
  }

  return response
}
