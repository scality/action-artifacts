import * as core from '@actions/core'
import {artifactsName, setOutputs} from './artifacts'

async function setup(): Promise<void> {
  const name: string = await artifactsName()

  await setOutputs(name)
}

async function run(): Promise<void> {
  try {
    const method: string = core.getInput('method')

    core.info(`Method ${method} has been selected`)

    if (method === 'setup') {
      await setup()
    } else {
      throw new Error(`Method ${method} does not exist`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
