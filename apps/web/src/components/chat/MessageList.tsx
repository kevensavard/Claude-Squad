'use client'

import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'
import { useEffect, useRef } from 'react'
import type { Message, SessionMember } from '@/types/database'
import { AgentMessage } from './AgentMessage'
import { ProposalCard } from './ProposalCard'
import type { ProposalCard as ProposalCardData } from '@/lib/anthropic/plan'

interface MessageListProps {
  sessionId: string
  currentUserId: string
  initialMessages: Message[]
  currentMember?: SessionMember
  members?: SessionMember[]
  approveSessionId?: string
  isHost?: boolean
}

export function MessageList({
  sessionId,
  currentUserId,
  initialMessages,
  isHost = false,
}: MessageListProps) {
  const messages = useRealtimeMessages(sessionId, initialMessages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {messages.map((msg) => {
        if (msg.sender_type === 'system') {
          return (
            <div key={msg.id} className="text-center py-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
          )
        }

        if (msg.sender_type === 'agent') {
          if (
            msg.mode === 'plan' &&
            msg.metadata &&
            typeof msg.metadata === 'object' &&
            'type' in msg.metadata &&
            msg.metadata.type === 'proposal'
          ) {
            return (
              <div key={msg.id} className="py-2">
                <div className="flex items-center gap-2 mb-2 mx-4">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{msg.agent_id}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 mx-4">{msg.content}</p>
                <ProposalCard
                  messageId={msg.id}
                  sessionId={sessionId}
                  proposal={msg.metadata as unknown as ProposalCardData}
                  isHost={isHost}
                />
              </div>
            )
          }
          return <AgentMessage key={msg.id} message={msg} />
        }

        // Human message
        const isOwn = msg.user_id === currentUserId
        return (
          <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} py-1`}>
            <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
              isOwn
                ? 'bg-purple-600 text-white rounded-br-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
