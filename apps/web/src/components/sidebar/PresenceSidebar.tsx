'use client'

import type { SessionMember } from '@/types/database'
import type { AgentRecord } from '@squad/types'
import { AgentStatusPill } from './AgentStatusPill'
import { TokenMeter } from './TokenMeter'

interface PresenceSidebarProps {
  members: SessionMember[]
  agentStatuses: Record<string, AgentRecord>
  tokenMeters: Record<string, { tokensIn: number; tokensOut: number }>
  currentUserId: string
  connected: boolean
}

export function PresenceSidebar({
  members,
  agentStatuses,
  tokenMeters,
  currentUserId,
  connected,
}: PresenceSidebarProps) {
  return (
    <aside className="w-60 border-r border-slate-200 dark:border-slate-700 flex flex-col p-3 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Members ({members.length})
        </h2>
        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-slate-400'}`}
          aria-label={connected ? 'Online' : 'Offline'}
          title={connected ? 'Connected' : 'Reconnecting…'}
        />
      </div>

      <div className="space-y-4">
        {members.map((member) => {
          const agent = agentStatuses[member.agent_id]
          const meter = tokenMeters[member.user_id]
          const isCurrentUser = member.user_id === currentUserId
          const isOnline = agent
            ? Date.now() - agent.lastHeartbeat < 90_000
            : false
          const isOrchestrator = agent?.role === 'orchestrator'

          return (
            <div key={member.user_id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-500' : 'bg-slate-400'}`}
                  aria-label={isOnline ? 'Online' : 'Offline'}
                />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {member.display_name.replace(/^Claude \(/, '').replace(/\)$/, '')}
                  {member.is_host && (
                    <span className="ml-1 text-xs text-slate-500">(host)</span>
                  )}
                  {isOrchestrator && (
                    <span className="ml-1 text-xs text-amber-500" title="Orchestrator">
                      ♛
                    </span>
                  )}
                  {isCurrentUser && (
                    <span className="ml-1 text-xs text-purple-500">(you)</span>
                  )}
                </span>
              </div>

              <div className="ml-4 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {member.agent_id}
                  </span>
                  {agent && <AgentStatusPill status={agent.status} />}
                </div>
                {meter && (
                  <TokenMeter tokensIn={meter.tokensIn} tokensOut={meter.tokensOut} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
