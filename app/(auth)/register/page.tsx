'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
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

    // Whitelist precheck. The instructor is exempt — they're not on a
    // whitelist, they ARE the whitelist (matched by app_config.instructor_email).
    // Both prechecks are UX-only; the database trigger is the real gate.
    const { data: isInstructor, error: instructorRpcError } =
      await supabase.rpc('is_instructor_email', { check_email: email })

    if (instructorRpcError) {
      setError('Could not verify email. Please try again.')
      setSubmitting(false)
      return
    }

    if (!isInstructor) {
      const { data: allowed, error: allowedRpcError } = await supabase.rpc(
        'is_email_allowed',
        { check_email: email }
      )

      if (allowedRpcError) {
        setError('Could not verify email. Please try again.')
        setSubmitting(false)
        return
      }

      if (!allowed) {
        setError(
          'This email is not on the class list. Ask your instructor to add it, then come back.'
        )
        setSubmitting(false)
        return
      }
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setSubmitting(false)
      return
    }

    // If email confirmation is off in Supabase config, the user is signed in
    // immediately and we go to /courses. If it's on, the session is null and
    // they need to click the email link first — but for now we don't
    // distinguish; /courses will redirect them back to /login if no session.
    router.push('/courses')
    router.refresh()
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
        Register
      </h1>
      <p
        style={{
          fontSize: 14,
          color: 'var(--gl-mute)',
          margin: '0 0 28px',
          lineHeight: 1.5,
        }}
      >
        Use the email your instructor added to the class list.
      </p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="name" className="gl-label">
            Full name
          </label>
          <input
            id="name"
            className="gl-input"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
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

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="password" className="gl-label">
            Password
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
            Confirm password
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
          {submitting ? 'Creating account…' : 'Create account'}
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
        Already have an account?{' '}
        <Link href="/login" className="gl-link">
          Sign in
        </Link>
      </p>
    </>
  )
}