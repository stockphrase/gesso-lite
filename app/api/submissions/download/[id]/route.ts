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

  // Fetch the submission row. RLS already enforces who can see what — if the
  // caller can't read this row, .single() returns no data.
  const { data: submission } = await supabase
    .from('submissions')
    .select('id, user_id, filename, storage_path, assignment_id')
    .eq('id', submissionId)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // Generate a short-lived signed URL (60 seconds is enough to start the download).
  const { data: signed, error: signedError } = await supabase.storage
    .from('course-files')
    .createSignedUrl(submission.storage_path, 60, {
      download: submission.filename,
    })

  if (signedError || !signed) {
    return NextResponse.json(
      { error: signedError?.message ?? 'Could not sign URL.' },
      { status: 500 }
    )
  }

  return NextResponse.redirect(signed.signedUrl, { status: 303 })
}
