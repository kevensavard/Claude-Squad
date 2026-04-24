import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: Promise<{ inviteCode: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { inviteCode } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, name, host_user_id, status, invite_code')
    .eq('invite_code', inviteCode)
    .single()

  if (sessionError || !session) {
    return NextResponse.json(
      { error: 'Session not found or invite code invalid' },
      { status: 404 }
    )
  }

  if (session.status === 'done' || session.status === 'archived') {
    return NextResponse.json({ error: 'Session is no longer active' }, { status: 410 })
  }

  const { data: existingMember } = await supabase
    .from('session_members')
    .select('agent_id')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    return NextResponse.json({ error: 'You are already a member of this session' }, { status: 409 })
  }

  const { data: members } = await supabase
    .from('session_members')
    .select('agent_id, user_id, display_name')
    .eq('session_id', session.id)

  const memberCount = members?.length ?? 0
  const nextAgentNumber = memberCount + 1
  const newAgentId = `claude-u${nextAgentNumber}`

  const { data: hostProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', session.host_user_id)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.display_name ?? user.email ?? 'Unknown'

  const { error: insertError } = await supabase
    .from('session_members')
    .insert({
      session_id: session.id,
      user_id: user.id,
      agent_id: newAgentId,
      display_name: `Claude (${displayName})`,
      is_host: false,
    })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 })
  }

  return NextResponse.json({
    sessionId: session.id,
    sessionName: session.name,
    hostDisplayName: hostProfile?.display_name ?? 'Unknown',
    memberCount: memberCount + 1,
    agentId: newAgentId,
  })
}
