import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_MIME = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
])
const ALLOWED_EXTENSIONS = ['.doc', '.docx', '.odt']
const MAX_BYTES = 10 * 1024 * 1024

function safeFilename(name: string): string {
  return name
    .replace(/[\/\\\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200)
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const submissionId = parseInt(
    String(formData.get('submission_id') ?? ''),
    10
  )
  const file = formData.get('file')

  if (!Number.isFinite(submissionId)) {
    return NextResponse.json({ error: 'Bad submission id.' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File required.' }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File must be 10 MB or smaller.' },
      { status: 400 }
    )
  }
  if (!hasAllowedExtension(file.name)) {
    return NextResponse.json(
      { error: 'File must be .doc, .docx, or .odt.' },
      { status: 400 }
    )
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed.' },
      { status: 400 }
    )
  }

  // Look up the submission. RLS ensures the caller can only see submissions
  // in courses they're staff of; we further enforce instructor below.
  const { data: submission } = await supabase
    .from('submissions')
    .select('id, assignment_id, user_id, stage_name')
    .eq('id', submissionId)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found.' }, {
      status: 404,
    })
  }

  // Resolve course_id via the assignment (submissions don't carry it directly).
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, course_id')
    .eq('id', submission.assignment_id)
    .single()
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, {
      status: 404,
    })
  }

  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: assignment.course_id }
  )
  if (!isInstructor) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const filename = safeFilename(file.name)
  const storagePath =
    `returns/${assignment.course_id}/${submission.assignment_id}/${submission.stage_name}/${submission.user_id}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from('course-files')
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type || undefined,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    )
  }

  // Update the submission row's returned_* columns. The trigger from Step 1
  // (enforce_submission_column_ownership) checks that the instructor only
  // modifies the returned_* columns and not student-owned ones — so we
  // pass exactly those.
  const { error: rowError } = await supabase
    .from('submissions')
    .update({
      returned_filename: filename,
      returned_storage_path: storagePath,
      returned_at: new Date().toISOString(),
    })
    .eq('id', submission.id)

  if (rowError) {
    return NextResponse.json(
      { error: `Saved file but could not update record: ${rowError.message}` },
      { status: 500 }
    )
  }

  await supabase.rpc('log_action', {
    p_action: 'submission.returned',
    p_target_type: 'submission',
    p_target_id: String(submission.id),
    p_details: {
      stage: submission.stage_name,
      filename,
      bytes: file.size,
    },
  })

  return NextResponse.json({ ok: true })
}
