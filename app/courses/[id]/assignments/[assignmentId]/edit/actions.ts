'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Stage = { name: string; due_date: string | null }

export async function updateAssignment(
  courseId: number,
  assignmentId: number,
  formData: FormData
): Promise<{ error?: string }> {
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null

  if (!title) return { error: 'Title is required.' }

  const names = formData.getAll('stage_name').map((v) => String(v).trim())
  const dates = formData.getAll('stage_due_date').map((v) => String(v).trim())
  const oldNames = formData.getAll('stage_old_name').map((v) => String(v).trim())

  const newStages: Stage[] = []
  const renames: { from: string; to: string }[] = []

  for (let i = 0; i < names.length; i++) {
    const newName = names[i]
    const oldName = oldNames[i] || ''
    const due_date = dates[i] || null

    if (!newName && !due_date && !oldName) continue
    if (!newName) return { error: `Stage ${i + 1} is missing a name.` }
    newStages.push({ name: newName, due_date })

    if (oldName && oldName !== newName) {
      renames.push({ from: oldName, to: newName })
    }
  }

  if (newStages.length === 0) {
    return { error: 'At least one stage is required.' }
  }

  const seen = new Set<string>()
  for (const s of newStages) {
    if (seen.has(s.name)) {
      return { error: `Duplicate stage name: ${s.name}` }
    }
    seen.add(s.name)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: courseId }
  )
  if (!isInstructor) return { error: 'Not authorized.' }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, course_id, stages')
    .eq('id', assignmentId)
    .single()
  if (!assignment || assignment.course_id !== courseId) {
    return { error: 'Assignment not found.' }
  }

  const oldStages = (assignment.stages ?? []) as Stage[]
  const oldNameSet = new Set(oldStages.map((s) => s.name))
  const newNameSet = new Set(newStages.map((s) => s.name))

  const deletedStages = [...oldNameSet].filter((n) => !newNameSet.has(n))
  const renameFromSet = new Set(renames.map((r) => r.from))
  const trulyDeletedStages = deletedStages.filter((n) => !renameFromSet.has(n))

  if (trulyDeletedStages.length > 0) {
    const { count } = await supabase
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_id', assignmentId)
      .in('stage_name', trulyDeletedStages)

    if ((count ?? 0) > 0) {
      return {
        error: `Cannot delete stage(s) ${trulyDeletedStages
          .map((s) => `"${s}"`)
          .join(', ')} — there are submissions for them. Rename instead, or remove the submissions first.`,
      }
    }
  }

  for (const r of renames) {
    const { error: renameError } = await supabase
      .from('submissions')
      .update({ stage_name: r.to })
      .eq('assignment_id', assignmentId)
      .eq('stage_name', r.from)

    if (renameError) {
      return {
        error: `Could not rename stage "${r.from}" → "${r.to}": ${renameError.message}`,
      }
    }
  }

  const { error: updateError } = await supabase
    .from('assignments')
    .update({
      title,
      description,
      stages: newStages,
    })
    .eq('id', assignmentId)

  if (updateError) {
    return { error: updateError.message }
  }

  await supabase.rpc('log_action', {
    p_action: 'assignment.updated',
    p_target_type: 'assignment',
    p_target_id: String(assignmentId),
    p_details: {
      title,
      stage_count: newStages.length,
      renames: renames.length,
    },
  })

  redirect(`/courses/${courseId}/assignments/${assignmentId}`)
}


export async function deleteAssignment(
  courseId: number,
  assignmentId: number,
  options?: { cascade?: boolean }
): Promise<{ error?: string; requires_cascade?: { submissions: number; returns: number } }> {
  const cascade = options?.cascade === true

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: courseId }
  )
  if (!isInstructor) return { error: 'Not authorized.' }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, course_id, title')
    .eq('id', assignmentId)
    .single()
  if (!assignment || assignment.course_id !== courseId) {
    return { error: 'Assignment not found.' }
  }

  // Fetch all submissions for this assignment (needed for both check and cascade).
  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, storage_path, returned_storage_path')
    .eq('assignment_id', assignmentId)

  const subs = submissions ?? []
  const submissionCount = subs.length
  const returnCount = subs.filter((s) => s.returned_storage_path).length

  // If submissions exist and caller didn't explicitly opt-in to cascade,
  // return a signal so the UI can prompt with counts.
  if (submissionCount > 0 && !cascade) {
    return {
      requires_cascade: {
        submissions: submissionCount,
        returns: returnCount,
      },
    }
  }

  // Cascade path: delete storage files, then submission rows, then the
  // assignment. Storage failures are logged but don't block the DB delete.
  const storagePaths: string[] = []
  for (const s of subs) {
    if (s.storage_path) storagePaths.push(s.storage_path)
    if (s.returned_storage_path) storagePaths.push(s.returned_storage_path)
  }

  if (storagePaths.length > 0) {
    // Storage removal chunked at 1000.
    for (let i = 0; i < storagePaths.length; i += 1000) {
      const chunk = storagePaths.slice(i, i + 1000)
      const { error: rmError } = await supabase.storage
        .from('course-files')
        .remove(chunk)
      if (rmError) {
        console.warn(
          `[assignment-delete] storage cleanup: ${rmError.message}`
        )
      }
    }
  }

  if (submissionCount > 0) {
    const { error: subDelError } = await supabase
      .from('submissions')
      .delete()
      .eq('assignment_id', assignmentId)

    if (subDelError) {
      return {
        error: `Could not delete submissions: ${subDelError.message}`,
      }
    }
  }

  const { error: deleteError } = await supabase
    .from('assignments')
    .delete()
    .eq('id', assignmentId)

  if (deleteError) {
    return { error: deleteError.message }
  }

  await supabase.rpc('log_action', {
    p_action: 'assignment.deleted',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: {
      assignment_id: assignmentId,
      title: assignment.title,
      cascaded_submissions: submissionCount,
      cascaded_returns: returnCount,
    },
  })

  redirect(`/courses/${courseId}`)
}
