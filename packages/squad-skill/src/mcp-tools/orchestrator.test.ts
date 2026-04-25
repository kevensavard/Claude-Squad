import { describe, it, expect } from 'vitest'
import { buildWatchSessionTool, buildDispatchTasksTool } from './orchestrator'
import type { WatchEvent } from '@squad/types'

describe('buildWatchSessionTool', () => {
  it('returns event from queue within timeout', async () => {
    const event: WatchEvent = { type: 'idle' }
    const tool = buildWatchSessionTool({
      nextEvent: async (_timeout) => event,
    })
    const result = await tool.handler({})
    expect(result.type).toBe('idle')
  })
})

describe('buildDispatchTasksTool', () => {
  it('calls sendDispatch with task graph', async () => {
    const dispatched: unknown[] = []
    const tool = buildDispatchTasksTool({
      sendDispatch: async (tasks) => { dispatched.push(...tasks) },
    })
    await tool.handler({
      tasks: [{ id: 't1', title: 'Auth', description: 'Build auth', assignedAgentId: 'a1' }],
    })
    expect(dispatched).toHaveLength(1)
  })
})
