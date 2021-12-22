import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as path from 'path'
import * as process from 'process'
import {artifactsName, fileUpload, setNotice, setOutputs} from './artifacts'
import axios, {AxiosRequestConfig, AxiosResponse} from 'axios'
import fs from 'fs'

async function setup(): Promise<void> {
  const name: string = await artifactsName()
  const url: string = core.getInput('url')

  await setOutputs(name, url)
}

async function prolong(): Promise<void> {
  const user: string = core.getInput('user')
  const password: string = core.getInput('password')
  const url: string = core.getInput('url')
  const name: string = core.getInput('name')

  const name_regex = new RegExp(
    '(^[^/]+:)staging(-[0-9a-f]+.[^./]+.[0-9]+.[0-9]+)$'
  )
  const match = name.match(name_regex)
  if (match == null) {
    throw Error('The name is not one of Scality actions artifacts')
  }
  const artifacts_target = `${match[1]}prolonged${match[2]}`

  const final_url: string = new URL(
    path.join('/copy/', name, artifacts_target),
    url
  )
    .toString()
    .concat('/')
  const request_config: AxiosRequestConfig = {
    auth: {
      username: user,
      password
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  }
  core.info(`copying '${name} to '${artifacts_target}`)
  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.includes('BUILD COPIED')) {
    throw Error(`Build not copied, ${response.status}: ${response.data}`)
  }
  await setOutputs(name, artifacts_target)
  await setOutputs(url, artifacts_target)
}

async function upload(): Promise<void> {
  const name: string = await artifactsName()
  const user: string = core.getInput('user')
  const url: string = core.getInput('url')
  const password: string = core.getInput('password')
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  const source: string = path.join(workspace, core.getInput('source'))
  const requests: Promise<AxiosResponse>[] = []
  let dirname: string

  if (fs.statSync(source).isFile()) {
    dirname = path.dirname(source)
  } else {
    dirname = source
  }
  core.debug(`source: ${source}`)
  core.debug(`dirname: ${dirname}`)

  const globOptions: glob.GlobOptions = {
    matchDirectories: false
  }
  const globber = await glob.create(source, globOptions)
  for await (const file of globber.globGenerator()) {
    try {
      core.info(`Uploading file: ${file}`)
      const artifactsPath: string = file.replace(dirname, '')
      const uploadUrl: string = new URL(
        path.join('/upload/', name, artifactsPath),
        url
      ).toString()
      const response: Promise<AxiosResponse> = fileUpload(
        uploadUrl,
        user,
        password,
        file
      )
      requests.push(response)
    } catch (error) {
      throw error
    }
  }
  core.info('Waiting for all requests to finish')
  await Promise.all(requests)
  core.info('All requests are done')
  await setOutputs(name, url)
  await setNotice(name, url)
}

async function run(): Promise<void> {
  try {
    const method: string = core.getInput('method')

    core.info(`Method ${method} has been selected`)

    if (method === 'setup') {
      await setup()
    } else if (method === 'upload') {
      await upload()
    } else if (method === 'prolong') {
      await prolong()
    } else {
      throw new Error(`Method ${method} does not exist`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
