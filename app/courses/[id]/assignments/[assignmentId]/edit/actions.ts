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

  // Build the new stages array. oldNames[i] is the previous name (empty string
  // for newly-added stages); names[i] is the new name; dates[i] is the new date.
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

  // Detect duplicate stage names in the new list.
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

  // Verify assignment belongs to this course and pull existing stages.
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

  // Detect deleted stages (present before, not present in new list).
  const deletedStages = [...oldNameSet].filter((n) => !newNameSet.has(n))
  // Account for renames: a "deleted" stage that's actually being renamed is fine.
  const renameFromSet = new Set(renames.map((r) => r.from))
  const trulyDeletedStages = deletedStages.filter((n) => !renameFromSet.has(n))

  if (trulyDeletedStages.length > 0) {
    // Check whether any of the deleted stages have existing submissions.
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

  // Apply renames atomically: update submissions for each rename.
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

  // Update the assignment row.
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
  assignmentId: number
): Promise<{ error?: string }> {
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

  // Check if there are submissions; if so, don't allow deletion.
  const { count } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)

  if ((count ?? 0) > 0) {
    return {
      error: `This assignment has ${count} submission${count === 1 ? '' : 's'}. Delete those first or delete the entire course.`,
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
    p_details: { assignment_id: assignmentId, title: assignment.title },
  })

  redirect(`/courses/${courseId}`)
}
