-- ============================================================================
-- Gesso Lite — Initial Schema
-- ============================================================================
-- This migration sets up the complete database for Gesso Lite:
--   - 9 tables (profiles, courses, course_memberships, allowed_emails,
--     assignments, submissions, reading_files, audit_log, app_config)
--   - RLS policies on every table (default-deny, course-scoped)
--   - SECURITY DEFINER helper functions
--   - Triggers for whitelist enforcement, role locking, auto-enrollment,
--     submission column protection, and instructor auto-promotion
--
-- After applying this migration, set the instructor email (kept out of
-- the repo) by running this once in the Supabase SQL editor:
--
--   UPDATE public.app_config SET instructor_email = 'you@example.com' WHERE id = 1;
--
-- The very first user who registers with that email will be auto-promoted
-- to role='instructor'. All subsequent registrations require a matching
-- whitelist entry in allowed_emails.
-- ============================================================================


-- ============================================================================
-- SECTION 1: SCHEMA
-- ============================================================================

-- App config: single-row table for runtime settings that need to be readable
-- by SECURITY DEFINER triggers but not exposed to clients. The instructor
-- email lives here (kept out of the migration file / repo).
CREATE TABLE public.app_config (
  id                 integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  instructor_email   text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_config (id) VALUES (1);


-- Profiles: one row per registered user. Mirrors auth.users.id.
-- The role column distinguishes the single instructor from everyone else.
-- Whether a 'member' is a student or tutor in a given course is determined
-- by their course_memberships row for that course.
CREATE TABLE public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL UNIQUE,
  name        text,
  role        text        NOT NULL CHECK (role IN ('instructor', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_email_idx ON public.profiles (lower(email));


-- Courses: one row per course the instructor teaches.
-- archived_at NULL = active; non-NULL = soft-deleted (hidden from active UI).
-- There is no automatic permanent deletion; the instructor manually deletes
-- archived courses via the settings page.
CREATE TABLE public.courses (
  id           bigserial   PRIMARY KEY,
  title        text        NOT NULL,
  term         text,
  year         integer,
  created_by   uuid        NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
);

CREATE INDEX courses_created_by_idx ON public.courses (created_by);
CREATE INDEX courses_archived_at_idx ON public.courses (archived_at);


-- Course memberships: who is in what course, with what per-course role.
CREATE TABLE public.course_memberships (
  id          bigserial   PRIMARY KEY,
  course_id   bigint      NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('student', 'tutor')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

CREATE INDEX course_memberships_user_idx ON public.course_memberships (user_id);
CREATE INDEX course_memberships_course_idx ON public.course_memberships (course_id);


-- Allowed emails (whitelist): instructor seeds this with the email + role
-- of each person who should be permitted to register and join a course.
-- claimed_at NULL = available, non-NULL = used during registration.
-- This table is NOT publicly readable; registration goes through the
-- is_email_allowed() function.
CREATE TABLE public.allowed_emails (
  id          bigserial   PRIMARY KEY,
  course_id   bigint      NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('student', 'tutor')),
  claimed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, email)
);

CREATE INDEX allowed_emails_email_idx ON public.allowed_emails (lower(email));


-- Assignments: a writing assignment with one or more stages.
-- stages is a JSONB array of {name, due_date} objects, e.g.
--   [{"name": "Proposal", "due_date": "2026-05-01"},
--    {"name": "Draft 1",  "due_date": "2026-05-15"},
--    {"name": "Final",    "due_date": "2026-06-01"}]
CREATE TABLE public.assignments (
  id           bigserial   PRIMARY KEY,
  course_id    bigint      NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text,
  stages       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assignments_course_idx ON public.assignments (course_id);


-- Submissions: one row per (assignment, user, stage). Tracks both the
-- student's submitted file and the instructor's returned (marked-up) file.
-- The two halves are protected by a trigger so neither party can write
-- to the other's columns (see prevent_cross_role_submission_updates below).
CREATE TABLE public.submissions (
  id                     bigserial   PRIMARY KEY,
  assignment_id          bigint      NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_name             text        NOT NULL,
  filename               text        NOT NULL,
  storage_path           text        NOT NULL,
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  returned_filename      text,
  returned_storage_path  text,
  returned_at            timestamptz,
  UNIQUE (assignment_id, user_id, stage_name)
);

CREATE INDEX submissions_assignment_idx ON public.submissions (assignment_id);
CREATE INDEX submissions_user_idx ON public.submissions (user_id);


-- Reading files: one folder of readings per course, uploaded by instructor,
-- downloadable by all course members.
CREATE TABLE public.reading_files (
  id            bigserial   PRIMARY KEY,
  course_id     bigint      NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  filename      text        NOT NULL,
  storage_path  text        NOT NULL,
  size_bytes    bigint,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reading_files_course_idx ON public.reading_files (course_id);


-- Audit log: append-only record of sensitive operations.
-- Writes go through the log_action() function (no direct INSERT permission).
-- Updates and deletes are forbidden by RLS.
CREATE TABLE public.audit_log (
  id           bigserial   PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action       text        NOT NULL,
  target_type  text,
  target_id    text,
  details      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (action IN (
    'course.created',
    'course.archived',
    'course.unarchived',
    'course.deleted',
    'course.exported',
    'roster.added',
    'roster.removed',
    'assignment.created',
    'assignment.updated',
    'assignment.deleted',
    'submission.uploaded',
    'submission.returned',
    'reading.uploaded',
    'reading.deleted'
  ))
);

CREATE INDEX audit_log_user_idx ON public.audit_log (user_id);
CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);


-- ============================================================================
-- SECTION 2: HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================================
-- These run with the privileges of the function owner (postgres), bypassing
-- RLS. They're used inside RLS policies to avoid recursion, and from
-- application code where a controlled, narrow privilege escalation is needed.
-- ============================================================================


-- is_email_allowed: called during registration (by anon) to check whether
-- a given email has any unclaimed whitelist entry. Returns boolean only —
-- does NOT leak which courses or what role.
CREATE OR REPLACE FUNCTION public.is_email_allowed(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_emails
    WHERE lower(email) = lower(check_email)
      AND claimed_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_allowed(text) TO anon, authenticated;


-- is_tutor_in_course: used by RLS policies on course_memberships and
-- submissions to let tutors read course data without recursing into
-- course_memberships (which would happen if the policy did the lookup
-- directly).
CREATE OR REPLACE FUNCTION public.is_tutor_in_course(check_course_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_memberships
    WHERE user_id = auth.uid()
      AND role = 'tutor'
      AND course_id = check_course_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_tutor_in_course(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tutor_in_course(bigint) TO authenticated;


-- is_member_of_course: used by RLS policies on assignments, reading_files,
-- and similar tables to check course membership without recursion.
CREATE OR REPLACE FUNCTION public.is_member_of_course(check_course_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_memberships
    WHERE user_id = auth.uid()
      AND course_id = check_course_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_member_of_course(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of_course(bigint) TO authenticated;


-- is_instructor_of_course: used by RLS policies and API routes to check
-- whether the current user is the instructor who created a given course.
-- (Since there's only ever one instructor, "instructor of the course"
-- and "creator of the course" are equivalent — but checking created_by
-- keeps the model explicit.)
CREATE OR REPLACE FUNCTION public.is_instructor_of_course(check_course_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses c
    JOIN public.profiles p ON p.id = c.created_by
    WHERE c.id = check_course_id
      AND c.created_by = auth.uid()
      AND p.role = 'instructor'
  );
$$;

REVOKE ALL ON FUNCTION public.is_instructor_of_course(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_instructor_of_course(bigint) TO authenticated;


-- log_action: the only way clients can write to audit_log. Forces
-- user_id = auth.uid() so entries cannot be forged. The action string is
-- still validated by the CHECK constraint on the table.
CREATE OR REPLACE FUNCTION public.log_action(
  p_action       text,
  p_target_type  text DEFAULT NULL,
  p_target_id    text DEFAULT NULL,
  p_details      jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;

REVOKE ALL ON FUNCTION public.log_action(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_action(text, text, text, jsonb) TO authenticated;


-- ============================================================================
-- SECTION 3: TRIGGERS
-- ============================================================================


-- handle_new_user: fires after a new auth.users row is created (i.e. after
-- supabase.auth.signUp succeeds). Creates the matching profiles row and any
-- course_memberships rows derived from allowed_emails. The browser never
-- writes to profiles directly — this trigger does it atomically.
--
-- Special case: if the new user's email matches the instructor email stored
-- in app_config, they are auto-promoted to role='instructor' and no
-- whitelist check is performed. Otherwise, they must have at least one
-- unclaimed whitelist entry, or the registration is rejected.
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
BEGIN
  -- Read the configured instructor email from app_config.
  SELECT instructor_email INTO v_instructor_email
  FROM public.app_config WHERE id = 1;

  IF v_instructor_email IS NOT NULL
     AND lower(NEW.email) = lower(v_instructor_email) THEN
    v_is_instructor := true;
  END IF;

  IF v_is_instructor THEN
    -- Instructor: create profile, no whitelist check, no memberships.
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'instructor');
  ELSE
    -- Member: must have at least one unclaimed whitelist entry.
    SELECT count(*) INTO v_whitelist_count
    FROM public.allowed_emails
    WHERE lower(email) = lower(NEW.email)
      AND claimed_at IS NULL;

    IF v_whitelist_count = 0 THEN
      RAISE EXCEPTION 'Email % is not authorized for registration', NEW.email
        USING ERRCODE = 'check_violation';
    END IF;

    -- Create the profile.
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'member');

    -- Create memberships from each unclaimed whitelist entry, marking them claimed.
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- handle_new_whitelist_entry: fires when the instructor adds a row to
-- allowed_emails. If the email already belongs to a registered user
-- (e.g. a student switching sections), immediately enroll them in the
-- new course and mark the whitelist row as claimed. Otherwise no-op
-- (the row sits with claimed_at IS NULL until the user registers).
CREATE OR REPLACE FUNCTION public.handle_new_whitelist_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_user_id uuid;
BEGIN
  SELECT id INTO v_existing_user_id
  FROM public.profiles
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF v_existing_user_id IS NOT NULL THEN
    -- User already exists; enroll them now.
    INSERT INTO public.course_memberships (course_id, user_id, role)
    VALUES (NEW.course_id, v_existing_user_id, NEW.role)
    ON CONFLICT (course_id, user_id) DO NOTHING;

    NEW.claimed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_whitelist_entry_added
  BEFORE INSERT ON public.allowed_emails
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_whitelist_entry();


-- prevent_role_self_promotion: blocks any UPDATE to profiles.role.
-- The role is set once by handle_new_user() and is immutable thereafter
-- through normal client paths. Direct database access (e.g. via SQL
-- editor as the postgres role) is unaffected because RLS doesn't apply
-- to superusers.
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'profiles.role cannot be changed via client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_role_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_change();


-- prevent_cross_role_submission_updates: enforces column ownership on
-- the submissions table. Students may only update student-owned columns
-- (filename, storage_path, submitted_at). Instructors may only update
-- instructor-owned columns (returned_*). Anyone else is blocked at the
-- RLS layer before reaching this trigger.
CREATE OR REPLACE FUNCTION public.enforce_submission_column_ownership()
RETURNS trigger
LANGUAGE plpgsql
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

CREATE TRIGGER enforce_submission_column_ownership_trigger
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_submission_column_ownership();


-- ============================================================================
-- SECTION 4: ROW LEVEL SECURITY
-- ============================================================================
-- Default-deny on every table. No qual:true policies. Every policy is
-- course-scoped where applicable.
-- ============================================================================

ALTER TABLE public.app_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_files       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log           ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------------
-- app_config
-- --------------------------------------------------------------------------
-- No client policies = no client access. Only SECURITY DEFINER functions
-- can read it, and the instructor (acting as postgres in the SQL editor)
-- can update it directly when needed.


-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------

-- Read your own profile, OR any profile of someone you share a course with
-- (where you are instructor or tutor — students don't need to see classmate profiles).
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.course_memberships cm_self
      JOIN public.course_memberships cm_target ON cm_target.course_id = cm_self.course_id
      WHERE cm_self.user_id = auth.uid()
        AND cm_self.role = 'tutor'
        AND cm_target.user_id = profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.courses c
      JOIN public.course_memberships cm ON cm.course_id = c.id
      WHERE c.created_by = auth.uid()
        AND cm.user_id = profiles.id
    )
  );

-- INSERTs are done by handle_new_user() (SECURITY DEFINER), not by clients.
-- No INSERT policy is needed; the absence of one denies direct client INSERTs.

-- Update your own profile (name only — role changes are blocked by the trigger).
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No DELETE policy: deletion happens via auth.users cascade.


-- --------------------------------------------------------------------------
-- courses
-- --------------------------------------------------------------------------

-- Read courses you're a member of, or courses you created.
CREATE POLICY courses_select ON public.courses
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_member_of_course(id)
  );

-- Only an instructor (per profiles.role) can create courses, and only with
-- created_by set to themselves.
CREATE POLICY courses_insert ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'instructor'
    )
  );

-- Update / delete: only the instructor who created the course.
CREATE POLICY courses_update ON public.courses
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY courses_delete ON public.courses
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());


-- --------------------------------------------------------------------------
-- course_memberships
-- --------------------------------------------------------------------------

CREATE POLICY course_memberships_select ON public.course_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_instructor_of_course(course_id)
    OR public.is_tutor_in_course(course_id)
  );

-- Only the instructor manages memberships. Inserts also happen via the
-- handle_new_user() and handle_new_whitelist_entry() triggers (SECURITY
-- DEFINER), which bypass RLS.
CREATE POLICY course_memberships_insert ON public.course_memberships
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY course_memberships_update ON public.course_memberships
  FOR UPDATE TO authenticated
  USING (public.is_instructor_of_course(course_id))
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY course_memberships_delete ON public.course_memberships
  FOR DELETE TO authenticated
  USING (public.is_instructor_of_course(course_id));


-- --------------------------------------------------------------------------
-- allowed_emails
-- --------------------------------------------------------------------------
-- Only the instructor sees this table directly. Anonymous registration
-- callers use is_email_allowed() which returns boolean only.

CREATE POLICY allowed_emails_select ON public.allowed_emails
  FOR SELECT TO authenticated
  USING (public.is_instructor_of_course(course_id));

CREATE POLICY allowed_emails_insert ON public.allowed_emails
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY allowed_emails_update ON public.allowed_emails
  FOR UPDATE TO authenticated
  USING (public.is_instructor_of_course(course_id))
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY allowed_emails_delete ON public.allowed_emails
  FOR DELETE TO authenticated
  USING (public.is_instructor_of_course(course_id));


-- --------------------------------------------------------------------------
-- assignments
-- --------------------------------------------------------------------------

CREATE POLICY assignments_select ON public.assignments
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_course(course_id)
    OR public.is_instructor_of_course(course_id)
  );

CREATE POLICY assignments_insert ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY assignments_update ON public.assignments
  FOR UPDATE TO authenticated
  USING (public.is_instructor_of_course(course_id))
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY assignments_delete ON public.assignments
  FOR DELETE TO authenticated
  USING (public.is_instructor_of_course(course_id));


-- --------------------------------------------------------------------------
-- submissions
-- --------------------------------------------------------------------------

-- Read: own submissions, plus instructor and tutors of the course.
CREATE POLICY submissions_select ON public.submissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = submissions.assignment_id
        AND (
          public.is_instructor_of_course(a.course_id)
          OR public.is_tutor_in_course(a.course_id)
        )
    )
  );

-- Insert: the student inserts their own submission row.
-- (Initial submission has student-owned columns set; returned_* are NULL.)
CREATE POLICY submissions_insert_own ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = assignment_id
        AND public.is_member_of_course(a.course_id)
    )
  );

-- Update: either the owning student OR the instructor of the course.
-- Column ownership is enforced by the trigger (instructor can only write
-- returned_* columns; student can only write their own columns).
CREATE POLICY submissions_update ON public.submissions
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = submissions.assignment_id
        AND public.is_instructor_of_course(a.course_id)
    )
  );

-- Delete: instructor only.
CREATE POLICY submissions_delete ON public.submissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = submissions.assignment_id
        AND public.is_instructor_of_course(a.course_id)
    )
  );


-- --------------------------------------------------------------------------
-- reading_files
-- --------------------------------------------------------------------------

CREATE POLICY reading_files_select ON public.reading_files
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_course(course_id)
    OR public.is_instructor_of_course(course_id)
  );

CREATE POLICY reading_files_insert ON public.reading_files
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY reading_files_update ON public.reading_files
  FOR UPDATE TO authenticated
  USING (public.is_instructor_of_course(course_id))
  WITH CHECK (public.is_instructor_of_course(course_id));

CREATE POLICY reading_files_delete ON public.reading_files
  FOR DELETE TO authenticated
  USING (public.is_instructor_of_course(course_id));


-- --------------------------------------------------------------------------
-- audit_log
-- --------------------------------------------------------------------------
-- Reads: instructor only. (Simple version: instructor sees all log entries.
-- Tightening to "log entries for objects in my courses" would require
-- parsing target_type/target_id, which gets fiddly. The instructor is the
-- only consumer, and they own everything anyway.)

CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'instructor'
    )
  );

-- No INSERT policy: writes go through log_action() (SECURITY DEFINER).
-- No UPDATE or DELETE policy: log is append-only.


-- ============================================================================
-- SECTION 5: GRANTS
-- ============================================================================
-- Tighten default schema/table grants. authenticated and anon get no direct
-- table privileges by default; everything goes through RLS-gated SELECT/
-- INSERT/UPDATE/DELETE on the tables we want them to reach, plus EXECUTE
-- on the functions above.
-- ============================================================================

-- Grant table-level CRUD only where RLS allows it. Without these, even an
-- RLS-allowed query would fail with "permission denied for table".
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_memberships  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_files       TO authenticated;
GRANT SELECT                          ON public.audit_log          TO authenticated;
-- audit_log INSERT is via log_action() only; no direct grant.
-- app_config has no grants; only SECURITY DEFINER functions and superusers
-- can touch it.

-- Sequences (for bigserial PKs) need usage too.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
