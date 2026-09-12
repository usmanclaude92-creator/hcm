-- Security advisor finding (2026-09-12): 18 functions in public had a mutable search_path,
-- the standard Postgres hardening gap (https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
-- Pinning search_path prevents a caller from shadowing an unqualified table/function
-- reference inside these functions by creating same-named objects earlier in their own
-- search_path.
--
-- NOTE: drafted 2026-09-12 during an automated audit/remediation session; the session was
-- blocked from applying this migration directly by a platform-level production-safety
-- control. Apply by hand: `supabase db push`, or paste into the SQL editor for project
-- jpsiafvbyupofnbqonkq, then remove this note.

ALTER FUNCTION public.hcms_to_uuid(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_to_uuid(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_col_type(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_to_date(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_append_only() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_payroll_line_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_payroll_inputs_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_override_scopes() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_override(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_override_clear() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_locked_write_allowed(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_payroll_run_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_attendance_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_payment_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_wps_transaction_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.hcms_loan_recovery_guard() SET search_path = public, pg_temp;
ALTER FUNCTION public.register_workforce_staff(text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_employee_to_workforce_roster() SET search_path = public, pg_temp;
