-- ============================================================================
-- Gesso Lite — explicit Data API grants
-- ============================================================================
-- Future-proofs the schema for the Supabase Data API change rolling out
-- October 30, 2026, after which new tables in "public" require explicit
-- GRANT statements to be reachable via supabase-js, PostgREST, or GraphQL.
--
-- This migration adds explicit grants to all existing Gesso Lite tables.
-- Existing projects keep their grants regardless, but running this makes
-- the migration self-contained for fresh installs after October 30, 2026.
--
-- Grants mirror the existing implicit grants:
--   - anon:           none (no public-readable tables in Gesso Lite)
--   - authenticated:  SELECT/INSERT/UPDATE/DELETE — RLS policies govern
--                     what's actually permitted at the row level
--   - service_role:   SELECT/INSERT/UPDATE/DELETE — used by server-side
--                     code with the service role key (bypasses RLS)
--
-- Idempotent — safe to re-run.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_memberships TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_files TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_templates TO authenticated, service_role;

-- Sequences for bigserial PKs need USAGE/SELECT grants so INSERT can read nextval().
-- Modern Supabase usually grants these implicitly, but explicit doesn't hurt.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Functions: the SECURITY DEFINER helpers (is_instructor_of_course, etc.) and
-- the log_action RPC need EXECUTE for authenticated callers via PostgREST.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
