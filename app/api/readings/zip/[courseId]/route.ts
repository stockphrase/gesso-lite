import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

function sanitize(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId: courseIdParam } = await params
  const courseId = parseInt(courseIdParam, 10)
  if (!Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // Authorization: any course member.
  const { data: isMember } = await supabase.rpc('is_member_of_course', {
    check_course_id: courseId,
  })
  if (!isMember) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('id', courseId)
    .single()

  const { data: readings } = await supabase
    .from('reading_files')
    .select('id, filename, storage_path')
    .eq('course_id', courseId)
    .order('uploaded_at', { ascending: false })

  if (!readings || readings.length === 0) {
    return NextResponse.json({ error: 'No readings to download.' }, {
      status: 404,
    })
  }

  const zip = new JSZip()
  const seen = new Set<string>()

  for (const r of readings) {
    let candidate = r.filename
    let n = 2
    while (seen.has(candidate)) {
      // If two readings somehow have the same filename, suffix with _2, _3...
      const dot = r.filename.lastIndexOf('.')
      if (dot < 0) {
        candidate = `${r.filename}_${n}`
      } else {
        candidate = `${r.filename.slice(0, dot)}_${n}${r.filename.slice(dot)}`
      }
      n += 1
    }
    seen.add(candidate)

    const { data: blob, error: dlErr } = await supabase.storage
      .from('course-files')
      .download(r.storage_path)
    if (dlErr || !blob) {
      console.warn(
        `Could not download reading ${r.id}: ${dlErr?.message ?? 'unknown'}`
      )
      continue
    }
    zip.file(candidate, await blob.arrayBuffer())
  }

  const zipName = `${sanitize(course?.title ?? 'course')}_readings.zip`
  const zipBuffer = await zip.generateAsync({ type: 'uint8array' })

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}
