# Step 14 — Deployment to Vercel + DNS swap

This step takes Gesso Lite from local-only to live on the internet at
`gesso.no-silo.com`, with the existing Gesso at the same address staying
live until you cut over.

The plan:

1. **Create a new Vercel project for Gesso Lite.** Connect it to your
   GitHub repo. Set environment variables. Deploy. You'll get a URL
   like `gesso-lite-stockphrase.vercel.app`.

2. **Wire up Supabase to know about that URL.** Add it to the redirect
   allow-list so password reset emails work in production.

3. **Test thoroughly from the Vercel URL.** Sign in, create a course,
   add a student, exercise the full flow. Plenty of time before Fall.

4. **When you're confident, do the DNS swap.** Cutover is brief: take
   the domain off the old Gesso project, attach to the new one, update
   Supabase Site URL.

This file walks through each step in detail.

---

## Phase 1: Push the latest code to GitHub

Before Vercel can deploy anything, your latest local changes need to be
on GitHub. From the gesso-lite repo root:

    git status
    # if there are uncommitted changes:
    git add .
    git commit -m "Pre-deployment cleanup"
    git push

Verify on github.com/stockphrase/gesso-lite that the latest changes
are visible.

---

## Phase 2: Create the Vercel project

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Find `stockphrase/gesso-lite` in your GitHub repos and click "Import"
4. Configure project:
   - **Project name**: `gesso-lite` (or whatever you prefer)
   - **Framework preset**: Next.js (auto-detected)
   - **Root directory**: `./` (default)
   - **Build settings**: defaults are fine
5. Before clicking Deploy, click to expand "Environment Variables"
   and add three:

       NEXT_PUBLIC_SUPABASE_URL = https://curaaqtqbjygbzzaytfk.supabase.co
       NEXT_PUBLIC_SUPABASE_ANON_KEY = (paste from your local .env.local)
       SUPABASE_SERVICE_ROLE_KEY = (paste from your local .env.local)

   Pick "All environments" (Production, Preview, Development) for each.

6. Click Deploy. Wait ~2 minutes for build + deploy.

7. When done, Vercel shows a URL like:

       https://gesso-lite-xxxx.vercel.app

   Copy this URL. You'll need it for the next phase.

If the build fails: the error log will show what went wrong. Most
common causes:
- TypeScript errors that didn't show locally — fix and push again
- Missing env var — add it via Settings → Environment Variables
- Out-of-date dependencies — run `npm install` locally and commit
  the updated package-lock.json, then push

---

## Phase 3: Tell Supabase about the new URL

The reset-password flow uses Supabase's email service to send links.
Supabase only sends links to URLs you've allow-listed. Right now your
production URL isn't on that list.

1. Go to your Supabase project dashboard:
   https://supabase.com/dashboard/project/curaaqtqbjygbzzaytfk

2. Authentication → URL Configuration

3. Under "Site URL", add the Vercel URL (for now). Example:

       Site URL: https://gesso-lite-xxxx.vercel.app

   This is the URL Supabase will use as the default redirect target.

4. Under "Redirect URLs", add a wildcard pattern for the Vercel URL:

       https://gesso-lite-xxxx.vercel.app/**

   This lets the password-reset flow's `redirectTo` parameter work
   regardless of where in the app the user came from.

5. Click Save.

---

## Phase 4: Test from the Vercel URL

Open `https://gesso-lite-xxxx.vercel.app` in a browser.

Test the critical paths:

1. **Login**: sign in as your instructor account. Should work. If "invalid
   credentials" shows, double-check your env vars are populated correctly.

2. **Courses list**: load. See your existing courses.

3. **Roster, assignment view, submission download**: load each. Verify
   files download correctly.

4. **Password reset**: sign out. Click "Forgot password?". Enter your
   email. Check your inbox (might be in spam). Click the link in the
   email — should go to `https://gesso-lite-xxxx.vercel.app/account/update-password`.
   Set a new password. Sign in with it.

5. **Course settings**: create a throwaway course, save it as a template,
   archive/unarchive, then delete it. Verify the backup zip downloads
   and contains expected content.

6. **Mobile**: open the URL on your phone. Verify pages don't overflow
   or break on the narrow viewport.

7. **Security headers**: open DevTools → Network → click any request →
   Response Headers. Confirm CSP, HSTS, X-Frame-Options are all set.
   (HSTS only matters in HTTPS; on Vercel you ARE in HTTPS, so it's now
   live.)

If anything's broken, fix locally → commit → push. Vercel auto-deploys
every push to main. Then re-test.

Take your time here. There's no rush before Fall.

---

## Phase 5: The cutover (when ready, near Fall term)

When you're confident Gesso Lite is ready to be the canonical app,
follow these steps in order. Total downtime: a few minutes for DNS
propagation; most users will see their next page load fail and a
refresh succeed.

### Step 5.1: Remove the domain from the old Gesso Vercel project

1. Go to your old Gesso Vercel project's dashboard
2. Settings → Domains
3. Find `gesso.no-silo.com`
4. Click "Remove" (or the equivalent action)

This frees the domain so the new project can claim it. The old Gesso
will continue to be reachable via its `*.vercel.app` URL.

### Step 5.2: Add the domain to the new Gesso Lite Vercel project

1. Go to the Gesso Lite Vercel project dashboard
2. Settings → Domains
3. In "Add Domain", type: `gesso.no-silo.com`
4. Click Add

Vercel will tell you what DNS records to set. For a subdomain, that's
typically:

       Type: CNAME
       Name: gesso
       Value: cname.vercel-dns.com

### Step 5.3: Update DNS at your domain registrar

1. Log into your domain registrar (where you bought no-silo.com)
2. Find DNS settings for the no-silo.com domain
3. Locate the CNAME record for `gesso`
4. Change its value to `cname.vercel-dns.com` (the value Vercel gave you)
5. Save

Wait 5-30 minutes for DNS propagation. You can check progress with:

    dig gesso.no-silo.com CNAME

When it returns `cname.vercel-dns.com`, the DNS has propagated. Vercel
will automatically issue an SSL certificate, which takes another minute
or two.

### Step 5.4: Update Supabase URL config

Now that gesso.no-silo.com is the canonical URL:

1. Supabase dashboard → Authentication → URL Configuration
2. Site URL: change to `https://gesso.no-silo.com`
3. Redirect URLs: add `https://gesso.no-silo.com/**`
4. (Optional) Remove the old `https://gesso-lite-xxxx.vercel.app/**`
   pattern, or keep it as a fallback. Keeping it is fine.

### Step 5.5: Test from the new URL

Open https://gesso.no-silo.com. Sign in. Walk through the same critical
paths from Phase 4. Especially the password reset flow — try a reset and
make sure the email link comes back to gesso.no-silo.com.

### Step 5.6: Tell users (optional)

For the original Gesso users (yourself, students currently enrolled),
make sure they know the URL hasn't changed but the underlying app has.
Most won't notice anything except that:
- The interface is different (the design)
- Their old courses are NOT here (different Supabase database)
- They need to register fresh on the new app for any Fall course you
  enrolled them in

---

## Optional: Keep the old Gesso accessible

If you want the old Gesso reachable for archival reasons, give it a new
subdomain. In old-Gesso Vercel project Settings → Domains, add something
like `archive.no-silo.com` or `old-gesso.no-silo.com`, then point DNS
there.

---

## Common deployment problems

**"Invalid login credentials" on production but localhost works.**
The env vars on Vercel don't match your local .env.local. Re-check
Settings → Environment Variables. Common causes:
- Service role key has trailing whitespace
- Anon key was shortened by accident during copy-paste
- Wrong Supabase URL (e.g. dashboard URL instead of project URL)

**Password reset email link goes to localhost.**
Site URL in Supabase is still `http://localhost:3000`. Update it to
the production URL.

**Build fails with "Module not found" but works locally.**
You probably have a file that exists on disk but isn't committed to
git. Run `git status` locally, see what's untracked, commit it.

**Dark mode init script blocked by CSP.**
You should have already added `'unsafe-inline'` to script-src in
next.config.ts during Step 13c. If you didn't, do it now.

**Course deletion fails on production.**
SUPABASE_SERVICE_ROLE_KEY env var is wrong or missing on Vercel.
Check Settings → Environment Variables.

---

## What's NOT included in this step

- Custom email-sending domain. Supabase sends emails from a noreply
  address by default; for `noreply@no-silo.com` you'd configure SMTP
  in Supabase → Authentication → Email Templates → SMTP Settings.
  Optional. The default works.
- Monitoring or error reporting. The Vercel dashboard shows function
  invocations and basic logs. For more (e.g. Sentry), separate setup.
- Backups of your Supabase database. Supabase has automatic daily
  backups on free tier (last 7 days). Worth knowing about. For
  longer retention, a paid Supabase plan or a custom export script.

---

## Done

After Phase 5, Gesso Lite is live at gesso.no-silo.com. The old Gesso
is parked at its `*.vercel.app` URL. You're ready for Fall.
