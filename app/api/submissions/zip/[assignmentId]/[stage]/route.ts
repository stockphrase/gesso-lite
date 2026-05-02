import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

// Sanitize a string for use as a filename component:
//   "O'Brien"        -> "OBrien"
//   "Essay #1"       -> "Essay-1"
//   "  Final draft " -> "Final-draft"
function sanitize(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function lastNameFromProfile(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    return parts[parts.length - 1]
  }
  return email.split('@')[0] ?? email
}

function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ assignmentId: string; stage: string }>
  }
) {
  const { assignmentId: aidParam, stage: stageParam } = await params
  const assignmentId = parseInt(aidParam, 10)
  if (!Number.isFinite(assignmentId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }
  const stageName = decodeURIComponent(stageParam)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, title, course_id, stages')
    .eq('id', assignmentId)
    .single()

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found.' }, {
      status: 404,
    })
  }

  // Authorization: instructor or tutor of the course.
  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: assignment.course_id }
  )
  const { data: isTutor } = await supabase.rpc('is_tutor_in_course', {
    check_course_id: assignment.course_id,
  })
  if (!isInstructor && !isTutor) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  type Stage = { name: string; due_date: string | null }
  const stages = (assignment.stages ?? []) as Stage[]
  if (!stages.some((s) => s.name === stageName)) {
    return NextResponse.json({ error: 'Unknown stage.' }, { status: 400 })
  }

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, user_id, filename, storage_path, submitted_at')
    .eq('assignment_id', assignmentId)
    .eq('stage_name', stageName)

  if (!submissions || submissions.length === 0) {
    return NextResponse.json(
      { error: 'No submissions to download.' },
      { status: 404 }
    )
  }

  const userIds = submissions.map((s) => s.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email, student_code')
    .in('id', userIds)
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  )

  const titleSafe = sanitize(assignment.title) || 'assignment'

  const zip = new JSZip()
  const seen = new Set<string>()

  for (const sub of submissions) {
    const profile = profileById.get(sub.user_id)
    if (!profile) continue // no profile, skip silently

    const last = sanitize(lastNameFromProfile(profile.name, profile.email))
    const ext = extOf(sub.filename) || '.docx'
    const code = profile.student_code

    let candidate = `${last}_${titleSafe}_${code}${ext}`
    // Defensive: avoid name collisions if two students share last name + code
    // (shouldn't happen since codes are unique, but JIC).
    let n = 2
    while (seen.has(candidate)) {
      candidate = `${last}-${n}_${titleSafe}_${code}${ext}`
      n += 1
    }
    seen.add(candidate)

    // Download the file from Supabase Storage.
    const { data: blob, error: dlErr } = await supabase.storage
      .from('course-files')
      .download(sub.storage_path)

    if (dlErr || !blob) {
      // Skip this file rather than failing the whole zip; log a warning.
      console.warn(
        `Could not download ${sub.storage_path}: ${dlErr?.message ?? 'unknown'}`
      )
      continue
    }

    const arrayBuffer = await blob.arrayBuffer()
    zip.file(candidate, arrayBuffer)
  }

  const zipName = `${titleSafe}_${sanitize(stageName)}.zip`
  const zipBuffer = await zip.generateAsync({ type: 'uint8array' })

  await supabase.rpc('log_action', {
    p_action: 'submission.uploaded', // closest existing action; we may add a new one
    p_target_type: 'assignment',
    p_target_id: String(assignmentId),
    p_details: {
      bulk_download: true,
      stage: stageName,
      count: submissions.length,
    },
  })

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}
