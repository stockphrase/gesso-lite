import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const readingId = parseInt(id, 10)
  if (!Number.isFinite(readingId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // RLS handles read authorization.
  const { data: reading } = await supabase
    .from('reading_files')
    .select('id, filename, storage_path')
    .eq('id', readingId)
    .single()

  if (!reading) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from('course-files')
    .createSignedUrl(reading.storage_path, 60, {
      download: reading.filename,
    })

  if (signedError || !signed) {
    return NextResponse.json(
      { error: signedError?.message ?? 'Could not sign URL.' },
      { status: 500 }
    )
  }

  return NextResponse.redirect(signed.signedUrl, { status: 303 })
}
