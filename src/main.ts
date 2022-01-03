import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import * as path from 'path'
import * as process from 'process'
import {artifactsName, fileUpload, setNotice, setOutputs} from './artifacts'
import axios, {AxiosError, AxiosRequestConfig, AxiosResponse} from 'axios'
import fs from 'fs'

async function setup(): Promise<void> {
  const name: string = await artifactsName()
  const url: string = core.getInput('url')

  await setOutputs(name, url)
}

async function promote(): Promise<void> {
  let myOutput = ''
  const options: exec.ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      myOutput += data.toString()
    }
  }

  const user: string = core.getInput('user')
  const password: string = core.getInput('password')
  const url: string = core.getInput('url')
  const name: string = core.getInput('name')
  const tag: string = core.getInput('tag')

  const staging_regex = new RegExp(
    '(^[^/]+:)(staging|prolonged)-([0-9a-f]+).[^./]+.[0-9]+.[0-9]+$'
  )
  const promoted_regex = new RegExp('(^[^/]+:)promoted-([^/]+)$')

  const staging_match = name.match(staging_regex)
  const promoted_match = name.match(promoted_regex)

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
  await exec.exec('git', ['rev-list', '-n', '1', tag], options)
  if (!myOutput.includes(artifacts_commit))
    throw Error(
      `Tag commit ${artifacts_commit} don't match the artifacts commit ${myOutput}`
    )

  const promoted_name = `${artifacts_prefix}promoted-${tag}`
  const final_url: string = new URL(
    path.join('/copy/', name, promoted_name),
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
  const response = await axios.get(final_url, request_config)
  if (response.status !== 200 || !response.data.includes('BUILD COPIED')) {
    throw Error(`Build not copied, ${response.status}: ${response.data}`)
  }
  await setOutputs(promoted_name, url)
  await setNotice(promoted_name, url)
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

async function upload_one_file(
  nb_try: number,
  file: string,
  dirname: string,
  name: string,
  url: string,
  user: string,
  password: string
): Promise<AxiosResponse> {
  if (nb_try === 0) {
    throw Error(`Number of retry retched for  ${file}`)
  }
  try {
    core.info(`Uploading file: ${file}`)
    const artifactsPath: string = file.replace(dirname, '')
    const uploadUrl: string = new URL(
      path.join('/upload/', name, artifactsPath),
      url
    ).toString()
    return fileUpload(uploadUrl, user, password, file)
  } catch (error: unknown) {
    if (
      axios.isAxiosError(error) &&
      (error as AxiosError<unknown, unknown>).response?.status === 400
    ) {
      core.info('Error 400 retry uploading')
      return upload_one_file(
        nb_try - 1,
        file,
        dirname,
        name,
        url,
        user,
        password
      )
    }
    throw error
  }
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
    requests.push(upload_one_file(4, file, dirname, name, url, user, password))
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
    } else if (method === 'promote') {
      await promote()
    } else {
      throw new Error(`Method ${method} does not exist`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
