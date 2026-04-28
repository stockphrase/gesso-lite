'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setSubmitting(false)
      return
    }

    setDone(true)
    setSubmitting(false)
    setTimeout(() => {
      router.push('/courses')
      router.refresh()
    }, 1200)
  }

  if (done) {
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
          Password updated
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-mute)',
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Redirecting…
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
          margin: '0 0 28px',
          letterSpacing: '-0.01em',
        }}
      >
        Set new password
      </h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="password" className="gl-label">
            New password
          </label>
          <input
            id="password"
            className="gl-input"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p
            style={{
              fontSize: 12,
              color: 'var(--gl-mute)',
              margin: '6px 0 0',
            }}
          >
            At least 8 characters.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="confirm" className="gl-label">
            Confirm new password
          </label>
          <input
            id="confirm"
            className="gl-input"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="gl-error" style={{ marginBottom: 20 }} role="alert">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="gl-btn">
          {submitting ? 'Updating…' : 'Update password'}
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
