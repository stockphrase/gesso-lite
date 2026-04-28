'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCourse } from './actions'

export default function NewCoursePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const currentYear = new Date().getFullYear()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      const result = await createCourse(data)
      if (result?.error) {
        setError(result.error)
      }
      // success path triggers a server redirect, so nothing else to do here
    })
  }

  return (
    <main className="gl-page">
      <div className="gl-shell" style={{ maxWidth: 460 }}>
        <div className="gl-page-header" style={{ marginBottom: 28 }}>
          <div>
            <p className="gl-eyebrow">Gesso Lite</p>
            <h1 className="gl-h1">New course</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="title" className="gl-label">
              Course title
            </label>
            <input
              id="title"
              name="title"
              className="gl-input"
              type="text"
              required
              placeholder="Writing 2.04"
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="term" className="gl-label">
              Term
            </label>
            <select
              id="term"
              name="term"
              className="gl-input"
              required
              defaultValue=""
              style={{
                appearance: 'none',
                background: 'transparent',
              }}
            >
              <option value="" disabled>
                Choose a term
              </option>
              <option value="Fall">Fall</option>
              <option value="Winter">Winter</option>
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="year" className="gl-label">
              Year
            </label>
            <input
              id="year"
              name="year"
              className="gl-input"
              type="number"
              required
              min={2020}
              max={2100}
              defaultValue={currentYear}
            />
            <p
              style={{
                fontSize: 12,
                color: 'var(--gl-mute)',
                margin: '6px 0 0',
                lineHeight: 1.5,
              }}
            >
              Calendar year the term begins. A Winter course in January 2027
              uses year 2027 and groups under academic year 2026–27.
            </p>
          </div>

          {error && (
            <div className="gl-error" style={{ marginBottom: 20 }} role="alert">
              {error}
            </div>
          )}

          <button type="submit" disabled={pending} className="gl-btn">
            {pending ? 'Creating…' : 'Create course'}
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
          <Link href="/courses" className="gl-link">
            Back to courses
          </Link>
        </p>
      </div>
    </main>
  )
}