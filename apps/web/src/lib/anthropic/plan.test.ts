import { describe, it, expect, vi } from 'vitest'

const mockProposal = {
  type: 'proposal' as const,
  tasks: [{
    id: 'task-1',
    title: 'Build auth',
    description: 'Implement user authentication',
    assignedAgentId: 'claude-u1',
    fileOwnership: ['src/auth/**'],
    dependsOn: [],
    estimatedTokens: 3000,
  }],
  totalEstimatedTokens: 3000,
  tokenSplitPreview: { 'user-1': 3000 },
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockProposal) }],
        usage: { input_tokens: 500, output_tokens: 200 },
      }),
    },
  })),
}))

import { decomposeSpec } from './plan'

describe('decomposeSpec', () => {
  it('returns a ProposalCard', async () => {
    const result = await decomposeSpec({
      spec: 'Build an auth system',
      agents: [{ agentId: 'claude-u1', userId: 'user-1' }],
      chatContext: 'some context',
      apiKey: 'sk-ant-test',
    })
    expect(result.type).toBe('proposal')
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]?.assignedAgentId).toBe('claude-u1')
  })

  it('includes all agents in the system prompt', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockProposal) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    ;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }))
    await decomposeSpec({
      spec: 'Build something',
      agents: [
        { agentId: 'claude-u1', userId: 'user-1' },
        { agentId: 'claude-u2', userId: 'user-2' },
      ],
      chatContext: '',
      apiKey: 'sk-ant-test',
    })
    const callArg = mockCreate.mock.calls[0]?.[0]
    expect(callArg?.system).toContain('claude-u1')
    expect(callArg?.system).toContain('claude-u2')
  })

  it('throws a descriptive error when model returns invalid JSON', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
      usage: { input_tokens: 50, output_tokens: 10 },
    })
    ;(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      messages: { create: mockCreate },
    }))
    await expect(decomposeSpec({
      spec: 'Build something',
      agents: [{ agentId: 'claude-u1', userId: 'user-1' }],
      chatContext: '',
      apiKey: 'sk-ant-test',
    })).rejects.toThrow('Orchestrator returned invalid JSON')
  })
})
