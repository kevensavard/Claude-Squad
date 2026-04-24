#!/usr/bin/env node

import { maybeRunGuidedMode } from './connect.js'

function parseArgs() {
  const args = process.argv.slice(2)

  function getFlag(name: string): string | undefined {
    const idx = args.findIndex((a) => a === `--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const session = getFlag('session')
  const agent = getFlag('agent')
  const key = getFlag('key') ?? process.env.ANTHROPIC_API_KEY
  const partyUrl = getFlag('party-url') ?? process.env.PARTYKIT_HOST ?? 'ws://localhost:1999'
  const workdir = getFlag('workdir')
  const githubToken = getFlag('github-token') ?? process.env.GITHUB_TOKEN

  return { session, agent, key, partyUrl, workdir, githubToken }
}

void maybeRunGuidedMode(parseArgs())
