-- Security audit finding (2026-09-12): register_workforce_staff and rls_auto_enable are
-- SECURITY DEFINER functions that were callable directly by anon/authenticated over
-- PostgREST RPC (e.g. POST /rest/v1/rpc/register_workforce_staff), bypassing every
-- identity check the Workforce Edge Functions perform. register_workforce_staff in
-- particular takes a caller-supplied pin_hash and a civil_id and unconditionally upserts
-- workforce_auth + a device binding for the matching employee -- i.e. anyone holding the
-- public Supabase anon key could hijack any active employee's attendance identity in one
-- request, with no PIN of their own required.
--
-- Nothing in hcm or the Workforce Android app calls either function via RPC (confirmed by
-- searching both repos for `.rpc(` and equivalent REST calls), so revoking is safe.
--
-- APPLIED to production (jpsiafvbyupofnbqonkq) 2026-09-12 -- verified via
-- information_schema.role_routine_grants: only postgres/service_role remain as grantees.

REVOKE ALL ON FUNCTION public.register_workforce_staff(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
