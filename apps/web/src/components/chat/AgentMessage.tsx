import { getAgentColor } from '@squad/types'
import type { Message } from '@/types/database'

interface AgentMessageProps {
  message: Message
}

const MODE_BADGE: Record<string, string> = {
  brainstorm: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  plan: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  build: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  status: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const MODE_LABEL: Record<string, string> = {
  brainstorm: '💡 brainstorm',
  review: '🔍 review',
  plan: '📋 plan',
  build: '🔨 build',
  status: '📊 status',
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function AgentMessage({ message }: AgentMessageProps) {
  const agentId = message.agent_id ?? 'claude-u1'
  const colors = getAgentColor(agentId)
  const modeBadgeClass = message.mode ? MODE_BADGE[message.mode] : ''
  const modeLabel = message.mode ? MODE_LABEL[message.mode] : null

  return (
    <div className={`mx-4 my-1 rounded-lg border-l-4 p-3 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${colors.text}`}>{agentId}</span>
        {modeLabel && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${modeBadgeClass}`}>
            {modeLabel}
          </span>
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {formatTime(message.created_at)}
        </span>
      </div>
      <p className="text-sm font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200">
        {message.content || <span className="opacity-40 italic">typing…</span>}
      </p>
    </div>
  )
}
