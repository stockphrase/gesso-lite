import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'
import EditAssignmentClient from './EditAssignmentClient'

export default async function EditAssignmentPage({
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
  if (!course || course.created_by !== user.id) {
    redirect(`/courses/${courseId}`)
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, description, stages')
    .eq('id', assignmentId)
    .eq('course_id', courseId)
    .single()
  if (!assignment) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  type Stage = { name: string; due_date: string | null }
  const stages = (assignment.stages ?? []) as Stage[]

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <EditAssignmentClient
          courseId={courseId}
          assignmentId={assignmentId}
          courseTitle={course.title}
          initialTitle={assignment.title}
          initialDescription={assignment.description ?? ''}
          initialStages={stages}
        />
        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
