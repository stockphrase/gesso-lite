'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import FilePicker from '@/app/_components/FilePicker'

type Stage = { name: string; due_date: string | null }

type Submission = {
  id: number
  user_id: string
  stage_name: string
  filename: string
  submitted_at: string
}

type RosterMember = {
  user_id: string
  name: string | null
  email: string
}

const ALLOWED_EXTENSIONS = ['.doc', '.docx', '.odt']
const MAX_BYTES = 10 * 1024 * 1024

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateFull(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function isPastDueDate(due_date: string | null): boolean {
  if (!due_date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(due_date + 'T00:00:00') < today
}

export default function SubmissionsClient({
  courseId,
  assignmentId,
  stages,
  submissions,
  roster,
  isStaff,
  currentUserId,
}: {
  courseId: number
  assignmentId: number
  stages: Stage[]
  submissions: Submission[]
  roster: RosterMember[]
  isStaff: boolean
  currentUserId: string
}) {
  if (isStaff) {
    return (
      <StaffSubmissionsView
        courseId={courseId}
        assignmentId={assignmentId}
        stages={stages}
        submissions={submissions}
        roster={roster}
      />
    )
  }
  return (
    <StudentSubmissionsView
      courseId={courseId}
      assignmentId={assignmentId}
      stages={stages}
      submissions={submissions}
      currentUserId={currentUserId}
    />
  )
}

// ---------------------------------------------------------------------------
// Student view
// ---------------------------------------------------------------------------

function StudentSubmissionsView({
  courseId,
  assignmentId,
  stages,
  submissions,
}: {
  courseId: number
  assignmentId: number
  stages: Stage[]
  submissions: Submission[]
  currentUserId: string
}) {
  const submissionByStage = new Map(submissions.map((s) => [s.stage_name, s]))

  return (
    <div className="gl-section">
      <h2 className="gl-h2">Your submissions</h2>
      {stages.length === 0 ? (
        <div className="gl-empty">No stages to submit.</div>
      ) : (
        stages.map((stage) => (
          <StudentStageBlock
            key={stage.name}
            courseId={courseId}
            assignmentId={assignmentId}
            stage={stage}
            existing={submissionByStage.get(stage.name) ?? null}
          />
        ))
      )}
    </div>
  )
}

function StudentStageBlock({
  courseId,
  assignmentId,
  stage,
  existing,
}: {
  courseId: number
  assignmentId: number
  stage: Stage
  existing: Submission | null
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [showReplace, setShowReplace] = useState(false)

  const isLate = isPastDueDate(stage.due_date) && !existing

  function validate(f: File): string | null {
    const lower = f.name.toLowerCase()
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return 'File must be .doc, .docx, or .odt.'
    }
    if (f.size > MAX_BYTES) {
      return 'File must be 10 MB or smaller.'
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) {
      setError('Choose a file first.')
      return
    }
    const v = validate(file)
    if (v) {
      setError(v)
      return
    }

    const fd = new FormData()
    fd.set('course_id', String(courseId))
    fd.set('assignment_id', String(assignmentId))
    fd.set('stage_name', stage.name)
    fd.set('file', file)

    startTransition(async () => {
      const res = await fetch('/api/submissions/upload', {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? 'Upload failed.')
        return
      }
      setFile(null)
      setShowReplace(false)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '14px 0', borderBottom: '0.5px solid var(--gl-hairline)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: existing && !showReplace ? 6 : 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <p style={{ margin: 0, fontSize: 16 }}>{stage.name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isLate && <span className="gl-pending-tag">Late</span>}
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--gl-mute)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {existing && (
              <>
                Submitted {formatDateShort(existing.submitted_at)}
                {stage.due_date && ` · Due ${formatDateFull(stage.due_date)}`}
              </>
            )}
            {!existing && stage.due_date && (
              <>
                {isLate ? 'Was due' : 'Due'} {formatDateFull(stage.due_date)}
              </>
            )}
            {!existing && !stage.due_date && 'No due date'}
          </p>
        </div>
      </div>

      {existing && !showReplace ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--gl-mute)',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            }}
          >
            {existing.filename}
          </p>
          <button
            type="button"
            className="gl-btn-ghost"
            onClick={() => setShowReplace(true)}
          >
            Replace file
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <FilePicker
              accept=".doc,.docx,.odt"
              onChange={(f) => setFile(f)}
              selected={file}
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || !file}
              className="gl-btn"
              style={{ width: 'auto', padding: '8px 14px', flexShrink: 0 }}
            >
              {pending ? 'Uploading…' : 'Upload'}
            </button>
            {existing && showReplace && (
              <button
                type="button"
                className="gl-btn-ghost"
                onClick={() => {
                  setShowReplace(false)
                  setFile(null)
                  setError(null)
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 12,
              color: 'var(--gl-mute)',
            }}
          >
            .doc, .docx, or .odt — max 10 MB.
          </p>
          {error && (
            <div
              className="gl-error"
              style={{ marginTop: 10, fontSize: 13 }}
              role="alert"
            >
              {error}
            </div>
          )}
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Staff view (instructor / tutor)
// ---------------------------------------------------------------------------

function StaffSubmissionsView({
  courseId,
  assignmentId,
  stages,
  submissions,
  roster,
}: {
  courseId: number
  assignmentId: number
  stages: Stage[]
  submissions: Submission[]
  roster: RosterMember[]
}) {
  return (
    <div className="gl-section">
      <h2 className="gl-h2">Submissions</h2>
      {stages.length === 0 ? (
        <div className="gl-empty">No stages defined.</div>
      ) : (
        stages.map((stage) => (
          <StaffStageBlock
            key={stage.name}
            courseId={courseId}
            assignmentId={assignmentId}
            stage={stage}
            submissions={submissions.filter((s) => s.stage_name === stage.name)}
            roster={roster}
          />
        ))
      )}
    </div>
  )
}

function StaffStageBlock({
  stage,
  submissions,
  roster,
}: {
  courseId: number
  assignmentId: number
  stage: Stage
  submissions: Submission[]
  roster: RosterMember[]
}) {
  const submittedIds = new Set(submissions.map((s) => s.user_id))
  const missing = roster.filter((r) => !submittedIds.has(r.user_id))

  const total = roster.length
  const submittedCount = submissions.length
  const allSubmitted = total > 0 && submittedCount === total
  const stageLate = isPastDueDate(stage.due_date)

  const [copyBanner, setCopyBanner] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  async function copyMissing() {
    setCopyError(null)
    const list = missing.map((m) => m.email).join(', ')
    try {
      await navigator.clipboard.writeText(list)
      setCopyBanner(list)
    } catch {
      setCopyBanner(list)
      setCopyError(
        'Could not copy automatically. Select the list and copy manually.'
      )
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          paddingBottom: 8,
          borderBottom: '0.5px solid var(--gl-hairline)',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{stage.name}</p>
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'baseline',
            flexWrap: 'wrap',
          }}
        >
          {allSubmitted ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--gl-ink)',
                fontWeight: 500,
              }}
            >
              All {total} submitted ✓
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--gl-mute)' }}>
                {submittedCount} of {total} submitted
                {stage.due_date && ` · ${stageLate ? 'was ' : ''}due ${formatDateShort(stage.due_date + 'T00:00:00')}`}
              </p>
              {missing.length > 0 && (
                <button
                  type="button"
                  className="gl-btn-ghost"
                  onClick={copyMissing}
                >
                  Copy missing emails
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {copyBanner !== null && (
        <div className="gl-banner" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <p className="gl-banner-title">
              {copyError ? 'Select to copy' : 'Copied to clipboard.'}
            </p>
            <p
              className="gl-banner-body"
              style={{
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {copyBanner}
            </p>
            {copyError && (
              <p className="gl-banner-body" style={{ fontSize: 12 }}>
                {copyError}
              </p>
            )}
          </div>
          <button
            className="gl-banner-dismiss"
            aria-label="Dismiss"
            onClick={() => {
              setCopyBanner(null)
              setCopyError(null)
            }}
          >
            ×
          </button>
        </div>
      )}

      {roster.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: 'var(--gl-mute)',
            margin: '8px 0 0',
            textAlign: 'center',
            padding: 16,
          }}
        >
          No students enrolled.
        </p>
      ) : (
        roster.map((r) => {
          const sub = submissions.find((s) => s.user_id === r.user_id)
          return (
            <StaffStudentRow
              key={r.user_id}
              member={r}
              submission={sub ?? null}
              stageDueDate={stage.due_date}
            />
          )
        })
      )}
    </div>
  )
}

function StaffStudentRow({
  member,
  submission,
  stageDueDate,
}: {
  member: RosterMember
  submission: Submission | null
  stageDueDate: string | null
}) {
  if (!submission) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: '0.5px solid var(--gl-hairline)',
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gl-mute)' }}>
            {member.name ?? member.email}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gl-mute)' }}>
            Not submitted
          </p>
        </div>
      </div>
    )
  }

  const submittedDate = new Date(submission.submitted_at)
  const isLate =
    stageDueDate &&
    submittedDate > new Date(stageDueDate + 'T23:59:59')

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '0.5px solid var(--gl-hairline)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          {member.name ?? member.email}
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: 12,
            color: 'var(--gl-mute)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {isLate && (
            <span
              className="gl-pending-tag"
              style={{ fontSize: 9, padding: '1px 6px' }}
            >
              Late
            </span>
          )}
          <span
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            }}
          >
            {submission.filename}
          </span>
          <span> · {formatDateShort(submission.submitted_at)}</span>
        </p>
      </div>
      <a
        href={`/api/submissions/download/${submission.id}`}
        className="gl-btn-ghost"
        style={{ textDecoration: 'none' }}
      >
        Download
      </a>
    </div>
  )
}
