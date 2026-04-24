'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyPartykit } from '../../actions/verify'

export function PartykitStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyPartykit()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="5. Partykit"
      description="Pings the Session State Server health endpoint to confirm NEXT_PUBLIC_PARTYKIT_HOST is reachable."
      status={status}
      onVerify={handleVerify}
      {...(error !== undefined && { errorDetail: error })}
      docsHref="https://squad-docs.vercel.app/self-hosting/partykit"
    />
  )
}
