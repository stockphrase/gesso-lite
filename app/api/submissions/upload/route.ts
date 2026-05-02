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
  // Remove path separators, control characters, and other surprises.
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

  const courseId = parseInt(String(formData.get('course_id') ?? ''), 10)
  const assignmentId = parseInt(
    String(formData.get('assignment_id') ?? ''),
    10
  )
  const stageName = String(formData.get('stage_name') ?? '').trim()
  const file = formData.get('file')

  if (!Number.isFinite(courseId) || !Number.isFinite(assignmentId)) {
    return NextResponse.json({ error: 'Bad ids.' }, { status: 400 })
  }
  if (!stageName) {
    return NextResponse.json({ error: 'Stage name required.' }, { status: 400 })
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
    // Some browsers report empty type for .odt; we trust the extension check above
    // when type is empty, otherwise enforce it.
    return NextResponse.json(
      { error: 'File type not allowed.' },
      { status: 400 }
    )
  }

  // Authorization: caller must be a member of the course AND the assignment
  // must belong to that course AND the stage_name must exist on the assignment.
  const { data: isMember } = await supabase.rpc('is_member_of_course', {
    check_course_id: courseId,
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Not a member of this course.' }, {
      status: 403,
    })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, course_id, stages')
    .eq('id', assignmentId)
    .single()
  if (!assignment || assignment.course_id !== courseId) {
    return NextResponse.json({ error: 'Assignment not found.' }, {
      status: 404,
    })
  }

  type Stage = { name: string; due_date: string | null }
  const stages = (assignment.stages ?? []) as Stage[]
  if (!stages.some((s) => s.name === stageName)) {
    return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 })
  }

  const filename = safeFilename(file.name)
  const storagePath =
    `submissions/${courseId}/${assignmentId}/${stageName}/${user.id}/${filename}`

  // Upload (upsert: replace on re-submit).
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

  // Insert/update the submissions row. UNIQUE (assignment_id, user_id, stage_name)
  // means upsert here gives one row per (student, stage).
  // Use ON CONFLICT to update filename + storage_path + submitted_at.
  const { error: rowError } = await supabase
    .from('submissions')
    .upsert(
      {
        assignment_id: assignmentId,
        user_id: user.id,
        stage_name: stageName,
        filename,
        storage_path: storagePath,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id,user_id,stage_name' }
    )

  if (rowError) {
    return NextResponse.json(
      { error: `Saved file but could not update record: ${rowError.message}` },
      { status: 500 }
    )
  }

  await supabase.rpc('log_action', {
    p_action: 'submission.uploaded',
    p_target_type: 'assignment',
    p_target_id: String(assignmentId),
    p_details: {
      stage: stageName,
      filename,
      bytes: file.size,
    },
  })

  return NextResponse.json({ ok: true })
}
