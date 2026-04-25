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

function EditableTaskRow({
  task,
  onChange,
}: {
  task: ProposalTask
  onChange: (updated: ProposalTask) => void
}) {
  return (
    <div className="border border-blue-300 dark:border-blue-600 rounded-lg p-3 space-y-2 bg-blue-50/30 dark:bg-blue-900/10">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 text-sm font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={task.title}
          onChange={(e) => onChange({ ...task, title: e.target.value })}
          placeholder="Task title"
        />
        <input
          className="w-28 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-purple-700 dark:text-purple-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={task.assignedAgentId}
          onChange={(e) => onChange({ ...task, assignedAgentId: e.target.value })}
          placeholder="Agent ID"
        />
      </div>
      <textarea
        className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-slate-500 dark:text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        rows={2}
        value={task.description}
        onChange={(e) => onChange({ ...task, description: e.target.value })}
        placeholder="Task description"
      />
      {task.fileOwnership.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
  const [modifying, setModifying] = useState(false)
  const [editedTasks, setEditedTasks] = useState<ProposalTask[]>(proposal.tasks)
  const [error, setError] = useState<string | null>(null)

  function updateTask(index: number, updated: ProposalTask) {
    setEditedTasks((prev) => prev.map((t, i) => (i === index ? updated : t)))
  }

  async function handleApprove(tasksOverride?: ProposalTask[]) {
    setApproving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { sessionId, proposalMessageId: messageId }
      if (tasksOverride) body.modifiedTasks = tasksOverride
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setApproved(true)
        setModifying(false)
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
          {modifying && <span className="ml-2 text-blue-500">· editing</span>}
        </p>
      </div>

      <div className="p-4 space-y-2">
        {modifying
          ? editedTasks.map((task, i) => (
              <EditableTaskRow key={task.id} task={task} onChange={(u) => updateTask(i, u)} />
            ))
          : proposal.tasks.map((task) => (
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
          modifying ? (
            <>
              <button
                onClick={() => handleApprove(editedTasks)}
                disabled={approving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {approving ? 'Starting…' : 'Apply & Build'}
              </button>
              <button
                onClick={() => { setEditedTasks(proposal.tasks); setModifying(false) }}
                disabled={approving}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleApprove()}
                disabled={approving || approved}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {approved ? 'Build started ✓' : approving ? 'Starting…' : 'Approve & Build'}
              </button>
              <button
                onClick={() => setModifying(true)}
                disabled={approved}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                Modify
              </button>
            </>
          )
        ) : (
          <p className="text-xs text-slate-400">Only the session host can approve the plan.</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
