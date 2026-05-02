import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

function sanitize(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function isoDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function isLate(submitted_at: string, due_date: string | null): boolean {
  if (!due_date) return false
  return new Date(submitted_at) > new Date(due_date + 'T23:59:59')
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const courseId = parseInt(idParam, 10)
  if (!Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  const url = new URL(request.url)
  const includeSubmissions =
    url.searchParams.get('include_submissions') !== 'false'
  const includeReturns = url.searchParams.get('include_returns') !== 'false'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, term, year, archived_at, created_at, created_by')
    .eq('id', courseId)
    .single()

  if (!course || course.created_by !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  // Assignments.
  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, title, description, stages, position, created_at')
    .eq('course_id', courseId)
    .order('position', { ascending: true })

  // All submissions for the course's assignments.
  const assignmentIds = (assignments ?? []).map((a) => a.id)
  const { data: submissions } =
    assignmentIds.length > 0
      ? await supabase
          .from('submissions')
          .select(
            'id, assignment_id, user_id, stage_name, filename, storage_path, submitted_at, returned_filename, returned_storage_path, returned_at'
          )
          .in('assignment_id', assignmentIds)
      : { data: [] }

  // Memberships + profiles for the roster.
  const { data: memberships } = await supabase
    .from('course_memberships')
    .select('user_id, role')
    .eq('course_id', courseId)

  const { data: pendingEmails } = await supabase
    .from('allowed_emails')
    .select('email, role, claimed_at')
    .eq('course_id', courseId)

  const userIds = (memberships ?? []).map((m) => m.user_id)
  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, email, name, role, student_code')
          .in('id', userIds)
      : { data: [] }

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  )

  // Audit log entries for this course.
  const { data: auditEntries } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, target_type, target_id, details, created_at')
    .or(
      `and(target_type.eq.course,target_id.eq.${courseId}),and(target_type.eq.assignment,target_id.in.(${assignmentIds.join(',') || '0'}))`
    )
    .order('created_at', { ascending: true })

  // Build the zip.
  const zip = new JSZip()

  // course.json — the basic record
  zip.file(
    'course.json',
    JSON.stringify(
      {
        id: course.id,
        title: course.title,
        term: course.term,
        year: course.year,
        archived_at: course.archived_at,
        created_at: course.created_at,
        backup_created_at: new Date().toISOString(),
      },
      null,
      2
    )
  )

  // assignments.json
  zip.file('assignments.json', JSON.stringify(assignments ?? [], null, 2))

  // roster.csv
  const rosterRows = ['user_id,email,name,role,student_code']
  for (const m of memberships ?? []) {
    const p = profileById.get(m.user_id)
    rosterRows.push(
      [
        csvEscape(m.user_id),
        csvEscape(p?.email),
        csvEscape(p?.name),
        csvEscape(m.role),
        csvEscape(p?.student_code),
      ].join(',')
    )
  }
  zip.file('roster.csv', rosterRows.join('\n'))

  // pending_emails.csv (allowed_emails not yet claimed)
  const pendingRows = ['email,role,claimed_at']
  for (const p of pendingEmails ?? []) {
    pendingRows.push(
      [csvEscape(p.email), csvEscape(p.role), csvEscape(p.claimed_at)].join(',')
    )
  }
  zip.file('pending_emails.csv', pendingRows.join('\n'))

  // submissions.csv — per-assignment-per-stage-per-student record
  type Stage = { name: string; due_date: string | null }
  type Assignment = {
    id: number
    title: string
    stages: Stage[]
  }

  const assignmentMap = new Map<number, Assignment>(
    ((assignments ?? []) as Assignment[]).map((a) => [a.id, a])
  )

  const submissionRows = [
    'assignment,stage,due_date,student_email,student_name,submitted_at,was_late,filename,returned_at,returned_filename',
  ]
  // Cross-product: every (assignment, stage, student) combo, marking which were submitted.
  for (const a of (assignments ?? []) as Assignment[]) {
    const stages = (a.stages ?? []) as Stage[]
    for (const stage of stages) {
      for (const m of memberships ?? []) {
        if (m.role !== 'student') continue
        const profile = profileById.get(m.user_id)
        const sub = (submissions ?? []).find(
          (s) =>
            s.assignment_id === a.id &&
            s.stage_name === stage.name &&
            s.user_id === m.user_id
        )
        submissionRows.push(
          [
            csvEscape(a.title),
            csvEscape(stage.name),
            csvEscape(stage.due_date),
            csvEscape(profile?.email),
            csvEscape(profile?.name),
            csvEscape(sub?.submitted_at),
            csvEscape(
              sub?.submitted_at && stage.due_date
                ? isLate(sub.submitted_at, stage.due_date)
                  ? 'yes'
                  : 'no'
                : ''
            ),
            csvEscape(sub?.filename),
            csvEscape(sub?.returned_at),
            csvEscape(sub?.returned_filename),
          ].join(',')
        )
      }
    }
  }
  zip.file('submissions.csv', submissionRows.join('\n'))

  // audit.json
  zip.file('audit.json', JSON.stringify(auditEntries ?? [], null, 2))

  // Submission files (optional)
  if (includeSubmissions && submissions && submissions.length > 0) {
    for (const s of submissions) {
      if (!s.storage_path) continue
      const a = assignmentMap.get(s.assignment_id)
      const profile = profileById.get(s.user_id)
      const folder = `submissions/${sanitize(a?.title ?? `assignment-${s.assignment_id}`)}/${sanitize(s.stage_name)}`
      const last = profile?.name?.trim().split(/\s+/).pop() ?? 'student'
      const code = profile?.student_code ?? 'unknown'
      const ext = s.filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '.docx'
      const filename = `${sanitize(last)}_${code}${ext}`

      const { data: blob, error: dlErr } = await supabase.storage
        .from('course-files')
        .download(s.storage_path)
      if (dlErr || !blob) {
        console.warn(
          `Backup: could not download ${s.storage_path}: ${dlErr?.message}`
        )
        continue
      }
      zip.file(`${folder}/${filename}`, await blob.arrayBuffer())
    }
  }

  // Return files (optional)
  if (includeReturns && submissions && submissions.length > 0) {
    for (const s of submissions) {
      if (!s.returned_storage_path || !s.returned_filename) continue
      const a = assignmentMap.get(s.assignment_id)
      const profile = profileById.get(s.user_id)
      const folder = `returns/${sanitize(a?.title ?? `assignment-${s.assignment_id}`)}/${sanitize(s.stage_name)}`

      const { data: blob, error: dlErr } = await supabase.storage
        .from('course-files')
        .download(s.returned_storage_path)
      if (dlErr || !blob) {
        console.warn(
          `Backup: could not download return ${s.returned_storage_path}: ${dlErr?.message}`
        )
        continue
      }
      zip.file(`${folder}/${s.returned_filename}`, await blob.arrayBuffer())
    }
  }

  const zipName = `${sanitize(course.title)}_backup_${isoDateString()}.zip`
  const zipBuffer = await zip.generateAsync({ type: 'uint8array' })

  await supabase.rpc('log_action', {
    p_action: 'course.backup',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: {
      include_submissions: includeSubmissions,
      include_returns: includeReturns,
      submission_count: submissions?.length ?? 0,
      member_count: memberships?.length ?? 0,
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
