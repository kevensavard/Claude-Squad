#!/usr/bin/env node

import { connectToSession } from './connect.js'

function parseArgs(): { sessionId: string; agentId: string; apiKey: string; partyUrl: string } {
  const args = process.argv.slice(2)

  function getFlag(name: string): string | undefined {
    const idx = args.findIndex((a) => a === `--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const command = args[0]
  if (command !== 'connect') {
    console.error('Usage: squad-skill connect --session <id> --agent <agentId> [--api-key <key>] [--party-url <url>]')
    process.exit(1)
  }

  const sessionId = getFlag('session')
  const agentId = getFlag('agent')
  const apiKey = getFlag('api-key') ?? process.env.ANTHROPIC_API_KEY
  const partyUrl = getFlag('party-url') ?? process.env.PARTYKIT_HOST ?? 'ws://localhost:1999'

  if (!sessionId || !agentId || !apiKey) {
    console.error('Missing required: --session, --agent, and --api-key (or ANTHROPIC_API_KEY env)')
    process.exit(1)
  }

  return { sessionId, agentId, apiKey, partyUrl }
}

void connectToSession(parseArgs())
