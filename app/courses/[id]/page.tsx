import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
    .select('role')
    .eq('id', user.id)
    .single()

  const isInstructor =
    profile?.role === 'instructor' && course.created_by === user.id

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
          <h2 className="gl-h2">Assignments</h2>
          <div className="gl-empty">
            Assignments will appear here in Step 6.
          </div>
        </div>

        <div className="gl-section">
          <h2 className="gl-h2">Readings</h2>
          <div className="gl-empty">
            Course readings will appear here in Step 10.
          </div>
        </div>

        {isInstructor && (
          <div className="gl-section">
            <h2 className="gl-h2">Roster</h2>
            <div className="gl-empty">
              Roster management will appear here in Step 5.
            </div>
          </div>
        )}
      </div>
    </main>
  )
}