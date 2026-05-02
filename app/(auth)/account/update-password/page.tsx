'use client'

import { useEffect, useState } from 'react'
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
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    const supabase = createClient()

    // Some flows: the auth callback already exchanged the code for a session
    // and redirected here. The session is set; we can update the password.
    // Other flows (PKCE/magic-link variants): Supabase fires PASSWORD_RECOVERY
    // when the page loads and sets the session at that point.

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'PASSWORD_RECOVERY' || session?.user) {
        setHasSession(true)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      if (data.session) setHasSession(true)
      else setHasSession((prev) => (prev === null ? false : prev))
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
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
    }, 1500)
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
          You&rsquo;re signed in. Redirecting to your courses…
        </p>
      </>
    )
  }

  if (hasSession === false) {
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
          Reset link expired
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-mute)',
            margin: '0 0 24px',
            lineHeight: 1.6,
          }}
        >
          This page is only valid when reached from a password-reset email
          link. The link may have expired or already been used.
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          <Link href="/reset-password" className="gl-link">
            Request a new reset link →
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
            autoFocus
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
