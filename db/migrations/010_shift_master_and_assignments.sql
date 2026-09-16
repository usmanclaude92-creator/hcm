-- Migration: 010_shift_master_and_assignments.sql
-- Description: Configurable Shift Master + Project/Head Office/Employee shift
-- assignment, and an attendance schedule snapshot on attendance_shifts.
--
-- No shift start/end times are hardcoded or assumed here -- the administrator defines
-- every shift's actual times through the Shift Master UI; this migration only creates
-- the empty structure.
--
-- Head Office is already a real row in `projects` (project_code HO0001), so Head Office
-- shifts are modeled as project_shift_assignments against that project -- no separate
-- "head office" table. A project (Head Office included) may have multiple active
-- shifts; at most one may be the open-ended default per project, used as the fallback
-- when no individual employee override applies. employee_shift_assignments is the
-- individual override (highest priority), optionally scoped to one project.
--
-- APPLIED to production (jpsiafvbyupofnbqonkq) 2026-09-16.

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_code text NOT NULL,
  shift_name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  standard_working_hours numeric(5,2) NOT NULL CHECK (standard_working_hours > 0),
  grace_in_minutes integer NOT NULL DEFAULT 0 CHECK (grace_in_minutes >= 0),
  grace_out_minutes integer NOT NULL DEFAULT 0 CHECK (grace_out_minutes >= 0),
  ot_eligible boolean NOT NULL DEFAULT false,
  ot_multiplier numeric(4,2),
  working_days text[] NOT NULL DEFAULT '{MON,TUE,WED,THU,FRI,SAT}',
  company_code text,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_code_upper ON public.shifts (upper(trim(shift_code)));

CREATE TABLE IF NOT EXISTS public.project_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_project_shift_assignments_project ON public.project_shift_assignments (project_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_shift_default_open
  ON public.project_shift_assignments (project_id)
  WHERE is_default AND is_active AND effective_to IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_employee_shift_assignments_employee ON public.employee_shift_assignments (employee_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_shift_open
  ON public.employee_shift_assignments (employee_id)
  WHERE is_active AND effective_to IS NULL;

ALTER TABLE public.attendance_shifts
  ADD COLUMN IF NOT EXISTS scheduled_shift_id uuid REFERENCES public.shifts(id),
  ADD COLUMN IF NOT EXISTS scheduled_start time,
  ADD COLUMN IF NOT EXISTS scheduled_end time,
  ADD COLUMN IF NOT EXISTS scheduled_break_minutes integer,
  ADD COLUMN IF NOT EXISTS scheduled_standard_hours numeric(5,2),
  ADD COLUMN IF NOT EXISTS scheduled_grace_in_minutes integer,
  ADD COLUMN IF NOT EXISTS scheduled_grace_out_minutes integer,
  ADD COLUMN IF NOT EXISTS late_minutes integer,
  ADD COLUMN IF NOT EXISTS early_departure_minutes integer;
