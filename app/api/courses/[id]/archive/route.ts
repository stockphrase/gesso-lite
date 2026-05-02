import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const courseId = parseInt(idParam, 10)
  if (!Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('id', courseId)
    .single()
  if (!course) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
  }
  if (course.created_by !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('courses')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', courseId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await supabase.rpc('log_action', {
    p_action: 'course.archived',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: { title: course.title },
  })

  return NextResponse.json({ ok: true })
}
