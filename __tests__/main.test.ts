import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {afterEach, beforeEach, test, expect} from '@jest/globals'
import fs from 'fs'
import os from 'os'

beforeEach(() => {
  process.env['GITHUB_REPOSITORY'] = 'owner/repo'
  process.env['GITHUB_WORKFLOW'] = 'worklow name'
  process.env['GITHUB_SHA'] = '650d9185ff9ad990de710b078a0579eb2bd64bd8'
  process.env['GITHUB_RUN_NUMBER'] = Math.floor(Math.random() * 100).toString()
  process.env['GITHUB_RUN_ATTEMPT'] = '1'

  if (process.env['INPUT_URL'] == undefined) {
    process.env['INPUT_URL'] = 'http://artifacts'
  }
  const tmpDir: string = fs.mkdtempSync(
    path.join(os.tmpdir(), 'test-action-artifacts')
  )
  process.env['GITHUB_WORKSPACE'] = tmpDir
})

afterEach(() => {
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  if (workspace) {
    fs.rmSync(workspace, {recursive: true})
  }
})

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs setup', () => {
  process.env['INPUT_METHOD'] = 'setup'

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})

test('test runs upload', () => {
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  const source: string = 'artifacts'
  process.env['INPUT_METHOD'] = 'upload'

  fs.mkdirSync(path.join(workspace, source))
  fs.writeFileSync(path.join(workspace, source, 'file.txt'), 'content')

  process.env['INPUT_SOURCE'] = source

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  const output: string = cp.execFileSync(np, [ip], options).toString()
  console.log(output)
  // output should not contain the warning mentioning that the file is not found
  expect(output).not.toContain('No files found for the provided path')
})

test('test runs upload absolute path', () => {
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  const source: string = path.join(workspace, 'artifacts')
  process.env['INPUT_METHOD'] = 'upload'

  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, 'file.txt'), 'content')

  process.env['INPUT_SOURCE'] = source

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})

test('test runs get method', () => {
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  const source: string = 'artifacts'
  process.env['INPUT_METHOD'] = 'upload'

  fs.mkdirSync(path.join(workspace, source))
  fs.writeFileSync(path.join(workspace, source, '.final_status'), 'SUCCESSFUL')

  process.env['INPUT_SOURCE'] = source

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  let options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())

  process.env['INPUT_METHOD'] = 'get'
  process.env['INPUT_WORKFLOW-NAME'] = process.env['GITHUB_WORKFLOW']
  process.env['INPUT_SOURCE'] = ''

  options = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})

test('test runs upload with no file in folder', () => {
  const workspace: string = process.env['GITHUB_WORKSPACE'] || ''
  const source: string = 'artifacts'
  process.env['INPUT_METHOD'] = 'upload'

  fs.mkdirSync(path.join(workspace, source))

  process.env['INPUT_SOURCE'] = source

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  const output: string = cp.execFileSync(np, [ip], options).toString()
  console.log(output)
  expect(output).toContain('No files found for the provided path')
})
