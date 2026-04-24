import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  verifySupabase,
  verifyMigrations,
  verifyGithub,
  verifyAnthropic,
  verifyPartykit,
} from './verify'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ── verifySupabase ───────────────────────────────────────────────────────────

describe('verifySupabase', () => {
  it('returns error when URL missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key')
    const r = await verifySupabase()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('returns error when anon key missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const r = await verifySupabase()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('returns ok on HTTP 200', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const r = await verifySupabase()
    expect(r.ok).toBe(true)
  })

  it('returns error on non-200', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    const r = await verifySupabase()
    expect(r.ok).toBe(false)
  })
})

// ── verifyMigrations ─────────────────────────────────────────────────────────

describe('verifyMigrations', () => {
  it('returns error when URL missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    const r = await verifyMigrations()
    expect(r.ok).toBe(false)
  })

  it('returns ok when sessions table exists (HTTP 200)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('[]', { status: 200 }))
    const r = await verifyMigrations()
    expect(r.ok).toBe(true)
  })

  it('returns specific error when table missing (HTTP 404)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const r = await verifyMigrations()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/Migrations not applied/)
  })
})

// ── verifyGithub ─────────────────────────────────────────────────────────────

describe('verifyGithub', () => {
  it('returns error when client ID missing', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', '')
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'secret')
    const r = await verifyGithub()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/GITHUB_CLIENT_ID/)
  })

  it('returns error when client secret missing', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', 'id')
    vi.stubEnv('GITHUB_CLIENT_SECRET', '')
    const r = await verifyGithub()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/GITHUB_CLIENT_SECRET/)
  })

  it('returns ok when both vars set', async () => {
    vi.stubEnv('GITHUB_CLIENT_ID', 'Ov23liXXX')
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'secret')
    const r = await verifyGithub()
    expect(r.ok).toBe(true)
  })
})

// ── verifyAnthropic ──────────────────────────────────────────────────────────

describe('verifyAnthropic', () => {
  it('returns error when key missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const r = await verifyAnthropic()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('returns error when key has wrong prefix', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'wrong-prefix-key')
    const r = await verifyAnthropic()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/sk-ant-/)
  })

  it('returns ok on HTTP 200', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const r = await verifyAnthropic()
    expect(r.ok).toBe(true)
  })

  it('returns error on 401', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-bad')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    const r = await verifyAnthropic()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/rejected/)
  })
})

// ── verifyPartykit ───────────────────────────────────────────────────────────

describe('verifyPartykit', () => {
  it('returns error when host missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTYKIT_HOST', '')
    const r = await verifyPartykit()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/NEXT_PUBLIC_PARTYKIT_HOST/)
  })

  it('returns ok on HTTP 200', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTYKIT_HOST', 'localhost:1999')
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const r = await verifyPartykit()
    expect(r.ok).toBe(true)
  })

  it('returns error when SSS unreachable', async () => {
    vi.stubEnv('NEXT_PUBLIC_PARTYKIT_HOST', 'localhost:1999')
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const r = await verifyPartykit()
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/Cannot reach/)
  })
})
