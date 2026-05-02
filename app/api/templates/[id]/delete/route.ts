import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const templateId = parseInt(idParam, 10)
  if (!Number.isFinite(templateId)) {
    return NextResponse.json({ error: 'Bad template id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // RLS enforces ownership but we'll fetch first for the audit log details.
  const { data: tpl } = await supabase
    .from('course_templates')
    .select('id, owner_id, name')
    .eq('id', templateId)
    .single()
  if (!tpl) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  }
  if (tpl.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('course_templates')
    .delete()
    .eq('id', templateId)

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    )
  }

  await supabase.rpc('log_action', {
    p_action: 'template.deleted',
    p_target_type: 'template',
    p_target_id: String(templateId),
    p_details: { name: tpl.name },
  })

  return NextResponse.json({ ok: true })
}
