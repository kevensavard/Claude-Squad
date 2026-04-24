interface PreToolUseInput {
  tool_name: string
  tool_input: Record<string, unknown>
}

interface HookDecision {
  decision?: 'block'
  reason?: string
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf\s+\//, reason: 'Recursive root deletion blocked' },
  { pattern: /git\s+push\s+.*--force/, reason: 'Force push blocked — use orchestrator merge flow' },
  { pattern: /git\s+checkout\s+main/, reason: 'Cannot switch to main branch — stay on your agent branch' },
  { pattern: /npm\s+install\s+-g/, reason: 'Global npm installs blocked in sandbox' },
  { pattern: /curl.*\|\s*sh/, reason: 'Piped shell execution blocked' },
  { pattern: /git\s+merge|git\s+rebase/, reason: 'Do not merge/rebase manually. Signal DONE to the orchestrator — it handles merging.' },
]

export function makeBashSafetyHook() {
  return async (input: PreToolUseInput): Promise<HookDecision> => {
    const command = (input.tool_input.command ?? '') as string
    for (const { pattern, reason } of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { decision: 'block', reason }
      }
    }
    return {}
  }
}
