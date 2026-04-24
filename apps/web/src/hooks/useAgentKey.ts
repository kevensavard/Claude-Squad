'use client'

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'squad_agent_key'

interface AgentKeyState {
  apiKey: string | null
  isConnected: boolean
  setKey: (key: string) => void
  clearKey: () => void
}

export function useAgentKey(): AgentKeyState {
  const [apiKey, setApiKey] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) setApiKey(stored)
  }, [])

  const setKey = useCallback((key: string) => {
    const trimmed = key.trim() || null
    setApiKey(trimmed)
    if (trimmed) sessionStorage.setItem(STORAGE_KEY, trimmed)
    else sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  const clearKey = useCallback(() => {
    setApiKey(null)
    sessionStorage.removeItem(STORAGE_KEY)
  }, [])

  return {
    apiKey,
    isConnected: apiKey !== null,
    setKey,
    clearKey,
  }
}
