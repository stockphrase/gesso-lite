import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CoursesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-braces: proxy.ts already redirects unauthenticated users,
  // but server components should never trust that and re-check.
  if (!user) {
    redirect('/login')
  }

  // Look up the profile to see role.
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">Courses</h1>
      <p className="text-sm text-gray-600">
        Signed in as {profile?.email} ({profile?.role})
      </p>
      <p className="mt-6 text-sm">
        Course list will appear here in Step 4.
      </p>

      <form action="/api/auth/signout" method="POST" className="mt-8">
        <button
          type="submit"
          className="rounded border border-gray-300 px-3 py-1 text-sm"
        >
          Sign out
        </button>
      </form>
    </main>
  )
}