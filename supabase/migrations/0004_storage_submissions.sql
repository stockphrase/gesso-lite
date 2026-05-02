-- ============================================================================
-- Gesso Lite — Storage bucket and submissions storage RLS
-- ============================================================================
-- Creates the private `course-files` storage bucket and RLS policies for the
-- submissions/ path prefix. Returns and readings paths are added in later
-- migrations (Step 8 and Step 10).
--
-- Path layout for submissions:
--   course-files/submissions/{courseId}/{assignmentId}/{stage}/{userId}/{filename}
--
-- The path encodes ownership so RLS policies can authorize access by
-- inspecting path segments.
-- ============================================================================

-- 1. Create the bucket if it doesn't exist. Idempotent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-files',
  'course-files',
  false,                         -- private; signed URLs only
  10 * 1024 * 1024,              -- 10 MB hard cap at the storage layer
  ARRAY[
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- 2. RLS policies for the storage.objects table, scoped to the bucket
-- and the submissions/ prefix.
--
-- Path segments accessed via storage.foldername(name) — returns text[]:
--   [1] = 'submissions'
--   [2] = course_id (text)
--   [3] = assignment_id (text)
--   [4] = stage_name
--   [5] = user_id (uuid as text)
--   filename is the trailing part of `name` (not in foldername)


-- SELECT (download): the submission's owner, the course's instructor,
-- or a tutor of the course.
CREATE POLICY "submissions read own or course staff"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'submissions'
  AND (
    -- Owner: path's user_id segment matches caller
    (storage.foldername(name))[5] = auth.uid()::text
    -- Or instructor of the course
    OR public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
    -- Or tutor of the course
    OR public.is_tutor_in_course(((storage.foldername(name))[2])::bigint)
  )
);


-- INSERT (upload): the student is uploading to their own user_id folder
-- AND they're a member of the course.
CREATE POLICY "submissions insert own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'submissions'
  AND (storage.foldername(name))[5] = auth.uid()::text
  AND public.is_member_of_course(((storage.foldername(name))[2])::bigint)
);


-- UPDATE (overwrite on re-upload): same rule as insert.
CREATE POLICY "submissions update own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'submissions'
  AND (storage.foldername(name))[5] = auth.uid()::text
  AND public.is_member_of_course(((storage.foldername(name))[2])::bigint)
)
WITH CHECK (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'submissions'
  AND (storage.foldername(name))[5] = auth.uid()::text
  AND public.is_member_of_course(((storage.foldername(name))[2])::bigint)
);


-- DELETE: instructor of the course (used during course delete cleanup).
CREATE POLICY "submissions delete by instructor"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'submissions'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);

-- ============================================================================
-- END
-- ============================================================================
