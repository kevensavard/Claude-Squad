import type { Message } from '@/types/database'

interface HumanMessageProps {
  message: Message
  currentUserId: string
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getInitial(displayName: string): string {
  return (displayName[0] ?? '?').toUpperCase()
}

export function HumanMessage({ message, currentUserId }: HumanMessageProps) {
  const isOwn = message.user_id === currentUserId
  const displayName = 'User'

  return (
    <div className={`flex items-start gap-2 px-4 py-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="w-7 h-7 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center text-xs font-medium text-purple-700 dark:text-purple-300 shrink-0">
        {getInitial(displayName)}
      </div>
      <div className={`max-w-xs lg:max-w-md space-y-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`px-3 py-2 rounded-2xl text-sm ${
          isOwn
            ? 'bg-purple-600 text-white rounded-br-sm'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-bl-sm'
        }`}>
          {message.content}
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
