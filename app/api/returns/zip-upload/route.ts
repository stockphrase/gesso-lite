import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

const ALLOWED_EXTENSIONS = ['.doc', '.docx', '.odt']
const MAX_BYTES_PER_FILE = 10 * 1024 * 1024
const MAX_ZIP_BYTES = 200 * 1024 * 1024

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

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.endsWith('.odt')) {
    return 'application/vnd.oasis.opendocument.text'
  }
  if (lower.endsWith('.doc')) {
    return 'application/msword'
  }
  return 'application/octet-stream'
}

function codeFromFilename(filename: string): string | null {
  const m = filename.match(/_([0-9a-z]{5})\.[A-Za-z0-9]+$/)
  return m ? m[1] : null
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(slash + 1) : path
}

type SkipReason =
  | 'no-code-suffix'
  | 'unknown-code'
  | 'no-submission'
  | 'wrong-extension'
  | 'too-large'
  | 'empty'
  | 'upload-failed'
  | 'db-update-failed'

type SkipEntry = { filename: string; reason: SkipReason; detail?: string }

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

  const assignmentId = parseInt(
    String(formData.get('assignment_id') ?? ''),
    10
  )
  const stageName = String(formData.get('stage_name') ?? '').trim()
  const file = formData.get('file')

  if (!Number.isFinite(assignmentId) || !stageName) {
    return NextResponse.json(
      { error: 'assignment_id and stage_name required.' },
      { status: 400 }
    )
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Zip file required.' }, { status: 400 })
  }
  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: `Zip is too large. Max ${MAX_ZIP_BYTES / 1024 / 1024} MB.` },
      { status: 400 }
    )
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, course_id, stages')
    .eq('id', assignmentId)
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

  type Stage = { name: string; due_date: string | null }
  const stages = (assignment.stages ?? []) as Stage[]
  if (!stages.some((s) => s.name === stageName)) {
    return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 })
  }

  const { data: memberships } = await supabase
    .from('course_memberships')
    .select('user_id, role')
    .eq('course_id', assignment.course_id)
  const memberIds = (memberships ?? []).map((m) => m.user_id)
  const { data: profiles } =
    memberIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, student_code, email, name')
          .in('id', memberIds)
      : { data: [] }
  const profileByCode = new Map<
    string,
    { id: string; email: string; name: string | null }
  >()
  for (const p of profiles ?? []) {
    if (p.student_code) {
      profileByCode.set(p.student_code, {
        id: p.id,
        email: p.email,
        name: p.name,
      })
    }
  }

  const { data: existingSubs } = await supabase
    .from('submissions')
    .select('id, user_id, filename')
    .eq('assignment_id', assignmentId)
    .eq('stage_name', stageName)

  const submissionByUser = new Map(
    (existingSubs ?? []).map((s) => [s.user_id, s] as const)
  )

  let zip: JSZip
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    zip = await JSZip.loadAsync(buf)
  } catch {
    return NextResponse.json({ error: 'Could not read zip.' }, { status: 400 })
  }

  const skipped: SkipEntry[] = []
  const succeeded: { user_id: string; filename: string }[] = []

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)

  for (const entry of entries) {
    const name = basename(entry.name)
    if (!name || name.startsWith('.')) continue

    if (!hasAllowedExtension(name)) {
      skipped.push({ filename: name, reason: 'wrong-extension' })
      continue
    }

    const code = codeFromFilename(name)
    if (!code) {
      skipped.push({ filename: name, reason: 'no-code-suffix' })
      continue
    }

    const profile = profileByCode.get(code)
    if (!profile) {
      skipped.push({ filename: name, reason: 'unknown-code', detail: code })
      continue
    }

    const submission = submissionByUser.get(profile.id)
    if (!submission) {
      skipped.push({ filename: name, reason: 'no-submission' })
      continue
    }

    const fileBytes = await entry.async('uint8array')
    if (fileBytes.byteLength === 0) {
      skipped.push({ filename: name, reason: 'empty' })
      continue
    }
    if (fileBytes.byteLength > MAX_BYTES_PER_FILE) {
      skipped.push({ filename: name, reason: 'too-large' })
      continue
    }

    const safeName = safeFilename(name)
    const contentType = contentTypeFor(safeName)
    const storagePath =
      `returns/${assignment.course_id}/${assignmentId}/${stageName}/${profile.id}/${safeName}`

    const blob = new Blob([fileBytes as BlobPart], { type: contentType })

    const { error: uploadError } = await supabase.storage
      .from('course-files')
      .upload(storagePath, blob, {
        upsert: true,
        contentType,
      })

    if (uploadError) {
      skipped.push({
        filename: name,
        reason: 'upload-failed',
        detail: uploadError.message,
      })
      continue
    }

    const { error: rowError } = await supabase
      .from('submissions')
      .update({
        returned_filename: safeName,
        returned_storage_path: storagePath,
        returned_at: new Date().toISOString(),
      })
      .eq('id', submission.id)

    if (rowError) {
      skipped.push({
        filename: name,
        reason: 'db-update-failed',
        detail: rowError.message,
      })
      continue
    }

    succeeded.push({ user_id: profile.id, filename: safeName })
  }

  await supabase.rpc('log_action', {
    p_action: 'submission.returned',
    p_target_type: 'assignment',
    p_target_id: String(assignmentId),
    p_details: {
      bulk: true,
      stage: stageName,
      returned_count: succeeded.length,
      skipped_count: skipped.length,
    },
  })

  return NextResponse.json({
    ok: true,
    returned: succeeded.length,
    skipped,
  })
}
