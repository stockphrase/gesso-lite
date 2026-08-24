-- ============================================================================
-- Gesso Lite — Extend audit_log allowed actions
-- ============================================================================
-- The action CHECK constraint from migration 0001 didn't anticipate several
-- actions the app has since started logging: course.updated, course.backup,
-- course.created_from_template, template.saved, template.deleted. Because
-- log_action()'s callers never check its return value, every one of these
-- calls has been silently failing the CHECK constraint — the underlying
-- operation (rename, backup, template save/delete, instantiate-from-template)
-- still succeeds, but nothing is written to the audit log.
--
-- This migration drops the old constraint (found dynamically, since it was
-- unnamed in 0001 and Postgres auto-generated its name) and replaces it with
-- one covering every action string the app actually uses today.
-- 'course.exported' is kept for backward compatibility with any historical
-- rows, though the app no longer writes it (course.backup replaced it).
-- ============================================================================

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.audit_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%action%IN%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    'course.created',
    'course.archived',
    'course.unarchived',
    'course.deleted',
    'course.exported',
    'course.updated',
    'course.backup',
    'course.created_from_template',
    'roster.added',
    'roster.removed',
    'assignment.created',
    'assignment.updated',
    'assignment.deleted',
    'submission.uploaded',
    'submission.returned',
    'reading.uploaded',
    'reading.deleted',
    'template.saved',
    'template.deleted'
  ));

-- ============================================================================
-- END
-- ============================================================================
