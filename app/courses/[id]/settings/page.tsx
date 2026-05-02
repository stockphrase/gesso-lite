import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'
import SettingsClient from './SettingsClient'

function academicYear(term: string | null, year: number | null): string {
  if (!term || !year) return ''
  const t = term.toLowerCase()
  if (t === 'fall') return `${year}-${String((year + 1) % 100).padStart(2, '0')}`
  if (t === 'winter')
    return `${year - 1}-${String(year % 100).padStart(2, '0')}`
  return ''
}

export default async function CourseSettingsPage({
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
  if (course.created_by !== user.id) {
    redirect(`/courses/${courseId}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  const ay = academicYear(course.term, course.year)
  const defaultTemplateName = ay
    ? `${ay}-${course.title}`
    : course.title

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
              Settings
            </h1>
          </div>
        </div>

        <SettingsClient
          courseId={course.id}
          courseTitle={course.title}
          defaultTemplateName={defaultTemplateName}
          isArchived={!!course.archived_at}
        />

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
