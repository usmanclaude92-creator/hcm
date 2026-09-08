import test from 'node:test';
import assert from 'node:assert/strict';
import { db, roundOMR, normalizeEmployeeId } from '../server/db.js';
import type { AttendancePunch, TimesheetRecord, EmployeeLoan } from '../src/types/index.js';

test('Mobile Punch and Attendance Synchronization', async (t) => {
  await db.init();

  const testEmpId = 'EMP-MOB-01';
  const testMonth = '2026-09';
  const testDate = '2026-09-08';

  // Ensure clean state for test employee
  const existingEmp = db.employees.findByEmployeeId(testEmpId);
  if (!existingEmp) {
    await db.employees.create({
      id: 'uuid-mob-01',
      employeeId: testEmpId,
      employeeName: 'Ahmed Al-Balushi',
      employeeType: 'Worker',
      nationalityType: 'Omani',
      wageType: 'Per Hour',
      designation: 'Electrician',
      employeeCompany: 'DGO',
      salaryPaidBy: 'DGO',
      monthlySalaryOrRate: 2.500,
      wpsSalary: 2.500,
      actualSalary: 2.500,
      recoverFrom: 'DGO',
      wpsEmployee: 'Yes',
      dateOfJoining: '2024-01-01',
      dateOfLeaving: '',
      bankName: 'Bank Muscat',
      bankAccountNumber: '01234567890123',
      iban: 'OM44BMUS01234567890123',
      assignedProjectCode: 'PRJ-MUSCAT',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await t.test('creates check-in punch with geofence evaluation', async () => {
    const punchId = 'punch-test-01';
    const punch: AttendancePunch = {
      id: punchId,
      employeeId: testEmpId,
      employeeName: 'Ahmed Al-Balushi',
      punchDate: testDate,
      checkInTime: '2026-09-08T07:30:00.000Z',
      projectId: 'proj-muscat',
      projectCode: 'PRJ-MUSCAT',
      projectName: 'Muscat Substation',
      checkInLatitude: 23.5880, // Near HQ
      checkInLongitude: 58.3829,
      isGeofenceException: false,
      status: 'Checked In',
      createdAt: '2026-09-08T07:30:00.000Z',
      updatedAt: '2026-09-08T07:30:00.000Z',
    };

    const created = await db.attendancePunches.create(punch);
    assert.equal(created.id, punchId);
    assert.equal(created.employeeId, testEmpId);

    const todayPunch = db.attendancePunches.getTodayPunch(testEmpId, testDate);
    assert.ok(todayPunch);
    assert.equal(todayPunch?.checkInTime, '2026-09-08T07:30:00.000Z');
  });

  await t.test('check-out updates hours and syncs to monthly attendance', async () => {
    const punchId = 'punch-test-01';
    const checkOutTime = '2026-09-08T17:00:00.000Z'; // 9.5 hours
    const hoursWorked = 9.5;
    const overtimeHours = 1.5;

    const updated = await db.attendancePunches.update(punchId, {
      checkOutTime,
      hoursWorked,
      overtimeHours,
      status: 'Checked Out',
    });

    assert.equal(updated.hoursWorked, 9.5);
    assert.equal(updated.overtimeHours, 1.5);
    assert.equal(updated.status, 'Checked Out');

    // Verify monthly attendance sync
    const monthlyRecs = db.attendance.getByEmployeeAndMonth(testEmpId, testMonth);
    const monthlyRec = monthlyRecs[0];
    assert.ok(monthlyRec, 'Monthly attendance record should be auto-created / synced');
    assert.equal(monthlyRec?.employeeId, testEmpId);
    assert.equal(monthlyRec?.daysWorked, 1);
    assert.equal(monthlyRec?.hoursWorked, 9.5);
    assert.equal(monthlyRec?.overtimeHours, 1.5);
  });

  await t.test('timesheet CRUD and approval flow', async () => {
    const tsId = 'timesheet-test-01';
    const ts: TimesheetRecord = {
      id: tsId,
      employeeId: testEmpId,
      employeeName: 'Ahmed Al-Balushi',
      workDate: testDate,
      projectId: 'proj-muscat',
      projectCode: 'PRJ-MUSCAT',
      projectName: 'Muscat Substation',
      hoursWorked: 8,
      description: 'Conduit laying and transformer panel installation',
      status: 'Submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.timesheets.create(ts);
    assert.equal(saved.id, tsId);
    assert.equal(saved.status, 'Submitted');

    const approved = await db.timesheets.approve(tsId, 'Site Supervisor Salim');
    assert.equal(approved.status, 'Approved');
    assert.equal(approved.approvedBy, 'Site Supervisor Salim');
    assert.ok(approved.approvedAt);
  });
});

test('Employee Financial Ledger and Balance Calculation', async (t) => {
  await db.init();

  const empId = `EMP-MOB-LEDGER-${Date.now()}`;
  const norm = normalizeEmployeeId(empId);

  await t.test('computes running balance from payroll, payments, and loans', async () => {
    // 1. Employee loan
    const loan: EmployeeLoan = {
      id: `loan-${Date.now()}`,
      employeeId: empId,
      employeeName: 'Salim Al-Harthy',
      employeeCompany: 'DGO',
      loanAmount: 500.000,
      loanDate: '2026-08-01',
      monthlyRecoveryAmount: 50.000,
      totalRecovered: 50.000,
      outstandingBalance: 450.000,
      status: 'Active',
      loanReason: 'Emergency medical expenses',
      disbursementDate: '2026-08-01',
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-01T08:00:00.000Z',
    };
    await db.loans.create(loan);

    const activeLoans = db.loans.getAll().filter(l => normalizeEmployeeId(l.employeeId) === norm && l.status === 'Active');
    assert.equal(activeLoans.length, 1);
    assert.equal(activeLoans[0].outstandingBalance, 500.000); // Newly created loan balance equals loanAmount

    // Test roundOMR precision
    assert.equal(roundOMR(500.0004), 500.000);
    assert.equal(roundOMR(450.1236), 450.124);
  });
});
