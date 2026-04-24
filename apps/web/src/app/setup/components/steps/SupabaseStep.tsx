'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifySupabase } from '../../actions/verify'

export function SupabaseStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifySupabase()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="1. Supabase"
      description="Verifies NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set and reachable."
      status={status}
      onVerify={handleVerify}
      {...(error !== undefined && { errorDetail: error })}
      docsHref="https://squad-docs.vercel.app/self-hosting/supabase"
    />
  )
}
