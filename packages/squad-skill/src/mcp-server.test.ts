import { describe, it, expect } from 'vitest'
import { EventQueue } from './mcp-server.js'

describe('EventQueue — merge_conflict', () => {
  it('delivers merge_conflict event to a waiting next() call', async () => {
    const queue = new EventQueue()
    const nextPromise = queue.next(1000)
    queue.push({ type: 'merge_conflict', conflictAgents: ['agent-1'], round: 1, maxRounds: 3 })
    const event = await nextPromise
    expect(event.type).toBe('merge_conflict')
    if (event.type === 'merge_conflict') {
      expect(event.conflictAgents).toEqual(['agent-1'])
      expect(event.round).toBe(1)
      expect(event.maxRounds).toBe(3)
    }
  })

  it('queues merge_conflict event when no waiter present, delivers on next next() call', async () => {
    const queue = new EventQueue()
    queue.push({ type: 'merge_conflict', conflictAgents: ['agent-2'], round: 2, maxRounds: 3 })
    const event = await queue.next(100)
    expect(event.type).toBe('merge_conflict')
    if (event.type === 'merge_conflict') {
      expect(event.conflictAgents).toEqual(['agent-2'])
      expect(event.round).toBe(2)
    }
  })
})
