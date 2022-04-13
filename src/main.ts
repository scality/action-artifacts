import * as core from '@actions/core'
import {getInputs} from './inputs-artifacts'

async function run(): Promise<void> {
  try {
    const inputs = getInputs()

    core.info(`Method ${inputs.method_type} has been selected`)
    await inputs.method(inputs)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
