-- Migration: 011_attendance_shifts_recorded_by.sql
-- Description: Distinguishes a self-service mobile clock-in/out (recorded_by IS NULL)
-- from one a supervisor entered on behalf of a worker who has no mobile device of their
-- own (recorded_by = the supervisor's employees.id). Supports the Workforce-App
-- Supervisor "Shift" tab's proxy attendance recording.
--
-- Nullable, so every existing row and every ordinary self-service punch is completely
-- unaffected.
--
-- APPLIED to production (jpsiafvbyupofnbqonkq) 2026-09-17.

ALTER TABLE public.attendance_shifts
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.employees(id);
