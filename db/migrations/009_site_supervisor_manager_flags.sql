-- Migration: 009_site_supervisor_manager_flags.sql
-- Description: Employment Details' "Site Supervisor" / "Site Manager" checkboxes.
-- is_site_supervisor mirrors into the real Workforce app's is_workforce_supervisor
-- (see server/routes/employees.ts pushSupervisorFlagToWorkforce); is_site_manager is
-- HCMS-only for now, with no Workforce-side meaning. Uniqueness (at most one active
-- holder of each role per project) is enforced in application code, not a DB
-- constraint, matching the "explicit flag" decision already applied to
-- is_workforce_supervisor.
--
-- APPLIED to production (jpsiafvbyupofnbqonkq) 2026-09-15.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_site_supervisor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_site_manager BOOLEAN NOT NULL DEFAULT FALSE;
