'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import FilePicker from '@/app/_components/FilePicker'

type Reading = {
  id: number
  filename: string
  size_bytes: number | null
  uploaded_at: string
}

type SkipReason =
  | 'not-pdf'
  | 'too-large'
  | 'empty'
  | 'upload-failed'
  | 'db-failed'

type SkipEntry = { filename: string; reason: SkipReason; detail?: string }

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })
}

function reasonLabel(r: SkipReason): string {
  switch (r) {
    case 'not-pdf':
      return 'not a PDF'
    case 'too-large':
      return 'too large'
    case 'empty':
      return 'empty file'
    case 'upload-failed':
      return 'upload failed'
    case 'db-failed':
      return 'database error'
  }
}

export default function ReadingsClient({
  courseId,
  readings,
  isInstructor,
}: {
  courseId: number
  readings: Reading[]
  isInstructor: boolean
}) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ saved: number; skipped: SkipEntry[] } | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (!file) {
      setError('Choose a file first.')
      return
    }
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.zip')) {
      setError('File must be a .pdf or a .zip of PDFs.')
      return
    }

    const fd = new FormData()
    fd.set('course_id', String(courseId))
    fd.set('file', file)

    startTransition(async () => {
      const res = await fetch('/api/readings/upload', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Upload failed.')
        return
      }
      setFile(null)
      setResult({ saved: data.saved ?? 0, skipped: data.skipped ?? [] })
      router.refresh()
    })
  }

  function handleDelete(id: number, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return

    startTransition(async () => {
      const res = await fetch(`/api/readings/delete/${id}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data?.error ?? 'Delete failed.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="gl-section">
      <h2
        className="gl-h2"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <span>Readings</span>
        {readings.length > 0 && (
          <span
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--gl-mute)',
              display: 'flex',
              gap: 14,
              alignItems: 'baseline',
            }}
          >
            <span>
              {readings.length} {readings.length === 1 ? 'file' : 'files'}
            </span>
            <a
              href={`/api/readings/zip/${courseId}`}
              className="gl-btn-ghost"
              style={{ textDecoration: 'none' }}
            >
              Download all
            </a>
          </span>
        )}
      </h2>

      {isInstructor && (
        <div
          style={{
            padding: 14,
            border: '0.5px solid var(--gl-hairline)',
            marginBottom: 24,
          }}
        >
          <p className="gl-label" style={{ marginBottom: 8 }}>
            Upload
          </p>
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <FilePicker
                accept=".pdf,.zip"
                onChange={(f) => setFile(f)}
                selected={file}
                disabled={pending}
              />
              <button
                type="submit"
                disabled={pending || !file}
                className="gl-btn"
                style={{
                  width: 'auto',
                  padding: '6px 12px',
                  fontSize: 10,
                  flexShrink: 0,
                  marginLeft: 'auto',
                }}
              >
                {pending ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 12,
                color: 'var(--gl-mute)',
                lineHeight: 1.5,
              }}
            >
              .pdf or a .zip of PDFs — max 50 MB per file.
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
        </div>
      )}

      {result && (
        <div className="gl-banner" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <p className="gl-banner-title">
              Uploaded {result.saved}{' '}
              {result.saved === 1 ? 'file' : 'files'}.
            </p>
            {result.skipped.length > 0 && (
              <p className="gl-banner-body" style={{ fontSize: 12 }}>
                Skipped {result.skipped.length}:{' '}
                {result.skipped.slice(0, 5).map((s, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <span
                      style={{
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      }}
                    >
                      {s.filename}
                    </span>{' '}
                    ({reasonLabel(s.reason)})
                  </span>
                ))}
                {result.skipped.length > 5 &&
                  ` and ${result.skipped.length - 5} more.`}
              </p>
            )}
          </div>
          <button
            className="gl-banner-dismiss"
            aria-label="Dismiss"
            onClick={() => setResult(null)}
          >
            ×
          </button>
        </div>
      )}

      {readings.length === 0 ? (
        <div className="gl-empty">
          {isInstructor
            ? 'No readings uploaded yet.'
            : 'The instructor has not uploaded any readings yet.'}
        </div>
      ) : (
        readings.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '0.5px solid var(--gl-hairline)',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.filename}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 12,
                  color: 'var(--gl-mute)',
                }}
              >
                {formatBytes(r.size_bytes)}
                {r.size_bytes !== null && ' · '}
                uploaded {formatDate(r.uploaded_at)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <a
                href={`/api/readings/download/${r.id}`}
                className="gl-btn-ghost"
                style={{ textDecoration: 'none' }}
              >
                Download
              </a>
              {isInstructor && (
                <button
                  type="button"
                  className="gl-btn-ghost"
                  onClick={() => handleDelete(r.id, r.filename)}
                  disabled={pending}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
