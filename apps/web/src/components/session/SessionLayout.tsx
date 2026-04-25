'use client'

import { useState } from 'react'
import type { SessionMember, Message, Session } from '@/types/database'
import { MessageList } from '../chat/MessageList'
import { MessageInput } from '../chat/MessageInput'
import { PresenceSidebar } from '../sidebar/PresenceSidebar'
import { ConnectionModal } from '../onboarding/ConnectionModal'
import { usePartykitSession } from '@/hooks/usePartykitSession'
import { useAgentKey } from '@/hooks/useAgentKey'
import { createClient } from '@/lib/supabase/client'

interface SessionLayoutProps {
  session: Session
  members: SessionMember[]
  initialMessages: Message[]
  currentUserId: string
  currentMember: SessionMember
}

export function SessionLayout({
  session,
  members,
  initialMessages,
  currentUserId,
  currentMember,
}: SessionLayoutProps) {
  const { agents, connected } = usePartykitSession(session.id, currentMember.agent_id)
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([])
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const { apiKey, isConnected, setKey } = useAgentKey()

  const role: 'orchestrator' | 'agent' = session.host_user_id === currentUserId ? 'orchestrator' : 'agent'

  const availableAgentIds = members.map((m) => m.agent_id)

  async function handleSend(content: string) {
    const optimistic: Message = {
      id: crypto.randomUUID(),
      session_id: session.id,
      sender_type: 'human',
      user_id: currentUserId,
      agent_id: null,
      content,
      mode: null,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    setOptimisticMessages((prev) => [...prev, optimistic])

    const hasMention = /@(claude-\w+|all|agents)/i.test(content)

    try {
      if (hasMention) {
        await fetch('/api/mention', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            content,
            apiKey: apiKey ?? undefined,
          }),
        })
      } else {
        const supabase = createClient()
        await supabase.from('messages').insert({
          session_id: session.id,
          sender_type: 'human',
          user_id: currentUserId,
          content,
          metadata: {},
        })
      }
    } finally {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <h1 className="font-semibold text-slate-900 dark:text-white truncate">{session.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          session.status === 'building'
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          {session.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowConnectionModal(true)}
            className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
              isConnected
                ? 'border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                : 'border-slate-300 text-slate-600 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600'
            }`}
          >
            {isConnected ? `● ${currentMember.agent_id} connected` : `Connect ${currentMember.agent_id}`}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <PresenceSidebar
          members={members}
          agentStatuses={agents}
          tokenMeters={{}}
          currentUserId={currentUserId}
          connected={connected}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          <MessageList
            sessionId={session.id}
            currentUserId={currentUserId}
            initialMessages={[...initialMessages, ...optimisticMessages]}
            currentMember={currentMember}
            members={members}
            approveSessionId={session.id}
            isHost={session.host_user_id === currentUserId}
          />
          <MessageInput
            sessionId={session.id}
            currentUserId={currentUserId}
            availableAgentIds={availableAgentIds}
            onSend={handleSend}
          />
        </main>

        <aside className="w-72 border-l border-slate-200 dark:border-slate-700 p-3 hidden lg:block">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Tasks
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tasks appear here after the build starts.
          </p>
        </aside>
      </div>

      {showConnectionModal && (
        <ConnectionModal
          agentId={currentMember.agent_id}
          sessionId={session.id}
          role={role}
          agentStatuses={agents}
          onKeySubmit={setKey}
          onClose={() => setShowConnectionModal(false)}
        />
      )}
    </div>
  )
}
