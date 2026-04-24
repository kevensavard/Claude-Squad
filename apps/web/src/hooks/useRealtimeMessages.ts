'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeMessages(sessionId: string, initialMessages: Message[]) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let active = true

    async function setup() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }

      // Remove any stale channel with the same topic before subscribing
      const topic = `realtime:messages:${sessionId}`
      const stale = supabase.getChannels().find((ch) => ch.topic === topic)
      if (stale) await supabase.removeChannel(stale)

      if (!active) return

      const channel = supabase
        .channel(`messages:${sessionId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new as Message
            if (msg.session_id === sessionId) addMessage(msg)
          }
        )
        .subscribe()

      channelRef.current = channel
    }

    void setup()

    return () => {
      active = false
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [sessionId, addMessage])

  return messages
}
