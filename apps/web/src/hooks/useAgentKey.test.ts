import { renderHook, act } from '@testing-library/react'
import { useAgentKey } from './useAgentKey'

describe('useAgentKey', () => {
  it('starts with no key', () => {
    const { result } = renderHook(() => useAgentKey())
    expect(result.current.apiKey).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it('stores a key when setKey is called', () => {
    const { result } = renderHook(() => useAgentKey())
    act(() => { result.current.setKey('sk-ant-test123') })
    expect(result.current.apiKey).toBe('sk-ant-test123')
    expect(result.current.isConnected).toBe(true)
  })

  it('clears the key when clearKey is called', () => {
    const { result } = renderHook(() => useAgentKey())
    act(() => { result.current.setKey('sk-ant-test123') })
    act(() => { result.current.clearKey() })
    expect(result.current.apiKey).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })
})
