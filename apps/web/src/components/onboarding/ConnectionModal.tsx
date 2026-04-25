'use client'

import { useState, useEffect } from 'react'
import type { AgentRecord } from '@squad/types'

interface ConnectionModalProps {
  agentId: string
  sessionId: string
  role: 'orchestrator' | 'agent'
  agentStatuses: Record<string, AgentRecord>
  onKeySubmit: (key: string) => void
  onClose: () => void
}

export function ConnectionModal({
  agentId,
  sessionId,
  role,
  agentStatuses,
  onKeySubmit,
  onClose,
}: ConnectionModalProps) {
  const [tab, setTab] = useState<'key' | 'skill'>('key')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)

  const command = `npx @squad/skill connect --session ${sessionId} --agent ${agentId} --role ${role}`

  // Auto-close when agent registers via Claude Code (tab === 'skill' + waiting)
  useEffect(() => {
    if (!waiting) return
    const agent = agentStatuses[agentId]
    if (agent && Date.now() - agent.lastHeartbeat < 30_000) {
      onClose()
    }
  }, [agentStatuses, agentId, waiting, onClose])

  function handleSubmitKey(e: React.FormEvent) {
    e.preventDefault()
    if (!key.startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-')
      return
    }
    onKeySubmit(key.trim())
    onClose()
  }

  function handleStartWaiting() {
    setWaiting(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Connect {agentId}
            {role === 'orchestrator' && (
              <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                (orchestrator)
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose how your agent responds. Your API key is never saved — it stays in your browser tab only.
        </p>

        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setTab('key')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'key'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            API key in browser
          </button>
          <button
            onClick={() => setTab('skill')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'skill'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Local Claude Code
          </button>
        </div>

        {tab === 'key' && (
          <form onSubmit={handleSubmitKey} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Anthropic API key
              </label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={key}
                onChange={(e) => { setKey(e.target.value); setError(null) }}
                required
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
            <p className="text-xs text-slate-400">
              Used only for this session. Not stored anywhere. Costs appear on your Anthropic bill.
            </p>
            <button
              type="submit"
              disabled={!key.startsWith('sk-ant-')}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Connect with this key
            </button>
          </form>
        )}

        {tab === 'skill' && (
          <div className="space-y-3">
            {!waiting ? (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Run this in your terminal. Your local Claude Code will connect as <strong>{agentId}</strong>:
                </p>
                <pre className="bg-slate-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto select-all whitespace-pre-wrap">
                  {command}
                </pre>
                <p className="text-xs text-slate-400">
                  Requires Claude Code CLI. Install at{' '}
                  <a
                    href="https://claude.ai/code"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-slate-600"
                  >
                    claude.ai/code
                  </a>
                </p>
                <button
                  onClick={handleStartWaiting}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  I ran it — waiting for connection
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Waiting for <strong>{agentId}</strong> to connect…
                </p>
                <button
                  onClick={() => setWaiting(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
