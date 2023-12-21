import * as core from '@actions/core'
import * as glob from '@actions/glob'
import async from 'async'
import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios'
import fs from 'fs'
import https from 'https'
import * as path from 'path'
import * as process from 'process'

import {
  artifactsName,
  artifactsPatternName,
  fileUpload,
  fileVersion,
  setIndex,
  setNotice,
  setOutputs
} from './artifacts'
import {InputsArtifacts} from './inputs-helper'
import {artifactsRetry, getCommitSha1} from './utils'

export async function setup(inputs: InputsArtifacts): Promise<void> {
  const name: string = await artifactsName()

  await setOutputs(name, inputs.url)
}

export async function promote(inputs: InputsArtifacts): Promise<void> {
  const staging_regex = new RegExp(
    '(^[^/]+:)(staging|prolonged)-([0-9a-f]+).[^./]+.[0-9]+$'
  )
  const promoted_regex = new RegExp('(^[^/]+:)promoted-([^/]+)$')

  const staging_match = inputs.name.match(staging_regex)
  const promoted_match = inputs.name.match(promoted_regex)

  let artifacts_commit = ''
  let artifacts_prefix = ''
  if (staging_match !== null) {
    core.info('Staging artifacts has been selected')
    artifacts_commit = staging_match[3]
    artifacts_prefix = staging_match[1]
  } else if (promoted_match !== null) {
    core.info('Promoted artifacts has been selected')
    const artifacts_tag = promoted_match[2]
    artifacts_commit = await getCommitSha1(artifacts_tag)
    artifacts_prefix = promoted_match[1]
  } else {
    throw Error(
      "This artifacts doesn't match Scality's artifacts naming standards"
    )
  }

  const myOutput = await getCommitSha1(inputs.tag)
  if (!myOutput.includes(artifacts_commit))
    throw Error(
      `Tag commit ${artifacts_commit} don't match the artifacts commit ${myOutput}`
    )

  const promoted_name = `${artifacts_prefix}promoted-${inputs.tag}`
  const final_url: string = new URL(
    path.join('/copy/', inputs.name, promoted_name),
    inputs.url
  )
    .toString()
    .concat('/')
  const request_config: AxiosRequestConfig = {
    auth: {
      username: inputs.user,
      password: inputs.password
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  }
  core.info(`copying '${inputs.name}' to '${promoted_name}'`)
  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.includes('BUILD COPIED')) {
    throw Error(`Build not copied, ${response.status}: ${response.data}`)
  }
  core.info(`'${inputs.name}' has been copied to '${promoted_name}'`)

  await setOutputs(promoted_name, inputs.url)
  await setNotice(promoted_name, inputs.url)
}

export async function prolong(inputs: InputsArtifacts): Promise<void> {
  const name_regex = new RegExp('(^[^/]+:)staging(-[0-9a-f]+.[^./]+.[0-9]+)$')
  const match = inputs.name.match(name_regex)
  if (match == null) {
    throw Error('The name is not one of Scality actions artifacts')
  }
  const artifacts_target = `${match[1]}prolonged${match[2]}`

  const final_url: string = new URL(
    path.join('/copy/', inputs.name, artifacts_target),
    inputs.url
  )
    .toString()
    .concat('/')
  const request_config: AxiosRequestConfig = {
    auth: {
      username: inputs.user,
      password: inputs.password
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  }
  core.info(`copying '${inputs.name} to '${artifacts_target}`)
  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.includes('BUILD COPIED')) {
    throw Error(`Build not copied, ${response.status}: ${response.data}`)
  }
  core.info(`'${inputs.name}' has been copied to '${artifacts_target}'`)

  await setOutputs(artifacts_target, inputs.url)
  await setNotice(artifacts_target, inputs.url)
}

async function upload_one_file(
  client: AxiosInstance,
  file: string,
  dirname: string,
  name: string,
  url: string
): Promise<AxiosResponse> {
  const run_attempt: string =
    process.env['GITHUB_RUN_ATTEMPT'] === undefined
      ? '1'
      : process.env['GITHUB_RUN_ATTEMPT']

  const artifactsPath: string = file.replace(dirname, '')
  if (run_attempt !== '1') {
    await fileVersion(url, name, client, artifactsPath, run_attempt)
  }
  const uploadUrl: string = new URL(
    path.join('/upload/', name, artifactsPath),
    url
  ).toString()
  return fileUpload(client, uploadUrl, file)
}

export async function upload(inputs: InputsArtifacts): Promise<void> {
  const name: string = await artifactsName()
  let dirname: string
  const requests = []
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

  if (fs.statSync(inputs.source).isFile()) {
    dirname = path.dirname(inputs.source)
  } else {
    dirname = inputs.source
  }
  core.debug(`source: ${inputs.source}`)
  core.debug(`dirname: ${dirname}`)

  const globOptions: glob.GlobOptions = {
    matchDirectories: false
  }
  const globber = await glob.create(inputs.source, globOptions)
  for await (const file of globber.globGenerator()) {
    requests.push(file)
  }

  // if no files are found, log a warning and exit
  if (requests.length === 0) {
    core.warning(`No files found for the provided path: ${inputs.source}`)
    return
  }
  await async.eachLimit(requests, 16, async (file: string, next) => {
    core.info(`Uploading file: ${file}`)
    try {
      await upload_one_file(client, file, dirname, name, inputs.url)
    } catch (e) {
      if (e instanceof Error) {
        return next(e)
      }
    }
    core.info(`${file} has been uploaded`)
    next()
  })

  core.info('All files are uploaded ')

  await setOutputs(name, inputs.url)
  await setNotice(name, inputs.url, requests)
}

export async function get(inputs: InputsArtifacts): Promise<void> {
  const pattern: string = await artifactsPatternName(inputs.workflow_name)
  const request_config: AxiosRequestConfig = {
    auth: {
      username: inputs.user,
      password: inputs.password
    },
    validateStatus(status: number): boolean {
      return status === 302 || status === 404
    },
    maxRedirects: 0
  }
  const final_url: string = new URL(
    path.join('/last_success/', pattern),
    inputs.url
  ).toString()
  artifactsRetry(axios)

  const response: AxiosResponse = await axios.get(final_url, request_config)

  if (response.status === 302) {
    const match: RegExpMatchArray | null = response.headers.location.match(
      /^\/download\/([^/]+)\//
    )
    if (match !== null) {
      core.info('Last successful artifacts has been found')
      const name: string | null = match[1]
      await setOutputs(name, inputs.url)
      await setNotice(name, inputs.url)
    }
  } else {
    throw Error('Last successful artifacts has not been found')
  }
}

export async function index(inputs: InputsArtifacts): Promise<void> {
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
  core.debug(`Indexing args: ${JSON.stringify(inputs.args)}`)
  core.info(`Setting index...`)
  await setIndex(client, inputs.url, inputs.args)
  core.info(`Index has been set`)
}
