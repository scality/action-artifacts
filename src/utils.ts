import * as core from '@actions/core'
import {AxiosError, AxiosInstance, AxiosRequestConfig, AxiosStatic} from 'axios'
import {
  GetResponseDataTypeFromEndpointMethod,
  GetResponseTypeFromEndpointMethod
} from '@octokit/types'
import {Octokit} from '@octokit/rest'
import fs from 'fs'
import * as git from 'isomorphic-git'
import {context} from '@actions/github'

const octokit = new Octokit()

export type workflowRunResponseType = GetResponseTypeFromEndpointMethod<
  typeof octokit.actions.getWorkflowRun
>

export type workflowRunResponseDataType = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.actions.getWorkflowRun
>

export function debugAxiosError(error: AxiosError): void {
  const debug: string =
    `Request on ${error.config?.url ?? 'unknown'} failed with ` +
    `code: ${error.code} ` +
    `status: ${error.response?.status} ` +
    `data: ${error.response?.data}`
  core.info(debug)
}

export function retryArtifacts(error: AxiosError): boolean {
  if (error.request.url.includes('add_metadata')) {
    core.info('Verifying if request on add_metadata has been successful')
    return (
      error.response?.status === 200 &&
      (error.response?.data as string).endsWith('PASSED\n')
    )
  } else {
    return (
      error.code !== 'ECONNABORTED' &&
      (!error.response ||
        (error.response.status >= 500 && error.response.status <= 599))
    )
  }
}

export function exponentialDelay(retryNumber = 0): number {
  const delay = Math.pow(2, retryNumber) * 100
  const randomSum = delay * 0.2 * Math.random()
  return delay + randomSum
}

export function artifactsRetry(
  client: AxiosInstance | AxiosStatic,
  retries = 10
): void {
  let counter = 0
  const maxRetry: number = retries
  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    debugAxiosError(error)
    const config: AxiosRequestConfig = error.config || {}
    if (counter < maxRetry && retryArtifacts(error)) {
      const delay: number = exponentialDelay(counter)
      counter++
      core.info(
        `Request on ${config.url} will be retried in ${Math.round(
          delay
        )} milliseconds`
      )
      if (config.data instanceof fs.ReadStream) {
        const file: string = config.data.path.toString()
        config.data.destroy()
        config.data = fs.createReadStream(file)
      }
      return new Promise(resolve =>
        setTimeout(() => resolve(client(config)), delay)
      )
    }
    return Promise.reject(error)
  })
}

export async function getCommitSha1(revspec: string): Promise<string> {
  let sha = ''
  try {
    const commits = await git.log({
      fs,
      dir: process.cwd(),
      ref: revspec,
      depth: 1
    })
    sha = commits[0].oid
  } catch (e) {
    core.debug('getCommitSha1 failed, fallback to context.sha')
    sha = context.sha
  }

  return sha
}
