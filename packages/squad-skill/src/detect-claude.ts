import { execSync, spawnSync } from 'node:child_process'

export function isClaudeInstalled(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function registerMcpServer(opts: {
  sessionId: string
  agentId: string
  role: 'orchestrator' | 'agent'
  partyUrl?: string
}): void {
  const partyFlag = opts.partyUrl ? ` --party-url ${opts.partyUrl}` : ''
  const cmd = `npx @squad/skill mcp --session ${opts.sessionId} --agent ${opts.agentId} --role ${opts.role}${partyFlag}`
  execSync(`claude mcp add claude-squad-${opts.sessionId} -- ${cmd}`, { stdio: 'inherit' })
}

export function launchClaude(): void {
  spawnSync('claude', [], { stdio: 'inherit' })
}
