import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SubmissionsClient from './SubmissionsClient'
import GlobalFooter from '@/app/_components/GlobalFooter'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()

  const isInstructor =
    profile?.role === 'instructor' && course.created_by === user.id

  const { data: isTutorRaw } = await supabase.rpc('is_tutor_in_course', {
    check_course_id: courseId,
  })
  const isTutor = !!isTutorRaw

  const isStaff = isInstructor || isTutor

  const stages = (assignment.stages ?? []) as Stage[]

  // Now selecting returned_* columns too.
  let submissions: Array<{
    id: number
    user_id: string
    stage_name: string
    filename: string
    submitted_at: string
    returned_filename: string | null
    returned_at: string | null
  }> = []

  if (isStaff) {
    const { data } = await supabase
      .from('submissions')
      .select(
        'id, user_id, stage_name, filename, submitted_at, returned_filename, returned_at'
      )
      .eq('assignment_id', assignmentId)
    submissions = data ?? []
  } else {
    const { data } = await supabase
      .from('submissions')
      .select(
        'id, user_id, stage_name, filename, submitted_at, returned_filename, returned_at'
      )
      .eq('assignment_id', assignmentId)
      .eq('user_id', user.id)
    submissions = data ?? []
  }

  let roster: Array<{ user_id: string; name: string | null; email: string }> =
    []
  if (isStaff) {
    const { data: memberships } = await supabase
      .from('course_memberships')
      .select('user_id, role')
      .eq('course_id', courseId)
      .eq('role', 'student')

    const userIds = (memberships ?? []).map((m) => m.user_id)
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds)
      const profById = new Map(
        (profiles ?? []).map((p) => [p.id, p] as const)
      )
      roster = (memberships ?? [])
        .map((m) => {
          const p = profById.get(m.user_id)
          return {
            user_id: m.user_id,
            name: p?.name ?? null,
            email: p?.email ?? '(unknown)',
          }
        })
        .sort((a, b) =>
          (a.name ?? a.email).localeCompare(b.name ?? b.email)
        )
    }
  }

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
            stages.map((s, idx) => (
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
                <span className="gl-assignment-meta">
                  {s.due_date
                    ? `Due ${formatDate(s.due_date)}`
                    : 'No due date'}
                </span>
              </div>
            ))
          )}
        </div>

        <SubmissionsClient
          courseId={courseId}
          assignmentId={assignmentId}
          stages={stages}
          submissions={submissions}
          roster={roster}
          isStaff={isStaff}
          isInstructor={isInstructor}
          currentUserId={user.id}
        />

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
