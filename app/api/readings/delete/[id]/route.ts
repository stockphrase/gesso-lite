import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const readingId = parseInt(id, 10)
  if (!Number.isFinite(readingId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // Look up the reading and its course.
  const { data: reading } = await supabase
    .from('reading_files')
    .select('id, course_id, filename, storage_path')
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

  // Remove storage object first; if it fails we still try to remove the row,
  // but we surface the storage error.
  const { error: storageError } = await supabase.storage
    .from('course-files')
    .remove([reading.storage_path])

  const { error: rowError } = await supabase
    .from('reading_files')
    .delete()
    .eq('id', readingId)

  if (rowError) {
    return NextResponse.json(
      {
        error: `Could not delete record: ${rowError.message}`,
        storage_error: storageError?.message,
      },
      { status: 500 }
    )
  }

  await supabase.rpc('log_action', {
    p_action: 'reading.deleted',
    p_target_type: 'course',
    p_target_id: String(reading.course_id),
    p_details: { filename: reading.filename },
  })

  return NextResponse.json({
    ok: true,
    storage_error: storageError?.message,
  })
}
