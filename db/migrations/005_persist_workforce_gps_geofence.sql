-- Migration: 005_persist_workforce_gps_geofence.sql
-- Description: Persist real GPS/geofence data on Workforce attendance events and shifts.
--
-- Applied directly to production (jpsiafvbyupofnbqonkq) alongside the Workforce Deployment
-- Dashboard data-chain fix. Checked in here to match repo convention (db/migrations/*.sql
-- tracks every schema change); re-running this file against production is a no-op.
--
-- The mobile app already sends latitude/longitude/is_mock_location/gps_accuracy_meters on
-- every clock-in and clock-out, but nothing persisted them: attendance_events was never
-- inserted into (0 rows, while every shift carried a dangling clock_in_event_id), and
-- attendance_shifts stored only compliance_flag, which collapses "outside the radius" and
-- "could not be evaluated" into the single value NEEDS_REVIEW. The dashboard therefore had
-- no way to tell a genuine geofence breach from an unevaluated one.
--
-- Additive and non-destructive: new nullable columns only, no existing row is modified.

ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS gps_accuracy_meters NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS shift_id UUID,
  ADD COLUMN IF NOT EXISTS project_id TEXT;

-- Denormalised "result of the latest selfie event on this shift", so the dashboard read
-- stays a single query. Overwritten at clock-out exactly as compliance_flag already is.
ALTER TABLE attendance_shifts
  ADD COLUMN IF NOT EXISTS geofence_status TEXT,
  ADD COLUMN IF NOT EXISTS distance_from_project_meters NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS gps_accuracy_meters NUMERIC(10,2);

ALTER TABLE attendance_shifts
  DROP CONSTRAINT IF EXISTS attendance_shifts_geofence_status_check;
ALTER TABLE attendance_shifts
  ADD CONSTRAINT attendance_shifts_geofence_status_check
  CHECK (geofence_status IS NULL OR geofence_status IN ('INSIDE', 'OUTSIDE', 'UNKNOWN'));

CREATE INDEX IF NOT EXISTS idx_attendance_events_shift ON attendance_events(shift_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_employee_time ON attendance_events(employee_id, server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_shifts_employee_date ON attendance_shifts(employee_id, shift_date);
