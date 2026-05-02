import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'

type Course = {
  id: number
  title: string
  term: string | null
  year: number | null
  archived_at: string | null
}

type AcademicYearGroup = {
  label: string
  startYear: number
  fall: Course[]
  winter: Course[]
}

function academicYearForCourse(course: Course): {
  startYear: number
  label: string
} | null {
  if (!course.year || !course.term) return null
  const t = course.term.toLowerCase()
  const startYear = t === 'fall' ? course.year : course.year - 1
  return {
    startYear,
    label: `${startYear}–${String(startYear + 1).slice(-2)}`,
  }
}

function groupCoursesByYear(courses: Course[]): AcademicYearGroup[] {
  const map = new Map<number, AcademicYearGroup>()

  for (const course of courses) {
    const ay = academicYearForCourse(course)
    if (!ay) continue
    if (!map.has(ay.startYear)) {
      map.set(ay.startYear, {
        label: ay.label,
        startYear: ay.startYear,
        fall: [],
        winter: [],
      })
    }
    const bucket = map.get(ay.startYear)!
    if (course.term?.toLowerCase() === 'fall') bucket.fall.push(course)
    else if (course.term?.toLowerCase() === 'winter') bucket.winter.push(course)
  }

  for (const group of map.values()) {
    group.fall.sort((a, b) => a.title.localeCompare(b.title))
    group.winter.sort((a, b) => a.title.localeCompare(b.title))
  }

  return Array.from(map.values()).sort((a, b) => b.startYear - a.startYear)
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; vaporized?: string }>
}) {
  const sp = await searchParams
  const deletedTitle = sp.deleted
  const vaporized = sp.vaporized ? parseInt(sp.vaporized, 10) : 0

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()

  const isInstructor = profile?.role === 'instructor'

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, term, year, archived_at')
    .order('year', { ascending: false })
    .order('title', { ascending: true })

  const allCourses = (courses ?? []) as Course[]
  const active = allCourses.filter((c) => !c.archived_at)
  const archived = allCourses.filter((c) => c.archived_at)

  const activeGroups = groupCoursesByYear(active)
  const archivedGroups = groupCoursesByYear(archived)

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <div className="gl-page-header">
          <div>
            <p className="gl-eyebrow">Gesso Lite</p>
            <h1 className="gl-h1">Courses</h1>
          </div>
          {isInstructor && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/audit"
                className="gl-btn-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--gl-mute)',
                  borderColor: 'var(--gl-hairline)',
                }}
              >
                Audit
              </Link>
              <Link
                href="/templates"
                className="gl-btn-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--gl-mute)',
                  borderColor: 'var(--gl-hairline)',
                }}
              >
                Templates
              </Link>
              <Link href="/courses/new" className="gl-btn-sm">
                + New course
              </Link>
            </div>
          )}
        </div>

        {deletedTitle && (
          <div className="gl-banner" style={{ marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <p className="gl-banner-title">
                Course &ldquo;{deletedTitle}&rdquo; deleted.
              </p>
              {vaporized > 0 && (
                <p className="gl-banner-body">
                  {vaporized}{' '}
                  {vaporized === 1 ? 'user account' : 'user accounts'} removed.
                </p>
              )}
            </div>
          </div>
        )}

        {activeGroups.length === 0 && archivedGroups.length === 0 && (
          <div className="gl-empty">
            {isInstructor
              ? 'No courses yet. Click "+ New course" to create one.'
              : 'You are not enrolled in any courses yet.'}
          </div>
        )}

        {activeGroups.map((group) => (
          <div key={group.startYear} className="gl-section">
            <h2 className="gl-h2">{group.label}</h2>
            {group.fall.length > 0 && (
              <div className="gl-subsection">
                <p className="gl-eyebrow">Fall</p>
                {group.fall.map((c) => (
                  <Link key={c.id} href={`/courses/${c.id}`} className="gl-row">
                    {c.title}
                  </Link>
                ))}
              </div>
            )}
            {group.winter.length > 0 && (
              <div className="gl-subsection">
                <p className="gl-eyebrow">Winter</p>
                {group.winter.map((c) => (
                  <Link key={c.id} href={`/courses/${c.id}`} className="gl-row">
                    {c.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {archivedGroups.length > 0 && (
          <div className="gl-archived-block">
            <p className="gl-eyebrow" style={{ marginBottom: 24 }}>
              Archived
            </p>
            {archivedGroups.map((group) => (
              <div key={group.startYear} className="gl-section">
                <h2 className="gl-h2 gl-h2-archived">{group.label}</h2>
                {group.fall.length > 0 && (
                  <div className="gl-subsection">
                    <p className="gl-eyebrow">Fall</p>
                    {group.fall.map((c) => (
                      <Link
                        key={c.id}
                        href={`/courses/${c.id}`}
                        className="gl-row gl-row-archived"
                      >
                        {c.title}
                      </Link>
                    ))}
                  </div>
                )}
                {group.winter.length > 0 && (
                  <div className="gl-subsection">
                    <p className="gl-eyebrow">Winter</p>
                    {group.winter.map((c) => (
                      <Link
                        key={c.id}
                        href={`/courses/${c.id}`}
                        className="gl-row gl-row-archived"
                      >
                        {c.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
