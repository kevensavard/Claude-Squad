import { describe, it, expect } from 'vitest'
import { handleConflictFeedback, handleMergeComplete } from './server.js'

describe('handleConflictFeedback', () => {
  it('increments round from 0 and returns limitReached: false when round < maxRounds', () => {
    const result = handleConflictFeedback(0, ['agent-1', 'agent-2'], 3)
    expect(result.round).toBe(1)
    expect(result.limitReached).toBe(false)
    expect(result.conflictAgents).toEqual(['agent-1', 'agent-2'])
  })

  it('returns limitReached: true when incremented round reaches maxRounds', () => {
    const result = handleConflictFeedback(2, ['agent-1'], 3)
    expect(result.round).toBe(3)
    expect(result.limitReached).toBe(true)
  })

  it('returns limitReached: true when round already exceeds maxRounds', () => {
    const result = handleConflictFeedback(3, ['agent-1'], 3)
    expect(result.round).toBe(4)
    expect(result.limitReached).toBe(true)
  })
})

describe('handleMergeComplete', () => {
  it('resets conflict round to 0', () => {
    const result = handleMergeComplete(3)
    expect(result.conflictRound).toBe(0)
  })
})
