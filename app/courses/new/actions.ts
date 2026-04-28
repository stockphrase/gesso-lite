'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createCourse(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const term = String(formData.get('term') ?? '').trim()
  const yearRaw = String(formData.get('year') ?? '').trim()

  if (!title) {
    return { error: 'Course title is required.' }
  }
  if (term !== 'Fall' && term !== 'Winter') {
    return { error: 'Term must be Fall or Winter.' }
  }
  const year = parseInt(yearRaw, 10)
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return { error: 'Year must be between 2020 and 2100.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: course, error: insertError } = await supabase
    .from('courses')
    .insert({
      title,
      term,
      year,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (insertError || !course) {
    return { error: insertError?.message ?? 'Could not create course.' }
  }

  await supabase.rpc('log_action', {
    p_action: 'course.created',
    p_target_type: 'course',
    p_target_id: String(course.id),
    p_details: { title, term, year },
  })

  redirect(`/courses/${course.id}`)
}