import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, name, role')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    email: profile?.email ?? user.email ?? null,
    name: profile?.name ?? null,
    role: profile?.role ?? null,
  })
}
