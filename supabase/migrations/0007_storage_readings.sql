-- ============================================================================
-- Gesso Lite — Storage RLS for readings/
-- ============================================================================
-- Adds policies for the readings/ prefix in the course-files bucket and
-- updates the bucket's allowed_mime_types to include application/pdf.
--
-- Path layout:
--   course-files/readings/{courseId}/{filename}
--
-- Authorization model:
--   - SELECT (download): any course member (instructor / tutor / student).
--   - INSERT/UPDATE/DELETE: instructor of the course only.
-- ============================================================================

-- 1. Add application/pdf to the bucket's allowed_mime_types.
-- The existing list (from migration 0004) had only Word + ODT MIME types,
-- which were appropriate for submissions. Readings are PDFs.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/pdf'
]
WHERE id = 'course-files';


-- 2. Storage RLS policies for the readings/ prefix.

-- SELECT (download): any member of the course.
CREATE POLICY "readings read by member or staff"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'readings'
  AND (
    public.is_member_of_course(((storage.foldername(name))[2])::bigint)
    OR public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
  )
);

-- INSERT (upload): instructor of the course.
CREATE POLICY "readings insert by instructor"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'readings'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);

-- UPDATE (overwrite on re-upload): instructor of the course.
CREATE POLICY "readings update by instructor"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'readings'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
)
WITH CHECK (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'readings'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);

-- DELETE: instructor of the course.
CREATE POLICY "readings delete by instructor"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'course-files'
  AND (storage.foldername(name))[1] = 'readings'
  AND public.is_instructor_of_course(((storage.foldername(name))[2])::bigint)
);
