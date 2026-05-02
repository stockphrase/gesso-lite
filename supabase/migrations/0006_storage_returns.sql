-- ============================================================================
-- Gesso Lite — Storage RLS for returns/
-- ============================================================================
-- Adds policies for the returns/ prefix in the course-files bucket.
-- Path layout:
--   course-files/returns/{courseId}/{assignmentId}/{stage}/{userId}/{filename}
--
-- The {userId} segment is the *student* — i.e. the recipient of the return,
-- not the uploading instructor. This mirrors the submissions/ layout so a
-- given student's files all live under their own user_id.
-- ============================================================================

-- SELECT (download): the recipient student, the course's instructor,
-- or a tutor of the course.
CREATE POLICY "returns read by student or staff"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'returns'
  AND (
    (storage.foldername(name))[5] = auth.uid()::text
    OR public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
    OR public.is_tutor_in_course(((storage.foldername(name))[2])::bigint)
  )
);

-- INSERT (upload): instructor of the course only.
CREATE POLICY "returns insert by instructor"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'returns'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);

-- UPDATE (replace on re-upload): instructor of the course.
CREATE POLICY "returns update by instructor"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'returns'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
)
WITH CHECK (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'returns'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);

-- DELETE: instructor of the course (used during course delete cleanup).
CREATE POLICY "returns delete by instructor"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'returns'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);
