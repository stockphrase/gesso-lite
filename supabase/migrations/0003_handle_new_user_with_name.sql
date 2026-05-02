-- ============================================================================
-- Gesso Lite — Update handle_new_user to capture name
-- ============================================================================
-- The /register form passes the user's name via supabase.auth.signUp's
-- options.data, which Supabase stores in auth.users.raw_user_meta_data.
-- The original handle_new_user trigger created the profiles row without
-- copying that name across, so profiles.name was always null for newly-
-- registered users.
--
-- This migration replaces the function to read raw_user_meta_data.name
-- (when present) and store it on the profiles row.
--
-- Existing profiles with null names are not backfilled. The instructor
-- can edit their own profile via the app (when we build that page); for
-- existing students, the simplest fix if they need a name set is for them
-- to register again — but we expect this migration to apply before there
-- are real student profiles to worry about.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_email text;
  v_is_instructor    boolean := false;
  v_whitelist_count  integer;
  v_name             text;
BEGIN
  -- Read the configured instructor email from app_config.
  SELECT instructor_email INTO v_instructor_email
  FROM public.app_config WHERE id = 1;

  IF v_instructor_email IS NOT NULL
     AND lower(NEW.email) = lower(v_instructor_email) THEN
    v_is_instructor := true;
  END IF;

  -- Pull the name from the signup metadata if it was provided.
  v_name := NEW.raw_user_meta_data->>'name';

  IF v_is_instructor THEN
    INSERT INTO public.profiles (id, email, name, role)
    VALUES (NEW.id, NEW.email, v_name, 'instructor');
  ELSE
    SELECT count(*) INTO v_whitelist_count
    FROM public.allowed_emails
    WHERE lower(email) = lower(NEW.email)
      AND claimed_at IS NULL;

    IF v_whitelist_count = 0 THEN
      RAISE EXCEPTION 'Email % is not authorized for registration', NEW.email
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.profiles (id, email, name, role)
    VALUES (NEW.id, NEW.email, v_name, 'member');

    INSERT INTO public.course_memberships (course_id, user_id, role)
    SELECT course_id, NEW.id, role
    FROM public.allowed_emails
    WHERE lower(email) = lower(NEW.email)
      AND claimed_at IS NULL;

    UPDATE public.allowed_emails
    SET claimed_at = now()
    WHERE lower(email) = lower(NEW.email)
      AND claimed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;
