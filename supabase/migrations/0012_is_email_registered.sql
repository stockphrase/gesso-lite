-- ============================================================================
-- Gesso Lite — RPC: is_email_registered
-- ============================================================================
-- Lets the register page distinguish two reasons is_email_allowed() can
-- return false:
--   1. The email was never added to any course's whitelist.
--   2. The email already has an account (its whitelist row was auto-claimed
--      by handle_new_whitelist_entry() when the person was added to a
--      course — see 0001). In this case they don't need to register at
--      all; they should log in.
-- Returns boolean only, same leak profile as is_email_allowed/
-- is_instructor_email: confirms an email is registered, nothing more.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_email_registered(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(email) = lower(check_email)
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
