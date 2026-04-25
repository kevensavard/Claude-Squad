import type { Message } from '@/types/database'
import { HumanMessage } from './HumanMessage'
import { AgentMessage } from './AgentMessage'
import { SystemNotice } from './SystemNotice'
import { ProposalCard } from './ProposalCard'
import { BuildSummaryCard } from './BuildSummaryCard'
import type { ProposalCard as ProposalCardData } from '@/lib/anthropic/plan'

interface MessageItemProps {
  message: Message
  currentUserId: string
  isHost: boolean
}

export function MessageItem({ message, currentUserId, isHost }: MessageItemProps) {
  if (message.sender_type === 'human') {
    return <HumanMessage message={message} currentUserId={currentUserId} />
  }

  if (message.sender_type === 'system') {
    const meta = message.metadata as Record<string, unknown>
    if (meta?.type === 'proposal') {
      return (
        <ProposalCard
          messageId={message.id}
          sessionId={message.session_id}
          proposal={meta as unknown as ProposalCardData}
          isHost={isHost}
        />
      )
    }
    if (meta?.type === 'build_summary') {
      return <BuildSummaryCard metadata={meta} />
    }
    return <SystemNotice message={message} />
  }

  return <AgentMessage message={message} />
}
