import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'

type Stage = { name: string; due_date: string | null }
type Assignment = {
  id: number
  title: string
  stages: Stage[]
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function nextUpcomingStage(
  assignment: Assignment
): { name: string; due_date: string } | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = assignment.stages
    .filter((s): s is { name: string; due_date: string } => !!s.due_date)
    .filter((s) => new Date(s.due_date + 'T00:00:00') >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  return upcoming[0] ?? null
}

function earliestUpcoming(assignment: Assignment): string {
  const next = nextUpcomingStage(assignment)
  return next?.due_date ?? '9999-99-99'
}

export default async function CourseHomePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idParam } = await params
  const courseId = parseInt(idParam, 10)
  if (!Number.isFinite(courseId)) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, term, year, archived_at, created_by')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()

  const isInstructor =
    profile?.role === 'instructor' && course.created_by === user.id

  const { data: assignmentRows } = await supabase
    .from('assignments')
    .select('id, title, stages')
    .eq('course_id', courseId)

  const assignments = ((assignmentRows ?? []) as Assignment[]).sort((a, b) =>
    earliestUpcoming(a).localeCompare(earliestUpcoming(b))
  )

  const academicYear =
    course.year && course.term
      ? course.term.toLowerCase() === 'fall'
        ? `${course.year}–${String(course.year + 1).slice(-2)}`
        : `${course.year - 1}–${String(course.year).slice(-2)}`
      : null

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <div className="gl-page-header">
          <div>
            <p className="gl-eyebrow">
              <Link
                href="/courses"
                style={{
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                ← Courses
              </Link>
            </p>
            <h1 className="gl-h1" style={{ marginTop: 4 }}>
              {course.title}
            </h1>
            {(academicYear || course.term) && (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--gl-mute)',
                  margin: '6px 0 0',
                }}
              >
                {course.term} {academicYear && `· ${academicYear}`}
                {course.archived_at && ' · Archived'}
              </p>
            )}
          </div>
          {isInstructor && (
            <Link href={`/courses/${course.id}/settings`} className="gl-btn-sm">
              Settings
            </Link>
          )}
        </div>

        <div className="gl-section">
          <h2
            className="gl-h2"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span>Assignments</span>
            {isInstructor && (
              <Link
                href={`/courses/${course.id}/assignments/new`}
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                + New assignment
              </Link>
            )}
          </h2>

          {assignments.length === 0 ? (
            <div className="gl-empty">No assignments yet.</div>
          ) : (
            assignments.map((a) => {
              const next = nextUpcomingStage(a)
              const isComplete = !next
              return (
                <Link
                  key={a.id}
                  href={`/courses/${course.id}/assignments/${a.id}`}
                  className={
                    isComplete
                      ? 'gl-assignment-row gl-assignment-row-complete'
                      : 'gl-assignment-row'
                  }
                >
                  <span style={{ fontSize: 16 }}>{a.title}</span>
                  <span className="gl-assignment-meta">
                    {next
                      ? `${next.name} due ${formatDate(next.due_date)}`
                      : 'All stages complete'}
                  </span>
                </Link>
              )
            })
          )}
        </div>

        <div className="gl-section">
          <h2 className="gl-h2">Readings</h2>
          <div className="gl-empty">
            Course readings will appear here in Step 10.
          </div>
        </div>

        {isInstructor && (
          <div className="gl-section">
            <h2
              className="gl-h2"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span>Roster</span>
              <Link
                href={`/courses/${course.id}/roster`}
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                Manage roster →
              </Link>
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--gl-mute)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Add students and tutors, view pending registrations.
            </p>
          </div>
        )}

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
