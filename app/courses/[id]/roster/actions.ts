'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type AddResult = {
  added: number
  skipped: { email: string; reason: 'duplicate' | 'invalid' }[]
}

type BulkAddResult = {
  students: AddResult
  tutors: AddResult
  error?: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
  const lines = raw
    .split(/[\n,;]/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean)
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    if (EMAIL_REGEX.test(line)) valid.push(line)
    else invalid.push(line)
  }
  return { valid, invalid }
}

async function addBatch(
  courseId: number,
  emails: string[],
  role: 'student' | 'tutor'
): Promise<{ added: number; duplicates: string[] }> {
  const supabase = await createClient()
  const duplicates: string[] = []
  let added = 0

  // Find existing rows for these emails in this course (any role).
  if (emails.length > 0) {
    const { data: existing } = await supabase
      .from('allowed_emails')
      .select('email')
      .eq('course_id', courseId)
      .in('email', emails)
    const existingSet = new Set(
      (existing ?? []).map((r: { email: string }) => r.email.toLowerCase())
    )

    const toInsert = emails
      .filter((e) => {
        if (existingSet.has(e)) {
          duplicates.push(e)
          return false
        }
        return true
      })
      .map((email) => ({ course_id: courseId, email, role }))

    if (toInsert.length > 0) {
      const { error: insertError, count } = await supabase
        .from('allowed_emails')
        .insert(toInsert, { count: 'exact' })
      if (insertError) {
        // Roll the failure into the result; the caller surfaces it.
        throw insertError
      }
      added = count ?? toInsert.length
    }
  }

  return { added, duplicates }
}

export async function bulkAddRoster(
  courseId: number,
  studentsRaw: string,
  tutorsRaw: string
): Promise<BulkAddResult> {
  const supabase = await createClient()

  // Authorize: must be the course's instructor. RLS will catch this too,
  // but we want a clean error rather than silently inserting nothing.
  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: courseId }
  )
  if (!isInstructor) {
    return {
      students: { added: 0, skipped: [] },
      tutors: { added: 0, skipped: [] },
      error: 'Not authorized.',
    }
  }

  const studentsParsed = parseEmails(studentsRaw)
  const tutorsParsed = parseEmails(tutorsRaw)

  try {
    const studentResult = await addBatch(
      courseId,
      studentsParsed.valid,
      'student'
    )
    const tutorResult = await addBatch(
      courseId,
      tutorsParsed.valid,
      'tutor'
    )

    if (studentResult.added > 0 || tutorResult.added > 0) {
      await supabase.rpc('log_action', {
        p_action: 'roster.added',
        p_target_type: 'course',
        p_target_id: String(courseId),
        p_details: {
          students_added: studentResult.added,
          tutors_added: tutorResult.added,
        },
      })
    }

    revalidatePath(`/courses/${courseId}/roster`)

    return {
      students: {
        added: studentResult.added,
        skipped: [
          ...studentResult.duplicates.map((email) => ({
            email,
            reason: 'duplicate' as const,
          })),
          ...studentsParsed.invalid.map((email) => ({
            email,
            reason: 'invalid' as const,
          })),
        ],
      },
      tutors: {
        added: tutorResult.added,
        skipped: [
          ...tutorResult.duplicates.map((email) => ({
            email,
            reason: 'duplicate' as const,
          })),
          ...tutorsParsed.invalid.map((email) => ({
            email,
            reason: 'invalid' as const,
          })),
        ],
      },
    }
  } catch (err) {
    return {
      students: { added: 0, skipped: [] },
      tutors: { added: 0, skipped: [] },
      error: err instanceof Error ? err.message : 'Could not update roster.',
    }
  }
}

export async function removeRosterEntry(
  courseId: number,
  kind: 'pending' | 'member',
  identifier: string
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: courseId }
  )
  if (!isInstructor) return { error: 'Not authorized.' }

  if (kind === 'pending') {
    // identifier is the allowed_emails.id
    const id = parseInt(identifier, 10)
    if (!Number.isFinite(id)) return { error: 'Bad id.' }
    const { error } = await supabase
      .from('allowed_emails')
      .delete()
      .eq('id', id)
      .eq('course_id', courseId)
    if (error) return { error: error.message }
  } else {
    // identifier is the user_id (uuid). Remove their membership AND any
    // allowed_emails row for this course in case the email is the same
    // (so they could be re-added later).
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', identifier)
      .single()

    const { error: cmError } = await supabase
      .from('course_memberships')
      .delete()
      .eq('user_id', identifier)
      .eq('course_id', courseId)
    if (cmError) return { error: cmError.message }

    if (profile?.email) {
      await supabase
        .from('allowed_emails')
        .delete()
        .eq('course_id', courseId)
        .ilike('email', profile.email)
    }
  }

  await supabase.rpc('log_action', {
    p_action: 'roster.removed',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: { kind, identifier },
  })

  revalidatePath(`/courses/${courseId}/roster`)
  return {}
}