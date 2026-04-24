export const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'claude-u1': {
    bg: 'bg-purple-50 dark:bg-purple-950',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-700 dark:text-purple-300',
  },
  'claude-u2': {
    bg: 'bg-teal-50 dark:bg-teal-950',
    border: 'border-teal-300 dark:border-teal-700',
    text: 'text-teal-700 dark:text-teal-300',
  },
  'claude-u3': {
    bg: 'bg-amber-50 dark:bg-amber-950',
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-700 dark:text-amber-300',
  },
  'claude-u4': {
    bg: 'bg-rose-50 dark:bg-rose-950',
    border: 'border-rose-300 dark:border-rose-700',
    text: 'text-rose-700 dark:text-rose-300',
  },
}

export function getAgentColor(agentId: string): { bg: string; border: string; text: string } {
  if (agentId in AGENT_COLORS) return AGENT_COLORS[agentId]!
  const keys = Object.keys(AGENT_COLORS)
  const digits = agentId.replace(/\D/g, '')
  const index = digits.length > 0 ? parseInt(digits, 10) % keys.length : 0
  return AGENT_COLORS[keys[index]!]!
}
