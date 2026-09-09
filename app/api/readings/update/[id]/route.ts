import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_DISPLAY_NAME_LEN = 200
const MAX_CITATION_LEN = 2000

function normalize(value: unknown, maxLen: number): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed.slice(0, maxLen) : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const readingId = parseInt(id, 10)
  if (!Number.isFinite(readingId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  let body: { display_name?: string; citation?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const displayName = normalize(body.display_name, MAX_DISPLAY_NAME_LEN)
  const citation = normalize(body.citation, MAX_CITATION_LEN)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: reading } = await supabase
    .from('reading_files')
    .select('id, course_id, filename, display_name, citation')
    .eq('id', readingId)
    .single()

  if (!reading) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: reading.course_id }
  )
  if (!isInstructor) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('reading_files')
    .update({ display_name: displayName, citation })
    .eq('id', readingId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await supabase.rpc('log_action', {
    p_action: 'reading.updated',
    p_target_type: 'course',
    p_target_id: String(reading.course_id),
    p_details: {
      old: { display_name: reading.display_name, citation: reading.citation },
      new: { display_name: displayName, citation },
    },
  })

  return NextResponse.json({ ok: true, display_name: displayName, citation })
}
