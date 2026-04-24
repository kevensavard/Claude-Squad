import type { AgentRecord } from '@squad/types'

interface AgentStatusPillProps {
  status: AgentRecord['status']
  size?: 'sm' | 'md'
}

const STATUS_STYLES: Record<AgentRecord['status'], string> = {
  idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  brainstorming: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  planning: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  building: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 animate-pulse',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  done: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  offline: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
}

export function AgentStatusPill({ status, size = 'sm' }: AgentStatusPillProps) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${textSize} ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}
