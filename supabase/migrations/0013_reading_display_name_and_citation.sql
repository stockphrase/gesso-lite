-- ============================================================================
-- Gesso Lite — Reading display name + citation, and duplicate-row fix
-- ============================================================================
-- The upload route upserts reading_files on (course_id, filename) via
-- `onConflict: 'course_id,filename'`, but no unique constraint on that pair
-- was ever added in 0001. Re-uploading a same-named PDF correctly overwrites
-- the Storage object (upload() uses upsert: true) but the DB upsert has
-- nothing to conflict on, so it silently inserts a second, now-stale row
-- instead of updating the existing one.
--
-- This migration dedupes any rows that already exist because of that bug,
-- then adds the missing constraint so the upsert behaves as intended. It
-- also adds display_name/citation columns for the new reading-metadata
-- feature, and extends the audit_log action allowlist the same way 0010
-- did — a forgotten update there makes log_action() silently no-op instead
-- of failing loudly.
-- ============================================================================

-- Dedupe: for each (course_id, filename) group, keep only the most recently
-- uploaded row (ties broken by highest id). Safe because duplicate rows for
-- the same course_id+filename always share the same storage_path (it's
-- derived from filename), so only one real Storage object exists regardless
-- of how many DB rows point at it.
DELETE FROM public.reading_files rf
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY course_id, filename
           ORDER BY uploaded_at DESC, id DESC
         ) AS rn
  FROM public.reading_files
) ranked
WHERE rf.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.reading_files
  ADD CONSTRAINT reading_files_course_filename_key UNIQUE (course_id, filename);

ALTER TABLE public.reading_files
  ADD COLUMN display_name text,
  ADD COLUMN citation     text;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    'course.created',
    'course.archived',
    'course.unarchived',
    'course.deleted',
    'course.exported',
    'course.updated',
    'course.backup',
    'course.created_from_template',
    'roster.added',
    'roster.removed',
    'assignment.created',
    'assignment.updated',
    'assignment.deleted',
    'submission.uploaded',
    'submission.returned',
    'reading.uploaded',
    'reading.deleted',
    'reading.updated',
    'template.saved',
    'template.deleted'
  ));

-- ============================================================================
-- END
-- ============================================================================
