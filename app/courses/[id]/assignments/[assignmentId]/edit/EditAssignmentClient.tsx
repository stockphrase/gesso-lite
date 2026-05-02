'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateAssignment, deleteAssignment } from './actions'

type Stage = { name: string; due_date: string | null }

type StageDraft = {
  id: string
  name: string
  dueDate: string
  oldName: string // empty for newly-added stages
}

function freshStage(): StageDraft {
  return {
    id: `stage-${Math.random().toString(36).slice(2)}`,
    name: '',
    dueDate: '',
    oldName: '',
  }
}

export default function EditAssignmentClient({
  courseId,
  assignmentId,
  courseTitle,
  initialTitle,
  initialDescription,
  initialStages,
}: {
  courseId: number
  assignmentId: number
  courseTitle: string
  initialTitle: string
  initialDescription: string
  initialStages: Stage[]
}) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [stages, setStages] = useState<StageDraft[]>(
    initialStages.length > 0
      ? initialStages.map((s) => ({
          id: `stage-${Math.random().toString(36).slice(2)}`,
          name: s.name,
          dueDate: s.due_date ?? '',
          oldName: s.name,
        }))
      : [freshStage()]
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function updateStage(id: string, patch: Partial<StageDraft>) {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    )
  }

  function addStage() {
    setStages((prev) => [...prev, freshStage()])
  }

  function removeStage(id: string) {
    setStages((prev) =>
      prev.length > 1 ? prev.filter((s) => s.id !== id) : prev
    )
  }

  function moveStage(id: string, direction: -1 | 1) {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const target = idx + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const [removed] = next.splice(idx, 1)
      next.splice(target, 0, removed)
      return next
    })
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
      formData.append('stage_old_name', s.oldName)
    }

    startTransition(async () => {
      const result = await updateAssignment(courseId, assignmentId, formData)
      if (result?.error) setError(result.error)
    })
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete assignment "${initialTitle}"? This cannot be undone. Submissions cannot exist for the assignment.`
      )
    )
      return
    startTransition(async () => {
      const result = await deleteAssignment(courseId, assignmentId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <>
      <div className="gl-page-header">
        <div>
          <p className="gl-eyebrow">
            <Link
              href={`/courses/${courseId}/assignments/${assignmentId}`}
              style={{
                color: 'var(--gl-mute)',
                textDecoration: 'none',
                borderBottom: '1px solid var(--gl-hairline)',
                paddingBottom: 1,
              }}
            >
              ← {initialTitle}
            </Link>
          </p>
          <h1 className="gl-h1" style={{ marginTop: 4 }}>
            Edit assignment
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--gl-mute)',
              margin: '6px 0 0',
            }}
          >
            in {courseTitle}
          </p>
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
            <div
              key={stage.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-end',
                padding: '10px 0',
                borderBottom: '0.5px solid var(--gl-hairline)',
              }}
            >
              <div style={{ flex: 1 }}>
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
              <div style={{ flex: '0 0 180px' }}>
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

              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  flexShrink: 0,
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  aria-label="Move up"
                  onClick={() => moveStage(stage.id, -1)}
                  disabled={idx === 0}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: idx === 0 ? 'var(--gl-hairline)' : 'var(--gl-mute)',
                    cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    padding: '4px 6px',
                    fontSize: 14,
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  onClick={() => moveStage(stage.id, 1)}
                  disabled={idx === stages.length - 1}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color:
                      idx === stages.length - 1
                        ? 'var(--gl-hairline)'
                        : 'var(--gl-mute)',
                    cursor:
                      idx === stages.length - 1 ? 'not-allowed' : 'pointer',
                    padding: '4px 6px',
                    fontSize: 14,
                  }}
                >
                  ↓
                </button>
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

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={pending}
            className="gl-btn"
            style={{ width: 'auto', padding: '10px 18px' }}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <Link
            href={`/courses/${courseId}/assignments/${assignmentId}`}
            className="gl-btn-ghost"
            style={{ textDecoration: 'none' }}
          >
            Cancel
          </Link>
        </div>
      </form>

      <div
        style={{
          marginTop: 48,
          paddingTop: 16,
          borderTop: '0.5px solid var(--gl-hairline)',
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: 'var(--gl-mute)',
            margin: '0 0 10px',
          }}
        >
          Permanently delete this assignment. Only allowed if no submissions
          exist for it.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          style={{
            background: 'transparent',
            border: '0.5px solid var(--gl-accent)',
            padding: '6px 12px',
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--gl-accent)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Delete assignment
        </button>
      </div>
    </>
  )
}
