import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  params: Promise<{ inviteCode: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { inviteCode } = await params
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('invite_code', inviteCode)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ sessionId: session.id })
}
