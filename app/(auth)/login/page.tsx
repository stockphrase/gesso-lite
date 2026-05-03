'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/courses'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setSubmitting(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
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
        Sign in
      </h1>

      <form onSubmit={handleSubmit}>
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

        <div style={{ marginBottom: 8 }}>
          <label htmlFor="password" className="gl-label">
            Password
          </label>
          <input
            id="password"
            className="gl-input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <p
          style={{
            fontSize: 13,
            margin: '0 0 24px',
            textAlign: 'right',
          }}
        >
          <Link href="/reset-password" className="gl-link">
            Forgot password?
          </Link>
        </p>

        {error && (
          <div className="gl-error" style={{ marginBottom: 20 }} role="alert">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="gl-btn">
          {submitting ? 'Signing in…' : 'Sign in'}
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
        New here?{' '}
        <Link href="/register" className="gl-link">
          Register
        </Link>
      </p>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}