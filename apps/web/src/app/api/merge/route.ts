import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createOctokit, parseRepoUrl } from '@/lib/github/client'
import { runMergeSequence } from '@/lib/github/merge'
import type { Octokit } from '@octokit/rest'

interface TokenSummaryRow {
  user_id: string
  display_name: string
  total_tokens_in: number
  total_tokens_out: number
  total_cost_usd: number | null
}

async function runPostMergeReview({
  octokit,
  owner,
  repo,
  baseBranch,
  squadBranch,
}: {
  octokit: Octokit
  owner: string
  repo: string
  baseBranch: string
  squadBranch: string
}): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic()

  let diff = ''
  try {
    const { data } = await octokit.repos.compareCommits({
      owner,
      repo,
      base: baseBranch,
      head: squadBranch,
    })
    const files = (data as { files?: Array<{ patch?: string; filename: string }> }).files ?? []
    diff = files
      .map((f) => `## ${f.filename}\n${f.patch ?? ''}`)
      .join('\n\n')
      .slice(0, 8000)
  } catch {
    return 'Could not fetch diff for review.'
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a cross-agent consistency reviewer. The following diff was produced by merging multiple agent branches into one squad branch. Identify type mismatches, conflicting API contracts, duplicate function definitions, or naming collisions. Be concise. List findings as bullet points. If nothing looks wrong, say "No issues found."\n\n${diff}`,
      },
    ],
  })

  const block = message.content[0]
  return block?.type === 'text' ? block.text : 'Review could not be completed.'
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
  let mergeOctokit: ReturnType<typeof createOctokit> | null = null
  let parsedRepo: ReturnType<typeof parseRepoUrl> | null = null
  let squadBranch: string | null = null

  if (session.github_repo_url) {
    const parsed = parseRepoUrl(session.github_repo_url)
    parsedRepo = parsed

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
          mergeOctokit = octokit
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
          squadBranch = result.squadBranch

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

  // Reset SSS conflict round counter on clean merge
  const sssUrl = process.env.NEXT_PUBLIC_PARTYKIT_HOST
  if (sssUrl) {
    try {
      await fetch(`${sssUrl}/parties/main/${sessionId}/merge-complete`, { method: 'POST' })
    } catch {
      // non-fatal
    }
  }

  // Post-merge review (Haiku) — non-blocking
  if (mergeOctokit && parsedRepo && squadBranch && prUrl) {
    try {
      const reviewText = await runPostMergeReview({
        octokit: mergeOctokit,
        owner: parsedRepo.owner,
        repo: parsedRepo.repo,
        baseBranch: 'main',
        squadBranch,
      })
      await adminSupabase.from('messages').insert({
        session_id: sessionId,
        sender_type: 'system',
        content: reviewText,
        metadata: { type: 'review_complete' },
      })
    } catch {
      // non-fatal — skip review on error
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
