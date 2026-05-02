# Step 8 — Returns + Student Codes

Two things in this batch:

1. **Per-student return upload.** Instructor uploads a marked-up file for
   any student's submission; student sees the orange "RETURNED" indicator
   and can download.

2. **Student codes.** A 5-character unique code on every profile, used
   later by Step 9's bulk download/upload to safely match marked-up files
   back to the right student.

## Files (5 total)

New:
- supabase/migrations/0005_student_code.sql
    Adds `profiles.student_code`, a generator function, updates
    `handle_new_user`, and backfills existing profiles.
- supabase/migrations/0006_storage_returns.sql
    Storage RLS policies for the `returns/` path prefix in the
    `course-files` bucket.
- app/api/submissions/return/route.ts
    POST — instructor uploads a return for one submission.
- app/api/submissions/return/download/[id]/route.ts
    GET — signed URL for the return file (60 seconds).

Replaces (overwrite existing):
- app/courses/[id]/assignments/[assignmentId]/page.tsx
    Now selects `returned_*` columns; passes `isInstructor` to the client.
- app/courses/[id]/assignments/[assignmentId]/SubmissionsClient.tsx
    Renders the return UI for both student and staff views.

## Apply order

1. Unzip into the repo root:
       unzip /path/to/gesso-lite-step8.zip -d .

2. Run the two migrations in order in the Supabase SQL editor:
       supabase/migrations/0005_student_code.sql
       supabase/migrations/0006_storage_returns.sql

3. Verify student codes:
       SELECT email, student_code FROM public.profiles ORDER BY created_at;
   Every row should have a 5-character code.

4. Verify returns policies exist:
       SELECT policyname FROM pg_policies
       WHERE tablename = 'objects' AND schemaname = 'storage'
         AND policyname LIKE 'returns%';
   You should see four returns policies.

5. Hot reload picks up the page/component changes; no dev server restart
   needed unless something's stuck.

## Test

As instructor:
- Open an assignment where a student has submitted. Each student row now
  shows a sub-row "+ Upload return" beneath it.
- Click "+ Upload return" — file picker appears inline.
- Choose a `.docx`, click "Upload return". Page refreshes; that student's
  row now shows the orange RETURNED tag with the filename and a "Replace
  return" button.

As student (incognito window):
- Open the same assignment. Your stage block now shows a second indented
  row with the orange RETURNED tag and a Download button.
- Click Download — the marked-up file downloads.

For stages where you've submitted but the instructor hasn't returned anything:
- A small muted line "Awaiting response from instructor." appears in place
  of the return row.
