import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createOctokit, parseRepoUrl } from '@/lib/github/client'
import { runMergeSequence } from '@/lib/github/merge'

interface TokenSummaryRow {
  user_id: string
  display_name: string
  total_tokens_in: number
  total_tokens_out: number
  total_cost_usd: number | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sessionId: string }
  try {
    body = await req.json() as { sessionId: string }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { sessionId } = body
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('host_user_id, status, github_repo_url, name')
    .eq('id', sessionId)
    .single()

  if (!session || session.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the session host can trigger merge' }, { status: 403 })
  }

  if (session.status !== 'building') {
    return NextResponse.json({ error: 'Session is not in building status' }, { status: 409 })
  }

  const adminSupabase = createAdminClient()

  await adminSupabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: 'Merge sequence started. Collecting agent branches…',
    metadata: { type: 'merge_triggered' },
  })

  // Get all agents in session
  const { data: members } = await adminSupabase
    .from('session_members')
    .select('agent_id')
    .eq('session_id', sessionId)

  const agentIds = (members ?? []).map((m: { agent_id: string }) => m.agent_id)

  // Run GitHub merge if repo configured
  let prUrl: string | null = null
  let mergedAgents: string[] = []
  let conflictAgents: string[] = []

  if (session.github_repo_url) {
    const parsed = parseRepoUrl(session.github_repo_url)

    if (parsed) {
      const { data: profileData } = await adminSupabase
        .from('profiles')
        .select('github_access_token')
        .eq('id', user.id)
        .single()

      const githubToken = (profileData as { github_access_token: string | null } | null)?.github_access_token

      if (githubToken) {
        try {
          const octokit = createOctokit(githubToken)
          const result = await runMergeSequence({
            octokit,
            owner: parsed.owner,
            repo: parsed.repo,
            sessionId,
            agentIds,
          })
          prUrl = result.prUrl
          mergedAgents = result.mergedAgents
          conflictAgents = result.conflictAgents

          if (conflictAgents.length > 0) {
            const sssUrl = process.env.NEXT_PUBLIC_PARTYKIT_HOST
            if (sssUrl) {
              try {
                const feedbackRes = await fetch(
                  `${sssUrl}/parties/main/${sessionId}/conflict-feedback`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conflictAgents }),
                  }
                )
                const feedbackData = await feedbackRes.json() as { round: number; limitReached: boolean }
                if (feedbackData.limitReached) {
                  // SSS already set session to done and broadcast merge_failed
                  return NextResponse.json({ ok: true, prUrl, limitReached: true })
                }
              } catch {
                // Non-fatal — fall back to legacy message
                await adminSupabase.from('messages').insert({
                  session_id: sessionId,
                  sender_type: 'system',
                  content: `Merge conflicts in agents: ${conflictAgents.join(', ')}. Orchestrator notified.`,
                  metadata: { type: 'merge_conflict', conflictAgents },
                })
              }
            }
            // Session stays 'building' — orchestrator will re-dispatch
            return NextResponse.json({ ok: true, prUrl, conflictAgents })
          }
        } catch (err) {
          await adminSupabase.from('messages').insert({
            session_id: sessionId,
            sender_type: 'system',
            content: `Merge failed: ${(err as Error).message}`,
            metadata: { type: 'merge_error' },
          })
          return NextResponse.json({ error: 'Merge failed' }, { status: 502 })
        }
      }
    }
  }

  // Fetch token summary
  const { data: tokenRows } = await adminSupabase
    .from('session_token_summary')
    .select('user_id, display_name, total_tokens_in, total_tokens_out, total_cost_usd')
    .eq('session_id', sessionId)

  const tokenSummary = ((tokenRows as TokenSummaryRow[] | null) ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    totalTokensIn: row.total_tokens_in,
    totalTokensOut: row.total_tokens_out,
    totalCostUsd: row.total_cost_usd ?? 0,
  }))

  // Post build summary card
  const summaryContent = prUrl
    ? `Build complete. PR: ${prUrl}`
    : `Build complete. ${mergedAgents.length} agent(s) finished.`

  await adminSupabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: summaryContent,
    metadata: {
      type: 'build_summary',
      prUrl,
      mergedAgents,
      conflictAgents,
      sessionId,
      tokenSummary,
    },
  })

  await adminSupabase.from('sessions').update({
    status: 'done',
    closed_at: new Date().toISOString(),
  }).eq('id', sessionId)

  return NextResponse.json({ ok: true, prUrl })
}
