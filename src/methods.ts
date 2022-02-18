import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import * as path from 'path'
import {artifactsName, fileUpload, setNotice, setOutputs} from './artifacts'
import axios, {AxiosError, AxiosRequestConfig, AxiosResponse} from 'axios'
import {InputsArtifacts} from './inputs-helper'
import async from 'async'
import fs from 'fs'

export async function setup(inputs: InputsArtifacts): Promise<void> {
  const name: string = await artifactsName()

  await setOutputs(name, inputs.url)
}

export async function promote(inputs: InputsArtifacts): Promise<void> {
  let myOutput = ''
  const options: exec.ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      myOutput += data.toString()
    }
  }

  const staging_regex = new RegExp(
    '(^[^/]+:)(staging|prolonged)-([0-9a-f]+).[^./]+.[0-9]+.[0-9]+$'
  )
  const promoted_regex = new RegExp('(^[^/]+:)promoted-([^/]+)$')

  const staging_match = inputs.workflow_name.match(staging_regex)
  const promoted_match = inputs.workflow_name.match(promoted_regex)

  let artifacts_commit = ''
  let artifacts_prefix = ''
  if (staging_match !== null) {
    artifacts_commit = staging_match[3]
    artifacts_prefix = staging_match[1]
  } else if (promoted_match !== null) {
    const artifacts_tag = promoted_match[2]
    myOutput = ''
    await exec.exec('git', ['rev-list', '-n', '1', artifacts_tag], options)
    artifacts_commit = myOutput
    artifacts_prefix = promoted_match[1]
  } else {
    throw Error(
      "This artifacts doesn't match Scality's artifacts naming standards"
    )
  }

  myOutput = ''
  await exec.exec('git', ['rev-list', '-n', '1', inputs.tag], options)
  if (!myOutput.includes(artifacts_commit))
    throw Error(
      `Tag commit ${artifacts_commit} don't match the artifacts commit ${myOutput}`
    )

  const promoted_name = `${artifacts_prefix}promoted-${inputs.tag}`
  const final_url: string = new URL(
    path.join('/copy/', inputs.workflow_name, promoted_name),
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
  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.includes('BUILD COPIED')) {
    throw Error(`Build not copied, ${response.status}: ${response.data}`)
  }
  await setOutputs(promoted_name, inputs.url)
  await setNotice(promoted_name, inputs.url)
}

export async function prolong(inputs: InputsArtifacts): Promise<void> {
  const name_regex = new RegExp(
    '(^[^/]+:)staging(-[0-9a-f]+.[^./]+.[0-9]+.[0-9]+)$'
  )
  const match = inputs.workflow_name.match(name_regex)
  if (match == null) {
    throw Error('The name is not one of Scality actions artifacts')
  }
  const artifacts_target = `${match[1]}prolonged${match[2]}`

  const final_url: string = new URL(
    path.join('/copy/', inputs.workflow_name, artifacts_target),
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
  core.info(`copying '${inputs.workflow_name} to '${artifacts_target}`)
  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.includes('BUILD COPIED')) {
    throw Error(`Build not copied, ${response.status}: ${response.data}`)
  }
  await setOutputs(inputs.workflow_name, artifacts_target)
  await setOutputs(inputs.url, artifacts_target)
}

async function upload_one_file(
  nb_try: number,
  file: string,
  dirname: string,
  name: string,
  inputs: InputsArtifacts
): Promise<AxiosResponse> {
  if (nb_try === 0) {
    throw Error(`Number of retry retched for  ${file}`)
  }
  try {
    const artifactsPath: string = file.replace(dirname, '')
    const uploadUrl: string = new URL(
      path.join('/upload/', name, artifactsPath),
      inputs.url
    ).toString()
    return fileUpload(uploadUrl, inputs.user, inputs.password, file)
  } catch (error: unknown) {
    if (
      axios.isAxiosError(error) &&
      (error as AxiosError<unknown, unknown>).response?.status === 400
    ) {
      core.info('Error 400 retry uploading')
      return upload_one_file(nb_try - 1, file, dirname, name, inputs)
    }
    throw error
  }
}

export async function upload(inputs: InputsArtifacts): Promise<void> {
  const name: string = await artifactsName()
  let dirname: string
  const requests = []

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

  await async.eachLimit(requests, 16, (async (file: string, next) => {
    core.info(`Uploading file: ${file}`)
    await upload_one_file(4, file, dirname, name, inputs)
    core.info(`${file} has been uploaded`)
    next()
  }))

  core.info('All files are uploaded ')

  await setOutputs(name, inputs.url)
  await setNotice(name, inputs.url)
}
