import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const templateId = parseInt(idParam, 10)
  if (!Number.isFinite(templateId)) {
    return NextResponse.json({ error: 'Bad template id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { title?: string; term?: string; year?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const title = String(body.title ?? '').trim()
  const term = String(body.term ?? '').trim()
  const year = body.year

  if (!title) {
    return NextResponse.json({ error: 'Course title required.' }, {
      status: 400,
    })
  }
  if (term !== 'Fall' && term !== 'Winter') {
    return NextResponse.json({ error: 'Term must be Fall or Winter.' }, {
      status: 400,
    })
  }
  if (!year || !Number.isFinite(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year.' }, { status: 400 })
  }

  // Verify template ownership.
  const { data: template } = await supabase
    .from('course_templates')
    .select('id, owner_id, assignments')
    .eq('id', templateId)
    .single()
  if (!template || template.owner_id !== user.id) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  }

  // Verify caller is an instructor.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'instructor') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Create the new course.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({
      title,
      term,
      year,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (courseError || !course) {
    return NextResponse.json(
      { error: courseError?.message ?? 'Could not create course.' },
      { status: 500 }
    )
  }

  // Create assignments from the template.
  type TemplateAssignment = {
    title: string
    description: string | null
    stages: { name: string }[]
  }
  const assignments = (template.assignments ?? []) as TemplateAssignment[]

  if (assignments.length > 0) {
    const rows = assignments.map((a, idx) => ({
      course_id: course.id,
      title: a.title,
      description: a.description,
      stages: a.stages.map((s) => ({ name: s.name, due_date: null })),
      position: idx,
    }))

    const { error: insertError } = await supabase
      .from('assignments')
      .insert(rows)

    if (insertError) {
      // Best-effort cleanup: delete the course we just created.
      await supabase.from('courses').delete().eq('id', course.id)
      return NextResponse.json(
        { error: `Failed to create assignments: ${insertError.message}` },
        { status: 500 }
      )
    }
  }

  await supabase.rpc('log_action', {
    p_action: 'course.created_from_template',
    p_target_type: 'course',
    p_target_id: String(course.id),
    p_details: {
      template_id: templateId,
      assignment_count: assignments.length,
    },
  })

  return NextResponse.json({ ok: true, course_id: course.id })
}
