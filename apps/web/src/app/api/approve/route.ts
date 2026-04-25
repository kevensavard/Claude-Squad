import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { Task } from '@squad/types'

interface ApproveBody {
  sessionId: string
  proposalMessageId: string
  modifiedTasks?: ProposalTask[]
}

interface ProposalTask {
  id: string
  title: string
  description: string
  assignedAgentId: string
  fileOwnership: string[]
  dependsOn: string[]
  estimatedTokens: number
}

interface ProposalCard {
  type: 'proposal'
  tasks: ProposalTask[]
}

const SHARED_RO_PATHS = ['src/types/shared.ts', 'package.json', 'tsconfig.json', '.env.example']

function partyBase(sessionId: string): string {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999'
  const scheme = host.startsWith('localhost') ? 'http' : 'https'
  return `${scheme}://${host}/parties/main/${sessionId}`
}

function proposalTaskToTask(pt: ProposalTask): Task {
  return {
    id: pt.id,
    title: pt.title,
    description: pt.description,
    acceptanceCriteria: [],
    assignedAgentId: pt.assignedAgentId,
    status: 'pending',
    fileOwnership: pt.fileOwnership,
    dependsOn: pt.dependsOn,
    estimatedTokens: pt.estimatedTokens,
    createdAt: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: ApproveBody
  try {
    body = await req.json() as ApproveBody
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { sessionId, proposalMessageId } = body
  if (!sessionId || !proposalMessageId) {
    return NextResponse.json({ error: 'sessionId and proposalMessageId required' }, { status: 400 })
  }

  // Validate host
  const { data: session } = await supabase
    .from('sessions')
    .select('host_user_id')
    .eq('id', sessionId)
    .single()

  if (!session || session.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the session host can approve' }, { status: 403 })
  }

  // Fetch proposal message
  const { data: proposalMsg } = await supabase
    .from('messages')
    .select('id, mode, metadata')
    .eq('id', proposalMessageId)
    .eq('session_id', sessionId)
    .single()

  if (
    !proposalMsg ||
    proposalMsg.mode !== 'plan' ||
    !proposalMsg.metadata ||
    typeof proposalMsg.metadata !== 'object' ||
    (proposalMsg.metadata as Record<string, unknown>).type !== 'proposal'
  ) {
    return NextResponse.json({ error: 'Invalid proposal message' }, { status: 400 })
  }

  const tasks: Task[] = (body.modifiedTasks && body.modifiedTasks.length > 0)
    ? body.modifiedTasks.map(proposalTaskToTask)
    : (proposalMsg.metadata as ProposalCard).tasks.map(proposalTaskToTask)

  if (tasks.length === 0) {
    return NextResponse.json({ error: 'Proposal contains no tasks' }, { status: 400 })
  }

  // Build ownership entries
  const ownerships: Array<{ path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }> = []

  for (const task of tasks) {
    for (const pattern of task.fileOwnership) {
      ownerships.push({ path: pattern, agentId: task.assignedAgentId, taskId: task.id, tier: 'owned' })
    }
  }
  for (const path of SHARED_RO_PATHS) {
    ownerships.push({ path, agentId: 'claude-1', taskId: 'shared', tier: 'shared-ro' })
  }

  // Dispatch to SSS
  const dispatchRes = await fetch(`${partyBase(sessionId)}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks, ownerships }),
  })

  if (!dispatchRes.ok) {
    return NextResponse.json({ error: 'SSS dispatch failed' }, { status: 502 })
  }

  // Confirmation message
  const adminSupabase = createAdminClient()
  await adminSupabase.from('messages').insert({
    session_id: sessionId,
    sender_type: 'system',
    content: `Build approved. Dispatching ${tasks.length} task(s) to agents.`,
    metadata: { type: 'build_dispatched', proposalMessageId, taskCount: tasks.length },
  })

  return NextResponse.json({ ok: true })
}
