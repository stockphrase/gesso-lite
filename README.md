# Step 11 — Course deletion

Permanent course deletion with required backup, type-the-title
confirmation, and "vaporize orphaned users" behavior.

## Files (5 total)

New:
- lib/supabase/service.ts
    Service-role Supabase client. Only used server-side; required for
    deleting auth.users rows (admin operation).

- app/api/courses/[id]/backup/route.ts
    GET. Streams a zip with course metadata, assignments, roster,
    submissions CSV, audit log, and (optionally) submission/return
    files. Always run before destructive deletion.

- app/api/courses/[id]/delete/route.ts
    POST. The destructive endpoint. Verifies title confirmation,
    vaporizes storage objects, deletes the course row (cascades),
    deletes orphaned auth.users rows.

Replaces:
- app/courses/[id]/settings/SettingsClient.tsx
    Adds the Delete section with two-phase confirmation flow.
- app/courses/[id]/settings/page.tsx
    Fetches counts (assignments, submissions, returns, etc) for the
    delete confirmation panel.
- app/courses/page.tsx
    Shows a banner when redirected after a successful deletion.

## Apply

1. Make sure SUPABASE_SERVICE_ROLE_KEY is in .env.local. The service
   role key is needed to delete auth.users records.

2. Restart your dev server (env changes don't hot-reload):
       npm run dev

3. Unzip into the repo root:
       unzip /path/to/gesso-lite-step11.zip -d .

4. No database migration this step.

## How deletion works

1. Instructor clicks "Delete this course…" on settings page.
2. Confirmation panel reveals: counts of what will be deleted,
   checkboxes for backup contents, type-the-title field.
3. Instructor types the exact course title, clicks "Generate backup &
   delete".
4. Server generates the backup zip and streams it as a download.
5. Once the file downloads, panel shows "Backup downloaded. Verify it
   opened correctly before proceeding." with a "Proceed with deletion"
   button.
6. Instructor clicks Proceed → browser confirms → server runs the
   destructive sequence:
   - Delete all storage objects under submissions/{id}/, returns/{id}/,
     and readings/{id}/
   - Delete the courses row (cascades to assignments, submissions,
     reading_files, course_memberships, allowed_emails)
   - For each enrolled non-instructor user: if they're not in any other
     course, delete their auth.users row (cascades to profiles)
7. Redirect to /courses with a banner showing the result.

## Test plan

You'll want to use a course you don't mind losing. Try:

1. **Create a test course** via "Use template" or "+ New course".
   Add an assignment, enroll a test student, have them upload a
   submission.

2. **Test backup-only**: Click "Save as template" first to keep the
   skeleton. Then click "Delete this course…", uncheck both file
   checkboxes (so the backup is metadata-only — quick), type the
   title, and watch the metadata-only zip download. Cancel before
   proceeding to deletion to confirm cancel works.

3. **Test full delete**: Open the course again. Trigger the same
   flow but now check both file checkboxes for a complete backup.
   After the zip downloads, click "Proceed with deletion".

4. **Verify destruction**:
   - Course disappears from /courses list with a "deleted" banner.
   - In SQL editor: `SELECT * FROM courses WHERE id = ?;` returns 0 rows.
   - `SELECT * FROM submissions WHERE assignment_id IN (...);` returns 0.
   - `SELECT * FROM auth.users WHERE id = '<test-student-id>';` returns 0.
   - In Storage dashboard: course-files bucket has no files under
     submissions/{id}/, returns/{id}/, or readings/{id}/.

5. **Verify spare-user behavior**: Set up two courses, enroll the
   same student in both, then delete one. The student's account
   should still exist (because they're still in the other course).

6. **Open the backup zip** and verify it contains:
   - course.json
   - assignments.json
   - roster.csv
   - pending_emails.csv
   - submissions.csv (with one row per assignment+stage+student combo,
     including blank rows for non-submitters)
   - audit.json
   - submissions/ folder (if you checked the box)
   - returns/ folder (if you checked the box)
