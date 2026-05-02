'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bulkAddRoster, removeRosterEntry } from './actions'

type Member = {
  user_id: string
  name: string | null
  email: string
}

type Pending = {
  id: number
  email: string
  role: 'student' | 'tutor'
}

type AddResult = {
  added: number
  skipped: { email: string; reason: 'duplicate' | 'invalid' }[]
}

type Banner = {
  students: AddResult
  tutors: AddResult
} | null

export default function RosterClient({
  courseId,
  studentMembers,
  studentPending,
  tutorMembers,
  tutorPending,
}: {
  courseId: number
  studentMembers: Member[]
  studentPending: Pending[]
  tutorMembers: Member[]
  tutorPending: Pending[]
}) {
  const router = useRouter()
  const [studentsRaw, setStudentsRaw] = useState('')
  const [tutorsRaw, setTutorsRaw] = useState('')
  const [banner, setBanner] = useState<Banner>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await bulkAddRoster(courseId, studentsRaw, tutorsRaw)
      if (result.error) {
        setError(result.error)
        return
      }
      setBanner({ students: result.students, tutors: result.tutors })
      setStudentsRaw('')
      setTutorsRaw('')
      router.refresh()
    })
  }

  function handleRemove(
    kind: 'pending' | 'member',
    identifier: string,
    label: string
  ) {
    if (!confirm(`Remove ${label} from this course?`)) return
    startTransition(async () => {
      const result = await removeRosterEntry(courseId, kind, identifier)
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function summarizeBatch(label: string, batch: AddResult): string | null {
    const parts: string[] = []
    if (batch.added > 0) parts.push(`added ${batch.added}`)
    const dups = batch.skipped.filter((s) => s.reason === 'duplicate')
    const invalids = batch.skipped.filter((s) => s.reason === 'invalid')
    if (dups.length > 0) {
      parts.push(
        `skipped ${dups.length} already on list (${dups
          .map((s) => s.email)
          .join(', ')})`
      )
    }
    if (invalids.length > 0) {
      parts.push(
        `${invalids.length} invalid (${invalids
          .map((s) => s.email)
          .join(', ')})`
      )
    }
    if (parts.length === 0) return null
    return `${label}: ${parts.join(', ')}.`
  }

  const studentSummary = banner ? summarizeBatch('Students', banner.students) : null
  const tutorSummary = banner ? summarizeBatch('Tutors', banner.tutors) : null

  return (
    <>
      {banner && (studentSummary || tutorSummary) && (
        <div className="gl-banner" role="status">
          <div>
            <p className="gl-banner-title">Roster updated.</p>
            {studentSummary && <p className="gl-banner-body">{studentSummary}</p>}
            {tutorSummary && <p className="gl-banner-body">{tutorSummary}</p>}
          </div>
          <button
            className="gl-banner-dismiss"
            aria-label="Dismiss"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="gl-error" style={{ marginBottom: 24 }} role="alert">
          {error}
        </div>
      )}

      <div className="gl-section">
        <h2 className="gl-h2">Add to roster</h2>
        <form onSubmit={handleAdd}>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="students" className="gl-label">
              Students
            </label>
            <textarea
              id="students"
              className="gl-textarea"
              placeholder="alice@example.edu&#10;bob@example.edu"
              value={studentsRaw}
              onChange={(e) => setStudentsRaw(e.target.value)}
            />
            <p
              style={{
                fontSize: 12,
                color: 'var(--gl-mute)',
                margin: '6px 0 0',
              }}
            >
              One email per line.
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="tutors" className="gl-label">
              Tutors
            </label>
            <textarea
              id="tutors"
              className="gl-textarea"
              style={{ minHeight: 60 }}
              placeholder="optional"
              value={tutorsRaw}
              onChange={(e) => setTutorsRaw(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="gl-btn"
            disabled={pending || (!studentsRaw.trim() && !tutorsRaw.trim())}
            style={{ width: 'auto', padding: '10px 18px' }}
          >
            {pending ? 'Adding…' : 'Add to roster'}
          </button>
        </form>
      </div>

      <RosterListSection
        title="Students"
        members={studentMembers}
        pending={studentPending}
        onRemove={handleRemove}
      />

      <RosterListSection
        title="Tutors"
        members={tutorMembers}
        pending={tutorPending}
        onRemove={handleRemove}
      />
    </>
  )
}

function RosterListSection({
  title,
  members,
  pending,
  onRemove,
}: {
  title: string
  members: Member[]
  pending: Pending[]
  onRemove: (
    kind: 'pending' | 'member',
    identifier: string,
    label: string
  ) => void
}) {
  const total = members.length + pending.length

  return (
    <div className="gl-section">
      <h2
        className="gl-h2"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span>{title}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: 'var(--gl-mute)',
          }}
        >
          {members.length} enrolled
          {pending.length > 0 && ` · ${pending.length} pending`}
        </span>
      </h2>

      {total === 0 && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--gl-mute)',
            margin: 0,
          }}
        >
          No {title.toLowerCase()} yet.
        </p>
      )}

      {members.map((m) => (
        <div key={m.user_id} className="gl-roster-row">
          <div>
            <p className="gl-roster-name">{m.name ?? m.email}</p>
            <p className="gl-roster-email">{m.email}</p>
          </div>
          <button
            className="gl-btn-ghost"
            onClick={() =>
              onRemove('member', m.user_id, m.name ?? m.email)
            }
          >
            Remove
          </button>
        </div>
      ))}

      {pending.map((p) => (
        <div key={p.id} className="gl-roster-row">
          <div className="gl-roster-row-meta">
            <span className="gl-pending-tag">Pending</span>
            <p className="gl-roster-email-pending">{p.email}</p>
          </div>
          <button
            className="gl-btn-ghost"
            onClick={() => onRemove('pending', String(p.id), p.email)}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}