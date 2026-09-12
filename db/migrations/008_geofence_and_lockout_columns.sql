-- Supports two fixes drafted alongside this migration in the Workforce Edge Functions
-- (see Workforce-App/supabase/functions/):
--   - projects.latitude/longitude/geofence_radius_meters let `attendance` compute a real
--     geofence distance instead of hardcoding "INSIDE". Existing rows get NULL
--     coordinates and a 200m default radius -- fill in real coordinates per project
--     before relying on geofence enforcement; until then the function reports
--     geofence_status UNKNOWN rather than fabricating compliance.
--   - workforce_auth.failed_pin_attempts/locked_until back a real server-side PIN lockout
--     in `pin-login` (5 attempts / 15 minutes), replacing a PIN check that previously
--     didn't exist at all.
--
-- APPLIED to production (jpsiafvbyupofnbqonkq) 2026-09-12.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS geofence_radius_meters numeric(8,2) NOT NULL DEFAULT 200;

ALTER TABLE public.workforce_auth
  ADD COLUMN IF NOT EXISTS failed_pin_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;
