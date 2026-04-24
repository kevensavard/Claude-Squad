import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepCard } from './StepCard'

describe('StepCard', () => {
  it('renders title and description', () => {
    render(
      <StepCard title="Supabase" description="Check database connection" status="idle" onVerify={vi.fn()} />
    )
    expect(screen.getByText('Supabase')).toBeInTheDocument()
    expect(screen.getByText('Check database connection')).toBeInTheDocument()
  })

  it('calls onVerify when button clicked', () => {
    const onVerify = vi.fn()
    render(<StepCard title="Test" description="desc" status="idle" onVerify={onVerify} />)
    fireEvent.click(screen.getByRole('button', { name: /verify/i }))
    expect(onVerify).toHaveBeenCalledOnce()
  })

  it('disables button while checking', () => {
    render(<StepCard title="Test" description="desc" status="checking" onVerify={vi.fn()} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows error detail when status is fail', () => {
    render(
      <StepCard
        title="Test"
        description="desc"
        status="fail"
        onVerify={vi.fn()}
        errorDetail="SUPABASE_URL is not set"
      />
    )
    expect(screen.getByText('SUPABASE_URL is not set')).toBeInTheDocument()
  })

  it('shows docs link when provided', () => {
    render(
      <StepCard
        title="Test"
        description="desc"
        status="fail"
        onVerify={vi.fn()}
        docsHref="/self-hosting/supabase"
      />
    )
    expect(screen.getByRole('link', { name: /docs/i })).toHaveAttribute('href', '/self-hosting/supabase')
  })
})
