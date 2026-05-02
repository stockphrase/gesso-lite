# Step 9 — Patch: MIME type fix for bulk return upload

The bulk upload was failing silently with "student has no submission"
when the real error was that Supabase Storage rejected the upload —
files extracted from a zip have no MIME type by default, and the bucket
only accepts the three Word/ODT MIME types we listed.

## Files (2 total)

Replaces:
- app/api/returns/zip-upload/route.ts
    Sets the correct `application/...` MIME type per file extension
    when uploading. Adds `upload-failed` and `db-update-failed` skip
    reasons so client errors are no longer reported as
    "no-submission".

- app/courses/[id]/assignments/[assignmentId]/SubmissionsClient.tsx
    Updates the `SkipEntry` type and `reasonLabel` function to know
    about the two new skip reasons.

## Apply

    unzip /path/to/gesso-lite-step9p.zip -d .

No database changes. Hot reload picks up the file changes.

## Test

Re-upload the same zip you tried before. Banner should now say
"Returned to N students" with no skips. Refresh the assignment page;
the orange RETURNED tag should appear on each student's row with the
filename from the zip.
