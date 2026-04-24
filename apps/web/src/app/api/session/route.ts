import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface CreateSessionBody {
  name: string
  githubRepoUrl?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CreateSessionBody
  try {
    body = await req.json() as CreateSessionBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'Session name is required' }, { status: 400 })
  }

  if (body.githubRepoUrl !== undefined) {
    try {
      const parsed = new URL(body.githubRepoUrl)
      if (parsed.hostname !== 'github.com') {
        return NextResponse.json({ error: 'githubRepoUrl must be a github.com URL' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'githubRepoUrl must be a valid URL' }, { status: 400 })
    }
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      host_user_id: user.id,
      name: body.name.trim(),
      github_repo_url: body.githubRepoUrl ?? null,
    })
    .select()
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.display_name ?? user.email ?? 'Unknown'

  const { error: memberError } = await supabase
    .from('session_members')
    .insert({
      session_id: session.id,
      user_id: user.id,
      agent_id: 'claude-u1',
      display_name: `Claude (${displayName})`,
      is_host: true,
    })

  if (memberError) {
    return NextResponse.json({ error: 'Failed to add host to session' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return NextResponse.json({
    sessionId: session.id,
    inviteCode: session.invite_code,
    inviteUrl: `${appUrl}/join/${session.invite_code}`,
  })
}
