-- ============================================================================
-- Gesso Lite — Student code
-- ============================================================================
-- Adds a 5-character unique code to every profile, used to safely match
-- marked-up files back to students during bulk return upload (Step 9).
--
-- Alphabet: 32 unambiguous lowercase alphanumeric characters
--   (no 0, 1, i, l, o — common look-alikes).
-- Total space: 32^5 = ~33 million codes; collisions in practice never happen.
-- ============================================================================

-- 1. Add the column.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_code text;

-- Add unique constraint separately so we can populate before enforcing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_student_code_key'
  ) THEN
    -- Create the unique constraint after backfill, below.
    NULL;
  END IF;
END $$;


-- 2. Generator function. Returns a unique 5-char code, retrying on collision.
CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet  text := '23456789abcdefghjkmnpqrstuvwxyz';
  alphabet_len integer := length(alphabet);
  candidate text;
  i         integer;
  attempts  integer := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    candidate := '';
    FOR i IN 1..5 LOOP
      candidate := candidate ||
        substr(alphabet, 1 + floor(random() * alphabet_len)::integer, 1);
    END LOOP;

    -- Check for collision.
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE student_code = candidate
    ) THEN
      RETURN candidate;
    END IF;

    -- Safety bail. With 32^5 = 33M codes, this should never trigger.
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate a unique student code after 50 attempts';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_student_code() FROM PUBLIC;
-- Only callable internally (by triggers running as SECURITY DEFINER); no app
-- caller needs to invoke it directly.


-- 3. Backfill any existing profiles that don't have a code yet.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE student_code IS NULL LOOP
    UPDATE public.profiles
    SET student_code = public.generate_student_code()
    WHERE id = r.id;
  END LOOP;
END $$;


-- 4. Now that every row has a code, enforce uniqueness and not-null.
ALTER TABLE public.profiles
  ALTER COLUMN student_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_student_code_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_student_code_key UNIQUE (student_code);
  END IF;
END $$;


-- 5. Update handle_new_user to populate student_code on new registrations.
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
  v_code             text;
BEGIN
  SELECT instructor_email INTO v_instructor_email
  FROM public.app_config WHERE id = 1;

  IF v_instructor_email IS NOT NULL
     AND lower(NEW.email) = lower(v_instructor_email) THEN
    v_is_instructor := true;
  END IF;

  v_name := NEW.raw_user_meta_data->>'name';
  v_code := public.generate_student_code();

  IF v_is_instructor THEN
    INSERT INTO public.profiles (id, email, name, role, student_code)
    VALUES (NEW.id, NEW.email, v_name, 'instructor', v_code);
  ELSE
    SELECT count(*) INTO v_whitelist_count
    FROM public.allowed_emails
    WHERE lower(email) = lower(NEW.email)
      AND claimed_at IS NULL;

    IF v_whitelist_count = 0 THEN
      RAISE EXCEPTION 'Email % is not authorized for registration', NEW.email
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.profiles (id, email, name, role, student_code)
    VALUES (NEW.id, NEW.email, v_name, 'member', v_code);

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
