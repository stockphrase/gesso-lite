import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Stage = { name: string; due_date: string | null }

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; assignmentId: string }>
}) {
  const { id: idParam, assignmentId: aidParam } = await params
  const courseId = parseInt(idParam, 10)
  const assignmentId = parseInt(aidParam, 10)
  if (!Number.isFinite(courseId) || !Number.isFinite(assignmentId)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, description, stages')
    .eq('id', assignmentId)
    .eq('course_id', courseId)
    .single()

  if (!assignment) notFound()

  const stages = (assignment.stages ?? []) as Stage[]
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <div className="gl-page-header">
          <div>
            <p className="gl-eyebrow">
              <Link
                href={`/courses/${course.id}`}
                style={{
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                ← {course.title}
              </Link>
            </p>
            <h1 className="gl-h1" style={{ marginTop: 4 }}>
              {assignment.title}
            </h1>
          </div>
        </div>

        {assignment.description && (
          <div className="gl-section">
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: 'var(--gl-ink)',
                margin: 0,
                whiteSpace: 'pre-wrap',
              }}
            >
              {assignment.description}
            </p>
          </div>
        )}

        <div className="gl-section">
          <h2 className="gl-h2">Stages</h2>
          {stages.length === 0 ? (
            <div className="gl-empty">No stages defined.</div>
          ) : (
            stages.map((s, idx) => {
              const past = s.due_date
                ? new Date(s.due_date + 'T00:00:00') < today
                : false
              return (
                <div
                  key={`${idx}-${s.name}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    padding: '12px 0',
                    borderBottom: '1px solid var(--gl-hairline)',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{s.name}</span>
                  <span
                    className="gl-assignment-meta"
                    style={{
                      color: past ? 'var(--gl-mute)' : 'var(--gl-mute)',
                    }}
                  >
                    {s.due_date
                      ? `Due ${formatDate(s.due_date)}`
                      : 'No due date'}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <div className="gl-section">
          <h2 className="gl-h2">Submissions</h2>
          <div className="gl-empty">
            Submission upload will appear here in Step 7.
          </div>
        </div>
      </div>
    </main>
  )
}
