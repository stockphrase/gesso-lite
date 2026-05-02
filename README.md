# Step 10 — Readings

Course readings: instructor uploads PDFs (single or zip-of-PDFs);
all course members can download individually or as a bulk zip.

## Files (7 total)

New:
- supabase/migrations/0007_storage_readings.sql
    Adds RLS policies for the `readings/` storage prefix and adds
    `application/pdf` to the bucket's `allowed_mime_types`.
- app/api/readings/upload/route.ts
    POST. Accepts a single .pdf or a .zip of PDFs. Saves each file to
    `readings/{courseId}/{filename}` and upserts the matching row in
    `reading_files` (overwrites by filename).
- app/api/readings/download/[id]/route.ts
    GET. Signed URL for one reading.
- app/api/readings/zip/[courseId]/route.ts
    GET. Streams a zip of all readings for the course.
- app/api/readings/delete/[id]/route.ts
    POST. Instructor deletes a reading (storage object + db row).
- app/courses/[id]/ReadingsClient.tsx
    Interactive readings UI. Instructor sees upload form + per-row
    Delete button; everyone gets per-row Download + bulk "Download all".

Replaces:
- app/courses/[id]/page.tsx
    Fetches readings, uses ReadingsClient instead of the placeholder.

## Apply

1. Unzip into the repo root:
       unzip /path/to/gesso-lite-step10.zip -d .

2. Run the migration in the Supabase SQL editor:
       supabase/migrations/0007_storage_readings.sql

3. Verify the bucket now allows PDFs:
       SELECT id, allowed_mime_types FROM storage.buckets
       WHERE id = 'course-files';
   Should include `application/pdf`.

4. Verify the readings policies exist:
       SELECT policyname FROM pg_policies
       WHERE tablename = 'objects' AND schemaname = 'storage'
         AND policyname LIKE 'readings%';
   Should show four readings policies.

## Test

As instructor, on a course home page:
- Upload a single PDF. The file appears in the list with size and date.
- Upload a zip with 3 PDFs and 1 .txt. Banner says "Uploaded 3 files.
  Skipped 1: notes.txt (not a PDF)."
- Re-upload the same PDF (same filename). Should overwrite, not duplicate.
- Click Download on a row — file downloads.
- Click "Download all" — get a zip with all readings.
- Click Delete on a row — confirms, removes from list.

As student (incognito):
- Same course home shows the readings list with Download buttons but no
  Upload form and no Delete buttons.
- Per-row Download and bulk "Download all" both work.
