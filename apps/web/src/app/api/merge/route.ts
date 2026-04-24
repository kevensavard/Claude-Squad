import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
    .select('host_user_id, status')
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
    content: 'Merge sequence triggered. Collecting agent branches…',
    metadata: { type: 'merge_triggered' },
  })

  await supabase.from('sessions').update({ status: 'done' }).eq('id', sessionId)

  // Full merge sequence (Octokit branch merge + PR creation) is Phase 5

  return NextResponse.json({ ok: true })
}
