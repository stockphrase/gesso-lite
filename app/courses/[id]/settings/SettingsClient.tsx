'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsClient({
  courseId,
  courseTitle,
  defaultTemplateName,
  isArchived,
}: {
  courseId: number
  courseTitle: string
  defaultTemplateName: string
  isArchived: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Save-as-template
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState(defaultTemplateName)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ id: number } | null>(null)

  function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaveResult(null)
    if (!templateName.trim()) {
      setSaveError('Template name required.')
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          name: templateName.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(data?.error ?? 'Could not save template.')
        return
      }
      setSaveResult({ id: data.template_id })
      setShowSaveTemplate(false)
      router.refresh()
    })
  }

  function handleArchive(action: 'archive' | 'unarchive') {
    const verb = action === 'archive' ? 'archive' : 'unarchive'
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} "${courseTitle}"?`))
      return
    startTransition(async () => {
      const res = await fetch(`/api/courses/${courseId}/${verb}`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error ?? `${verb} failed.`)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <div className="gl-section">
        <h2 className="gl-h2">Save as template</h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-ink)',
            lineHeight: 1.6,
            margin: '0 0 14px',
          }}
        >
          Save this course's structure for reuse later. Stored items: course
          title, all assignments (titles, descriptions, stage names — no
          dates), and a list of reading filenames as a reference.
        </p>

        {saveResult && (
          <div className="gl-banner" style={{ marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <p className="gl-banner-title">Template saved.</p>
              <p className="gl-banner-body">
                <a
                  href={`/templates/${saveResult.id}`}
                  className="gl-link"
                  style={{ color: 'var(--gl-accent)' }}
                >
                  View it on the templates page →
                </a>
              </p>
            </div>
            <button
              className="gl-banner-dismiss"
              aria-label="Dismiss"
              onClick={() => setSaveResult(null)}
            >
              ×
            </button>
          </div>
        )}

        {showSaveTemplate ? (
          <form onSubmit={handleSaveTemplate}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="tplname" className="gl-label">
                Template name
              </label>
              <input
                id="tplname"
                className="gl-input"
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
                autoFocus
              />
            </div>
            {saveError && (
              <div
                className="gl-error"
                style={{ marginBottom: 12, fontSize: 13 }}
                role="alert"
              >
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="submit"
                disabled={pending}
                className="gl-btn"
                style={{ width: 'auto', padding: '8px 14px' }}
              >
                {pending ? 'Saving…' : 'Save template'}
              </button>
              <button
                type="button"
                className="gl-btn-ghost"
                onClick={() => {
                  setShowSaveTemplate(false)
                  setTemplateName(defaultTemplateName)
                  setSaveError(null)
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="gl-btn-ghost"
            onClick={() => setShowSaveTemplate(true)}
          >
            Save as template
          </button>
        )}
      </div>

      <div className="gl-section">
        <h2 className="gl-h2">Archive</h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-ink)',
            lineHeight: 1.6,
            margin: '0 0 14px',
          }}
        >
          {isArchived
            ? 'This course is archived. It still exists with all data; it just appears under "Archived" on the course list.'
            : 'Hide the course from the active list while preserving all data. You and your students can still access it via the archived section. Reversible.'}
        </p>
        <button
          type="button"
          className="gl-btn-ghost"
          disabled={pending}
          onClick={() => handleArchive(isArchived ? 'unarchive' : 'archive')}
        >
          {isArchived ? 'Unarchive course' : 'Archive course'}
        </button>
      </div>

      <div className="gl-section">
        <p
          style={{
            fontSize: 13,
            color: 'var(--gl-mute)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Delete this course in Step 11.
        </p>
      </div>
    </>
  )
}
