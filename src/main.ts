import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as path from 'path'
import * as process from 'process'
import {artifactsName, fileUpload, setNotice, setOutputs} from './artifacts'
import fs from 'fs'

async function setup(): Promise<void> {
  const name: string = await artifactsName()
  const url: string = core.getInput('url')

  await setOutputs(name, url)
}

async function upload(): Promise<void> {
  const name: string = await artifactsName()
  const user: string = core.getInput('user')
  const url: string = core.getInput('url')
  const password: string = core.getInput('password')
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  const source: string = path.join(workspace, core.getInput('source'))
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

      await fileUpload(uploadUrl, user, password, file)
    } catch (error) {
      throw error
    }
    core.info(`${file} has been uploaded`)
  }
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
    } else {
      throw new Error(`Method ${method} does not exist`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
