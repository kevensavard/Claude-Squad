import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"mode":"brainstorm","confidence":0.9}' }],
      }),
    },
  })),
}))

import { classifyIntent } from './classify'

describe('classifyIntent', () => {
  it('returns parsed mode and confidence', async () => {
    const result = await classifyIntent('what do you think about React?', '', 'sk-ant-test')
    expect(result.mode).toBe('brainstorm')
    expect(result.confidence).toBe(0.9)
  })

  it('falls back to brainstorm on bad JSON', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
    })
    ;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }))
    const result = await classifyIntent('hmm', '', 'sk-ant-test')
    expect(result.mode).toBe('brainstorm')
    expect(result.confidence).toBe(0.5)
  })

  it('never returns build mode (reclassified to brainstorm)', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"mode":"build","confidence":0.95}' }],
    })
    ;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }))
    const result = await classifyIntent('build it now', '', 'sk-ant-test')
    expect(result.mode).toBe('brainstorm')
    expect(result.confidence).toBe(0.95)
  })
})
