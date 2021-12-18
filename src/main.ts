import * as core from '@actions/core'
import * as glob from '@actions/glob'
import fs from 'fs'
import FormData from 'form-data'
import axios from 'axios'
import {AxiosRequestConfig} from 'axios'
import {artifactsName, setOutputs} from './artifacts'

async function setup(): Promise<void> {
  const name: string = await artifactsName()

  await setOutputs(name)
}

async function upload(): Promise<void> {
  const source: string = core.getInput('source')
  const name: string = await artifactsName()
  const user: string = core.getInput('user')
  const url: string = core.getInput('url')
  const password: string = core.getInput('password')

  const globber = await glob.create(source)
  for await (const file of globber.globGenerator()) {
    const stat: fs.Stats = await fs.statSync(file)

    if (stat.isFile()) {
      const form: FormData = new FormData()
      const request_config: AxiosRequestConfig = {
        headers: {
          ...form.getHeaders()
        },
        auth: {
          username: user,
          password: password
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }

      form.append('file', fs.createReadStream(file))
      core.info(`Uploading file: ${file}`)
      axios.put(
        `${url}/upload/${name}/${file.replace(source, '')}`,
        form,
        request_config
      )
      .then((response) => {
        core.info(`${file} has been uploaded`)
      })
      .catch((error) => {
          throw error
      })
    }
  }
  await setOutputs(name)
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
