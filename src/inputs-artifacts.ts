import * as core from '@actions/core'
import * as path from 'path'
import {Inputs, Methods} from './constants'
import {get, prolong, promote, setup, upload} from './methods'
import {InputsArtifacts} from './inputs-helper'
import process from 'process'

/**
 * Helper to get all the inputs for the action
 */
export function getInputs(): InputsArtifacts {
  const method_type = core.getInput(Inputs.Method, {required: true})

  let method = null
  let password = ''
  let user = ''
  let source = ''
  let tag = ''
  let workflow_name = ''
  let name = ''

  const url = core.getInput(Inputs.Url, {required: true})

  if (method !== Methods.Setup) {
    password = core.getInput(Inputs.Password, {required: true})
    user = core.getInput(Inputs.User, {required: true})
  }

  if (method_type === Methods.Upload) {
    const workspace = process.env['GITHUB_WORKSPACE'] || ''
    const input_source: string = core.getInput(Inputs.Source, {required: true})
    if (path.isAbsolute(input_source)) {
      source = input_source
    } else {
      source = path.join(workspace, input_source)
    }
    method = upload
  } else if (method_type === Methods.Prolong) {
    name = core.getInput(Inputs.Name, {required: true})
    method = prolong
  } else if (method_type === Methods.Promote) {
    name = core.getInput(Inputs.Name, {required: true})
    tag = core.getInput(Inputs.Tag, {required: true})
    method = promote
  } else if (method_type === Methods.Get) {
    workflow_name = core.getInput(Inputs.Workflow_name, {required: true})
    method = get
  } else if (method_type === Methods.Setup) {
    method = setup
  } else {
    throw new Error(`Method ${method} does not exist`)
  }

  return {
    user,
    password,
    url,
    source,
    tag,
    method,
    method_type,
    workflow_name,
    name
  } as InputsArtifacts
}
