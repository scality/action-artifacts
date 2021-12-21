import * as core from '@actions/core'
import * as github from '@actions/github'
import * as process from 'process'

export async function artifactsName(): Promise<string> {
  const owner: string = github.context.repo.owner
  const repo: string = github.context.repo.repo
  const workflow: string = github.context.workflow
    .replace(/\W/g, '-')
    .replace(/^-/, '')
  const commit: string = github.context.sha.slice(0, 10)
  const runNumber: number = github.context.runNumber
  // run attempt is not available through GitHub toolkit yet.
  const runAttempt: string | undefined = process.env['GITHUB_RUN_ATTEMPT']

  return `github:${owner}:${repo}:staging-${commit}.${workflow}.${runNumber}.${runAttempt}`
}

export async function setOutputs(name: string): Promise<void> {
  const url: string = core.getInput('url')

  core.setOutput('name', name)
  core.setOutput('link', `${url}/builds/${name}`)
}
