import * as core from '@actions/core'
import * as coreCommand from '@actions/core/lib/command'
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
  coreCommand.issueCommand('save-state', {name: 'isPost'}, 'true')
}

// Post
else {
  post(inputs)
}
