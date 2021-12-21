import * as core from '@actions/core'
import * as github from '@actions/github'
import * as process from 'process'
import axios, {AxiosRequestConfig, AxiosResponse} from 'axios'
import axiosRetry from 'axios-retry'
import fs from 'fs'

export async function artifactsName(): Promise<string> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo
  const workflow: string = github.context.workflow
    .replace(/\W/g, '-')
    .replace(/^-/, '')
  const commit: string = github.context.sha.slice(0, 10)
  const runNumber: number = github.context.runNumber
  // run attempt is not available through GitHub toolkit yet.
  const runAttempt: string | undefined = process.env['GITHUB_RUN_ATTEMPT']

  return `github:${owner}:${repo}:staging-${commit}.${workflow}.${runNumber}.${runAttempt}`
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
  url: string,
  username: string,
  password: string,
  file: string,
  retries = 3
): Promise<AxiosResponse> {
  const fileStream: fs.ReadStream = fs.createReadStream(file)
  const request_config: AxiosRequestConfig = {
    auth: {
      username,
      password
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  }
  axiosRetry(axios, {
    retries
  })

  return axios.put(url, fileStream, request_config)
}
