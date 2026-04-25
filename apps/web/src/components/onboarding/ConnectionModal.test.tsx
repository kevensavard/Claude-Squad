import { render, screen, fireEvent } from '@testing-library/react'
import { ConnectionModal } from './ConnectionModal'

describe('ConnectionModal', () => {
  const defaultProps = {
    agentId: 'claude-u1',
    sessionId: 'test-session-123',
    role: 'agent' as const,
    agentStatuses: {},
    onKeySubmit: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders API key tab by default with password input', () => {
    render(<ConnectionModal {...defaultProps} />)
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
    expect(screen.getByText('API key in browser')).toBeInTheDocument()
  })

  it('shows validation error when key does not start with sk-ant-', () => {
    render(<ConnectionModal {...defaultProps} />)
    const input = screen.getByPlaceholderText('sk-ant-...')
    fireEvent.change(input, { target: { value: 'invalid-key-here' } })
    fireEvent.submit(input.closest('form')!)
    expect(screen.getByText('Key must start with sk-ant-')).toBeInTheDocument()
    expect(defaultProps.onKeySubmit).not.toHaveBeenCalled()
  })

  it('calls onKeySubmit and onClose when valid key is submitted', () => {
    render(<ConnectionModal {...defaultProps} />)
    const input = screen.getByPlaceholderText('sk-ant-...')
    fireEvent.change(input, { target: { value: 'sk-ant-validkey123' } })
    fireEvent.submit(input.closest('form')!)
    expect(defaultProps.onKeySubmit).toHaveBeenCalledWith('sk-ant-validkey123')
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('shows session-specific CLI command on squad-skill tab', () => {
    render(<ConnectionModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Local Claude Code (squad-skill)'))
    expect(screen.getByText(/npx @squad\/skill connect --agent claude-u1 --session test-session-123/)).toBeInTheDocument()
  })
})
