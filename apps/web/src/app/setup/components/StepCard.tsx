'use client'

import React from 'react'

export type StepStatus = 'idle' | 'checking' | 'pass' | 'fail'

interface StepCardProps {
  title: string
  description: string
  status: StepStatus
  onVerify: () => void
  errorDetail?: string
  docsHref?: string
  children?: React.ReactNode
}

const STATUS_BADGE: Record<StepStatus, { label: string; className: string }> = {
  idle: { label: '—', className: 'bg-gray-100 text-gray-500' },
  checking: { label: 'Checking…', className: 'bg-yellow-100 text-yellow-700' },
  pass: { label: '✓ Connected', className: 'bg-green-100 text-green-700' },
  fail: { label: '✗ Failed', className: 'bg-red-100 text-red-700' },
}

export function StepCard({ title, description, status, onVerify, errorDetail, docsHref, children }: StepCardProps) {
  const badge = STATUS_BADGE[status]
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {children && <div className="mt-4">{children}</div>}

      {status === 'fail' && (errorDetail || docsHref) && (
        <div className="mt-4 rounded-md bg-red-50 p-3">
          {errorDetail && <p className="text-sm text-red-700">{errorDetail}</p>}
          {docsHref && (
            <a
              href={docsHref}
              className="mt-1 inline-block text-sm font-medium text-red-800 underline"
              target="_blank"
              rel="noreferrer"
            >
              View docs →
            </a>
          )}
        </div>
      )}

      <button
        onClick={onVerify}
        disabled={status === 'checking'}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'checking' ? 'Checking…' : 'Verify'}
      </button>
    </div>
  )
}
