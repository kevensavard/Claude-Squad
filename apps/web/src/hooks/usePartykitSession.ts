'use client'

import { useEffect, useState, useRef } from 'react'
import PartySocket from 'partysocket'
import type { AgentRegistry, ServerMessage, ClientMessage } from '@squad/types'

interface PartykitState {
  agents: AgentRegistry
  connected: boolean
}

export function usePartykitSession(sessionId: string, agentId: string): PartykitState {
  const [agents, setAgents] = useState<AgentRegistry>({})
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<PartySocket | null>(null)

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999'
    const socket = new PartySocket({
      host,
      room: sessionId,
    })
    socketRef.current = socket

    socket.addEventListener('open', () => {
      setConnected(true)
      const regMsg: ClientMessage = {
        type: 'register_agent',
        agentId,
        userId: sessionId,
        displayName: `Claude (user)`,
      }
      socket.send(JSON.stringify(regMsg))
    })

    socket.addEventListener('close', () => setConnected(false))

    socket.addEventListener('message', (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage
        if (msg.type === 'agent_update') {
          setAgents((prev) => ({ ...prev, [msg.payload.agentId]: msg.payload }))
        }
      } catch {
        // ignore malformed
      }
    })

    const heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        const hb: ClientMessage = { type: 'heartbeat', agentId }
        socket.send(JSON.stringify(hb))
      }
    }, 30_000)

    return () => {
      clearInterval(heartbeatInterval)
      socket.close()
    }
  }, [sessionId, agentId])

  return { agents, connected }
}
