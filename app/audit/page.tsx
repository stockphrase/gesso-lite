import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'

type AuditEntry = {
  id: number
  user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

type CourseRef = {
  id: number
  title: string
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHour < 24) return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function actionVerb(entry: AuditEntry): string {
  const a = entry.action
  switch (a) {
    case 'course.archived':
      return 'archived course'
    case 'course.unarchived':
      return 'unarchived course'
    case 'course.deleted':
      return 'deleted course'
    case 'course.created_from_template':
      return 'created course from template'
    case 'course.backup':
      return 'downloaded backup of course'
    case 'assignment.created':
      return 'created assignment'
    case 'submission.uploaded':
      return 'uploaded a submission for assignment'
    case 'submission.returned':
      return 'returned a submission for assignment'
    case 'reading.uploaded':
      return 'uploaded readings to course'
    case 'reading.deleted':
      return 'deleted reading from course'
    case 'template.saved':
      return 'saved template'
    case 'template.deleted':
      return 'deleted template'
    default:
      return a
  }
}

function detailLine(entry: AuditEntry): string | null {
  const d = entry.details
  if (!d || typeof d !== 'object') return null

  switch (entry.action) {
    case 'course.deleted': {
      const v = (d.users_vaporized as number) ?? 0
      const s = (d.users_spared as number) ?? 0
      const parts: string[] = []
      if (v > 0)
        parts.push(`${v} ${v === 1 ? 'user account' : 'user accounts'} removed`)
      if (s > 0)
        parts.push(`${s} ${s === 1 ? 'account' : 'accounts'} spared (in other courses)`)
      return parts.join(' · ') || null
    }
    case 'submission.uploaded': {
      const stage = d.stage as string | undefined
      if (stage) return `Stage: ${stage}`
      return null
    }
    case 'submission.returned': {
      const bulk = d.bulk as boolean | undefined
      const count = d.returned_count as number | undefined
      if (bulk && count !== undefined) {
        return `Distributed ${count} ${count === 1 ? 'return' : 'returns'} via bulk upload`
      }
      const stage = d.stage as string | undefined
      if (stage) return `Stage: ${stage}`
      return null
    }
    case 'reading.uploaded': {
      const saved = d.saved_count as number | undefined
      const skipped = d.skipped_count as number | undefined
      if (saved !== undefined) {
        const parts: string[] = [`Saved ${saved} ${saved === 1 ? 'file' : 'files'}`]
        if (skipped) parts.push(`skipped ${skipped}`)
        return parts.join(' · ')
      }
      return null
    }
    case 'reading.deleted': {
      const fname = d.filename as string | undefined
      return fname ? `Filename: ${fname}` : null
    }
    case 'assignment.created': {
      const sc = d.stage_count as number | undefined
      if (sc !== undefined) return `${sc} ${sc === 1 ? 'stage' : 'stages'}`
      return null
    }
    case 'course.created_from_template': {
      const ac = d.assignment_count as number | undefined
      if (ac !== undefined)
        return `${ac} ${ac === 1 ? 'assignment' : 'assignments'} from template`
      return null
    }
    case 'course.backup': {
      const incS = d.include_submissions as boolean | undefined
      const incR = d.include_returns as boolean | undefined
      const memberCount = d.member_count as number | undefined
      const parts: string[] = []
      if (memberCount !== undefined)
        parts.push(`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`)
      if (incS) parts.push('included submission files')
      if (incR) parts.push('included return files')
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 'template.saved': {
      const name = d.name as string | undefined
      return name ? `Template name: ${name}` : null
    }
    case 'template.deleted': {
      const name = d.name as string | undefined
      return name ? `Template name: ${name}` : null
    }
    default:
      return null
  }
}

function courseRef(
  entry: AuditEntry,
  coursesById: Map<number, CourseRef>,
  assignmentsById: Map<number, { id: number; course_id: number; title: string }>
): { courseId: number; courseTitle: string; assignmentId?: number; assignmentTitle?: string } | null {
  if (entry.target_type === 'course' && entry.target_id) {
    const cid = parseInt(entry.target_id, 10)
    const course = coursesById.get(cid)
    if (course) {
      return { courseId: course.id, courseTitle: course.title }
    }
    const detailsTitle =
      (entry.details && typeof entry.details === 'object'
        ? (entry.details.title as string | undefined)
        : undefined) ?? null
    if (detailsTitle) {
      return { courseId: cid, courseTitle: detailsTitle }
    }
  }
  if (entry.target_type === 'assignment' && entry.target_id) {
    const aid = parseInt(entry.target_id, 10)
    const assignment = assignmentsById.get(aid)
    if (assignment) {
      const course = coursesById.get(assignment.course_id)
      return {
        courseId: assignment.course_id,
        courseTitle: course?.title ?? '(deleted course)',
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
      }
    }
  }
  return null
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>
}) {
  const sp = await searchParams
  const courseFilterId = sp.course ? parseInt(sp.course, 10) : null

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

  if (profile?.role !== 'instructor') {
    redirect('/courses')
  }

  let query = supabase
    .from('audit_log')
    .select('id, user_id, action, target_type, target_id, details, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (courseFilterId !== null && Number.isFinite(courseFilterId)) {
    const { data: courseAssignments } = await supabase
      .from('assignments')
      .select('id')
      .eq('course_id', courseFilterId)
    const assignmentIds = (courseAssignments ?? []).map((a) => a.id.toString())

    const orParts = [
      `and(target_type.eq.course,target_id.eq.${courseFilterId})`,
    ]
    if (assignmentIds.length > 0) {
      orParts.push(
        `and(target_type.eq.assignment,target_id.in.(${assignmentIds.join(',')}))`
      )
    }
    query = query.or(orParts.join(','))
  }

  const { data: entries } = await query
  const auditEntries = (entries ?? []) as AuditEntry[]

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('created_by', user.id)
    .order('title')

  const coursesList = (courses ?? []) as CourseRef[]
  const coursesById = new Map(coursesList.map((c) => [c.id, c]))

  const allCourseIds = coursesList.map((c) => c.id)
  const { data: allAssignments } =
    allCourseIds.length > 0
      ? await supabase
          .from('assignments')
          .select('id, course_id, title')
          .in('course_id', allCourseIds)
      : { data: [] }
  const assignmentsById = new Map(
    (allAssignments ?? []).map((a) => [a.id, a as { id: number; course_id: number; title: string }])
  )

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
              Audit log
            </h1>
            <p
              style={{
                fontSize: 13,
                color: 'var(--gl-mute)',
                margin: '6px 0 0',
                lineHeight: 1.5,
              }}
            >
              Recent significant actions in your courses. Last 100 entries.
            </p>
          </div>
        </div>

        {coursesList.length > 0 && (
          <form
            method="get"
            style={{
              marginBottom: 32,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <label className="gl-label" htmlFor="course">
              Filter by course
            </label>
            <select
              id="course"
              name="course"
              defaultValue={courseFilterId ?? ''}
              style={{
                background: 'transparent',
                border: '0.5px solid var(--gl-hairline)',
                padding: '6px 10px',
                fontSize: 13,
                color: 'var(--gl-ink)',
                appearance: 'none',
              }}
            >
              <option value="">All courses</option>
              {coursesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="gl-btn-ghost"
              style={{ padding: '6px 10px' }}
            >
              Apply
            </button>
            {courseFilterId !== null && (
              <Link
                href="/audit"
                className="gl-btn-ghost"
                style={{ textDecoration: 'none', padding: '6px 10px' }}
              >
                Clear
              </Link>
            )}
          </form>
        )}

        {auditEntries.length === 0 ? (
          <div className="gl-empty">No actions logged yet.</div>
        ) : (
          auditEntries.map((entry) => {
            const ref = courseRef(entry, coursesById, assignmentsById)
            const detail = detailLine(entry)

            return (
              <div
                key={entry.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr',
                  gap: 16,
                  padding: '14px 0',
                  borderBottom: '0.5px solid var(--gl-hairline)',
                  alignItems: 'baseline',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--gl-mute)',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.5,
                  }}
                >
                  <div>{formatRelative(entry.created_at)}</div>
                  <div style={{ fontSize: 11 }}>
                    {formatAbsolute(entry.created_at)}
                  </div>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14 }}>
                    You {actionVerb(entry)}
                    {ref && (
                      <>
                        {' '}
                        {ref.assignmentId ? (
                          <>
                            <Link
                              href={`/courses/${ref.courseId}/assignments/${ref.assignmentId}`}
                              className="gl-link"
                            >
                              {ref.assignmentTitle ?? `assignment ${ref.assignmentId}`}
                            </Link>
                            {' in '}
                            <Link
                              href={`/courses/${ref.courseId}`}
                              className="gl-link"
                            >
                              {ref.courseTitle}
                            </Link>
                          </>
                        ) : coursesById.has(ref.courseId) ? (
                          <Link
                            href={`/courses/${ref.courseId}`}
                            className="gl-link"
                          >
                            &ldquo;{ref.courseTitle}&rdquo;
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--gl-mute)' }}>
                            &ldquo;{ref.courseTitle}&rdquo; (deleted)
                          </span>
                        )}
                      </>
                    )}
                    {entry.target_type === 'template' && (
                      <span style={{ color: 'var(--gl-mute)' }}> (template)</span>
                    )}
                  </p>
                  {detail && (
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 12,
                        color: 'var(--gl-mute)',
                        lineHeight: 1.5,
                      }}
                    >
                      {detail}
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
