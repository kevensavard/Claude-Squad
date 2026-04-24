'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyAnthropic } from '../../actions/verify'

export function AnthropicStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyAnthropic()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="4. Anthropic"
      description="Sends a 1-token test request to verify ANTHROPIC_API_KEY is valid."
      status={status}
      onVerify={handleVerify}
      {...(error !== undefined && { errorDetail: error })}
      docsHref="https://squad-docs.vercel.app/self-hosting/env-reference"
    />
  )
}
