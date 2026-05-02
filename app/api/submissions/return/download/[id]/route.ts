import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const submissionId = parseInt(id, 10)
  if (!Number.isFinite(submissionId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // RLS handles read authorization on the submissions row.
  const { data: submission } = await supabase
    .from('submissions')
    .select('id, returned_filename, returned_storage_path')
    .eq('id', submissionId)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  if (!submission.returned_storage_path || !submission.returned_filename) {
    return NextResponse.json(
      { error: 'No return uploaded yet.' },
      { status: 404 }
    )
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from('course-files')
    .createSignedUrl(submission.returned_storage_path, 60, {
      download: submission.returned_filename,
    })

  if (signedError || !signed) {
    return NextResponse.json(
      { error: signedError?.message ?? 'Could not sign URL.' },
      { status: 500 }
    )
  }

  return NextResponse.redirect(signed.signedUrl, { status: 303 })
}
