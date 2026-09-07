-- ============================================================================
-- HCMS 000 — Legacy baseline (documentation + rehearsal only)
--
-- This is the schema that already exists in production, reproduced verbatim so
-- that migrations 001+ can be rehearsed from an identical starting point on a
-- throwaway database. It is NEVER run against production, where these objects
-- already exist. Eight of these tables are empty and unused by any code; 001
-- alters them into shape rather than dropping them.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_state (
  id varchar PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

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
