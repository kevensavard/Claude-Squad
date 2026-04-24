'use client'

import { useState } from 'react'

interface ConnectionModalProps {
  agentId: string
  sessionId: string
  onKeySubmit: (key: string) => void
  onClose: () => void
}

export function ConnectionModal({ agentId, sessionId, onKeySubmit, onClose }: ConnectionModalProps) {
  const [tab, setTab] = useState<'key' | 'skill'>('key')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmitKey(e: React.FormEvent) {
    e.preventDefault()
    if (!key.startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-')
      return
    }
    onKeySubmit(key.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Connect {agentId}
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
            Local Claude Code (squad-skill)
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
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Run this in your terminal. Your local Claude Code will connect as <strong>{agentId}</strong>:
            </p>
            <pre className="bg-slate-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto select-all">
              {`npx @squad/skill connect --agent ${agentId} --session ${sessionId}`}
            </pre>
            <p className="text-xs text-slate-400">
              Your Claude Code API key is used automatically. Costs appear on your Anthropic bill.
            </p>
            <p className="text-xs text-slate-400">
              Once connected, the agent indicator next to your name will turn green.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              I&apos;ll set it up now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
