'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Stage = { name: string; due_date: string | null }

export async function createAssignment(
  courseId: number,
  formData: FormData
): Promise<{ error?: string }> {
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null

  if (!title) return { error: 'Title is required.' }

  // Stages come in as parallel arrays: name[], due_date[]
  const names = formData.getAll('stage_name').map((v) => String(v).trim())
  const dates = formData.getAll('stage_due_date').map((v) => String(v).trim())

  const stages: Stage[] = []
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const due_date = dates[i] || null
    if (!name && !due_date) continue // skip fully empty rows
    if (!name) return { error: `Stage ${i + 1} is missing a name.` }
    stages.push({ name, due_date })
  }

  if (stages.length === 0) {
    return { error: 'At least one stage is required.' }
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

  // Append at the end by default. position is just a tiebreaker; ordering on
  // the list is by next-stage due date.
  const { data: maxRow } = await supabase
    .from('assignments')
    .select('position')
    .eq('course_id', courseId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (maxRow?.position ?? -1) + 1

  const { data: assignment, error: insertError } = await supabase
    .from('assignments')
    .insert({
      course_id: courseId,
      title,
      description,
      stages,
      position,
    })
    .select('id')
    .single()

  if (insertError || !assignment) {
    return { error: insertError?.message ?? 'Could not create assignment.' }
  }

  await supabase.rpc('log_action', {
    p_action: 'assignment.created',
    p_target_type: 'assignment',
    p_target_id: String(assignment.id),
    p_details: { title, stage_count: stages.length },
  })

  redirect(`/courses/${courseId}/assignments/${assignment.id}`)
}
