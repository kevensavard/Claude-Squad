import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

interface TokenSummaryRow {
  user_id: string
  display_name: string
  total_tokens_in: number
  total_tokens_out: number
  total_cost_usd: number | null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function SessionSummaryPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (!session) notFound()

  const { data: members } = await supabase
    .from('session_members')
    .select('*')
    .eq('session_id', id)
    .order('joined_at', { ascending: true })

  const isMember = (members ?? []).some((m: { user_id: string }) => m.user_id === user.id)
  if (!isMember) redirect('/')

  const { data: messages } = await supabase
    .from('messages')
    .select('id, sender_type, agent_id, content, mode, metadata, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  const { data: tokenRows } = await supabase
    .from('session_token_summary')
    .select('user_id, display_name, total_tokens_in, total_tokens_out, total_cost_usd')
    .eq('session_id', id)

  const tokenSummary = ((tokenRows as TokenSummaryRow[] | null) ?? [])
  const totalCost = tokenSummary.reduce((s, r) => s + (r.total_cost_usd ?? 0), 0)
  const totalTokens = tokenSummary.reduce((s, r) => s + r.total_tokens_in + r.total_tokens_out, 0)

  const buildSummaryMsg = (messages ?? []).find(
    (m: { metadata: Record<string, unknown> }) => m.metadata?.type === 'build_summary'
  )
  const prUrl = buildSummaryMsg
    ? (buildSummaryMsg.metadata as { prUrl?: string }).prUrl ?? null
    : null

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/session/${id}`}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-3 inline-block"
          >
            ← Back to session
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{session.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              session.status === 'done'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}>
              {session.status}
            </span>
            <span className="text-xs text-slate-400">Started {formatDate(session.created_at)}</span>
            {session.closed_at && (
              <span className="text-xs text-slate-400">Ended {formatDate(session.closed_at)}</span>
            )}
          </div>
        </div>

        {/* PR link */}
        {prUrl && (
          <div className="mb-6 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pull Request</p>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {prUrl}
            </a>
          </div>
        )}

        {/* Token breakdown */}
        {tokenSummary.length > 0 && (
          <div className="mb-6 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Token cost — {totalTokens.toLocaleString()} tokens · ${totalCost.toFixed(4)} total
            </h2>
            <div className="space-y-2">
              {tokenSummary.map((row) => {
                const tokens = row.total_tokens_in + row.total_tokens_out
                const pct = totalTokens > 0 ? (tokens / totalTokens) * 100 : 0
                return (
                  <div key={row.user_id}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-700 dark:text-slate-300">{row.display_name}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {tokens.toLocaleString()} · ${(row.total_cost_usd ?? 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 dark:bg-purple-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Message history */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Session history · {(messages ?? []).length} messages
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {(messages ?? []).map((msg: {
              id: string
              sender_type: string
              agent_id: string | null
              content: string
              mode: string | null
              metadata: Record<string, unknown>
              created_at: string
            }) => (
              <div key={msg.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-medium ${
                    msg.sender_type === 'agent'
                      ? 'text-purple-600 dark:text-purple-400'
                      : msg.sender_type === 'system'
                      ? 'text-slate-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    {msg.sender_type === 'agent' ? msg.agent_id : msg.sender_type}
                  </span>
                  {msg.mode && (
                    <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {msg.mode}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-auto">
                    {formatDate(msg.created_at)}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">
                  {msg.content}
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
