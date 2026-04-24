import type { SSSHttpOptions, OwnershipResult } from './types.js'
import type { ContextInjection } from '@squad/types'
import type WebSocket from 'ws'

const SHARED_RO_PATHS = [
  'src/types/shared.ts',
  'package.json',
  'tsconfig.json',
  '.env.example',
]

function sssBase(opts: SSSHttpOptions): string {
  const scheme = opts.partyHost.startsWith('localhost') ? 'http' : 'https'
  return `${scheme}://${opts.partyHost}/parties/main/${opts.sessionId}`
}

export async function getOwnership(
  opts: SSSHttpOptions,
  filePath: string
): Promise<OwnershipResult> {
  const encoded = encodeURIComponent(filePath.replace(/^\//, ''))
  const res = await fetch(`${sssBase(opts)}/ownership/${encoded}`)
  if (!res.ok) return { owned: false, agentId: null, tier: null }
  return res.json() as Promise<OwnershipResult>
}

export async function postOwnership(
  opts: SSSHttpOptions,
  body: { path: string; agentId: string; taskId: string; tier: 'owned' | 'shared-ro' }
): Promise<void> {
  await fetch(`${sssBase(opts)}/ownership`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function getContextInjection(
  opts: SSSHttpOptions,
  agentId: string
): Promise<ContextInjection> {
  const res = await fetch(`${sssBase(opts)}/context-injection/${agentId}`)
  if (!res.ok) throw new Error(`Context injection failed: ${res.status}`)
  return res.json() as Promise<ContextInjection>
}

export async function postTokenUpdate(
  opts: SSSHttpOptions,
  body: { userId: string; tokensIn: number; tokensOut: number }
): Promise<void> {
  await fetch(`${sssBase(opts)}/token-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function broadcastAgentMessage(
  ws: WebSocket,
  agentId: string,
  content: string,
  mode: 'building' | 'status'
): void {
  ws.send(JSON.stringify({ type: 'broadcast_agent_message', agentId, content, mode }))
}

export function sendWsMessage(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg))
}

export function isSharedRO(filePath: string): boolean {
  const normalized = filePath.replace(/^\//, '')
  return SHARED_RO_PATHS.includes(normalized)
}
