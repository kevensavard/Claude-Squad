'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewSessionPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const body: { name: string; githubRepoUrl?: string } = { name }
      if (githubRepoUrl.trim()) body.githubRepoUrl = githubRepoUrl.trim()

      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json() as { sessionId?: string; error?: string }

      if (!res.ok || !data.sessionId) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      router.push(`/session/${data.sessionId}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-full max-w-md space-y-6 p-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">New session</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Give your squad session a name. You&apos;ll get an invite link to share.
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Session name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Invoicing SaaS MVP"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              GitHub repo URL <span className="text-slate-400">(optional — can add later)</span>
            </label>
            <input
              type="url"
              placeholder="https://github.com/you/your-repo"
              value={githubRepoUrl}
              onChange={(e) => setGithubRepoUrl(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || name.trim().length === 0}
            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create session'}
          </button>
        </form>
      </div>
    </div>
  )
}
