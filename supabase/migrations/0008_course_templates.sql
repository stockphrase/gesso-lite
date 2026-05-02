-- ============================================================================
-- Gesso Lite — Course templates
-- ============================================================================
-- Lets the instructor save the structural skeleton of a course (assignments
-- with stages, list of reading filenames as a reference) and use it later
-- to prefill a new course.
--
-- What's stored:
--   - assignments: array of { title, description, stages: [{ name }] }
--     - stages have NO due_date; the instructor sets dates after instantiating
--   - previous_readings: array of { filename } — informational only, NOT
--     copied as actual readings into instantiated courses
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_templates (
  id                    bigserial PRIMARY KEY,
  owner_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  course_title_default  text NOT NULL,
  assignments           jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_readings     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS course_templates_owner_id_idx
  ON public.course_templates (owner_id);

ALTER TABLE public.course_templates ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their own templates.
CREATE POLICY "templates owner select"
  ON public.course_templates FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "templates owner insert"
  ON public.course_templates FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "templates owner update"
  ON public.course_templates FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "templates owner delete"
  ON public.course_templates FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
