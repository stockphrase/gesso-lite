import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Stage = { name: string; due_date: string | null }

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { course_id?: number; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const courseId = body.course_id
  const name = String(body.name ?? '').trim()

  if (!courseId || !Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'course_id required.' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'Template name required.' }, {
      status: 400,
    })
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

  // Pull assignments — keep title/description/stage names; drop dates.
  const { data: rawAssignments } = await supabase
    .from('assignments')
    .select('title, description, stages, position')
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  type AssignmentRow = {
    title: string
    description: string | null
    stages: Stage[]
    position: number
  }

  const assignments = ((rawAssignments ?? []) as AssignmentRow[]).map(
    (a) => ({
      title: a.title,
      description: a.description,
      stages: (a.stages ?? []).map((s) => ({ name: s.name })),
    })
  )

  // Pull readings — keep filenames only.
  const { data: rawReadings } = await supabase
    .from('reading_files')
    .select('filename')
    .eq('course_id', courseId)
    .order('uploaded_at', { ascending: false })
  const previousReadings = (rawReadings ?? []).map((r) => ({
    filename: r.filename,
  }))

  const { data: tpl, error: insertError } = await supabase
    .from('course_templates')
    .insert({
      owner_id: user.id,
      name,
      course_title_default: course.title,
      assignments,
      previous_readings: previousReadings,
    })
    .select('id')
    .single()

  if (insertError || !tpl) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not save template.' },
      { status: 500 }
    )
  }

  await supabase.rpc('log_action', {
    p_action: 'template.saved',
    p_target_type: 'template',
    p_target_id: String(tpl.id),
    p_details: { name, source_course_id: courseId },
  })

  return NextResponse.json({ ok: true, template_id: tpl.id })
}
