import { describe, it, expect, vi } from 'vitest'
import { EventQueue } from './mcp-server'
import type { WatchEvent } from '@squad/types'

describe('EventQueue', () => {
  it('returns event immediately if already queued', async () => {
    const q = new EventQueue()
    const event: WatchEvent = { type: 'idle' }
    q.push(event)
    const result = await q.next(1000)
    expect(result.type).toBe('idle')
  })

  it('resolves waiting caller when event is pushed', async () => {
    const q = new EventQueue()
    const promise = q.next(5000)
    q.push({ type: 'idle' })
    const result = await promise
    expect(result.type).toBe('idle')
  })

  it('resolves with idle after timeout', async () => {
    vi.useFakeTimers()
    const q = new EventQueue()
    const promise = q.next(100)
    vi.advanceTimersByTime(200)
    const result = await promise
    expect(result.type).toBe('idle')
    vi.useRealTimers()
  })
})
