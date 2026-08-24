import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Only allow same-origin, single-segment-rooted paths (e.g. "/courses" or
// "/account/update-password"). Rejects anything that could be interpreted as
// an absolute URL or a scheme-relative / userinfo trick (e.g. "//evil.com" or
// "@evil.com/x"), which would otherwise let this redirect send the browser
// off-site right after a real login.
function safeNextPath(next: string | null): string {
  if (next && /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/.test(next)) {
    return next
  }
  return '/courses'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Bad/expired/missing code — send back to login.
  return NextResponse.redirect(`${origin}/login`)
}