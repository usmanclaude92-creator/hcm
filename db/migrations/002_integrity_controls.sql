-- ============================================================================
-- HCMS 002 — Integrity controls
--
-- Rules that must hold regardless of which process writes the row, so they are
-- enforced by the database rather than by application convention.
--
-- Controlled overrides: a legitimate correction path (a payroll revision, an
-- authorised attendance correction) sets a transaction-local flag:
--
--     SET LOCAL hcms.allow_locked_write = 'on';
--
-- The flag is transaction-scoped, so it cannot leak into another statement or
-- another request, and every override still has to write its own history row.
-- ============================================================================

CREATE OR REPLACE FUNCTION hcms_locked_write_allowed() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('hcms.allow_locked_write', true), 'off') = 'on';
$$;

-- --- Append-only tables -----------------------------------------------------

CREATE OR REPLACE FUNCTION hcms_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_logs','payment_status_history','payment_reversals',
    'attendance_record_history','attendance_approval_history',
    'payroll_line_history','payroll_approval_history','payroll_revisions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_append_only', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION hcms_append_only()',
      t || '_append_only', t);
  END LOOP;
END $$;

-- --- Finalized payroll is immutable ----------------------------------------

CREATE OR REPLACE FUNCTION hcms_payroll_line_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE run_status text;
BEGIN
  SELECT status INTO run_status FROM payroll_runs
   WHERE id = coalesce(NEW.payroll_run_id, OLD.payroll_run_id);

  IF TG_OP = 'DELETE' AND NOT hcms_locked_write_allowed() THEN
    RAISE EXCEPTION 'Payroll lines are not deletable; revise the run instead'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF run_status = 'FINALIZED' AND NOT hcms_locked_write_allowed() THEN
    RAISE EXCEPTION 'Payroll % is FINALIZED: line cannot be changed without a revision',
      (SELECT payroll_month FROM payroll_runs WHERE id = coalesce(NEW.payroll_run_id, OLD.payroll_run_id))
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- A line always belongs to the month of its run.
  IF TG_OP <> 'DELETE' THEN
    IF NEW.payroll_month <> (SELECT payroll_month FROM payroll_runs WHERE id = NEW.payroll_run_id) THEN
      RAISE EXCEPTION 'Payroll line month % does not match its run', NEW.payroll_month
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS payroll_lines_guard ON payroll_lines;
CREATE TRIGGER payroll_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_lines
  FOR EACH ROW EXECUTE FUNCTION hcms_payroll_line_guard();

CREATE OR REPLACE FUNCTION hcms_payroll_run_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payroll runs are not deletable' USING ERRCODE = 'restrict_violation';
  END IF;
  -- FINALIZED may only move to IN_REVISION, and only through the revision path.
  IF OLD.status = 'FINALIZED' AND NEW.status = 'FINALIZED'
     AND NOT hcms_locked_write_allowed()
     AND (OLD.total_net_salary, OLD.total_gross_salary) IS DISTINCT FROM
         (NEW.total_net_salary, NEW.total_gross_salary) THEN
    RAISE EXCEPTION 'Finalized payroll totals cannot be edited in place'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'FINALIZED' AND NEW.status NOT IN ('FINALIZED','IN_REVISION') THEN
    RAISE EXCEPTION 'FINALIZED payroll may only move to IN_REVISION, not %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payroll_runs_guard ON payroll_runs;
CREATE TRIGGER payroll_runs_guard
  BEFORE UPDATE OR DELETE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION hcms_payroll_run_guard();

-- Lineage rows are facts about a completed calculation.
CREATE OR REPLACE FUNCTION hcms_payroll_inputs_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT hcms_locked_write_allowed() THEN
    RAISE EXCEPTION 'payroll_line_inputs is append-only outside a recalculation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS payroll_line_inputs_guard ON payroll_line_inputs;
CREATE TRIGGER payroll_line_inputs_guard
  BEFORE UPDATE OR DELETE ON payroll_line_inputs
  FOR EACH ROW EXECUTE FUNCTION hcms_payroll_inputs_guard();

-- --- Approved attendance cannot drift under a payroll ----------------------

CREATE OR REPLACE FUNCTION hcms_attendance_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE month_status text; month_of_parent char(7);
BEGIN
  SELECT status, payroll_month INTO month_status, month_of_parent
    FROM attendance_months
   WHERE id = coalesce(NEW.attendance_month_id, OLD.attendance_month_id);

  IF TG_OP <> 'INSERT' AND month_status IN ('APPROVED','FINALIZED')
     AND NOT hcms_locked_write_allowed() THEN
    RAISE EXCEPTION 'Attendance for % is % and cannot be changed without a correction',
      month_of_parent, month_status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF month_status = 'FINALIZED' AND NOT hcms_locked_write_allowed() THEN
      RAISE EXCEPTION 'Attendance for % is FINALIZED', month_of_parent
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.payroll_month <> month_of_parent THEN
      RAISE EXCEPTION 'Attendance row month % does not match its attendance month %',
        NEW.payroll_month, month_of_parent
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS attendance_records_guard ON attendance_records;
CREATE TRIGGER attendance_records_guard
  BEFORE INSERT OR UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION hcms_attendance_guard();

-- --- Payments are immutable financial events -------------------------------

CREATE OR REPLACE FUNCTION hcms_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE line_net numeric(14,3); already_paid numeric(14,3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments are never deleted; reverse the payment instead'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.amount, OLD.payment_date, OLD.employee_id, OLD.payroll_line_id, OLD.payroll_month)
       IS DISTINCT FROM
       (NEW.amount, NEW.payment_date, NEW.employee_id, NEW.payroll_line_id, NEW.payroll_month)
       AND NOT hcms_locked_write_allowed() THEN
      RAISE EXCEPTION 'A recorded payment''s amount, date, employee or payroll line cannot be altered'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT: a payment may not exceed what the payroll line actually owes.
  IF NEW.payroll_line_id IS NOT NULL AND NEW.status IN ('PENDING','PROCESSING','SUCCESS') THEN
    SELECT net_salary INTO line_net FROM payroll_lines WHERE id = NEW.payroll_line_id;
    SELECT coalesce(sum(amount), 0) INTO already_paid
      FROM salary_payments
     WHERE payroll_line_id = NEW.payroll_line_id
       AND status IN ('PENDING','PROCESSING','SUCCESS');
    IF line_net IS NOT NULL AND already_paid + NEW.amount > line_net
       AND NOT hcms_locked_write_allowed() THEN
      RAISE EXCEPTION
        'Payment of % would take total paid to % against a net entitlement of % for this payroll line',
        NEW.amount, already_paid + NEW.amount, line_net
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS salary_payments_guard ON salary_payments;
CREATE TRIGGER salary_payments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON salary_payments
  FOR EACH ROW EXECUTE FUNCTION hcms_payment_guard();

-- --- WPS recovery may not exceed what is recoverable ------------------------

CREATE OR REPLACE FUNCTION hcms_wps_transaction_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE recoverable numeric(14,3); recovered numeric(14,3);
BEGIN
  IF TG_OP <> 'INSERT' AND NOT hcms_locked_write_allowed() THEN
    RAISE EXCEPTION 'WPS recovery transactions are append-only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT recoverable_amount INTO recoverable FROM wps_recoveries WHERE id = NEW.wps_recovery_id;
    SELECT coalesce(sum(amount), 0) INTO recovered
      FROM wps_recovery_transactions WHERE wps_recovery_id = NEW.wps_recovery_id;
    IF recoverable IS NOT NULL AND recovered + NEW.amount > recoverable
       AND NOT hcms_locked_write_allowed() THEN
      RAISE EXCEPTION 'WPS recovery of % exceeds the remaining recoverable balance of %',
        NEW.amount, recoverable - recovered
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS wps_recovery_transactions_guard ON wps_recovery_transactions;
CREATE TRIGGER wps_recovery_transactions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON wps_recovery_transactions
  FOR EACH ROW EXECUTE FUNCTION hcms_wps_transaction_guard();

-- --- Loan recovery may not exceed the loan ---------------------------------

CREATE OR REPLACE FUNCTION hcms_loan_recovery_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE principal numeric(14,3); recovered numeric(14,3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Loan recoveries are never deleted; reverse them instead'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT loan_amount INTO principal FROM loans WHERE id = NEW.loan_id;
    SELECT coalesce(sum(amount), 0) INTO recovered
      FROM loan_recoveries WHERE loan_id = NEW.loan_id AND NOT is_reversed;
    IF principal IS NOT NULL AND recovered + NEW.amount > principal
       AND NOT hcms_locked_write_allowed() THEN
      RAISE EXCEPTION 'Loan recovery of % exceeds the outstanding balance of %',
        NEW.amount, principal - recovered
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS loan_recoveries_guard ON loan_recoveries;
CREATE TRIGGER loan_recoveries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON loan_recoveries
  FOR EACH ROW EXECUTE FUNCTION hcms_loan_recovery_guard();

-- --- Reconciliation view ----------------------------------------------------

CREATE OR REPLACE VIEW payroll_payment_reconciliation AS
SELECT
  pl.id                       AS payroll_line_id,
  pl.payroll_month,
  pl.company_code,
  pl.employee_code,
  pl.employee_name,
  pl.net_salary               AS liability,
  coalesce(pp.planned_amount, 0) AS planned,
  coalesce(paid.total, 0)     AS paid,
  coalesce(rev.total, 0)      AS reversed,
  pl.net_salary - coalesce(paid.total, 0) AS outstanding,
  CASE
    WHEN pl.net_salary = 0                          THEN 'No Payable'
    WHEN coalesce(paid.total, 0) = 0                THEN 'Unpaid'
    WHEN coalesce(paid.total, 0) >= pl.net_salary   THEN 'Fully Paid'
    ELSE 'Partially Paid'
  END AS payment_status
FROM payroll_lines pl
LEFT JOIN LATERAL (
  SELECT sum(amount) AS total FROM salary_payments sp
   WHERE sp.payroll_line_id = pl.id AND sp.status IN ('SUCCESS','PENDING','PROCESSING')
) paid ON true
LEFT JOIN LATERAL (
  SELECT sum(amount) AS total FROM salary_payments sp
   WHERE sp.payroll_line_id = pl.id AND sp.status = 'REVERSED'
) rev ON true
LEFT JOIN payment_plan_lines pp ON pp.payroll_line_id = pl.id;

COMMENT ON VIEW payroll_payment_reconciliation IS
  'Liability vs plan vs actual payments vs outstanding, derived from stored payment rows and their stored statuses.';

INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Integrity controls: append-only audit, finalized payroll and approved attendance locks, payment/loan/WPS ceilings, reconciliation view')
ON CONFLICT (version) DO NOTHING;
