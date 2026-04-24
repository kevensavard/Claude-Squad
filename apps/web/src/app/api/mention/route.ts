import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { classifyIntent } from '@/lib/anthropic/classify'
import { generateResponse } from '@/lib/anthropic/respond'
import { decomposeSpec } from '@/lib/anthropic/plan'

interface MentionBody {
  sessionId: string
  content: string
  apiKey?: string
}

function parseMentions(content: string): string[] {
  const regex = /@(claude-\w+|all|agents)/gi
  const found: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const tag = (match[1] ?? '').toLowerCase()
    found.push(tag === 'agents' ? 'all' : tag)
  }
  return [...new Set(found)]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: MentionBody
  try {
    body = await req.json() as MentionBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { sessionId, content, apiKey } = body

  if (!sessionId || !content?.trim()) {
    return NextResponse.json({ error: 'sessionId and content required' }, { status: 400 })
  }

  // Validate user is a session member
  const { data: currentMember } = await supabase
    .from('session_members')
    .select('agent_id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!currentMember) {
    return NextResponse.json({ error: 'Not a session member' }, { status: 403 })
  }

  // Insert the human message
  const { data: humanMsg, error: insertError } = await supabase
    .from('messages')
    .insert({
      session_id: sessionId,
      sender_type: 'human',
      user_id: user.id,
      content,
      metadata: {} as object,
    })
    .select()
    .single()

  if (insertError || !humanMsg) {
    return NextResponse.json({ error: 'Failed to insert message' }, { status: 500 })
  }

  // Parse which agents were mentioned
  const mentions = parseMentions(content)

  // Load all session members to resolve @all
  const { data: members } = await supabase
    .from('session_members')
    .select('agent_id, user_id')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true })

  const allAgents = members ?? []

  const targetAgentIds = mentions.includes('all')
    ? allAgents.map((m) => m.agent_id)
    : mentions.filter((tag) => allAgents.some((m) => m.agent_id === tag))

  // Respond immediately — agent processing happens in background
  console.log('[mention] targets:', targetAgentIds, 'hasKey:', !!apiKey)
  if (targetAgentIds.length > 0 && apiKey) {
    console.log('[mention] scheduling after()')
    after((async () => {
      console.log('[mention] after() running')
      const admin = createAdminClient()
      try {
      // Load recent context for agent responses
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(30)

      const chatContext = (recentMessages ?? []).reverse()

      // Clean content: strip @mentions for classification
      const cleanContent = content.replace(/@(claude-\w+|all|agents)/gi, '').trim()

      // Classify intent once — same for all agents
      console.log('[mention] classifying:', cleanContent)
      const { mode, confidence } = await classifyIntent(cleanContent, '', apiKey)
      console.log('[mention] classified:', mode, confidence)
      const resolvedMode = confidence >= 0.70 ? mode : 'brainstorm'

      if (resolvedMode === 'plan') {
        // Plan produces one proposal from the first (orchestrator) agent only
        const orchestratorAgentId = targetAgentIds[0]
        try {
          const agentsForPlan = allAgents.map((m) => ({ agentId: m.agent_id, userId: m.user_id }))
          const proposal = await decomposeSpec({
            spec: cleanContent,
            agents: agentsForPlan,
            chatContext: chatContext.map((m) => m.content).join('\n'),
            apiKey,
          })

          await admin.from('messages').insert({
            session_id: sessionId,
            sender_type: 'agent',
            agent_id: orchestratorAgentId,
            content: `Here is my proposed plan for: "${cleanContent}"`,
            mode: 'plan',
            metadata: proposal as object,
          })
        } catch (err) {
          await admin.from('messages').insert({
            session_id: sessionId,
            sender_type: 'system',
            content: `${orchestratorAgentId} failed to plan: ${err instanceof Error ? err.message : 'Unknown error'}`,
            metadata: {} as object,
          })
        }
      } else {
        // ASSUMPTION: Phase 3 sessions are small (≤ 5 agents). No cap on @all.
        // Process each agent sequentially to prevent chat flooding
        for (const agentId of targetAgentIds) {
          try {
            console.log('[mention] generating response for', agentId)
            const { text } = await generateResponse({
              mode: resolvedMode,
              content: cleanContent,
              chatContext,
              agentId,
              apiKey,
            })
            console.log('[mention] got response, inserting...')

            const { error: insertErr } = await admin.from('messages').insert({
              session_id: sessionId,
              sender_type: 'agent',
              agent_id: agentId,
              content: text,
              mode: resolvedMode,
              metadata: {},
            })
            console.log('[mention] insert result:', insertErr ?? 'ok')
          } catch (err) {
            await admin.from('messages').insert({
              session_id: sessionId,
              sender_type: 'system',
              content: `${agentId} failed to respond: ${err instanceof Error ? err.message : 'Unknown error'}`,
              metadata: {} as object,
            })
          }
        }
      }
      } catch (err) {
        console.error('[mention] after() failed:', err)
      }
    })())
  }

  return NextResponse.json({ ok: true, messageId: humanMsg.id })
}
