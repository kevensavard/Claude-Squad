interface TokenMeterProps {
  tokensIn: number
  tokensOut: number
  warningThreshold?: number
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function estimateCost(tokensIn: number, tokensOut: number): string {
  const cost = (tokensIn / 1_000_000) * 3 + (tokensOut / 1_000_000) * 15
  if (cost < 0.01) return '<$0.01'
  return `~$${cost.toFixed(2)}`
}

export function TokenMeter({ tokensIn, tokensOut, warningThreshold = 50_000 }: TokenMeterProps) {
  const total = tokensIn + tokensOut
  const pct = Math.min((total / warningThreshold) * 100, 100)
  const isWarning = total > warningThreshold * 0.8
  const isOver = total > warningThreshold

  const barColor = isOver
    ? 'bg-red-500'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-purple-500'

  return (
    <div className="space-y-1" title={`${tokensIn.toLocaleString()} in · ${tokensOut.toLocaleString()} out · ${estimateCost(tokensIn, tokensOut)}`}>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{formatTokens(total)} tok</span>
        <span>{estimateCost(tokensIn, tokensOut)}</span>
      </div>
      <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
