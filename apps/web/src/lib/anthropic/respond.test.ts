import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Here is my brainstorm response.' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}))

import { generateResponse } from './respond'

describe('generateResponse', () => {
  it('returns content and usage', async () => {
    const result = await generateResponse({
      mode: 'brainstorm',
      content: 'What do you think about Postgres?',
      chatContext: [],
      agentId: 'claude-u1',
      apiKey: 'sk-ant-test',
    })
    expect(result.text).toBe('Here is my brainstorm response.')
    expect(result.tokensIn).toBe(100)
    expect(result.tokensOut).toBe(50)
  })

  it('extracts code block for review mode', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Code looks good.' }],
      usage: { input_tokens: 200, output_tokens: 30 },
    })
    ;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }))
    const result = await generateResponse({
      mode: 'review',
      content: 'Review this:\n```\nconst x = 1\n```',
      chatContext: [],
      agentId: 'claude-u1',
      apiKey: 'sk-ant-test',
    })
    expect(result.text).toBe('Code looks good.')
    // Verify the create was called (code block extraction happened)
    expect(mockCreate).toHaveBeenCalledOnce()
    const callArg = mockCreate.mock.calls[0]?.[0]
    expect(callArg?.messages[callArg?.messages.length - 1]?.content).toContain('const x = 1')
  })
})
