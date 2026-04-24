import { describe, it, expect, vi, afterEach } from 'vitest'
import { getMissingEnvVars, hasAllEnvVars } from './env-check'

const ALL_VARS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  NEXT_PUBLIC_PARTYKIT_HOST: 'localhost:1999',
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
}

afterEach(() => vi.unstubAllEnvs())

describe('getMissingEnvVars', () => {
  it('returns empty array when all vars set', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    expect(getMissingEnvVars()).toEqual([])
  })

  it('returns missing var names', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GITHUB_CLIENT_SECRET', '')
    const missing = getMissingEnvVars()
    expect(missing).toContain('ANTHROPIC_API_KEY')
    expect(missing).toContain('GITHUB_CLIENT_SECRET')
    expect(missing).toHaveLength(2)
  })
})

describe('hasAllEnvVars', () => {
  it('returns true when all vars set', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    expect(hasAllEnvVars()).toBe(true)
  })

  it('returns false when any var missing', () => {
    Object.entries(ALL_VARS).forEach(([k, v]) => vi.stubEnv(k, v))
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(hasAllEnvVars()).toBe(false)
  })
})
