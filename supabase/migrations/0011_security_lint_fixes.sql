-- ============================================================================
-- Gesso Lite — Security linter fixes
-- ============================================================================
-- Addresses two categories of WARN-level findings from the Supabase database
-- linter (Advisors > Security):
--
--   1. function_search_path_mutable: prevent_role_change() and
--      enforce_submission_column_ownership() were the only two functions in
--      0001 missing `SET search_path = public`. Every other function already
--      had it. Recreated here with the same bodies, search_path added.
--
--   2. anon/authenticated_security_definer_function_executable: Supabase
--      grants EXECUTE on every new function to anon/authenticated/
--      service_role via default privileges — a grant separate from PUBLIC,
--      so the `REVOKE ALL ... FROM PUBLIC` lines in 0001/0002/0005 never
--      touched it. Migration 0009's blanket
--      `GRANT EXECUTE ON ALL FUNCTIONS ... TO authenticated` then re-granted
--      generate_student_code() to authenticated too. This revokes EXECUTE
--      from the functions that were never meant to be called via
--      PostgREST RPC:
--        - handle_new_user, handle_new_whitelist_entry, prevent_role_change,
--          enforce_submission_column_ownership: trigger-only functions.
--        - generate_student_code: called only from inside handle_new_user().
--        - is_instructor_of_course, is_member_of_course, is_tutor_in_course,
--          log_action: called from app/ via supabase.rpc(), but every call
--          site checks supabase.auth.getUser() first — anon never has a
--          legitimate reason to call these.
--      is_email_allowed() and is_instructor_email() are deliberately left
--      untouched — the register page calls both before the user is signed
--      in, so anon access is required.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Missing search_path
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'profiles.role cannot be changed via client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_submission_column_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_owner       boolean := (auth.uid() = OLD.user_id);
  v_is_instructor  boolean;
  v_student_changed     boolean;
  v_instructor_changed  boolean;
BEGIN
  -- Determine if the caller is the instructor of this submission's course.
  SELECT public.is_instructor_of_course(a.course_id) INTO v_is_instructor
  FROM public.assignments a
  WHERE a.id = OLD.assignment_id;

  -- Detect which column groups changed.
  v_student_changed :=
    (OLD.filename     IS DISTINCT FROM NEW.filename)
 OR (OLD.storage_path IS DISTINCT FROM NEW.storage_path)
 OR (OLD.submitted_at IS DISTINCT FROM NEW.submitted_at)
 OR (OLD.stage_name   IS DISTINCT FROM NEW.stage_name);

  v_instructor_changed :=
    (OLD.returned_filename     IS DISTINCT FROM NEW.returned_filename)
 OR (OLD.returned_storage_path IS DISTINCT FROM NEW.returned_storage_path)
 OR (OLD.returned_at           IS DISTINCT FROM NEW.returned_at);

  IF v_is_owner AND NOT v_is_instructor THEN
    -- Student updating their own submission: must not touch returned_* fields.
    IF v_instructor_changed THEN
      RAISE EXCEPTION 'students cannot modify returned_* columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_is_instructor THEN
    -- Instructor updating: must not touch student-owned fields.
    IF v_student_changed THEN
      RAISE EXCEPTION 'instructor cannot modify student-owned submission columns'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    -- Neither owner nor instructor; should have been blocked by RLS, but belt-and-braces.
    RAISE EXCEPTION 'not authorized to update this submission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2. Lock down EXECUTE to only what's actually needed
-- --------------------------------------------------------------------------

-- Trigger-only functions: never meant to be invoked directly via RPC.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_whitelist_entry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_submission_column_ownership() FROM PUBLIC, anon, authenticated;

-- Called only from inside handle_new_user(); no client or app caller invokes it.
REVOKE ALL ON FUNCTION public.generate_student_code() FROM PUBLIC, anon, authenticated;

-- Called from app/ via supabase.rpc(), but only after an authenticated check.
REVOKE EXECUTE ON FUNCTION public.is_instructor_of_course(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_member_of_course(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_tutor_in_course(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_action(text, text, text, jsonb) FROM anon;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
