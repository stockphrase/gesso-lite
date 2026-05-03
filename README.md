# Course details edit (post-build patch)

Adds a "Details" section to the course settings page, letting the
instructor change course title, term, and year. Useful when a section
assignment changes ("Section 02 → Section 04") or a typo needs fixing.

## Files (3 total)

New:
- app/api/courses/[id]/update/route.ts
    POST endpoint that updates courses.title, courses.term, courses.year
    after re-validating instructor ownership. Logs a course.updated entry.

Replaces:
- app/courses/[id]/settings/SettingsClient.tsx
    Adds the Details section at the top, above Save as template.
- app/courses/[id]/settings/page.tsx
    Passes courseTerm and courseYear through to SettingsClient.

## Apply

    unzip /path/to/gesso-lite-course-edit.zip -d .

No database migration. Hot reload picks up the changes.
Commit, push, Vercel auto-redeploys.

## Test

1. Open any course → Settings.
2. Top section is now "Details" with three fields pre-filled.
3. Change the title (e.g. "Writing 2.04" → "Writing 2.04 - Section 04").
4. Click "Save details".
5. Banner shows "Details saved." Page refreshes; the new title appears
   in the breadcrumb.
6. Go back to /courses — verify the new title shows in the list.
7. Try changing term (Fall ↔ Winter) and year too. Both should work.
