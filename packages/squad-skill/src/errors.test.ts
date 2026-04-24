import { describe, it, expect } from 'vitest'
import { formatError } from './errors'

describe('formatError', () => {
  it('formats agent-not-found error with available agents', () => {
    const msg = formatError('agent_not_found', { agentId: 'claude-u2', available: ['claude-u1', 'claude-u3'] })
    expect(msg).toContain('claude-u2')
    expect(msg).toContain('claude-u1')
    expect(msg).toContain('claude-u3')
  })

  it('formats websocket-refused error with host', () => {
    const msg = formatError('ws_refused', { host: 'localhost:1999' })
    expect(msg).toContain('localhost:1999')
    expect(msg).toContain('pnpm dev')
  })

  it('formats bad-api-key error', () => {
    const msg = formatError('bad_api_key', {})
    expect(msg).toContain('sk-ant-')
  })

  it('formats session-not-found error', () => {
    const msg = formatError('session_not_found', { sessionId: 'abc123' })
    expect(msg).toContain('abc123')
    expect(msg).toContain('expired')
  })
})
