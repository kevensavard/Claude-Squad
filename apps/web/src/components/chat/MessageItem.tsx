import type { Message } from '@/types/database'
import { HumanMessage } from './HumanMessage'
import { AgentMessage } from './AgentMessage'
import { SystemNotice } from './SystemNotice'

interface MessageItemProps {
  message: Message
  currentUserId: string
}

export function MessageItem({ message, currentUserId }: MessageItemProps) {
  if (message.sender_type === 'human') {
    return <HumanMessage message={message} currentUserId={currentUserId} />
  }
  if (message.sender_type === 'system') {
    return <SystemNotice message={message} />
  }
  return <AgentMessage message={message} />
}
