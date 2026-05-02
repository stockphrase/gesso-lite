import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'

const MAX_BYTES_PER_FILE = 50 * 1024 * 1024
const MAX_ZIP_BYTES = 500 * 1024 * 1024

function safeFilename(name: string): string {
  return name
    .replace(/[\/\\\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200)
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(slash + 1) : path
}

function isPdf(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf')
}

type SkipReason =
  | 'not-pdf'
  | 'too-large'
  | 'empty'
  | 'upload-failed'
  | 'db-failed'

type SkipEntry = { filename: string; reason: SkipReason; detail?: string }

async function saveOneReading(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: number,
  rawName: string,
  bytes: Uint8Array
): Promise<{ ok: boolean; skip?: SkipEntry; saved?: { filename: string } }> {
  const filename = safeFilename(rawName)
  if (!isPdf(filename)) {
    return { ok: false, skip: { filename, reason: 'not-pdf' } }
  }
  if (bytes.byteLength === 0) {
    return { ok: false, skip: { filename, reason: 'empty' } }
  }
  if (bytes.byteLength > MAX_BYTES_PER_FILE) {
    return { ok: false, skip: { filename, reason: 'too-large' } }
  }

  const storagePath = `readings/${courseId}/${filename}`
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })

  const { error: uploadError } = await supabase.storage
    .from('course-files')
    .upload(storagePath, blob, {
      upsert: true,
      contentType: 'application/pdf',
    })

  if (uploadError) {
    return {
      ok: false,
      skip: {
        filename,
        reason: 'upload-failed',
        detail: uploadError.message,
      },
    }
  }

  const { error: rowError } = await supabase
    .from('reading_files')
    .upsert(
      {
        course_id: courseId,
        filename,
        storage_path: storagePath,
        size_bytes: bytes.byteLength,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: 'course_id,filename' }
    )

 if (rowError) {
    return {
      ok: false,
      skip: {
        filename,
        reason: 'db-failed',
        detail: rowError.message,
      },
    }
  }

  return { ok: true, saved: { filename } }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const courseId = parseInt(String(formData.get('course_id') ?? ''), 10)
  const file = formData.get('file')

  if (!Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'Bad course id.' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File required.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty.' }, { status: 400 })
  }

  const { data: isInstructor } = await supabase.rpc(
    'is_instructor_of_course',
    { check_course_id: courseId }
  )
  if (!isInstructor) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const lower = file.name.toLowerCase()
  const isZip = lower.endsWith('.zip')

  const skipped: SkipEntry[] = []
  const saved: { filename: string }[] = []

  if (isZip) {
    if (file.size > MAX_ZIP_BYTES) {
      return NextResponse.json(
        { error: `Zip too large. Max ${MAX_ZIP_BYTES / 1024 / 1024} MB.` },
        { status: 400 }
      )
    }

    let zip: JSZip
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      zip = await JSZip.loadAsync(buf)
    } catch {
      return NextResponse.json({ error: 'Could not read zip.' }, {
        status: 400,
      })
    }

    const entries = Object.values(zip.files).filter((e) => !e.dir)
    for (const entry of entries) {
      const name = basename(entry.name)
      if (!name || name.startsWith('.')) continue

      if (!isPdf(name)) {
        skipped.push({ filename: name, reason: 'not-pdf' })
        continue
      }

      const bytes = await entry.async('uint8array')
      const result = await saveOneReading(supabase, courseId, name, bytes)
      if (result.ok && result.saved) {
        saved.push(result.saved)
      } else if (result.skip) {
        skipped.push(result.skip)
      }
    }
  } else {
    if (!isPdf(file.name)) {
      return NextResponse.json(
        { error: 'File must be a .pdf or a .zip of PDFs.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_BYTES_PER_FILE / 1024 / 1024} MB.` },
        { status: 400 }
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await saveOneReading(supabase, courseId, file.name, bytes)
    if (result.ok && result.saved) {
      saved.push(result.saved)
    } else if (result.skip) {
      skipped.push(result.skip)
    }
  }

  await supabase.rpc('log_action', {
    p_action: 'reading.uploaded',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: {
      saved_count: saved.length,
      skipped_count: skipped.length,
      bulk: isZip,
    },
  })

  return NextResponse.json({
    ok: true,
    saved: saved.length,
    skipped,
  })
}