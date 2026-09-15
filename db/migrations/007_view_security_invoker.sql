-- Security advisor finding (2026-09-12), ERROR level: payroll_payment_reconciliation was
-- defined as a SECURITY DEFINER view, meaning it ran with its creator's privileges/RLS
-- rather than the querying user's. The view is a plain read-only join/aggregation (no
-- privileged function calls inside it), so switching it to security_invoker is a pure
-- hardening change with no functional difference.
--
-- APPLIED to production (jpsiafvbyupofnbqonkq) 2026-09-12.

ALTER VIEW public.payroll_payment_reconciliation SET (security_invoker = true);
