import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { SessionLayout } from '@/components/session/SessionLayout'
import type { Message, Session, SessionMember } from '@/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionPage({ params }: PageProps) {
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

  const currentMember = (members ?? []).find((m) => m.user_id === user.id)
  if (!currentMember) {
    redirect('/')
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  return (
    <SessionLayout
      session={session as Session}
      members={(members ?? []) as SessionMember[]}
      initialMessages={(messages ?? []) as Message[]}
      currentUserId={user.id}
      currentMember={currentMember as SessionMember}
    />
  )
}
