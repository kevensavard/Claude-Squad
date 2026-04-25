'use client'

interface TokenEntry {
  userId: string
  displayName: string
  totalTokensIn: number
  totalTokensOut: number
  totalCostUsd: number
}

interface BuildSummaryData {
  type: 'build_summary'
  prUrl: string | null
  mergedAgents: string[]
  conflictAgents: string[]
  sessionId: string
  tokenSummary: TokenEntry[]
}

interface BuildSummaryCardProps {
  metadata: Record<string, unknown>
}

export function BuildSummaryCard({ metadata }: BuildSummaryCardProps) {
  const data = metadata as unknown as BuildSummaryData
  const totalCost = data.tokenSummary.reduce((sum, e) => sum + e.totalCostUsd, 0)
  const totalTokens = data.tokenSummary.reduce(
    (sum, e) => sum + e.totalTokensIn + e.totalTokensOut,
    0
  )

  return (
    <div className="mx-4 my-2 border border-green-200 dark:border-green-800 rounded-xl overflow-hidden">
      <div className="bg-green-50 dark:bg-green-900/30 px-4 py-3 border-b border-green-200 dark:border-green-800">
        <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">Build Complete</h3>
        <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
          {data.mergedAgents.length} agent(s) merged · ~{totalTokens.toLocaleString()} tokens · ${totalCost.toFixed(4)}
        </p>
      </div>

      <div className="p-4 space-y-3">
        {data.prUrl && (
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pull Request</p>
            <a
              href={data.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {data.prUrl}
            </a>
          </div>
        )}

        {data.mergedAgents.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Merged agents</p>
            <div className="flex flex-wrap gap-1">
              {data.mergedAgents.map((a) => (
                <span
                  key={a}
                  className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.conflictAgents.length > 0 && (
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Merge conflicts</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {data.conflictAgents.join(', ')} — manual resolution needed
            </p>
          </div>
        )}

        {data.tokenSummary.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Token cost breakdown</p>
            <div className="space-y-1">
              {data.tokenSummary.map((entry) => (
                <div key={entry.userId} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300">{entry.displayName}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {(entry.totalTokensIn + entry.totalTokensOut).toLocaleString()} tokens · ${entry.totalCostUsd.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <a
          href={`/session/${data.sessionId}/summary`}
          className="block text-center text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mt-1"
        >
          View full session summary →
        </a>
      </div>
    </div>
  )
}
