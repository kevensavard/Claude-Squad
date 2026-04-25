import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}))

import { execSync } from 'node:child_process'
import { isClaudeInstalled } from './detect-claude'

describe('isClaudeInstalled', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns true when claude --version exits 0', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('Claude Code 1.0.0'))
    expect(isClaudeInstalled()).toBe(true)
  })

  it('returns false when claude --version throws', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not found') })
    expect(isClaudeInstalled()).toBe(false)
  })
})
