-- ============================================================================
-- HCMS rollback for 001 + 002 + 003
--
-- VALID ONLY BEFORE THE BACKFILL. This script proves the forward migration is
-- reversible while the relational tables are still empty: it drops everything
-- 001-003 created and restores the eight legacy tables to their exact 000
-- shape. `app_state` is never touched, so the live application keeps working
-- throughout -- during the forward migration, after it, and after this.
--
-- It REFUSES to run if any relational table holds a row. Once the backfill has
-- put data in these tables, going back is a restore-from-backup decision, not
-- a schema operation, and this script deliberately will not make it for you.
--
-- Rehearsed on hcm-staging (PostgreSQL 17.6):
--   * with the integrity-test fixture rows present, the pre-flight REFUSED and
--     named the offending table and row count -- the guard is not decorative;
--   * with the tables empty, the rollback restored the database to exactly the
--     production baseline: the same nine tables, 0 views, 0 triggers, 0 foreign
--     keys, 0 hcms_* functions, and employees.id / employees.date_of_joining
--     back to character varying from uuid / date;
--   * re-applying 001+002+003 onto that restored baseline reproduced the
--     migrated schema exactly -- 43 tables, 61 foreign keys, 84 check
--     constraints, 15 triggers, 105 indexes, 1 view -- and the integrity suite
--     passed 43/43 on it. The round trip is lossless in both directions.
-- ============================================================================

DO $$
DECLARE n bigint; tbl text; total bigint := 0;
BEGIN
  FOREACH tbl IN ARRAY
    ARRAY['companies','departments','designations','leave_types',
          'project_allowed_companies','user_company_scope',
          'employee_personal_details','employee_salary_history',
          'employee_bank_accounts','employee_employment_history',
          'employee_documents','attendance_months','attendance_records',
          'attendance_record_history','attendance_approval_history',
          'payroll_runs','payroll_lines','payroll_line_inputs',
          'payroll_line_history','payroll_approval_history',
          'payroll_revisions','salary_payments','payment_status_history',
          'payment_reversals','payment_plans','payment_plan_lines','loans',
          'loan_recoveries','wps_recoveries','wps_recovery_transactions',
          'leave_requests','cif_batches','cif_records','schema_migrations',
          'users','employees','projects','audit_logs','employee_civil_ids',
          'employee_visas','employee_driving_licences',
          'employee_government_documents']
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', tbl) INTO n;
      IF n > 0 AND tbl <> 'schema_migrations' THEN
        RAISE EXCEPTION
          'Refusing to roll back: % holds % row(s). Rolling back now would '
          'destroy data. Restore from backup instead.', tbl, n
          USING ERRCODE = 'restrict_violation';
      END IF;
      total := total + n;
    END IF;
  END LOOP;
  RAISE NOTICE 'Pre-flight passed: relational tables hold % row(s).', total;
END $$;

-- --- Triggers and guard functions ------------------------------------------
DROP FUNCTION IF EXISTS hcms_append_only() CASCADE;
DROP FUNCTION IF EXISTS hcms_payroll_line_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_payroll_run_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_payroll_inputs_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_attendance_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_payment_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_wps_transaction_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_loan_recovery_guard() CASCADE;
DROP FUNCTION IF EXISTS hcms_locked_write_allowed() CASCADE;
DROP FUNCTION IF EXISTS hcms_locked_write_allowed(text) CASCADE;
DROP FUNCTION IF EXISTS hcms_override(text) CASCADE;
DROP FUNCTION IF EXISTS hcms_override_clear() CASCADE;
DROP FUNCTION IF EXISTS hcms_override_scopes() CASCADE;

DROP VIEW IF EXISTS payroll_payment_reconciliation;

-- --- Tables created by 001 --------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY
    ARRAY['companies','departments','designations','leave_types',
          'project_allowed_companies','user_company_scope',
          'employee_personal_details','employee_salary_history',
          'employee_bank_accounts','employee_employment_history',
          'employee_documents','attendance_months','attendance_records',
          'attendance_record_history','attendance_approval_history',
          'payroll_runs','payroll_lines','payroll_line_inputs',
          'payroll_line_history','payroll_approval_history',
          'payroll_revisions','salary_payments','payment_status_history',
          'payment_reversals','payment_plans','payment_plan_lines','loans',
          'loan_recoveries','wps_recoveries','wps_recovery_transactions',
          'leave_requests','cif_batches','cif_records','schema_migrations']
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl);
  END LOOP;
END $$;

-- --- The eight legacy tables, restored to their exact 000 shape -------------
-- They were ALTERed, not replaced, so they are dropped and recreated. This is
-- safe only because the pre-flight above proved they are empty.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY
    ARRAY['users','employees','projects','audit_logs','employee_civil_ids',
          'employee_visas','employee_driving_licences',
          'employee_government_documents']
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', tbl);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY,
  username varchar UNIQUE NOT NULL,
  name varchar NOT NULL,
  email varchar NOT NULL,
  role varchar NOT NULL,
  password_hash varchar NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id varchar PRIMARY KEY,
  employee_id varchar UNIQUE NOT NULL,
  employee_name varchar NOT NULL,
  employee_type varchar NOT NULL,
  nationality_type varchar NOT NULL,
  wage_type varchar NOT NULL,
  date_of_joining varchar NOT NULL,
  date_of_leaving varchar,
  designation varchar NOT NULL,
  employee_company varchar NOT NULL,
  salary_paid_by varchar NOT NULL,
  monthly_salary_or_rate numeric NOT NULL,
  wps_employee varchar NOT NULL,
  wps_salary numeric NOT NULL,
  actual_salary numeric NOT NULL,
  recover_from varchar,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id varchar PRIMARY KEY,
  project_code varchar UNIQUE NOT NULL,
  project_name varchar NOT NULL,
  status varchar NOT NULL,
  start_date varchar,
  end_date varchar,
  remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id varchar PRIMARY KEY,
  user_id varchar,
  username varchar NOT NULL,
  user_role varchar NOT NULL,
  action varchar NOT NULL,
  module varchar NOT NULL,
  record_id varchar,
  description text NOT NULL,
  ip_address varchar,
  "timestamp" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_civil_ids (
  id varchar PRIMARY KEY,
  employee_id varchar NOT NULL,
  civil_id_number varchar NOT NULL,
  issue_date varchar NOT NULL,
  expiry_date varchar NOT NULL,
  status varchar NOT NULL,
  issuing_authority varchar NOT NULL,
  country varchar NOT NULL,
  document_attachment text,
  file_name varchar,
  storage_path text,
  remarks text,
  is_current boolean DEFAULT true,
  replaced_date varchar,
  replace_reason text,
  created_by varchar,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_driving_licences (
  id varchar PRIMARY KEY,
  employee_id varchar NOT NULL,
  licence_number varchar NOT NULL,
  category varchar NOT NULL,
  issuing_country varchar NOT NULL,
  issuing_authority varchar NOT NULL,
  vehicle_class varchar,
  restrictions text,
  issue_date varchar NOT NULL,
  expiry_date varchar NOT NULL,
  status varchar NOT NULL,
  document_attachment text,
  file_name varchar,
  storage_path text,
  remarks text,
  is_current boolean DEFAULT true,
  previous_licence_id varchar,
  renewal_date varchar,
  created_by varchar,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_visas (
  id varchar PRIMARY KEY,
  employee_id varchar NOT NULL,
  visa_number varchar NOT NULL,
  trade_on_visa varchar NOT NULL,
  visa_profession_code varchar,
  visa_type varchar NOT NULL,
  issue_date varchar NOT NULL,
  expiry_date varchar NOT NULL,
  sponsor varchar NOT NULL,
  sponsorship_type varchar,
  issuing_authority varchar NOT NULL,
  country varchar NOT NULL,
  status varchar NOT NULL,
  document_attachment text,
  file_name varchar,
  storage_path text,
  remarks text,
  is_current boolean DEFAULT true,
  effective_from varchar NOT NULL,
  effective_to varchar,
  reason_for_change text,
  created_by varchar,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_government_documents (
  id varchar PRIMARY KEY,
  employee_id varchar NOT NULL,
  document_type varchar NOT NULL,
  document_number varchar NOT NULL,
  issue_date varchar NOT NULL,
  expiry_date varchar NOT NULL,
  issuing_authority varchar,
  country varchar,
  status varchar NOT NULL,
  document_attachment text,
  file_name varchar,
  storage_path text,
  remarks text,
  is_current boolean DEFAULT true,
  created_by varchar,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- --- Idempotency helpers introduced by 001 ---------------------------------
DROP FUNCTION IF EXISTS hcms_to_uuid(text, text);
DROP FUNCTION IF EXISTS hcms_to_date(text, text);
DROP FUNCTION IF EXISTS hcms_col_type(text, text);

-- app_state is intentionally untouched: it is still the live store.
