import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idParam } = await params
  const courseId = parseInt(idParam, 10)
  if (!Number.isFinite(courseId)) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 })
  }

  let body: { confirm_title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const confirmTitle = String(body.confirm_title ?? '').trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('id', courseId)
    .single()

  if (!course) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 })
  }
  if (course.created_by !== user.id) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  if (confirmTitle !== course.title) {
    return NextResponse.json(
      { error: 'Title confirmation does not match.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const instructorId = course.created_by

  // Step 1: figure out which users are in this course.
  const { data: memberships } = await service
    .from('course_memberships')
    .select('user_id')
    .eq('course_id', courseId)

  const enrolledUserIds = (memberships ?? [])
    .map((m) => m.user_id)
    .filter((uid) => uid !== instructorId)

  // Step 2: for each enrolled user, decide whether to vaporize them.
  // Spare users who are still members of *another* course (not this one).
  const usersToDelete: string[] = []
  for (const uid of enrolledUserIds) {
    const { count } = await service
      .from('course_memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .neq('course_id', courseId)
    if ((count ?? 0) === 0) {
      usersToDelete.push(uid)
    }
  }

  // Step 3: delete storage objects for this course's three path prefixes.
  // We list each prefix and delete all matching objects.
  const prefixes = [
    `submissions/${courseId}`,
    `returns/${courseId}`,
    `readings/${courseId}`,
  ]

  const storageDeletionErrors: string[] = []

  for (const prefix of prefixes) {
    // List all objects under this prefix recursively. We do this via
    // direct DB read because the storage list API is paginated and
    // awkward for cleanup.
    const { data: objs } = await service
      .from('storage.objects' as 'storage.objects')
      .select('name')
      .like('name', `${prefix}/%`)

    // Fallback if the typed query doesn't work — use raw SQL.
    let objectNames: string[] = (objs ?? []).map((o: { name: string }) => o.name)
    if (objectNames.length === 0) {
      // Try via storage list API instead. It's paginated; we walk pages.
      const collected: string[] = []
      const { data: listed } = await service.storage
        .from('course-files')
        .list(prefix, { limit: 1000 })
      if (listed) {
        for (const item of listed) {
          // list() returns a flat list at this depth; recurse if dirs are present.
          if (item.id) {
            collected.push(`${prefix}/${item.name}`)
          } else {
            // Subfolder; list it.
            const { data: sub } = await service.storage
              .from('course-files')
              .list(`${prefix}/${item.name}`, { limit: 1000 })
            for (const subItem of sub ?? []) {
              if (subItem.id) {
                collected.push(`${prefix}/${item.name}/${subItem.name}`)
              } else {
                // One more level (e.g. submissions/{cid}/{aid}/{stage}/{userId}/file)
                const { data: subsub } = await service.storage
                  .from('course-files')
                  .list(`${prefix}/${item.name}/${subItem.name}`, {
                    limit: 1000,
                  })
                for (const ssItem of subsub ?? []) {
                  if (ssItem.id) {
                    collected.push(
                      `${prefix}/${item.name}/${subItem.name}/${ssItem.name}`
                    )
                  } else {
                    const { data: deeper } = await service.storage
                      .from('course-files')
                      .list(
                        `${prefix}/${item.name}/${subItem.name}/${ssItem.name}`,
                        { limit: 1000 }
                      )
                    for (const dItem of deeper ?? []) {
                      if (dItem.id) {
                        collected.push(
                          `${prefix}/${item.name}/${subItem.name}/${ssItem.name}/${dItem.name}`
                        )
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      objectNames = collected
    }

    if (objectNames.length > 0) {
      // Storage remove takes paths. Chunk by 1000 to be safe.
      for (let i = 0; i < objectNames.length; i += 1000) {
        const chunk = objectNames.slice(i, i + 1000)
        const { error: rmErr } = await service.storage
          .from('course-files')
          .remove(chunk)
        if (rmErr) {
          storageDeletionErrors.push(`${prefix}: ${rmErr.message}`)
        }
      }
    }
  }

  // Step 4: delete the course row. CASCADE removes assignments,
  // submissions, returns, reading_files, course_memberships, allowed_emails.
  const { error: courseDeleteError } = await service
    .from('courses')
    .delete()
    .eq('id', courseId)

  if (courseDeleteError) {
    return NextResponse.json(
      {
        error: `Course row delete failed: ${courseDeleteError.message}`,
        storage_errors: storageDeletionErrors,
      },
      { status: 500 }
    )
  }

  // Step 5: vaporize the orphaned users (auth.users delete cascades to profiles).
  const userDeletionErrors: { user_id: string; error: string }[] = []
  for (const uid of usersToDelete) {
    const { error: deleteUserError } = await service.auth.admin.deleteUser(uid)
    if (deleteUserError) {
      userDeletionErrors.push({ user_id: uid, error: deleteUserError.message })
    }
  }

  // Step 6: log action.
  await supabase.rpc('log_action', {
    p_action: 'course.deleted',
    p_target_type: 'course',
    p_target_id: String(courseId),
    p_details: {
      title: course.title,
      users_vaporized: usersToDelete.length,
      users_spared: enrolledUserIds.length - usersToDelete.length,
      storage_deletion_errors: storageDeletionErrors.length,
      user_deletion_errors: userDeletionErrors.length,
    },
  })

  return NextResponse.json({
    ok: true,
    users_vaporized: usersToDelete.length,
    users_spared: enrolledUserIds.length - usersToDelete.length,
    storage_deletion_errors: storageDeletionErrors,
    user_deletion_errors: userDeletionErrors,
  })
}
