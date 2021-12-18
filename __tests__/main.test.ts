import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {test} from '@jest/globals'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs setup', () => {
  process.env['INPUT_METHOD'] = 'setup'
  process.env['INPUT_URL'] = 'http://artifacts'
  process.env['GITHUB_REPOSITORY'] = 'owner/repo'
  process.env['GITHUB_WORKFLOW'] = 'worklow name'
  process.env['GITHUB_SHA'] = '650d9185ff9ad990de710b078a0579eb2bd64bd8'
  process.env['GITHUB_RUN_NUMBER'] = '42'
  process.env['GITHUB_RUN_ATTEMPT'] = '1'
  process.env['GITHUB_EVENT_NAME'] = 'pull_request'

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})

test('test runs upload', () => {
  process.env['INPUT_METHOD'] = 'upload'
  process.env['INPUT_SOURCE'] = '/tmp/'
  // process.env['INPUT_URL'] = 'http://artifacts'
  // process.env['INPUT_USER'] = 'username-pass'
  // process.env['INPUT_PASSWORD'] = 'pass'
  process.env['GITHUB_REPOSITORY'] = 'owner/repo'
  process.env['GITHUB_WORKFLOW'] = 'worklow name'
  process.env['GITHUB_SHA'] = '650d9185ff9ad990de710b078a0579eb2bd64bd8'
  process.env['GITHUB_RUN_NUMBER'] = '42'
  process.env['GITHUB_RUN_ATTEMPT'] = '1'
  process.env['GITHUB_EVENT_NAME'] = 'pull_request'

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})
