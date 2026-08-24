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
-- This migration drops the old constraint and replaces it with one covering
-- every action string the app actually uses today. The constraint was
-- unnamed in 0001, but Postgres's default auto-generated name for a
-- single-column table-level CHECK is `<table>_<column>_check`, i.e.
-- `audit_log_action_check` — confirmed against a live database, so we drop
-- it by that name directly (IF EXISTS makes this safe to re-run).
-- 'course.exported' is kept for backward compatibility with any historical
-- rows, though the app no longer writes it (course.backup replaced it).
-- ============================================================================

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

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
