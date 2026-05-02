import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * USE WITH CARE. Only call from server-side code that has already
 * authenticated and authorized the operation. Never expose this client
 * or its key to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
