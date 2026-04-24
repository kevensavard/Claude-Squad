export interface ParsedMessage {
  raw: string
  mentions: string[]
  isAllMention: boolean
  cleanContent: string
}

export function parseMention(raw: string): ParsedMessage {
  const mentionRegex = /@(claude-\d+|all|agents)/gi
  const mentions: string[] = []
  let match

  while ((match = mentionRegex.exec(raw)) !== null) {
    const tag = match[1]!.toLowerCase()
    mentions.push(tag === 'agents' ? 'all' : tag)
  }

  return {
    raw,
    mentions: [...new Set(mentions)],
    isAllMention: mentions.includes('all'),
    cleanContent: raw.replace(mentionRegex, '').replace(/\s{2,}/g, ' ').trim(),
  }
}
