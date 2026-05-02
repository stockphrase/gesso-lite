'use client'

import { useState, useTransition, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createAssignment } from './actions'
import GlobalFooter from '@/app/_components/GlobalFooter'

type StageDraft = { id: string; name: string; dueDate: string }

function newStage(): StageDraft {
  return {
    id: `stage-${Math.random().toString(36).slice(2)}`,
    name: '',
    dueDate: '',
  }
}

export default function NewAssignmentPage() {
  const params = useParams()
  const courseId = parseInt(String(params.id ?? ''), 10)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [stages, setStages] = useState<StageDraft[]>([newStage()])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [courseTitle, setCourseTitle] = useState<string>('')
  const [signedInAs, setSignedInAs] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(courseId)) return
    fetch(`/api/courses/${courseId}/title`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.title) setCourseTitle(data.title)
      })
      .catch(() => {})
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.email) setSignedInAs(data.email)
      })
      .catch(() => {})
  }, [courseId])

  function updateStage(id: string, patch: Partial<StageDraft>) {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    )
  }

  function addStage() {
    setStages((prev) => [...prev, newStage()])
  }

  function removeStage(id: string) {
    setStages((prev) =>
      prev.length > 1 ? prev.filter((s) => s.id !== id) : prev
    )
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set('title', title)
    formData.set('description', description)
    for (const s of stages) {
      formData.append('stage_name', s.name)
      formData.append('stage_due_date', s.dueDate)
    }

    startTransition(async () => {
      const result = await createAssignment(courseId, formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <div className="gl-page-header">
          <div>
            <p className="gl-eyebrow">
              <Link
                href={`/courses/${courseId}`}
                style={{
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                ← {courseTitle || 'Course'}
              </Link>
            </p>
            <h1 className="gl-h1" style={{ marginTop: 4 }}>
              New assignment
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="title" className="gl-label">
              Title
            </label>
            <input
              id="title"
              className="gl-input"
              type="text"
              required
              autoFocus
              placeholder="Memoir Essay"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="description" className="gl-label">
              Description
            </label>
            <textarea
              id="description"
              className="gl-textarea"
              style={{ minHeight: 70, fontFamily: 'var(--font-sans)' }}
              placeholder="Optional. Shown on the assignment page."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <p className="gl-label" style={{ marginBottom: 12 }}>
              Stages
            </p>

            {stages.map((stage, idx) => (
              <div key={stage.id} className="gl-stage-row">
                <div className="gl-stage-name">
                  {idx === 0 && (
                    <label
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'var(--gl-mute)',
                        fontWeight: 500,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      Name
                    </label>
                  )}
                  <input
                    type="text"
                    className="gl-stage-input"
                    placeholder="Proposal"
                    value={stage.name}
                    onChange={(e) =>
                      updateStage(stage.id, { name: e.target.value })
                    }
                  />
                </div>
                <div className="gl-stage-date">
                  {idx === 0 && (
                    <label
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'var(--gl-mute)',
                        fontWeight: 500,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      Due date
                    </label>
                  )}
                  <input
                    type="date"
                    className="gl-stage-input"
                    value={stage.dueDate}
                    onChange={(e) =>
                      updateStage(stage.id, { dueDate: e.target.value })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="gl-stage-remove"
                  aria-label="Remove stage"
                  onClick={() => removeStage(stage.id)}
                  disabled={stages.length === 1}
                  style={{
                    opacity: stages.length === 1 ? 0.3 : 1,
                    cursor: stages.length === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              className="gl-add-stage-btn"
              onClick={addStage}
            >
              + Add stage
            </button>
          </div>

          {error && (
            <div className="gl-error" style={{ marginBottom: 20 }} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="gl-btn"
            style={{ width: 'auto', padding: '10px 18px' }}
          >
            {pending ? 'Creating…' : 'Create assignment'}
          </button>
        </form>

        <GlobalFooter signedInAs={signedInAs} />
      </div>
    </main>
  )
}
