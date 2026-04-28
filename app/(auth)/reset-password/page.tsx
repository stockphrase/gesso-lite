'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password`,
      }
    )

    if (resetError) {
      setError(resetError.message)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 500,
            margin: '0 0 12px',
            letterSpacing: '-0.01em',
          }}
        >
          Check your email
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-mute)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          If an account exists for{' '}
          <span style={{ color: 'var(--gl-ink)' }}>{email}</span>, a password
          reset link has been sent. The link is valid for one hour.
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          <Link href="/login" className="gl-link">
            Back to sign in
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 500,
          margin: '0 0 8px',
          letterSpacing: '-0.01em',
        }}
      >
        Reset password
      </h1>
      <p
        style={{
          fontSize: 14,
          color: 'var(--gl-mute)',
          margin: '0 0 28px',
          lineHeight: 1.5,
        }}
      >
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="email" className="gl-label">
            Email
          </label>
          <input
            id="email"
            className="gl-input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {error && (
          <div className="gl-error" style={{ marginBottom: 20 }} role="alert">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="gl-btn">
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p
        style={{
          fontSize: 13,
          color: 'var(--gl-mute)',
          margin: '24px 0 0',
          textAlign: 'center',
        }}
      >
        <Link href="/login" className="gl-link">
          Back to sign in
        </Link>
      </p>
    </>
  )
}