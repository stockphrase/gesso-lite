import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const courseId = parseInt(idParam, 10)
  if (!Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
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
    return NextResponse.json({ error: 'Title required.' }, { status: 400 })
  }
  if (term !== 'Fall' && term !== 'Winter') {
    return NextResponse.json(
      { error: 'Term must be Fall or Winter.' },
      { status: 400 }
    )
  }
  if (!year || !Number.isFinite(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year.' }, { status: 400 })
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
    .select('id, title, term, year, created_by')
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
    .update({ title, term, year })
    .eq('id', courseId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await supabase.rpc('log_action', {
    p_action: 'course.updated',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: {
      old: { title: course.title, term: course.term, year: course.year },
      new: { title, term, year },
    },
  })

  return NextResponse.json({ ok: true })
}
