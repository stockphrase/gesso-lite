# Step 7.5 — Patch: file picker + global theme toggle

Two fixes:
1. The native file input "Browse" button is replaced with a styled FilePicker
   component that matches Gesso's aesthetic in both light and dark mode.
2. The theme toggle now appears on every authenticated page (via a shared
   GlobalFooter) and on the auth pages (login / register / reset-password /
   update-password) below the form.

## Files (10 total)

New:
- app/_components/FilePicker.tsx
    Styled wrapper around a hidden native file input. "Choose file" button
    + filename label, theme-aware.
- app/_components/GlobalFooter.tsx
    Shared footer used by every page with a `gl-shell`. Shows signed-in
    email, theme toggle, and sign-out button.
- app/api/me/route.ts
    Small endpoint returning the current user's email/name/role. Used by
    client-component pages that don't already have access to the profile
    in a server component.

Replaces (overwrite existing):
- app/(auth)/layout.tsx
    Adds a centered ThemeToggle below the auth card.
- app/courses/page.tsx
    Uses GlobalFooter.
- app/courses/[id]/page.tsx
    Uses GlobalFooter.
- app/courses/[id]/roster/page.tsx
    Uses GlobalFooter.
- app/courses/new/page.tsx
    Uses GlobalFooter (fetches /api/me for signed-in email).
- app/courses/[id]/assignments/new/page.tsx
    Uses GlobalFooter.
- app/courses/[id]/assignments/[assignmentId]/page.tsx
    Uses GlobalFooter.
- app/courses/[id]/assignments/[assignmentId]/SubmissionsClient.tsx
    Uses FilePicker for the upload form.

No database changes.

## Apply

    unzip /path/to/gesso-lite-step7p.zip -d .

Hot reload should pick everything up. If anything's stuck, restart
`npm run dev`.

## Test

- Sign in. Bottom of every page should now have: "Signed in as ...", a
  three-state Light/Auto/Dark toggle, and a Sign out button.
- The toggle on any page changes the theme everywhere immediately.
- Sign out. The login / register / reset-password pages should each have
  the theme toggle below the card.
- On an assignment page as a student, the upload form's "Choose file"
  button should match the rest of the styling — gray ghost button with
  a filename label next to it. Try it in both light and dark mode.
