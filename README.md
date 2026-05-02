# Step 13b — Password reset flow

Adds the missing `/account/update-password` page that students land on
after clicking a password-reset link in their email.

## Files (1 total)

New:
- app/(auth)/account/update-password/page.tsx
    Reads the session set by Supabase after the reset-link redirect,
    presents a form to set a new password, applies it via
    supabase.auth.updateUser({ password }), then redirects to /courses.

The reset-password REQUEST page (where users enter their email and
trigger the reset email) already exists at app/(auth)/reset-password
from Step 3. Its `redirectTo` already points to
`/auth/callback?next=/account/update-password`, which is what the
auth callback at app/auth/callback/route.ts handles.

## Apply

    unzip /path/to/gesso-lite-step13b.zip -d .

If you already have an `app/(auth)/account/update-password/page.tsx`
in your repo, this overwrites it with the more robust version that
handles the auth-state listener.

No database migration. No Supabase config changes needed.

## Supabase URL configuration

For the email link to work in production, you'll need to add your
production URL to Supabase's allow list. For local dev, ensure your
Site URL or Redirect URLs include http://localhost:3000.

Dashboard: Authentication → URL Configuration:
- Site URL: http://localhost:3000 (for dev)
- Redirect URLs: add http://localhost:3000/** if not already there

When you deploy (Step 14), add your production URL to both fields.

## Test

1. Go to /login → click "Forgot password?".
2. Enter your email (mail@no-silo.com) → click "Send reset link".
3. See the "Check your email" message.
4. Open the email Supabase sent (might be in your project's Auth →
   Email Templates section, or the actual email if you have SMTP set up).
5. Click the link in the email. It goes to the Supabase auth domain,
   which redirects through /auth/callback?code=… and lands on
   /account/update-password.
6. Enter a new password (≥8 chars), confirm it, click "Update password".
7. Should see "Password updated" briefly, then redirect to /courses.
8. Sign out. Sign in with the new password. Should work.

## If the link doesn't work locally

For local dev, Supabase needs to know your dev URL. Check
Authentication → URL Configuration. Site URL should be
http://localhost:3000. If it's something else (like a Vercel preview
URL), update it for now and we'll switch back at deployment.
