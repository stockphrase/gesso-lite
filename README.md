# Step 13c — Security headers + mobile responsive

## What's in this step

1. **next.config.ts**: replaces the existing config with one that sets
   security headers on every response. Includes Content-Security-Policy,
   Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options,
   Referrer-Policy, and Permissions-Policy.

2. **app/responsive.css**: new file with media-query overrides that
   improve the layout on phone-sized screens (≤600px wide). Doesn't
   touch desktop appearance.

## Files (2 total)

New:
- app/responsive.css

Replaces:
- next.config.ts

## Apply

1. Unzip into the repo root:
       unzip /path/to/gesso-lite-step13c.zip -d .

2. Manually edit `app/layout.tsx`. Two small changes:

   a. Add an import for the new responsive.css under the existing
      `import "./globals.css"` line:

          import "./globals.css"
          import "./responsive.css"     // <-- ADD THIS LINE

   b. Add a `viewport` metadata export so phone browsers render the
      page at the correct width. Put this near the existing `metadata`
      export:

          export const viewport = {
            width: 'device-width',
            initialScale: 1,
          }

   The full file should look something like:

          import type { Metadata } from "next";
          import "./globals.css";
          import "./responsive.css";

          export const metadata: Metadata = {
            title: "Gesso Lite",
            description: "...",
          };

          export const viewport = {
            width: 'device-width',
            initialScale: 1,
          };

          export default function RootLayout({...}) { ... }

3. Restart `npm run dev` (next.config.ts changes don't hot-reload; the
   dev server must be restarted).

## Test the security headers

After restarting:

1. Visit any page in the app.
2. Open DevTools → Network tab.
3. Click the request to `/courses` (or any page) in the network list.
4. Look at the Response Headers section. You should see:
   - Content-Security-Policy
   - Strict-Transport-Security (only relevant in HTTPS, but it's set)
   - X-Frame-Options: DENY
   - X-Content-Type-Options: nosniff
   - Referrer-Policy: strict-origin-when-cross-origin
   - Permissions-Policy: camera=(), microphone=(), …
5. The page should load and work normally. If anything is broken
   (blank pages, missing styles, console errors mentioning "Refused to
   load…"), the CSP needs adjustment. Tell me what's broken and I'll
   amend it.

## Test mobile responsive

Two ways:

**(a) Quick test in DevTools:**
1. Open the app in your browser.
2. F12 → click the "device toolbar" icon (top-left of DevTools, or
   Ctrl+Shift+M on most browsers).
3. Pick "iPhone SE" or any preset narrower than 400px.
4. Navigate through the courses, audit page, settings page, etc.
5. The page header should stack the title above the action buttons.
   Headings are smaller. Padding tighter. Buttons fit on screen.

**(b) Real phone test:**
Your dev server logs an IP like `http://192.168.2.187:3000`. If your
phone is on the same WiFi network, type that into your phone's browser.
Sign in (you may need to register a test account), navigate around.

## CSP gotchas

If anything in the app stops working after applying the security headers,
the most likely culprit is the Content-Security-Policy. Symptoms:
- Console errors like "Refused to execute inline script…"
- Console errors like "Refused to load…"
- Iframes failing to load
- Auth pages stuck

Tell me which page broke and what the console error says, and we'll
relax the CSP for that case.

The CSP I wrote allows:
- Scripts: from same origin only (Next.js's bundles)
- Styles: same origin OR inline (the app uses style={{...}} extensively)
- Connects: same origin + your Supabase URL + Supabase websocket
- Images: same origin + data URLs + blob URLs (for downloads)
- No iframes can embed the app
- No Flash/Java plugins
- HTTPS upgrade for any HTTP requests in production
