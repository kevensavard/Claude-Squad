'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface PageProps {
  params: Promise<{ code: string }>
}

export default function JoinPage({ params }: PageProps) {
  const { code } = use(params)
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    // Ensure authenticated (anonymous if needed)
    let { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const { error: anonError, data: anonData } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: displayName.trim() } },
      })
      if (anonError) {
        setError(anonError.message)
        setLoading(false)
        return
      }
      user = anonData.user
    }

    if (!user) {
      setError('Could not authenticate')
      setLoading(false)
      return
    }

    // Look up session by invite code directly from client
    const { data: session } = await supabase
      .from('sessions')
      .select('id, name, host_user_id, status')
      .eq('invite_code', code)
      .single()

    if (!session) {
      setError('Session not found or invite code invalid')
      setLoading(false)
      return
    }

    if (session.status === 'done' || session.status === 'archived') {
      setError('This session is no longer active')
      setLoading(false)
      return
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('session_members')
      .select('agent_id')
      .eq('session_id', session.id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      router.push(`/session/${session.id}`)
      return
    }

    // Count members via security definer function (bypasses RLS)
    const { data: countData } = await supabase
      .rpc('session_member_count', { p_session_id: session.id })

    const memberCount = (countData as number | null) ?? 0
    const agentId = `claude-u${memberCount + 1}`

    // Upsert profile with display name
    await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName.trim() || 'Anonymous',
    })

    // Insert member
    const { error: insertError } = await supabase.from('session_members').insert({
      session_id: session.id,
      user_id: user.id,
      agent_id: agentId,
      display_name: `Claude (${displayName.trim() || 'Anonymous'})`,
      is_host: false,
    })

    if (insertError) {
      setError('Failed to join session: ' + insertError.message)
      setLoading(false)
      return
    }

    router.push(`/session/${session.id}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Join session</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Enter your name to join</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            maxLength={50}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || displayName.trim().length < 2}
            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Joining…' : 'Join session'}
          </button>
        </form>
      </div>
    </div>
  )
}
