-- ============================================================================
-- HCMS database integrity tests
--
-- Every assertion below attempts an operation that MUST be refused, or checks a
-- computed result. Run against a throwaway database that has had 000+001+002
-- applied:  psql -d hcm_rehearsal -f db/tests/integrity_test.sql
--
-- Output is one row per assertion with PASS/FAIL and a non-zero exit if any
-- assertion fails.
--
-- Every helper clears the integrity override after the statement it ran. That
-- is not tidiness: hcms_override() is TRANSACTION-scoped, so under psql
-- autocommit an un-cleared override vanishes with the statement, while in a
-- single-transaction harness (or a pooled application request) it stays on and
-- silently authorises everything that follows. An earlier version of this file
-- relied on autocommit and therefore reported 38/38 while the same assertions
-- gave 33/38 inside one transaction. The helpers now behave identically either
-- way.
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE TEMP TABLE results (n serial, name text, outcome text, detail text);

CREATE OR REPLACE FUNCTION expect_error(p_name text, p_sql text, p_expect text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM hcms_override_clear();
    INSERT INTO results (name, outcome, detail)
    VALUES (p_name, 'FAIL', 'statement was allowed but should have been refused');
  EXCEPTION WHEN others THEN
    PERFORM hcms_override_clear();
    IF p_expect IS NOT NULL AND position(lower(p_expect) in lower(SQLERRM)) = 0 THEN
      INSERT INTO results (name, outcome, detail)
      VALUES (p_name, 'FAIL', 'refused, but for the wrong reason: ' || SQLERRM);
    ELSE
      INSERT INTO results (name, outcome, detail) VALUES (p_name, 'PASS', left(SQLERRM, 90));
    END IF;
  END;
END $$;

CREATE OR REPLACE FUNCTION expect_ok(p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM hcms_override_clear();
    INSERT INTO results (name, outcome, detail) VALUES (p_name, 'PASS', 'accepted');
  EXCEPTION WHEN others THEN
    PERFORM hcms_override_clear();
    INSERT INTO results (name, outcome, detail) VALUES (p_name, 'FAIL', SQLERRM);
  END;
END $$;

CREATE OR REPLACE FUNCTION expect_eq(p_name text, p_actual numeric, p_expected numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT DISTINCT FROM p_expected THEN
    INSERT INTO results (name, outcome, detail) VALUES (p_name, 'PASS', p_actual::text);
  ELSE
    INSERT INTO results (name, outcome, detail)
    VALUES (p_name, 'FAIL', format('expected %s, got %s', p_expected, p_actual));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
INSERT INTO companies (code, name) VALUES ('TESTCO', 'Test Company') ON CONFLICT DO NOTHING;

INSERT INTO employees (id, employee_id, employee_name, employee_type, nationality_type,
                       wage_type, date_of_joining, designation, employee_company,
                       salary_paid_by, monthly_salary_or_rate, wps_employee, wps_salary,
                       actual_salary, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'EMP-TEST-001', 'Test Worker', 'Staff', 'Expat',
        'Fixed Monthly', DATE '2025-01-01', 'Engineer', 'TESTCO', 'TESTCO',
        600.000, 'No', 0, 600.000, true);

INSERT INTO attendance_months (id, payroll_month, status)
VALUES ('22222222-2222-2222-2222-222222222222', '2026-07', 'DRAFT');

INSERT INTO attendance_records (id, attendance_month_id, employee_id, payroll_month,
                                days_worked, company_code)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', '2026-07', 25, 'TESTCO');

INSERT INTO payroll_runs (id, payroll_month, status, attendance_month_id)
VALUES ('44444444-4444-4444-4444-444444444444', '2026-07', 'DRAFT',
        '22222222-2222-2222-2222-222222222222');

INSERT INTO payroll_lines (id, payroll_run_id, employee_id, payroll_month, employee_code,
                           employee_name, employee_type, nationality_type, wage_type,
                           company_code, basic_salary_or_rate, gross_salary,
                           house_allowance, total_additions, other_deductions,
                           total_deductions, net_salary)
VALUES ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111', '2026-07', 'EMP-TEST-001', 'Test Worker',
        'Staff', 'Expat', 'Fixed Monthly', 'TESTCO', 600.000, 600.000,
        50.000, 50.000, 20.000, 20.000, 630.000);

-- Lineage fixture. Without a row here the append-only assertion on
-- payroll_line_inputs would delete zero rows, fire no row trigger, and pass
-- vacuously -- which is exactly how it first slipped through.
INSERT INTO payroll_line_inputs (id, payroll_line_id, input_type, source_table,
                                 source_record_id, quantity, rate, amount, snapshot)
VALUES ('99999999-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555',
        'ATTENDANCE','attendance_records','33333333-3333-3333-3333-333333333333',
        25, 24.000, 600.000, '{"days_worked":25,"rate":24.000}'::jsonb);

-- ---------------------------------------------------------------------------
-- Referential integrity
-- ---------------------------------------------------------------------------
SELECT expect_error('FK: payroll line without an employee',
  $q$INSERT INTO payroll_lines (payroll_run_id, employee_id, payroll_month, employee_code,
      employee_name, employee_type, nationality_type, wage_type, company_code)
     VALUES ('44444444-4444-4444-4444-444444444444','99999999-9999-9999-9999-999999999999',
             '2026-07','X','X','Staff','Expat','Fixed Monthly','TESTCO')$q$,
  'foreign key');

SELECT expect_error('FK: attendance without an employee',
  $q$INSERT INTO attendance_records (attendance_month_id, employee_id, payroll_month)
     VALUES ('22222222-2222-2222-2222-222222222222','99999999-9999-9999-9999-999999999999','2026-07')$q$,
  'foreign key');

SELECT expect_error('FK: employee in a company that does not exist',
  $q$INSERT INTO employees (employee_id, employee_name, employee_type, nationality_type,
      wage_type, date_of_joining, designation, employee_company, salary_paid_by,
      monthly_salary_or_rate, wps_employee, wps_salary, actual_salary)
     VALUES ('EMP-TEST-BAD','X','Staff','Expat','Fixed Monthly',DATE '2025-01-01','X',
             'NOPE','TESTCO',1,'No',0,0)$q$,
  'foreign key');

SELECT expect_error('FK: payment referencing a missing payroll line',
  $q$INSERT INTO salary_payments (payroll_line_id, employee_id, payroll_month, amount, payment_date)
     VALUES ('99999999-9999-9999-9999-999999999999','11111111-1111-1111-1111-111111111111',
             '2026-07', 10, DATE '2026-08-01')$q$,
  'foreign key');

SELECT expect_error('FK: employee cannot be deleted while payroll references it',
  $q$DELETE FROM employees WHERE id = '11111111-1111-1111-1111-111111111111'$q$,
  'violates foreign key');

-- ---------------------------------------------------------------------------
-- Uniqueness / duplicates
-- ---------------------------------------------------------------------------
SELECT expect_error('UNIQUE: duplicate employee ID (case-insensitive)',
  $q$INSERT INTO employees (employee_id, employee_name, employee_type, nationality_type,
      wage_type, date_of_joining, designation, employee_company, salary_paid_by,
      monthly_salary_or_rate, wps_employee, wps_salary, actual_salary)
     VALUES ('emp-test-001','Clone','Staff','Expat','Fixed Monthly',DATE '2025-01-01','X',
             'TESTCO','TESTCO',1,'No',0,0)$q$,
  'duplicate key');

SELECT expect_error('UNIQUE: duplicate payroll line for the same employee and run',
  $q$INSERT INTO payroll_lines (payroll_run_id, employee_id, payroll_month, employee_code,
      employee_name, employee_type, nationality_type, wage_type, company_code)
     VALUES ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
             '2026-07','EMP-TEST-001','Test Worker','Staff','Expat','Fixed Monthly','TESTCO')$q$,
  'duplicate key');

SELECT expect_error('UNIQUE: duplicate payroll run for the same month',
  $q$INSERT INTO payroll_runs (payroll_month, status) VALUES ('2026-07','DRAFT')$q$,
  'duplicate key');

SELECT expect_error('UNIQUE: duplicate attendance allocation for employee+project+month',
  $q$INSERT INTO attendance_records (attendance_month_id, employee_id, payroll_month, days_worked)
     VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','2026-07',5)$q$,
  'duplicate key');

-- ---------------------------------------------------------------------------
-- Value constraints
-- ---------------------------------------------------------------------------
SELECT expect_error('CHECK: negative net salary refused',
  $q$UPDATE payroll_lines SET net_salary = -1 WHERE id = '55555555-5555-5555-5555-555555555555'$q$,
  'check constraint');

SELECT expect_error('CHECK: payment amount of zero refused',
  $q$INSERT INTO salary_payments (payroll_line_id, employee_id, payroll_month, amount, payment_date)
     VALUES ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',
             '2026-07', 0, DATE '2026-08-01')$q$,
  'check constraint');

SELECT expect_error('CHECK: malformed payroll month refused',
  $q$INSERT INTO payroll_runs (payroll_month, status) VALUES ('2026-13','DRAFT')$q$,
  'check constraint');

SELECT expect_error('CHECK: attendance of 40 days in a month refused',
  $q$INSERT INTO attendance_records (attendance_month_id, employee_id, payroll_month, days_worked, project_id)
     VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','2026-07',40,NULL)$q$,
  'check constraint');

SELECT expect_error('CHECK: leaving date before joining date refused',
  $q$UPDATE employees SET date_of_leaving = DATE '2024-01-01'
      WHERE id = '11111111-1111-1111-1111-111111111111'$q$,
  'check constraint');

-- ---------------------------------------------------------------------------
-- Month consistency
-- ---------------------------------------------------------------------------
SELECT expect_error('CONSISTENCY: payroll line month must match its run',
  $q$UPDATE payroll_lines SET payroll_month = '2026-08'
      WHERE id = '55555555-5555-5555-5555-555555555555'$q$,
  'does not match');

SELECT expect_error('CONSISTENCY: attendance row month must match its attendance month',
  $q$INSERT INTO attendance_records (attendance_month_id, employee_id, payroll_month, days_worked)
     VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','2026-08',1)$q$,
  'does not match');

-- ---------------------------------------------------------------------------
-- Payment ceiling and immutability
-- ---------------------------------------------------------------------------
SELECT expect_ok('PAYMENT: partial payment within entitlement accepted',
  $q$INSERT INTO salary_payments (id, payroll_line_id, employee_id, payroll_month, amount,
       payment_date, status, reference_number)
     VALUES ('66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555',
             '11111111-1111-1111-1111-111111111111','2026-07', 400.000, DATE '2026-08-05',
             'SUCCESS','REF-1')$q$);

SELECT expect_error('PAYMENT: total payments may not exceed the net entitlement',
  $q$INSERT INTO salary_payments (payroll_line_id, employee_id, payroll_month, amount, payment_date)
     VALUES ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',
             '2026-07', 300.000, DATE '2026-08-06')$q$,
  'net entitlement');

SELECT expect_error('PAYMENT: duplicate reference number in the same month refused',
  $q$INSERT INTO salary_payments (payroll_line_id, employee_id, payroll_month, amount,
       payment_date, reference_number)
     VALUES ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',
             '2026-07', 10.000, DATE '2026-08-06','ref-1')$q$,
  'duplicate key');

SELECT expect_error('PAYMENT: a recorded payment cannot be deleted',
  $q$DELETE FROM salary_payments WHERE id = '66666666-6666-6666-6666-666666666666'$q$,
  'never deleted');

SELECT expect_error('PAYMENT: a recorded amount cannot be altered',
  $q$UPDATE salary_payments SET amount = 1 WHERE id = '66666666-6666-6666-6666-666666666666'$q$,
  'cannot be altered');

SELECT expect_ok('PAYMENT: status may move forward, recorded in history',
  $q$UPDATE salary_payments SET status = 'REVERSED'
      WHERE id = '66666666-6666-6666-6666-666666666666'$q$);

-- ---------------------------------------------------------------------------
-- Append-only audit
-- ---------------------------------------------------------------------------
INSERT INTO audit_logs (id, username, user_role, action, module, description)
VALUES ('77777777-7777-7777-7777-777777777777','tester','Administrator','TEST','Test','fixture');

SELECT expect_error('AUDIT: log entries cannot be updated',
  $q$UPDATE audit_logs SET description = 'tampered' WHERE id = '77777777-7777-7777-7777-777777777777'$q$,
  'append-only');

SELECT expect_error('AUDIT: log entries cannot be deleted',
  $q$DELETE FROM audit_logs WHERE id = '77777777-7777-7777-7777-777777777777'$q$,
  'append-only');

-- ---------------------------------------------------------------------------
-- Approved attendance and finalized payroll are locked
-- ---------------------------------------------------------------------------
UPDATE attendance_months SET status = 'APPROVED' WHERE id = '22222222-2222-2222-2222-222222222222';

SELECT expect_error('LOCK: approved attendance cannot be edited',
  $q$UPDATE attendance_records SET days_worked = 30
      WHERE id = '33333333-3333-3333-3333-333333333333'$q$,
  'cannot be changed');

SELECT expect_error('LOCK: approved attendance cannot be deleted',
  $q$DELETE FROM attendance_records WHERE id = '33333333-3333-3333-3333-333333333333'$q$,
  'cannot be changed');

SELECT expect_ok('LOCK: an authorised correction may edit approved attendance',
  $q$SELECT hcms_override('attendance_correction');
     UPDATE attendance_records SET days_worked = 26
      WHERE id = '33333333-3333-3333-3333-333333333333'$q$);

UPDATE payroll_runs SET status = 'FINALIZED', finalized_at = now(), finalized_by = 'tester'
 WHERE id = '44444444-4444-4444-4444-444444444444';

SELECT expect_error('LOCK: finalized payroll line cannot be edited',
  $q$UPDATE payroll_lines SET net_salary = 999 WHERE id = '55555555-5555-5555-5555-555555555555'$q$,
  'FINALIZED');

-- The failure this file was written to catch: before 003 a single global
-- override meant an attendance correction also unlocked payroll and loans.
SELECT expect_error('SCOPE: an attendance override does not unlock a finalized payroll line',
  $q$SELECT hcms_override('attendance_correction');
     UPDATE payroll_lines SET net_salary = 999 WHERE id = '55555555-5555-5555-5555-555555555555'$q$,
  'FINALIZED');

SELECT expect_ok('SCOPE: a payroll_revision override does unlock a finalized payroll line',
  $q$SELECT hcms_override('payroll_revision');
     UPDATE payroll_lines SET net_salary = 630.000
      WHERE id = '55555555-5555-5555-5555-555555555555'$q$);

SELECT expect_error('SCOPE: an unknown override scope is rejected',
  $q$SELECT hcms_override('everything')$q$,
  'Unknown integrity override scope');

SELECT expect_error('SCOPE: payroll_line_inputs needs a recalculation override, not a revision one',
  $q$SELECT hcms_override('payroll_revision');
     DELETE FROM payroll_line_inputs WHERE payroll_line_id = '55555555-5555-5555-5555-555555555555'$q$,
  'append-only outside a recalculation');

SELECT expect_error('LOCK: payroll lines cannot be deleted',
  $q$DELETE FROM payroll_lines WHERE id = '55555555-5555-5555-5555-555555555555'$q$,
  'not deletable');

SELECT expect_error('LOCK: payroll runs cannot be deleted',
  $q$DELETE FROM payroll_runs WHERE id = '44444444-4444-4444-4444-444444444444'$q$,
  'not deletable');

SELECT expect_error('LOCK: finalized payroll cannot jump back to DRAFT',
  $q$UPDATE payroll_runs SET status = 'DRAFT' WHERE id = '44444444-4444-4444-4444-444444444444'$q$,
  'may only move to IN_REVISION');

SELECT expect_ok('LOCK: finalized payroll may enter a controlled revision',
  $q$UPDATE payroll_runs SET status = 'IN_REVISION'
      WHERE id = '44444444-4444-4444-4444-444444444444'$q$);

-- ---------------------------------------------------------------------------
-- Loan ceiling
-- ---------------------------------------------------------------------------
INSERT INTO loans (id, employee_id, loan_amount, loan_date, monthly_deduction)
VALUES ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111',
        300.000, DATE '2026-01-01', 50.000);

SELECT expect_ok('LOAN: recovery within the principal accepted',
  $q$INSERT INTO loan_recoveries (loan_id, employee_id, amount, recovery_date, payroll_month)
     VALUES ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111',
             100.000, DATE '2026-08-01','2026-07')$q$);

SELECT expect_error('LOAN: recovery beyond the principal refused',
  $q$INSERT INTO loan_recoveries (loan_id, employee_id, amount, recovery_date, payroll_month)
     VALUES ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111',
             250.000, DATE '2026-09-01','2026-08')$q$,
  'exceeds the outstanding balance');

SELECT expect_error('SCOPE: an attendance override does not unlock loan over-recovery',
  $q$SELECT hcms_override('attendance_correction');
     INSERT INTO loan_recoveries (loan_id, employee_id, amount, recovery_date, payroll_month)
     VALUES ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111',
             250.000, DATE '2026-09-02','2026-09')$q$,
  'exceeds the outstanding balance');

SELECT expect_error('LOAN: a second payroll recovery in the same month refused',
  $q$INSERT INTO loan_recoveries (loan_id, employee_id, amount, recovery_date, payroll_month)
     VALUES ('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111',
             10.000, DATE '2026-08-02','2026-07')$q$,
  'duplicate key');

-- ---------------------------------------------------------------------------
-- Reconciliation arithmetic
-- ---------------------------------------------------------------------------
SELECT expect_eq('RECONCILIATION: liability is the stored net salary',
  (SELECT liability FROM payroll_payment_reconciliation
    WHERE payroll_line_id = '55555555-5555-5555-5555-555555555555'), 630.000);

SELECT expect_eq('RECONCILIATION: a reversed payment does not count as paid',
  (SELECT paid FROM payroll_payment_reconciliation
    WHERE payroll_line_id = '55555555-5555-5555-5555-555555555555'), 0);

SELECT expect_eq('RECONCILIATION: outstanding = liability - paid',
  (SELECT outstanding FROM payroll_payment_reconciliation
    WHERE payroll_line_id = '55555555-5555-5555-5555-555555555555'), 630.000);

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
SELECT lpad(n::text, 2) || '  ' || rpad(outcome, 5) || '  ' || name AS "integrity assertions"
FROM results ORDER BY n;

SELECT count(*) FILTER (WHERE outcome = 'PASS') AS passed,
       count(*) FILTER (WHERE outcome = 'FAIL') AS failed,
       count(*) AS total
FROM results;

SELECT name || ' -> ' || detail AS "failures" FROM results WHERE outcome = 'FAIL' ORDER BY n;

DO $$
DECLARE failures int;
BEGIN
  SELECT count(*) INTO failures FROM results WHERE outcome = 'FAIL';
  IF failures > 0 THEN
    RAISE EXCEPTION '% integrity assertion(s) failed', failures;
  END IF;
END $$;
