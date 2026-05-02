import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RosterClient from './RosterClient'
import GlobalFooter from '@/app/_components/GlobalFooter'

export default async function RosterPage({
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
    .select('id, title, created_by')
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

  const { data: pendingRows } = await supabase
    .from('allowed_emails')
    .select('id, email, role')
    .eq('course_id', courseId)
    .is('claimed_at', null)
    .order('email', { ascending: true })

  const { data: membershipRows } = await supabase
    .from('course_memberships')
    .select('user_id, role')
    .eq('course_id', courseId)

  const userIds = (membershipRows ?? []).map((m) => m.user_id)
  const { data: profileRows } =
    userIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', userIds)
      : { data: [] }

  type ProfileRow = { id: string; name: string | null; email: string }
  const profilesById: Map<string, ProfileRow> = new Map()
  for (const p of profileRows ?? []) {
    profilesById.set(p.id, p)
  }

  type MembershipRow = { user_id: string; role: 'student' | 'tutor' }
  const memberships = (membershipRows ?? []) as MembershipRow[]

  const members = memberships
    .map((m) => {
      const p = profilesById.get(m.user_id)
      return {
        user_id: m.user_id,
        role: m.role,
        name: p?.name ?? null,
        email: p?.email ?? '(profile unavailable)',
      }
    })
    .sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email)
    )

  const studentMembers = members.filter((m) => m.role === 'student')
  const tutorMembers = members.filter((m) => m.role === 'tutor')

  const pending = (pendingRows ?? []) as {
    id: number
    email: string
    role: 'student' | 'tutor'
  }[]

  const studentPending = pending.filter((p) => p.role === 'student')
  const tutorPending = pending.filter((p) => p.role === 'tutor')

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
              Roster
            </h1>
          </div>
        </div>

        <RosterClient
          courseId={course.id}
          studentMembers={studentMembers.map((m) => ({
            user_id: m.user_id,
            name: m.name,
            email: m.email,
          }))}
          studentPending={studentPending}
          tutorMembers={tutorMembers.map((m) => ({
            user_id: m.user_id,
            name: m.name,
            email: m.email,
          }))}
          tutorPending={tutorPending}
        />

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
