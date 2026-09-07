-- ============================================================================
-- HCMS 001 — Relational core
--
-- Replaces the single-JSONB-document store (app_state) with real tables for
-- every entity the application actually has. app_state is NOT touched by this
-- migration: it keeps working untouched while the relational side is built,
-- backfilled and validated alongside it.
--
-- Conventions
--   money      NUMERIC(14,3)  — OMR carries three decimals everywhere.
--   ids        uuid           — the application already generates UUID strings.
--   months     char(7)        — 'YYYY-MM', constrained by regex.
--   statuses   text + CHECK   — readable in psql and cheap to extend, unlike
--                               PG enums which need a migration per value.
--   deletes    RESTRICT       — financial history is never removed by cascade.
--
-- Idempotent: safe to run repeatedly (verified over three consecutive passes).
-- The eight pre-existing empty tables (users, employees, projects, audit_logs,
-- employee_civil_ids, employee_visas, employee_driving_licences,
-- employee_government_documents) are ALTERED into shape rather than dropped,
-- so nothing is destroyed and their names survive.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Idempotency helpers: the conversions below must be no-ops on a second run,
-- when the column has already been converted. Casting an already-uuid column
-- through nullif(col, '') fails, so the current type is checked first.
CREATE OR REPLACE FUNCTION hcms_col_type(p_table text, p_col text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT data_type FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_col;
$$;

CREATE OR REPLACE FUNCTION hcms_to_uuid(p_table text, p_col text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF hcms_col_type(p_table, p_col) IS DISTINCT FROM 'uuid' THEN
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', p_table, p_col);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE uuid USING (nullif(%I, '''')::uuid)', p_table, p_col, p_col);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hcms_to_date(p_table text, p_col text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF hcms_col_type(p_table, p_col) IS DISTINCT FROM 'date' THEN
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE date USING (nullif(%I, '''')::date)', p_table, p_col, p_col);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Reference / master data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  is_employer   boolean NOT NULL DEFAULT true,
  can_pay_salary boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE companies IS
  'Legal entities. Was a hard-coded TypeScript union; employees now reference it by FK.';

CREATE TABLE IF NOT EXISTS departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text,
  is_active   boolean NOT NULL DEFAULT true,
  remarks     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_key ON departments (lower(name));

CREATE TABLE IF NOT EXISTS designations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  department_id uuid REFERENCES departments (id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS designations_title_key ON designations (lower(title));

CREATE TABLE IF NOT EXISTS leave_types (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL,
  name                    text NOT NULL,
  is_paid                 boolean NOT NULL DEFAULT true,
  annual_entitlement_days numeric(6,2) NOT NULL DEFAULT 0
                          CHECK (annual_entitlement_days >= 0),
  is_active               boolean NOT NULL DEFAULT true,
  remarks                 text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leave_types_code_key ON leave_types (upper(code));

-- projects already exists (empty). Bring it into shape without dropping it.
SELECT hcms_to_uuid('projects', 'id');
ALTER TABLE projects ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE projects ALTER COLUMN project_code TYPE text;
ALTER TABLE projects ALTER COLUMN project_name TYPE text;
ALTER TABLE projects ALTER COLUMN status TYPE text;
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'Active';
SELECT hcms_to_date('projects', 'start_date');
SELECT hcms_to_date('projects', 'end_date');
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE projects ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE projects ALTER COLUMN updated_at SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_status_check
    CHECK (status IN ('Active','Inactive'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS project_allowed_companies (
  project_id   uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  company_code text NOT NULL REFERENCES companies (code) ON DELETE RESTRICT,
  PRIMARY KEY (project_id, company_code)
);
COMMENT ON TABLE project_allowed_companies IS
  'Replaces Project.allowedCompanies[]. Empty set = unrestricted.';

-- ---------------------------------------------------------------------------
-- Identity and access
-- ---------------------------------------------------------------------------

SELECT hcms_to_uuid('users', 'id');
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE users ALTER COLUMN username TYPE text;
ALTER TABLE users ALTER COLUMN name TYPE text;
ALTER TABLE users ALTER COLUMN email TYPE text;
ALTER TABLE users ALTER COLUMN role TYPE text;
ALTER TABLE users ALTER COLUMN password_hash TYPE text;
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('Administrator','Payroll Manager','Payroll User','Viewer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

CREATE TABLE IF NOT EXISTS user_company_scope (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_code text NOT NULL REFERENCES companies (code) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, company_code)
);
COMMENT ON TABLE user_company_scope IS
  'Replaces User.companyScope[]. No rows for a user = unrestricted.';

-- ---------------------------------------------------------------------------
-- Employee master
-- ---------------------------------------------------------------------------

SELECT hcms_to_uuid('employees', 'id');
ALTER TABLE employees ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE employees ALTER COLUMN employee_id TYPE text;
ALTER TABLE employees ALTER COLUMN employee_name TYPE text;
ALTER TABLE employees ALTER COLUMN employee_type TYPE text;
ALTER TABLE employees ALTER COLUMN nationality_type TYPE text;
ALTER TABLE employees ALTER COLUMN wage_type TYPE text;
ALTER TABLE employees ALTER COLUMN designation TYPE text;
ALTER TABLE employees ALTER COLUMN employee_company TYPE text;
ALTER TABLE employees ALTER COLUMN salary_paid_by TYPE text;
ALTER TABLE employees ALTER COLUMN wps_employee TYPE text;
ALTER TABLE employees ALTER COLUMN recover_from TYPE text;
SELECT hcms_to_date('employees', 'date_of_joining');
SELECT hcms_to_date('employees', 'date_of_leaving');
ALTER TABLE employees ALTER COLUMN monthly_salary_or_rate TYPE numeric(14,3);
ALTER TABLE employees ALTER COLUMN wps_salary TYPE numeric(14,3);
ALTER TABLE employees ALTER COLUMN actual_salary TYPE numeric(14,3);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES designations (id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments (id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS assigned_project_id uuid REFERENCES projects (id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_object_path text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE employees ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE employees ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE employees ALTER COLUMN updated_at SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_company_fk
    FOREIGN KEY (employee_company) REFERENCES companies (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_paid_by_fk
    FOREIGN KEY (salary_paid_by) REFERENCES companies (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_type_check
    CHECK (employee_type IN ('Worker','Staff'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_nationality_check
    CHECK (nationality_type IN ('Omani','Expat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_wage_type_check
    CHECK (wage_type IN ('Per Hour','Fixed Monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_wps_check
    CHECK (wps_employee IN ('Yes','No'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_salary_nonneg
    CHECK (monthly_salary_or_rate >= 0 AND wps_salary >= 0 AND actual_salary >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE employees ADD CONSTRAINT employees_leaving_after_joining
    CHECK (date_of_leaving IS NULL OR date_of_leaving >= date_of_joining);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Business key, case-insensitive: the application normalises employee IDs to
-- upper case, so 'emp001' and 'EMP001' must not both be insertable.
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_id_upper_key ON employees (upper(employee_id));
CREATE INDEX IF NOT EXISTS employees_company_idx ON employees (employee_company);
CREATE INDEX IF NOT EXISTS employees_active_idx ON employees (is_active);

CREATE TABLE IF NOT EXISTS employee_personal_details (
  employee_id           uuid PRIMARY KEY REFERENCES employees (id) ON DELETE RESTRICT,
  father_name           text,
  date_of_birth         date,
  gender                text,
  marital_status        text,
  blood_group           text,
  mobile                text,
  whatsapp_number       text,
  personal_email        text,
  current_address       text,
  permanent_address     text,
  emergency_contacts    jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifications        jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills                jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_experience       text,
  hr_notes              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE employee_personal_details IS
  'Non-financial personal profile. Bank details live in employee_bank_accounts; photos live in object storage, referenced by employees.photo_object_path.';

-- Effective-dated history. These three tables are what make a historical payroll
-- reproducible after today's master data changes.
CREATE TABLE IF NOT EXISTS employee_salary_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  wage_type       text NOT NULL CHECK (wage_type IN ('Per Hour','Fixed Monthly')),
  monthly_salary_or_rate numeric(14,3) NOT NULL CHECK (monthly_salary_or_rate >= 0),
  wps_salary      numeric(14,3) NOT NULL DEFAULT 0 CHECK (wps_salary >= 0),
  actual_salary   numeric(14,3) NOT NULL DEFAULT 0 CHECK (actual_salary >= 0),
  effective_from  date NOT NULL,
  effective_to    date,
  reason          text,
  changed_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS employee_salary_history_lookup_idx
  ON employee_salary_history (employee_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  bank_name           text,
  bank_account_number text,
  iban                text,
  bank_branch         text,
  account_holder_name text,
  effective_from      date NOT NULL,
  effective_to        date,
  is_current          boolean NOT NULL DEFAULT true,
  changed_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS employee_bank_accounts_lookup_idx
  ON employee_bank_accounts (employee_id, effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS employee_bank_accounts_one_current
  ON employee_bank_accounts (employee_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS employee_employment_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  field          text NOT NULL,
  previous_value text,
  new_value      text,
  effective_date date NOT NULL,
  reason         text,
  changed_by     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_employment_history_lookup_idx
  ON employee_employment_history (employee_id, effective_date DESC);

-- ---------------------------------------------------------------------------
-- Compliance documents. These four tables already exist (empty); they are
-- re-pointed at employees.id and given real constraints.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_civil_ids','employee_visas',
                           'employee_driving_licences','employee_government_documents']
  LOOP
    PERFORM hcms_to_uuid(t, 'id');
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', t);
    PERFORM hcms_to_uuid(t, 'employee_id');
    PERFORM hcms_to_date(t, 'issue_date');
    PERFORM hcms_to_date(t, 'expiry_date');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS object_path text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS mime_type text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS size_bytes bigint', t);
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (employee_id) '
                     'REFERENCES employees (id) ON DELETE RESTRICT', t, t || '_employee_fk');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (employee_id)', t || '_employee_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (expiry_date)', t || '_expiry_idx', t);
  END LOOP;
END $$;

-- One current document of each kind per employee.
CREATE UNIQUE INDEX IF NOT EXISTS employee_civil_ids_one_current
  ON employee_civil_ids (employee_id) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS employee_visas_one_current
  ON employee_visas (employee_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS employee_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES employees (id) ON DELETE RESTRICT,
  document_type text NOT NULL,
  file_name     text NOT NULL,
  object_path   text NOT NULL,
  mime_type     text,
  size_bytes    bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum      text,
  uploaded_by   text,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  remarks       text
);
CREATE INDEX IF NOT EXISTS employee_documents_employee_idx ON employee_documents (employee_id);
COMMENT ON TABLE employee_documents IS
  'Document repository metadata. The bytes live in object storage; this table never stores base64 content.';

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS attendance_months (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month char(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status        text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','FINALIZED')),
  submitted_by  text, submitted_at timestamptz,
  approved_by   text, approved_at  timestamptz,
  finalized_by  text, finalized_at timestamptz,
  reverted_by   text, reverted_at  timestamptz, revert_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_months_month_key ON attendance_months (payroll_month);

CREATE TABLE IF NOT EXISTS attendance_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_month_id uuid NOT NULL REFERENCES attendance_months (id) ON DELETE RESTRICT,
  employee_id         uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  project_id          uuid REFERENCES projects (id) ON DELETE RESTRICT,
  payroll_month       char(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  days_worked         numeric(6,2) NOT NULL DEFAULT 0 CHECK (days_worked >= 0 AND days_worked <= 31),
  hours_worked        numeric(8,2) NOT NULL DEFAULT 0 CHECK (hours_worked >= 0 AND hours_worked <= 744),
  overtime_hours      numeric(8,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  bonus               numeric(14,3) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  deduction           numeric(14,3) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
  company_code        text REFERENCES companies (code) ON DELETE RESTRICT,
  pay_by              text REFERENCES companies (code) ON DELETE RESTRICT,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- One allocation per employee per project per month; a second row for the same
-- trio was previously possible and double-counted into payroll.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_unique_allocation
  ON attendance_records (attendance_month_id, employee_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS attendance_records_employee_month_idx
  ON attendance_records (employee_id, payroll_month);
CREATE INDEX IF NOT EXISTS attendance_records_month_idx ON attendance_records (attendance_month_id);
CREATE INDEX IF NOT EXISTS attendance_records_project_idx ON attendance_records (project_id);

CREATE TABLE IF NOT EXISTS attendance_record_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id uuid REFERENCES attendance_records (id) ON DELETE RESTRICT,
  employee_id          uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  payroll_month        char(7) NOT NULL,
  action               text NOT NULL CHECK (action IN ('CREATED','CORRECTED','VOIDED')),
  previous_value       jsonb,
  new_value            jsonb,
  reason               text,
  changed_by           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_record_history_record_idx
  ON attendance_record_history (attendance_record_id);
COMMENT ON TABLE attendance_record_history IS
  'Corrections never overwrite silently: the original row is retained and the change is recorded here with before/after, actor and reason.';

CREATE TABLE IF NOT EXISTS attendance_approval_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_month_id uuid NOT NULL REFERENCES attendance_months (id) ON DELETE RESTRICT,
  from_status         text,
  to_status           text NOT NULL,
  actor               text,
  reason              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_approval_history_month_idx
  ON attendance_approval_history (attendance_month_id, created_at);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payroll_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month char(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status        text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','PREVIEW','APPROVED','FINALIZED','IN_REVISION')),
  attendance_month_id uuid REFERENCES attendance_months (id) ON DELETE RESTRICT,
  total_employees          integer NOT NULL DEFAULT 0 CHECK (total_employees >= 0),
  total_gross_salary       numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_gross_salary >= 0),
  total_additions          numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_additions >= 0),
  total_deductions         numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  total_net_salary         numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_net_salary >= 0),
  total_wps_salary         numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_wps_salary >= 0),
  total_recoverable_salary numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_recoverable_salary >= 0),
  total_overtime_pay       numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_overtime_pay >= 0),
  revision_number integer NOT NULL DEFAULT 0 CHECK (revision_number >= 0),
  calculated_at  timestamptz,
  approved_by    text, approved_at  timestamptz,
  finalized_by   text, finalized_at timestamptz,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- One payroll run per month: duplicate runs were previously possible.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_month_key ON payroll_runs (payroll_month);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  uuid NOT NULL REFERENCES payroll_runs (id) ON DELETE RESTRICT,
  employee_id     uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  payroll_month   char(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Snapshot of employee master AS AT calculation time. Deliberately denormalised:
  -- a payslip must render identically in five years even if the employee is renamed,
  -- moved to another company or promoted.
  employee_code       text NOT NULL,
  employee_name       text NOT NULL,
  employee_type       text NOT NULL,
  nationality_type    text NOT NULL,
  wage_type           text NOT NULL,
  designation         text,
  company_code        text NOT NULL REFERENCES companies (code) ON DELETE RESTRICT,
  salary_paid_by      text REFERENCES companies (code) ON DELETE RESTRICT,
  projects_summary    text,
  days_worked         numeric(6,2) NOT NULL DEFAULT 0 CHECK (days_worked >= 0),
  hours_worked        numeric(8,2) NOT NULL DEFAULT 0 CHECK (hours_worked >= 0),
  basic_salary_or_rate numeric(14,3) NOT NULL DEFAULT 0 CHECK (basic_salary_or_rate >= 0),
  rate_overridden     boolean NOT NULL DEFAULT false,
  master_rate         numeric(14,3),
  gross_salary        numeric(14,3) NOT NULL DEFAULT 0 CHECK (gross_salary >= 0),
  overtime_hours      numeric(8,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  overtime_rate       numeric(14,3) NOT NULL DEFAULT 0 CHECK (overtime_rate >= 0),
  overtime_pay        numeric(14,3) NOT NULL DEFAULT 0 CHECK (overtime_pay >= 0),
  attendance_bonus    numeric(14,3) NOT NULL DEFAULT 0 CHECK (attendance_bonus >= 0),
  attendance_deduction numeric(14,3) NOT NULL DEFAULT 0 CHECK (attendance_deduction >= 0),
  paid_leave_days     numeric(6,2) NOT NULL DEFAULT 0 CHECK (paid_leave_days >= 0),
  unpaid_leave_days   numeric(6,2) NOT NULL DEFAULT 0 CHECK (unpaid_leave_days >= 0),
  house_allowance     numeric(14,3) NOT NULL DEFAULT 0 CHECK (house_allowance >= 0),
  transport_allowance numeric(14,3) NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  bonus               numeric(14,3) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  other_allowance     numeric(14,3) NOT NULL DEFAULT 0 CHECK (other_allowance >= 0),
  total_additions     numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_additions >= 0),
  loan_recovery       numeric(14,3) NOT NULL DEFAULT 0 CHECK (loan_recovery >= 0),
  other_deductions    numeric(14,3) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  total_deductions    numeric(14,3) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  net_salary          numeric(14,3) NOT NULL DEFAULT 0 CHECK (net_salary >= 0),
  payment_method      text NOT NULL DEFAULT 'Non-WPS' CHECK (payment_method IN ('WPS','Non-WPS')),
  wps_employee        text NOT NULL DEFAULT 'No' CHECK (wps_employee IN ('Yes','No')),
  wps_salary          numeric(14,3) NOT NULL DEFAULT 0 CHECK (wps_salary >= 0),
  recoverable_salary  numeric(14,3) NOT NULL DEFAULT 0 CHECK (recoverable_salary >= 0),
  recover_from        text,
  calculation_version text NOT NULL DEFAULT 'v1',
  calculated_at       timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- One line per employee per run: duplicate payroll lines were previously possible.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_lines_run_employee_key
  ON payroll_lines (payroll_run_id, employee_id);
CREATE INDEX IF NOT EXISTS payroll_lines_employee_month_idx ON payroll_lines (employee_id, payroll_month);
CREATE INDEX IF NOT EXISTS payroll_lines_run_idx ON payroll_lines (payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_lines_company_idx ON payroll_lines (company_code);

-- The lineage table: what each payroll figure was actually derived from.
CREATE TABLE IF NOT EXISTS payroll_line_inputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id uuid NOT NULL REFERENCES payroll_lines (id) ON DELETE RESTRICT,
  input_type      text NOT NULL CHECK (input_type IN
                    ('ATTENDANCE','LEAVE','LOAN','SALARY_MASTER','OVERTIME','MANUAL_OVERRIDE')),
  source_table    text,
  source_record_id uuid,
  quantity        numeric(12,3),
  rate            numeric(14,3),
  amount          numeric(14,3),
  snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_line_inputs_line_idx ON payroll_line_inputs (payroll_line_id);
CREATE INDEX IF NOT EXISTS payroll_line_inputs_source_idx ON payroll_line_inputs (source_table, source_record_id);
COMMENT ON TABLE payroll_line_inputs IS
  'Every figure on a payroll line points back to the exact records that produced it, plus a snapshot of the values used. This is what makes a six-month-old payroll explainable without recalculating it from today''s master data.';

CREATE TABLE IF NOT EXISTS payroll_line_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id uuid NOT NULL REFERENCES payroll_lines (id) ON DELETE RESTRICT,
  field           text NOT NULL,
  previous_value  text,
  new_value       text,
  reason          text,
  changed_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_line_history_line_idx ON payroll_line_history (payroll_line_id, created_at);

CREATE TABLE IF NOT EXISTS payroll_approval_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES payroll_runs (id) ON DELETE RESTRICT,
  from_status    text,
  to_status      text NOT NULL,
  actor          text,
  reason         text,
  override_used  boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_approval_history_run_idx ON payroll_approval_history (payroll_run_id, created_at);

CREATE TABLE IF NOT EXISTS payroll_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  uuid NOT NULL REFERENCES payroll_runs (id) ON DELETE RESTRICT,
  payroll_month   char(7) NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number >= 0),
  revision_date   timestamptz NOT NULL DEFAULT now(),
  revised_by      text,
  reason          text NOT NULL,
  previous_gross  numeric(14,3) NOT NULL DEFAULT 0,
  previous_net    numeric(14,3) NOT NULL DEFAULT 0,
  new_gross       numeric(14,3) NOT NULL DEFAULT 0,
  new_net         numeric(14,3) NOT NULL DEFAULT 0,
  snapshot_lines  jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_revisions_run_number_key
  ON payroll_revisions (payroll_run_id, revision_number);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS salary_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_line_id uuid REFERENCES payroll_lines (id) ON DELETE RESTRICT,
  employee_id     uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  payroll_month   char(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount          numeric(14,3) NOT NULL CHECK (amount > 0),
  payment_date    date NOT NULL,
  payment_mode    text,
  bank_name       text,
  pay_to          text,
  reference_number text,
  receipt_object_path text,
  receipt_file_name   text,
  status          text NOT NULL DEFAULT 'SUCCESS'
                  CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED','REVERSED','CANCELLED')),
  failure_reason  text,
  failed_at       timestamptz,
  remarks         text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salary_payments_line_idx ON salary_payments (payroll_line_id);
CREATE INDEX IF NOT EXISTS salary_payments_employee_month_idx ON salary_payments (employee_id, payroll_month);
CREATE INDEX IF NOT EXISTS salary_payments_status_idx ON salary_payments (status);
-- A reference number, where given, must be unique per month to catch the same
-- bank transfer being entered twice.
CREATE UNIQUE INDEX IF NOT EXISTS salary_payments_reference_key
  ON salary_payments (payroll_month, upper(reference_number))
  WHERE reference_number IS NOT NULL AND reference_number <> '';

CREATE TABLE IF NOT EXISTS payment_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES salary_payments (id) ON DELETE RESTRICT,
  from_status text,
  to_status   text NOT NULL,
  reason      text,
  actor       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_status_history_payment_idx
  ON payment_status_history (payment_id, created_at);
COMMENT ON TABLE payment_status_history IS
  'Payment status is a stored, append-only fact. It is never re-derived from today''s payroll figure, so revising a line cannot rewrite payment history.';

CREATE TABLE IF NOT EXISTS payment_reversals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          uuid NOT NULL REFERENCES salary_payments (id) ON DELETE RESTRICT,
  reversed_amount     numeric(14,3) NOT NULL CHECK (reversed_amount > 0),
  reason              text NOT NULL,
  reversed_by         text,
  reversed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_reversals_payment_key ON payment_reversals (payment_id);

CREATE TABLE IF NOT EXISTS payment_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid REFERENCES payroll_runs (id) ON DELETE RESTRICT,
  payroll_month  char(7) NOT NULL,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_plans_month_key ON payment_plans (payroll_month);

CREATE TABLE IF NOT EXISTS payment_plan_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id uuid NOT NULL REFERENCES payment_plans (id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  payroll_line_id uuid REFERENCES payroll_lines (id) ON DELETE RESTRICT,
  planned_amount  numeric(14,3) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  remarks         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_plan_lines_plan_employee_key
  ON payment_plan_lines (payment_plan_id, employee_id);

-- ---------------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS loans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  loan_amount       numeric(14,3) NOT NULL CHECK (loan_amount > 0),
  loan_date         date NOT NULL,
  monthly_deduction numeric(14,3) NOT NULL DEFAULT 0 CHECK (monthly_deduction >= 0),
  purpose           text,
  status            text NOT NULL DEFAULT 'Active'
                    CHECK (status IN ('Active','Closed','Cancelled','On Hold')),
  remarks           text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loans_employee_idx ON loans (employee_id, status);

CREATE TABLE IF NOT EXISTS loan_recoveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         uuid NOT NULL REFERENCES loans (id) ON DELETE RESTRICT,
  employee_id     uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  payroll_line_id uuid REFERENCES payroll_lines (id) ON DELETE RESTRICT,
  payroll_month   char(7),
  source          text NOT NULL DEFAULT 'Payroll Deduction'
                  CHECK (source IN ('Payroll Deduction','Direct Payment','Adjustment')),
  amount          numeric(14,3) NOT NULL CHECK (amount > 0),
  recovery_date   date NOT NULL,
  reference_number text,
  remarks         text,
  is_reversed     boolean NOT NULL DEFAULT false,
  reversed_at     timestamptz,
  reversed_by     text,
  reversal_reason text,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loan_recoveries_loan_idx ON loan_recoveries (loan_id);
-- A payroll run may only post one recovery per loan per month.
CREATE UNIQUE INDEX IF NOT EXISTS loan_recoveries_payroll_once
  ON loan_recoveries (loan_id, payroll_month)
  WHERE source = 'Payroll Deduction' AND payroll_month IS NOT NULL AND NOT is_reversed;

-- ---------------------------------------------------------------------------
-- WPS recovery
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wps_recoveries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  payroll_run_id    uuid REFERENCES payroll_runs (id) ON DELETE RESTRICT,
  payroll_line_id   uuid REFERENCES payroll_lines (id) ON DELETE RESTRICT,
  payroll_month     char(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  wps_salary        numeric(14,3) NOT NULL DEFAULT 0 CHECK (wps_salary >= 0),
  net_salary        numeric(14,3) NOT NULL DEFAULT 0 CHECK (net_salary >= 0),
  recoverable_amount numeric(14,3) NOT NULL DEFAULT 0 CHECK (recoverable_amount >= 0),
  recover_from      text REFERENCES companies (code) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Partially Recovered','Recovered','Written Off')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wps_recoveries_employee_month_key
  ON wps_recoveries (employee_id, payroll_month);

CREATE TABLE IF NOT EXISTS wps_recovery_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wps_recovery_id  uuid NOT NULL REFERENCES wps_recoveries (id) ON DELETE RESTRICT,
  employee_id      uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  amount           numeric(14,3) NOT NULL CHECK (amount > 0),
  recovery_date    date NOT NULL,
  recovery_mode    text,
  reference_number text,
  remarks          text,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wps_recovery_transactions_recovery_idx
  ON wps_recovery_transactions (wps_recovery_id);

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  leave_type_id uuid NOT NULL REFERENCES leave_types (id) ON DELETE RESTRICT,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  days          numeric(6,2) NOT NULL CHECK (days > 0),
  is_paid       boolean NOT NULL DEFAULT true,
  reason        text,
  status        text NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft','Submitted','Approved','Rejected','Cancelled')),
  submitted_by  text, submitted_at timestamptz,
  decided_by    text, decided_at   timestamptz, decision_reason text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS leave_requests_employee_idx ON leave_requests (employee_id, start_date);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests (status);

-- ---------------------------------------------------------------------------
-- CIF (bank file reconciliation)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cif_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code   text NOT NULL REFERENCES companies (code) ON DELETE RESTRICT,
  payroll_month  char(7) NOT NULL,
  payroll_run_id uuid REFERENCES payroll_runs (id) ON DELETE RESTRICT,
  cif_file_type  text,
  status         text NOT NULL DEFAULT 'Uploaded'
                 CHECK (status IN ('Uploaded','Validated','Previewed','Processed','Reconciled','Complete')),
  payroll_total  numeric(14,3) NOT NULL DEFAULT 0,
  cif_total      numeric(14,3) NOT NULL DEFAULT 0,
  variance       numeric(14,3) NOT NULL DEFAULT 0,
  valid_count     integer NOT NULL DEFAULT 0,
  invalid_count   integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  override_used   boolean NOT NULL DEFAULT false,
  override_reason text,
  override_by     text,
  uploaded_by    text,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  processed_by   text, processed_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cif_batches_month_idx ON cif_batches (payroll_month, company_code);

CREATE TABLE IF NOT EXISTS cif_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL REFERENCES cif_batches (id) ON DELETE CASCADE,
  employee_id       uuid REFERENCES employees (id) ON DELETE RESTRICT,
  employee_code     text,
  account_reference text,
  amount            numeric(14,3) NOT NULL DEFAULT 0,
  reference         text,
  status            text NOT NULL DEFAULT 'Valid' CHECK (status IN ('Valid','Invalid','Duplicate')),
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cif_records_batch_idx ON cif_records (batch_id);

-- ---------------------------------------------------------------------------
-- Audit trail — real append-only table, no cap
-- ---------------------------------------------------------------------------

SELECT hcms_to_uuid('audit_logs', 'id');
ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
SELECT hcms_to_uuid('audit_logs', 'user_id');
ALTER TABLE audit_logs ALTER COLUMN username TYPE text;
ALTER TABLE audit_logs ALTER COLUMN user_role TYPE text;
ALTER TABLE audit_logs ALTER COLUMN action TYPE text;
ALTER TABLE audit_logs ALTER COLUMN module TYPE text;
ALTER TABLE audit_logs ALTER COLUMN record_id TYPE text;
ALTER TABLE audit_logs ALTER COLUMN ip_address TYPE text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_value jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE audit_logs ALTER COLUMN "timestamp" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_module_idx ON audit_logs (module, "timestamp" DESC);
COMMENT ON TABLE audit_logs IS
  'Append-only. Enforced by trigger, not convention. No retention cap: the previous in-document array silently dropped its oldest 5000th entry.';

-- ---------------------------------------------------------------------------
-- Schema version marker
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  description text
);
INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Relational core: master data, employees, attendance, payroll, payments, loans, WPS, leave, CIF, audit')
ON CONFLICT (version) DO NOTHING;
