'use client'

import { useState } from 'react'
import { StepCard, type StepStatus } from '../StepCard'
import { verifyGithub } from '../../actions/verify'

export function GithubStep() {
  const [status, setStatus] = useState<StepStatus>('idle')
  const [error, setError] = useState<string>()

  async function handleVerify() {
    setStatus('checking')
    setError(undefined)
    const result = await verifyGithub()
    if (result.ok) {
      setStatus('pass')
    } else {
      setStatus('fail')
      setError(result.error)
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

  return (
    <StepCard
      title="3. GitHub OAuth"
      description="Verifies GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set."
      status={status}
      onVerify={handleVerify}
      {...(error !== undefined && { errorDetail: error })}
      docsHref="https://squad-docs.vercel.app/self-hosting/github-oauth"
    >
      <p className="text-sm text-gray-600">
        Set your GitHub OAuth App callback URL to:{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
          {appUrl}/auth/callback/github
        </code>
      </p>
    </StepCard>
  )
}
