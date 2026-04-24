'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyMigrations } from '../../actions/verify'

const MIGRATION_SQL_LINK = 'https://github.com/your-username/squad/blob/main/docs/DATABASE.md'

export function MigrationsStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyMigrations()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  return (
    <StepCard
      title="2. Database Migrations"
      description="Checks that the sessions table exists (confirms migrations have been applied)."
      status={status}
      onVerify={handleVerify}
      {...(error !== undefined && { errorDetail: error })}
      docsHref="https://squad-docs.vercel.app/self-hosting/supabase"
    >
      <p className="text-sm text-gray-600">
        Run each migration from{' '}
        <a href={MIGRATION_SQL_LINK} target="_blank" rel="noreferrer" className="underline">
          docs/DATABASE.md
        </a>{' '}
        in the Supabase SQL editor, in order (001 → 004).
      </p>
    </StepCard>
  )
}
