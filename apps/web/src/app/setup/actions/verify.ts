'use server'

export type VerifyResult = { ok: true } | { ok: false; error: string }

export async function verifySupabase(): Promise<VerifyResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local' }
  if (!key) return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in .env.local' }
  try {
    // /auth/v1/settings is a public endpoint — confirms the URL points to a real Supabase project
    const res = await fetch(`${url}/auth/v1/settings`)
    if (!res.ok) return { ok: false, error: `Cannot reach Supabase at ${url}. Check NEXT_PUBLIC_SUPABASE_URL.` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Supabase: ${err instanceof Error ? err.message : 'network error'}` }
  }
}

export async function verifyMigrations(): Promise<VerifyResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local' }
  if (!key) return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set in .env.local' }
  try {
    const res = await fetch(`${url}/rest/v1/sessions?limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (res.status === 404) {
      return { ok: false, error: 'Migrations not applied. Run the SQL from docs/DATABASE.md in the Supabase SQL editor.' }
    }
    if (!res.ok) return { ok: false, error: `Supabase returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Supabase: ${err instanceof Error ? err.message : 'network error'}` }
  }
}

export async function verifyGithub(): Promise<VerifyResult> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId) return { ok: false, error: 'GITHUB_CLIENT_ID is not set in .env.local' }
  if (!clientSecret) return { ok: false, error: 'GITHUB_CLIENT_SECRET is not set in .env.local' }
  return { ok: true }
}

export async function verifyAnthropic(): Promise<VerifyResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY is not set in .env.local' }
  if (!key.startsWith('sk-ant-')) {
    return { ok: false, error: 'ANTHROPIC_API_KEY must start with sk-ant-. Check the key at console.anthropic.com.' }
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    if (res.status === 401) {
      return { ok: false, error: 'API key rejected by Anthropic. Verify the key is valid and has credits.' }
    }
    if (!res.ok) return { ok: false, error: `Anthropic returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Anthropic: ${err instanceof Error ? err.message : 'network error'}` }
  }
}

export async function verifyPartykit(): Promise<VerifyResult> {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST
  if (!host) return { ok: false, error: 'NEXT_PUBLIC_PARTYKIT_HOST is not set in .env.local' }
  try {
    const protocol = host.startsWith('localhost') ? 'http' : 'https'
    const res = await fetch(`${protocol}://${host}/parties/main/health-check/health`)
    if (!res.ok) return { ok: false, error: `Partykit returned HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Cannot reach Partykit at ${host}: ${err instanceof Error ? err.message : 'network error'}` }
  }
}
