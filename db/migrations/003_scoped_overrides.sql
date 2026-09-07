-- ============================================================================
-- HCMS 003 — Scoped, single-purpose integrity overrides
--
-- WHY THIS EXISTS
--
-- 002 introduced one global override switch:
--
--     SET LOCAL hcms.allow_locked_write = 'on';
--
-- and its header claimed the flag "cannot leak into another statement". That is
-- false, and staging proved it. SET LOCAL is TRANSACTION-scoped, not
-- STATEMENT-scoped. Under psql autocommit each statement is its own
-- transaction, so the leak is invisible; under a pooled connection that runs a
-- request inside one transaction -- which is how the application actually talks
-- to PostgreSQL -- the flag stays on for every subsequent statement.
--
-- Evidence, from the 002 integrity run against Supabase PostgreSQL 17.6
-- (project hcm-staging), all statements in one transaction:
--
--   assertion 27  authorised attendance correction   -> sets the flag
--   assertion 28  edit a FINALIZED payroll line      -> ALLOWED (net 630 -> 999)
--   assertion 29  delete a payroll line              -> trigger allowed it;
--                                                       only an FK stopped it
--   assertion 34  loan recovery beyond the principal -> ALLOWED (350 of a 300 loan)
--
-- One attendance correction therefore disarmed every financial control for the
-- rest of the request. The controls in 002 were not wrong; the key that opens
-- them was a master key.
--
-- THE FIX
--
-- The override is now a named scope, and each guard accepts only its own scope.
-- An attendance correction cannot authorise a payroll edit, and a payroll
-- revision cannot authorise a loan over-recovery, even inside one transaction.
--
--     SELECT hcms_override('attendance_correction');
--     UPDATE attendance_records ...;
--     SELECT hcms_override_clear();          -- callers must still clear
--
-- hcms_override() rejects unknown scopes, so a typo fails closed rather than
-- opening nothing silently. The old zero-argument hcms_locked_write_allowed()
-- is dropped rather than left in place: any caller missed by this migration
-- must fail loudly instead of inheriting a master key.
-- ============================================================================

CREATE OR REPLACE FUNCTION hcms_override_scopes() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['attendance_correction','payroll_revision','payroll_recalculation',
               'payment_correction','loan_adjustment','wps_adjustment']
$$;

CREATE OR REPLACE FUNCTION hcms_override(p_scope text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (p_scope = ANY (hcms_override_scopes())) THEN
    RAISE EXCEPTION 'Unknown integrity override scope %; expected one of %',
      p_scope, array_to_string(hcms_override_scopes(), ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('hcms.allow_locked_write', p_scope, true);
END $$;
COMMENT ON FUNCTION hcms_override(text) IS
  'Opens exactly one class of locked write for the rest of the transaction. '
  'Pair every call with hcms_override_clear() as soon as the write is done.';

CREATE OR REPLACE FUNCTION hcms_override_clear() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('hcms.allow_locked_write', 'off', true);
END $$;

CREATE OR REPLACE FUNCTION hcms_locked_write_allowed(p_scope text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('hcms.allow_locked_write', true), 'off') = p_scope;
$$;
COMMENT ON FUNCTION hcms_locked_write_allowed(text) IS
  'True only when the transaction opened THIS scope. A scope opened for one '
  'control never satisfies another.';

-- --- Guards re-pointed at their own scope ----------------------------------

CREATE OR REPLACE FUNCTION hcms_payroll_line_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE run_status text; allowed boolean;
BEGIN
  allowed := hcms_locked_write_allowed('payroll_revision');
  SELECT status INTO run_status FROM payroll_runs
   WHERE id = coalesce(NEW.payroll_run_id, OLD.payroll_run_id);

  IF TG_OP = 'DELETE' AND NOT allowed THEN
    RAISE EXCEPTION 'Payroll lines are not deletable; revise the run instead'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF run_status = 'FINALIZED' AND NOT allowed THEN
    RAISE EXCEPTION 'Payroll % is FINALIZED: line cannot be changed without a revision',
      (SELECT payroll_month FROM payroll_runs WHERE id = coalesce(NEW.payroll_run_id, OLD.payroll_run_id))
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NEW.payroll_month <> (SELECT payroll_month FROM payroll_runs WHERE id = NEW.payroll_run_id) THEN
      RAISE EXCEPTION 'Payroll line month % does not match its run', NEW.payroll_month
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION hcms_payroll_run_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payroll runs are not deletable' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'FINALIZED' AND NEW.status = 'FINALIZED'
     AND NOT hcms_locked_write_allowed('payroll_revision')
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

CREATE OR REPLACE FUNCTION hcms_payroll_inputs_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT hcms_locked_write_allowed('payroll_recalculation') THEN
    RAISE EXCEPTION 'payroll_line_inputs is append-only outside a recalculation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION hcms_attendance_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE month_status text; month_of_parent char(7); allowed boolean;
BEGIN
  allowed := hcms_locked_write_allowed('attendance_correction');
  SELECT status, payroll_month INTO month_status, month_of_parent
    FROM attendance_months
   WHERE id = coalesce(NEW.attendance_month_id, OLD.attendance_month_id);

  IF TG_OP <> 'INSERT' AND month_status IN ('APPROVED','FINALIZED') AND NOT allowed THEN
    RAISE EXCEPTION 'Attendance for % is % and cannot be changed without a correction',
      month_of_parent, month_status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF month_status = 'FINALIZED' AND NOT allowed THEN
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

CREATE OR REPLACE FUNCTION hcms_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE line_net numeric(14,3); already_paid numeric(14,3); allowed boolean;
BEGIN
  allowed := hcms_locked_write_allowed('payment_correction');

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payments are never deleted; reverse the payment instead'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.amount, OLD.payment_date, OLD.employee_id, OLD.payroll_line_id, OLD.payroll_month)
       IS DISTINCT FROM
       (NEW.amount, NEW.payment_date, NEW.employee_id, NEW.payroll_line_id, NEW.payroll_month)
       AND NOT allowed THEN
      RAISE EXCEPTION 'A recorded payment''s amount, date, employee or payroll line cannot be altered'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payroll_line_id IS NOT NULL AND NEW.status IN ('PENDING','PROCESSING','SUCCESS') THEN
    SELECT net_salary INTO line_net FROM payroll_lines WHERE id = NEW.payroll_line_id;
    SELECT coalesce(sum(amount), 0) INTO already_paid
      FROM salary_payments
     WHERE payroll_line_id = NEW.payroll_line_id
       AND status IN ('PENDING','PROCESSING','SUCCESS');
    IF line_net IS NOT NULL AND already_paid + NEW.amount > line_net AND NOT allowed THEN
      RAISE EXCEPTION
        'Payment of % would take total paid to % against a net entitlement of % for this payroll line',
        NEW.amount, already_paid + NEW.amount, line_net
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION hcms_wps_transaction_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE recoverable numeric(14,3); recovered numeric(14,3); allowed boolean;
BEGIN
  allowed := hcms_locked_write_allowed('wps_adjustment');
  IF TG_OP <> 'INSERT' AND NOT allowed THEN
    RAISE EXCEPTION 'WPS recovery transactions are append-only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT recoverable_amount INTO recoverable FROM wps_recoveries WHERE id = NEW.wps_recovery_id;
    SELECT coalesce(sum(amount), 0) INTO recovered
      FROM wps_recovery_transactions WHERE wps_recovery_id = NEW.wps_recovery_id;
    IF recoverable IS NOT NULL AND recovered + NEW.amount > recoverable AND NOT allowed THEN
      RAISE EXCEPTION 'WPS recovery of % exceeds the remaining recoverable balance of %',
        NEW.amount, recoverable - recovered
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

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
       AND NOT hcms_locked_write_allowed('loan_adjustment') THEN
      RAISE EXCEPTION 'Loan recovery of % exceeds the outstanding balance of %',
        NEW.amount, principal - recovered
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- The master key is withdrawn. Any caller this migration missed now errors
-- instead of silently inheriting permission to write anything.
DROP FUNCTION IF EXISTS hcms_locked_write_allowed();

INSERT INTO schema_migrations (version, description)
VALUES ('003', 'Scoped integrity overrides: replaces the single global allow_locked_write master key, which leaked across statements within a transaction')
ON CONFLICT (version) DO NOTHING;
