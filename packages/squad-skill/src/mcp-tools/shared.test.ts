import { describe, it, expect } from 'vitest'
import { buildGetSessionStateTool, buildPostMessageTool } from './shared'
import type { AgentRecord } from '@squad/types'

const mockRecord: AgentRecord = {
  agentId: 'a1', userId: 'u1', displayName: 'Claude', status: 'idle',
  currentTaskId: null, lastHeartbeat: Date.now(), tokensUsed: 0, role: 'orchestrator',
}

describe('buildGetSessionStateTool', () => {
  it('returns agents and tasks from state cache', () => {
    const tool = buildGetSessionStateTool({
      getState: () => ({
        agents: { a1: mockRecord },
        tasks: {},
        recentMessages: [],
      }),
    })
    const result = tool.handler({})
    expect(result.agents).toHaveProperty('a1')
  })
})

describe('buildPostMessageTool', () => {
  it('calls sendMessage with content', async () => {
    const sent: string[] = []
    const tool = buildPostMessageTool({
      agentId: 'a1',
      sendMessage: async (content) => { sent.push(content) },
    })
    await tool.handler({ content: 'hello' })
    expect(sent).toEqual(['hello'])
  })
})
