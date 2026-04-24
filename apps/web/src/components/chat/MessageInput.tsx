'use client'

import { useState, useRef, useCallback } from 'react'
import { parseMention } from '@/lib/mention-parser'

interface MessageInputProps {
  sessionId: string
  currentUserId: string
  availableAgentIds: string[]
  onSend: (content: string) => Promise<void>
  disabled?: boolean
}

export function MessageInput({
  sessionId: _sessionId,
  currentUserId: _currentUserId,
  availableAgentIds,
  onSend,
  disabled = false,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredAgents = ['all', ...availableAgentIds].filter((id) =>
    id.toLowerCase().startsWith(autocompleteFilter.toLowerCase())
  )

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setValue(text)

    const cursor = e.target.selectionStart ?? text.length
    const textBeforeCursor = text.slice(0, cursor)
    const atMatch = /@(\S*)$/.exec(textBeforeCursor)

    if (atMatch) {
      setAutocompleteFilter(atMatch[1] ?? '')
      setShowAutocomplete(true)
      setAutocompleteIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }

  function insertMention(agentId: string) {
    if (!textareaRef.current) return
    const cursor = textareaRef.current.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursor)
    const textAfterCursor = value.slice(cursor)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    const newText = textBeforeCursor.slice(0, atIndex) + `@${agentId} ` + textAfterCursor
    setValue(newText)
    setShowAutocomplete(false)
    textareaRef.current.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAutocompleteIndex((i) => Math.min(i + 1, filteredAgents.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAutocompleteIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const selected = filteredAgents[autocompleteIndex]
        if (selected) {
          e.preventDefault()
          insertMention(selected)
          return
        }
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleSend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || sending || disabled) return
    setSending(true)
    try {
      await onSend(trimmed)
      setValue('')
      setShowAutocomplete(false)
    } finally {
      setSending(false)
    }
  }, [value, sending, disabled, onSend])

  const parsed = parseMention(value)
  const hasMentions = parsed.mentions.length > 0

  return (
    <div className="relative border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      {showAutocomplete && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-10">
          {filteredAgents.map((id, i) => (
            <button
              key={id}
              className={`w-full text-left px-3 py-2 text-sm ${
                i === autocompleteIndex
                  ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(id) }}
              onMouseEnter={() => setAutocompleteIndex(i)}
            >
              @{id}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            placeholder={disabled ? 'Waiting for agent response…' : 'Message the squad… (@claude-1 to mention)'}
            rows={1}
            className="w-full resize-none px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 max-h-32 overflow-y-auto"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            aria-label="Message input"
          />
          {hasMentions && (
            <div className="flex flex-wrap gap-1 mt-1" aria-label="Mentions">
              {parsed.mentions.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                >
                  @{m}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => void handleSend()}
          disabled={!value.trim() || sending || disabled}
          className="shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          aria-label="Send message"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-1">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
