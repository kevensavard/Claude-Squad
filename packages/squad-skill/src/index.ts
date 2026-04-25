#!/usr/bin/env node

import { maybeRunGuidedMode } from './connect.js'
import { isClaudeInstalled, registerMcpServer, launchClaude } from './detect-claude.js'

function parseArgs() {
  const args = process.argv.slice(2)
  const subcommand = args[0] && !args[0].startsWith('--') ? args[0] : undefined

  function getFlag(name: string): string | undefined {
    const idx = args.findIndex((a) => a === `--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const session = getFlag('session')
  const agent = getFlag('agent')
  const role = (getFlag('role') ?? 'agent') as 'orchestrator' | 'agent'
  const key = getFlag('key') ?? process.env.ANTHROPIC_API_KEY
  const partyUrl = getFlag('party-url') ?? process.env.PARTYKIT_HOST ?? 'ws://localhost:1999'
  const workdir = getFlag('workdir')
  const githubToken = getFlag('github-token') ?? process.env.GITHUB_TOKEN

  return { subcommand, session, agent, role, key, partyUrl, workdir, githubToken }
}

async function main() {
  const args = parseArgs()

  // `npx @squad/skill mcp ...` — started by Claude Code, runs stdio MCP server
  if (args.subcommand === 'mcp') {
    if (!args.session || !args.agent) {
      console.error('mcp subcommand requires --session and --agent')
      process.exit(1)
    }
    // Dynamic import to avoid loading MCP deps when not needed
    // @ts-ignore — mcp-server.ts will be created in Task 7
    const { startMcpServer } = await import('./mcp-server.js')
    await startMcpServer({
      sessionId: args.session,
      agentId: args.agent,
      role: args.role,
      partyUrl: args.partyUrl,
    })
    return
  }

  // `npx @squad/skill connect ...` — user runs this from terminal
  if (args.subcommand === 'connect') {
    if (!args.session || !args.agent) {
      console.error('connect subcommand requires --session and --agent')
      process.exit(1)
    }
    if (isClaudeInstalled()) {
      console.log('Claude Code detected. Registering MCP server…')
      registerMcpServer({
        sessionId: args.session,
        agentId: args.agent,
        role: args.role,
        partyUrl: args.partyUrl !== 'ws://localhost:1999' ? args.partyUrl : undefined,
      })
      console.log('Launching Claude Code…')
      launchClaude()
    } else {
      console.log('Claude Code not found. Falling back to API key mode…')
      await maybeRunGuidedMode({
        session: args.session,
        agent: args.agent,
        key: args.key,
        partyUrl: args.partyUrl,
        workdir: args.workdir,
        githubToken: args.githubToken,
      })
    }
    return
  }

  // Legacy: `npx @squad/skill --key sk-ant-...` or bare `npx @squad/skill`
  await maybeRunGuidedMode(args)
}

void main()
