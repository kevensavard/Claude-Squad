'use client'

import { useState } from 'react'
import type { ProposalCard as ProposalCardData, ProposalTask } from '@/lib/anthropic/plan'

interface ProposalCardProps {
  messageId: string
  sessionId: string
  proposal: ProposalCardData
  isHost: boolean
}

function TaskRow({ task }: { task: ProposalTask }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{task.description}</p>
        </div>
        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium">
          {task.assignedAgentId}
        </span>
      </div>
      {task.fileOwnership.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {task.fileOwnership.map((f) => (
            <code key={f} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
              {f}
            </code>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400">~{task.estimatedTokens.toLocaleString()} tokens</p>
    </div>
  )
}

export function ProposalCard({ messageId, sessionId, proposal, isHost }: ProposalCardProps) {
  const [approving, setApproving] = useState(false)
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setApproving(true)
    setError(null)
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, proposalMessageId: messageId }),
      })
      if (res.ok) {
        setApproved(true)
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Approval failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">📋 Build Proposal</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {proposal.tasks.length} tasks · ~{proposal.totalEstimatedTokens.toLocaleString()} total tokens
        </p>
      </div>

      <div className="p-4 space-y-2">
        {proposal.tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>

      {Object.keys(proposal.tokenSplitPreview).length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Estimated cost split:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(proposal.tokenSplitPreview).map(([userId, tokens]) => (
              <span key={userId} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                {userId.slice(0, 8)}… — {tokens.toLocaleString()} tokens
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-4 flex gap-2 items-center">
        {isHost ? (
          <>
            <button
              onClick={handleApprove}
              disabled={approving || approved}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {approved ? 'Build started ✓' : approving ? 'Starting…' : 'Approve & Build'}
            </button>
            <button
              disabled={approved}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Modify
            </button>
          </>
        ) : (
          <p className="text-xs text-slate-400">Only the session host can approve the plan.</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
