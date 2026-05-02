'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function TemplateClient({
  templateId,
  courseTitleDefault,
}: {
  templateId: number
  courseTitleDefault: string
}) {
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  const [title, setTitle] = useState(courseTitleDefault)
  const [term, setTerm] = useState<'Fall' | 'Winter'>('Fall')
  const [year, setYear] = useState(currentYear)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleInstantiate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError('Course title required.')
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/templates/${templateId}/instantiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), term, year }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Could not create course.')
        return
      }
      router.push(`/courses/${data.course_id}`)
    })
  }

  function handleDeleteTemplate() {
    if (!confirm('Delete this template? This cannot be undone.')) return
    startTransition(async () => {
      const res = await fetch(`/api/templates/${templateId}/delete`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error ?? 'Delete failed.')
        return
      }
      router.push('/templates')
    })
  }

  return (
    <>
      <div className="gl-section">
        <h2 className="gl-h2">Use template to create course</h2>
        <form onSubmit={handleInstantiate}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="title" className="gl-label">
              Course title
            </label>
            <input
              id="title"
              className="gl-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="term" className="gl-label">
              Term
            </label>
            <select
              id="term"
              className="gl-input"
              value={term}
              onChange={(e) => setTerm(e.target.value as 'Fall' | 'Winter')}
              style={{
                appearance: 'none',
                background: 'transparent',
              }}
            >
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
              className="gl-input"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              required
            />
          </div>

          {error && (
            <div className="gl-error" style={{ marginBottom: 16 }} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="gl-btn"
            style={{ width: 'auto', padding: '10px 18px' }}
          >
            {pending ? 'Creating…' : 'Create course from template'}
          </button>
        </form>

        <p
          style={{
            fontSize: 12,
            color: 'var(--gl-mute)',
            margin: '12px 0 0',
            lineHeight: 1.5,
          }}
        >
          The new course will have all the assignments from this template,
          with empty due dates. You'll fill those in afterwards.
        </p>
      </div>

      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: '0.5px solid var(--gl-hairline)',
        }}
      >
        <button
          type="button"
          className="gl-btn-ghost"
          onClick={handleDeleteTemplate}
          disabled={pending}
        >
          Delete template
        </button>
      </div>
    </>
  )
}
