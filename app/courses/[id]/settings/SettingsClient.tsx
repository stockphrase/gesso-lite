'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type DeleteCounts = {
  assignments: number
  submissions: number
  returns: number
  readings: number
  students: number
  tutors: number
  pending: number
}

export default function SettingsClient({
  courseId,
  courseTitle,
  defaultTemplateName,
  isArchived,
  counts,
}: {
  courseId: number
  courseTitle: string
  defaultTemplateName: string
  isArchived: boolean
  counts: DeleteCounts
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Save-as-template
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState(defaultTemplateName)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ id: number } | null>(null)

  // Delete
  const [showDelete, setShowDelete] = useState(false)
  const [titleConfirm, setTitleConfirm] = useState('')
  const [includeSubmissions, setIncludeSubmissions] = useState(true)
  const [includeReturns, setIncludeReturns] = useState(true)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletePhase, setDeletePhase] =
    useState<'idle' | 'backing-up' | 'awaiting-confirmation' | 'deleting'>(
      'idle'
    )

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

  async function handleDelete() {
    setDeleteError(null)

    if (titleConfirm.trim() !== courseTitle) {
      setDeleteError(
        `Type "${courseTitle}" exactly to confirm.`
      )
      return
    }

    setDeletePhase('backing-up')

    // Phase 1: backup download. Trigger via a navigation that returns
    // the zip with Content-Disposition. We can't easily detect download
    // success in the browser, so we use a fetch + manual blob save and
    // wait for the user to confirm.
    const params = new URLSearchParams({
      include_submissions: String(includeSubmissions),
      include_returns: String(includeReturns),
    })
    const backupUrl = `/api/courses/${courseId}/backup?${params}`

    try {
      const res = await fetch(backupUrl)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteError(data?.error ?? 'Backup failed.')
        setDeletePhase('idle')
        return
      }
      const blob = await res.blob()
      const filename = res.headers
        .get('content-disposition')
        ?.match(/filename="([^"]+)"/)?.[1] ??
        `${courseTitle.replace(/[^A-Za-z0-9]+/g, '-')}_backup.zip`

      // Trigger the browser download.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDeleteError(`Backup failed: ${(e as Error).message}`)
      setDeletePhase('idle')
      return
    }

    setDeletePhase('awaiting-confirmation')
  }

  function handleProceedAfterBackup() {
    if (!confirm(
      'Confirm: the backup downloaded successfully and you have it. ' +
      'Click OK to delete the course, all its data, and any students/tutors ' +
      'enrolled only in this course. This cannot be undone.'
    )) {
      return
    }

    setDeletePhase('deleting')

    startTransition(async () => {
      const res = await fetch(`/api/courses/${courseId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_title: courseTitle }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeleteError(data?.error ?? 'Delete failed.')
        setDeletePhase('idle')
        return
      }

      const params = new URLSearchParams({
        deleted: courseTitle,
        vaporized: String(data.users_vaporized ?? 0),
      })
      router.push(`/courses?${params}`)
    })
  }

  function handleCancelDelete() {
    setShowDelete(false)
    setTitleConfirm('')
    setDeleteError(null)
    setDeletePhase('idle')
  }

  return (
    <>
      {/* Save as template */}
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

      {/* Archive */}
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

      {/* Delete */}
      <div className="gl-section">
        <h2
          className="gl-h2"
          style={{
            color: 'var(--gl-accent)',
            borderBottomColor: 'var(--gl-accent)',
          }}
        >
          Delete
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-ink)',
            lineHeight: 1.6,
            margin: '0 0 12px',
          }}
        >
          Permanently delete this course, all assignments, all submissions,
          all returns, all readings, and any student or tutor accounts enrolled
          only in this course. A backup zip will download to your computer
          first.
        </p>
        <p
          style={{
            fontSize: 14,
            color: 'var(--gl-ink)',
            lineHeight: 1.6,
            margin: '0 0 14px',
          }}
        >
          This cannot be undone.
        </p>

        {!showDelete && (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--gl-accent)',
              padding: '8px 14px',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--gl-accent)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Delete this course…
          </button>
        )}

        {showDelete && (
          <div
            style={{
              border: '1px solid var(--gl-accent)',
              padding: 20,
              marginTop: 16,
            }}
          >
            <h3
              style={{
                fontSize: 16,
                fontWeight: 500,
                margin: '0 0 12px',
                color: 'var(--gl-accent)',
              }}
            >
              Delete &ldquo;{courseTitle}&rdquo;?
            </h3>

            <ul
              style={{
                margin: '0 0 16px',
                paddingLeft: 20,
                fontSize: 13,
                color: 'var(--gl-ink)',
                lineHeight: 1.8,
              }}
            >
              <li>
                {counts.assignments}{' '}
                {counts.assignments === 1 ? 'assignment' : 'assignments'} will
                be deleted
              </li>
              <li>
                {counts.submissions}{' '}
                {counts.submissions === 1 ? 'submission' : 'submissions'} will
                be deleted
              </li>
              <li>
                {counts.returns}{' '}
                {counts.returns === 1 ? 'return' : 'returns'} will be deleted
              </li>
              <li>
                {counts.readings}{' '}
                {counts.readings === 1 ? 'reading' : 'readings'} will be deleted
              </li>
              <li>
                {counts.students}{' '}
                {counts.students === 1 ? 'student' : 'students'} will be
                deleted (only if they're not in any other course)
              </li>
              <li>
                {counts.tutors} {counts.tutors === 1 ? 'tutor' : 'tutors'} will
                be deleted (same condition)
              </li>
              {counts.pending > 0 && (
                <li>
                  {counts.pending} pending{' '}
                  {counts.pending === 1 ? 'registration' : 'registrations'} will
                  be discarded
                </li>
              )}
            </ul>

            {deletePhase === 'idle' && (
              <>
                <div
                  style={{
                    marginBottom: 14,
                    fontSize: 13,
                    color: 'var(--gl-ink)',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 8px',
                      fontWeight: 500,
                      fontSize: 12,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--gl-mute)',
                    }}
                  >
                    Backup contents
                  </p>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={includeSubmissions}
                      onChange={(e) => setIncludeSubmissions(e.target.checked)}
                    />
                    Include submission files in backup
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeReturns}
                      onChange={(e) => setIncludeReturns(e.target.checked)}
                    />
                    Include return files in backup
                  </label>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: 12,
                      color: 'var(--gl-mute)',
                    }}
                  >
                    Database records (course info, assignments, roster,
                    submission/return metadata) are always included.
                  </p>
                </div>

                <p
                  style={{
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--gl-mute)',
                    fontWeight: 500,
                    margin: '0 0 6px',
                  }}
                >
                  Type the course title to confirm
                </p>
                <input
                  type="text"
                  value={titleConfirm}
                  onChange={(e) => setTitleConfirm(e.target.value)}
                  placeholder={courseTitle}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 0,
                    borderBottom: '1px solid var(--gl-accent)',
                    padding: '8px 0',
                    fontSize: 15,
                    color: 'var(--gl-ink)',
                    outline: 'none',
                    marginBottom: 16,
                  }}
                />

                {deleteError && (
                  <div
                    className="gl-error"
                    style={{ marginBottom: 14, fontSize: 13 }}
                    role="alert"
                  >
                    {deleteError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={titleConfirm.trim() !== courseTitle || pending}
                    style={{
                      background:
                        titleConfirm.trim() === courseTitle
                          ? 'var(--gl-accent)'
                          : 'transparent',
                      color:
                        titleConfirm.trim() === courseTitle
                          ? 'var(--gl-paper)'
                          : 'var(--gl-mute)',
                      border: '1px solid var(--gl-accent)',
                      padding: '8px 14px',
                      fontSize: 11,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500,
                      cursor:
                        titleConfirm.trim() === courseTitle
                          ? 'pointer'
                          : 'not-allowed',
                      opacity:
                        titleConfirm.trim() === courseTitle ? 1 : 0.5,
                    }}
                  >
                    Generate backup &amp; delete
                  </button>
                  <button
                    type="button"
                    className="gl-btn-ghost"
                    onClick={handleCancelDelete}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {deletePhase === 'backing-up' && (
              <p style={{ fontSize: 13, color: 'var(--gl-ink)', margin: 0 }}>
                Generating backup…
              </p>
            )}

            {deletePhase === 'awaiting-confirmation' && (
              <>
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--gl-ink)',
                    margin: '0 0 14px',
                    lineHeight: 1.6,
                  }}
                >
                  Backup downloaded. Verify it opened correctly before
                  proceeding — once you click below, deletion runs and cannot
                  be undone.
                </p>
                {deleteError && (
                  <div
                    className="gl-error"
                    style={{ marginBottom: 14, fontSize: 13 }}
                    role="alert"
                  >
                    {deleteError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleProceedAfterBackup}
                    style={{
                      background: 'var(--gl-accent)',
                      color: 'var(--gl-paper)',
                      border: '1px solid var(--gl-accent)',
                      padding: '8px 14px',
                      fontSize: 11,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Proceed with deletion
                  </button>
                  <button
                    type="button"
                    className="gl-btn-ghost"
                    onClick={handleCancelDelete}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {deletePhase === 'deleting' && (
              <p style={{ fontSize: 13, color: 'var(--gl-ink)', margin: 0 }}>
                Deleting course, files, and accounts…
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
