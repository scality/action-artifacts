import * as core from '@actions/core'
import * as fs from 'fs'
import * as os from 'os'
import {InputsArtifacts} from './inputs-helper'
import {getInputs} from './inputs-artifacts'
import {setDefaultIndex} from './artifacts'

async function run(inputs: InputsArtifacts): Promise<void> {
  try {
    core.info(`Method ${inputs.method_type} has been selected`)
    await inputs.method(inputs)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function post(inputs: InputsArtifacts): Promise<void> {
  try {
    await setDefaultIndex(inputs)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

const inputs = getInputs()
const IsPost = !!process.env['STATE_isPost']

// Main
if (!IsPost) {
  run(inputs)
  // Publish a variable so that when the POST action runs, it can determine it should run the post logic.
  // This is necessary since we don't have a separate entry point
  let GH_STATE_FILE = ''
  if (process?.env?.GITHUB_STATE) {
    //appendFileSync only accepts string, not 'undefined'.
    GH_STATE_FILE = process.env.GITHUB_STATE
  }
  fs.appendFileSync(GH_STATE_FILE, `isPost=true${os.EOL}`, {encoding: 'utf8'})
}

// Post
else {
  post(inputs)
}
