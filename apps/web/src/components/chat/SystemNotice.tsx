import type { Message } from '@/types/database'

interface SystemNoticeProps {
  message: Message
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SystemNotice({ message }: SystemNoticeProps) {
  return (
    <div className="flex items-center gap-3 py-1 px-4" role="status">
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {message.content}
        <span className="ml-2 opacity-60">{formatTime(message.created_at)}</span>
      </span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}
