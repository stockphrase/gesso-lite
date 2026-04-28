-- ============================================================================
-- Gesso Lite — RPC: is_instructor_email
-- ============================================================================
-- Returns true if the given email matches the instructor email in app_config.
-- Used by the /register page to skip the whitelist precheck for the instructor
-- (the instructor isn't on a whitelist; they ARE the whitelist). The trigger
-- in handle_new_user() does the same check server-side as the actual gate.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_instructor_email(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_config
    WHERE id = 1
      AND instructor_email IS NOT NULL
      AND lower(instructor_email) = lower(check_email)
  );
$$;

REVOKE ALL ON FUNCTION public.is_instructor_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_instructor_email(text) TO anon, authenticated;
