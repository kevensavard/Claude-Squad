import { describe, it, expect } from 'vitest'
import { parseMention } from '../mention-parser.js'

describe('parseMention', () => {
  it('parses single agent mention', () => {
    const result = parseMention('hey @claude-1 what do you think?')
    expect(result.mentions).toContain('claude-1')
    expect(result.isAllMention).toBe(false)
    expect(result.cleanContent).toBe('hey what do you think?')
  })

  it('parses @all mention', () => {
    const result = parseMention('@all update me on the status')
    expect(result.isAllMention).toBe(true)
    expect(result.mentions).toContain('all')
  })

  it('parses @agents as @all', () => {
    const result = parseMention('@agents what is the status?')
    expect(result.isAllMention).toBe(true)
    expect(result.mentions).toContain('all')
    expect(result.mentions).not.toContain('agents')
  })

  it('deduplicates repeated mentions', () => {
    const result = parseMention('@claude-1 and @claude-1 again')
    expect(result.mentions).toHaveLength(1)
    expect(result.mentions[0]).toBe('claude-1')
  })

  it('parses multiple distinct mentions', () => {
    const result = parseMention('@claude-1 and @claude-2 check this out')
    expect(result.mentions).toContain('claude-1')
    expect(result.mentions).toContain('claude-2')
    expect(result.mentions).toHaveLength(2)
  })

  it('returns empty mentions for plain message', () => {
    const result = parseMention('just a normal message')
    expect(result.mentions).toHaveLength(0)
    expect(result.isAllMention).toBe(false)
    expect(result.cleanContent).toBe('just a normal message')
  })
})
