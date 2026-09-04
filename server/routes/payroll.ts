import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import {
  db,
  normalizeEmployeeId,
  roundOMR,
  isHourlyPaid,
  normalHourlyWage,
  employedDaysInMonth,
  leaveDaysInMonth,
  STANDARD_DAYS_PER_MONTH,
  STANDARD_HOURS_PER_DAY,
  DEFAULT_OVERTIME_MULTIPLIER,
} from '../db.js';
import {
  verifyAuth,
  requireWritePermission,
  requireRoles,
  AuthRequest,
  companyScopeOf,
  canSeeCompany,
} from '../auth.js';
import type { MonthlyPayroll, PayrollLine, PayrollStatus, PaymentMethod } from '../../src/types/index';

const router = Router();

// Helper to calculate a single employee line
function calculateEmployeeLine(
  emp: any,
  attendanceRecords: any[],
  payrollId: string,
  existingLine?: Partial<PayrollLine>,
  activeLoans: any[] = [],
  month: string = '',
  approvedLeave: any[] = []
): PayrollLine {
  const empId = normalizeEmployeeId(emp.employeeId);
  const empAttendance = attendanceRecords.filter(a => normalizeEmployeeId(a.employeeId) === empId);
  const hourly = isHourlyPaid(emp);

  // Summarize projects worked
  const projectsSummary = empAttendance.length > 0
    ? empAttendance.map(a => `${a.projectCode} (${hourly ? a.hoursWorked + 'h' : a.daysWorked + 'd'})`).join(', ')
    : 'No Attendance';

  const rawDaysWorked = empAttendance.reduce((sum, a) => sum + (Number(a.daysWorked) || 0), 0);
  const hoursWorked = empAttendance.reduce((sum, a) => sum + (Number(a.hoursWorked) || 0), 0);

  // Attendance-captured adjustments. These were stored by the attendance sheet, shown
  // back on it as per-employee totals, and then read by nothing -- payroll aggregated
  // only days and hours. A site bonus or a disciplinary deduction disappeared silently
  // between two adjacent screens.
  const overtimeHours = empAttendance.reduce((sum, a) => sum + (Number(a.overtimeHours) || 0), 0);
  const attendanceBonus = roundOMR(empAttendance.reduce((sum, a) => sum + (Number(a.bonus) || 0), 0));
  const attendanceDeduction = roundOMR(empAttendance.reduce((sum, a) => sum + (Number(a.deduction) || 0), 0));

  // A mid-month joiner or leaver can only be paid for the part of the month they were
  // actually employed, however many days the attendance sheet carries.
  const employableDays = month ? employedDaysInMonth(emp, month) : STANDARD_DAYS_PER_MONTH;
  const daysWorked = hourly ? rawDaysWorked : Math.min(rawDaysWorked, employableDays);

  // Approved leave falling inside this month. Paid leave is treated as time worked --
  // that is what "paid leave" means -- so it is added to the payable days (or converted
  // to standard hours for an hourly employee). Unpaid leave is recorded but not paid.
  // Only Approved requests count; a submitted-but-undecided request never affects pay.
  const monthLeave = month
    ? approvedLeave.filter(l => normalizeEmployeeId(l.employeeId) === empId)
    : [];
  const paidLeaveDays = monthLeave
    .filter(l => l.isPaid)
    .reduce((sum, l) => sum + leaveDaysInMonth(l.startDate, l.endDate, month), 0);
  const unpaidLeaveDays = monthLeave
    .filter(l => !l.isPaid)
    .reduce((sum, l) => sum + leaveDaysInMonth(l.startDate, l.endDate, month), 0);

  // Rate: refreshed from Employee Master on every recalculation UNLESS a user typed a
  // rate on this line by hand. Previously the existing line's rate always won, so a
  // salary revision entered in Employee Master was silently ignored by a draft that
  // already existed -- and nothing in the UI distinguished "overridden" from "stale".
  const masterRate = roundOMR(Number(emp.monthlySalaryOrRate) || 0);
  const rateOverridden = existingLine?.rateOverridden === true;
  const basicSalaryOrRate = rateOverridden && existingLine?.basicSalaryOrRate !== undefined
    ? roundOMR(Number(existingLine.basicSalaryOrRate))
    : masterRate;

  // Gross Salary calculation rule. Paid leave counts as time worked; the total is still
  // capped at the payroll month and at the days the employee was actually employed, so
  // attendance plus leave can never pay more than a full month.
  let grossSalary = 0;
  let payableDays = daysWorked;
  let payableHours = hoursWorked;
  if (hourly) {
    payableHours = roundOMR(hoursWorked + paidLeaveDays * STANDARD_HOURS_PER_DAY);
    grossSalary = roundOMR(payableHours * basicSalaryOrRate);
  } else {
    payableDays = Math.min(daysWorked + paidLeaveDays, employableDays, STANDARD_DAYS_PER_MONTH);
    // Monthly: Gross = Monthly Salary ÷ 30 × Payable Days
    grossSalary = roundOMR((basicSalaryOrRate / STANDARD_DAYS_PER_MONTH) * payableDays);
  }

  // Overtime. A rate override entered on the line wins; otherwise the statutory 125% of
  // the normal hourly wage. Overtime hours were previously captured and displayed in the
  // payroll sheet while being paid at nothing.
  const overtimeRate = existingLine?.overtimeRate !== undefined && existingLine.overtimeRate !== null
    ? roundOMR(Number(existingLine.overtimeRate))
    : roundOMR(normalHourlyWage(emp, basicSalaryOrRate) * DEFAULT_OVERTIME_MULTIPLIER);
  const overtimePay = roundOMR(overtimeHours * overtimeRate);

  // Manual per-line additions, kept separate from the attendance-derived amounts so the
  // two can never double-count each other.
  const houseAllowance = existingLine ? roundOMR(Number(existingLine.houseAllowance) || 0) : 0;
  const transportAllowance = existingLine ? roundOMR(Number(existingLine.transportAllowance) || 0) : 0;
  const bonus = existingLine ? roundOMR(Number(existingLine.bonus) || 0) : 0;
  const otherAllowance = existingLine ? roundOMR(Number(existingLine.otherAllowance) || 0) : 0;
  const totalAdditions = roundOMR(
    houseAllowance + transportAllowance + bonus + otherAllowance + overtimePay + attendanceBonus
  );

  // Deductions
  // If no existing line, suggest monthly recovery from active loan if available
  let loanRecovery = existingLine ? roundOMR(Number(existingLine.loanRecovery) || 0) : 0;
  const otherDeductions = existingLine ? roundOMR(Number(existingLine.otherDeductions) || 0) : 0;
  const nonLoanDeductions = roundOMR(otherDeductions + attendanceDeduction);

  if (!existingLine) {
    const activeLoan = activeLoans.find(l => normalizeEmployeeId(l.employeeId) === empId && l.status === 'Active');
    if (activeLoan && activeLoan.outstandingBalance > 0) {
      // Never suggest recovering more than the employee is actually being paid this
      // month. Without this cap an employee with no attendance was given a NEGATIVE
      // net salary, and finalisation then posted a loan recovery against a month in
      // which nothing was paid.
      const payableThisMonth = roundOMR(Math.max(0, grossSalary + totalAdditions - nonLoanDeductions));
      loanRecovery = roundOMR(Math.min(activeLoan.monthlyRecoveryAmount, activeLoan.outstandingBalance, payableThisMonth));
    }
  }

  // Loan recovery can never exceed what is actually payable this month. This also
  // re-clamps a recovery carried over from an earlier draft, so a line that was
  // calculated while the employee had attendance does not keep deducting after the
  // attendance is removed and leave a negative net salary behind.
  const payableBeforeLoan = roundOMR(Math.max(0, grossSalary + totalAdditions - nonLoanDeductions));
  if (loanRecovery > payableBeforeLoan) {
    loanRecovery = payableBeforeLoan;
  }

  const totalDeductions = roundOMR(loanRecovery + nonLoanDeductions);

  // Net Salary
  const netSalary = roundOMR(grossSalary + totalAdditions - totalDeductions);

  // WPS Calculations
  const wpsEmployee = emp.wpsEmployee === 'Yes' ? 'Yes' : 'No';
  const paymentMethod: PaymentMethod = existingLine?.paymentMethod || (wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS');
  const wpsSalary = roundOMR(Number(emp.wpsSalary) || 0);

  // WPS Recoverable formula: MAX(WPS Salary - Net Salary, 0), but ONLY for a month in
  // which the employee actually earned a wage. Applying it unconditionally raised
  // recovery against every active WPS employee who did not work -- a receivable the
  // company would be told to collect from staff it had paid nothing.
  const hasWageBasis = payableHours > 0 || payableDays > 0;
  let recoverableSalary = 0;
  if (wpsEmployee === 'Yes' && wpsSalary > 0 && hasWageBasis) {
    recoverableSalary = roundOMR(Math.max(wpsSalary - netSalary, 0));
  }

  const recoverFrom = emp.recoverFrom || (wpsEmployee === 'Yes' ? emp.employeeCompany : '');

  const timestamp = new Date().toISOString();
  return {
    id: existingLine?.id || crypto.randomUUID(),
    payrollId,
    employeeId: emp.employeeId,
    employeeName: emp.employeeName,
    employeeType: emp.employeeType,
    nationalityType: emp.nationalityType,
    wageType: emp.wageType,
    designation: emp.designation,
    employeeCompany: emp.employeeCompany,
    salaryPaidBy: emp.salaryPaidBy,
    projectsSummary,
    daysWorked,
    hoursWorked,
    paidLeaveDays,
    unpaidLeaveDays,
    basicSalaryOrRate,
    rateOverridden,
    masterRate,
    grossSalary,
    overtimeHours,
    overtimeRate,
    overtimePay,
    attendanceBonus,
    attendanceDeduction,
    houseAllowance,
    transportAllowance,
    bonus,
    otherAllowance,
    totalAdditions,
    loanRecovery,
    otherDeductions,
    totalDeductions,
    netSalary,
    paymentMethod,
    wpsSalary,
    recoverableSalary,
    recoverFrom,
    wpsEmployee,
    createdAt: existingLine?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

// GET /api/payroll - List all payroll months overview
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const payrolls = db.payroll.getAll();
    payrolls.sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth));
    res.json(payrolls);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payroll list' });
  }
});

// GET /api/payroll/:month - Get full payroll sheet for a month
router.get('/:month', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const payroll = db.payroll.getByMonth(month);

    if (!payroll) {
      return res.json({
        exists: false,
        payrollMonth: month,
        status: 'Draft',
        lines: [],
      });
    }

    // A scoped account sees only its own companies' lines. Totals are recomputed from the
    // visible lines so the sheet's own header cannot leak another company's payroll cost.
    const scope = companyScopeOf(req.user);
    if (scope === null) {
      return res.json({ exists: true, ...payroll });
    }

    const lines = (payroll.lines || []).filter(l => canSeeCompany(scope, l.employeeCompany));
    res.json({
      exists: true,
      ...payroll,
      lines,
      scopedToCompanies: scope,
      totalEmployees: lines.length,
      totalGrossSalary: roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0)),
      totalAdditions: roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0)),
      totalDeductions: roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0)),
      totalNetSalary: roundOMR(lines.reduce((s, l) => s + l.netSalary, 0)),
      totalWpsSalary: roundOMR(lines.reduce((s, l) => s + l.wpsSalary, 0)),
      totalRecoverableSalary: roundOMR(lines.reduce((s, l) => s + l.recoverableSalary, 0)),
      totalOvertimePay: roundOMR(lines.reduce((s, l) => s + (l.overtimePay || 0), 0)),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payroll' });
  }
});

// POST /api/payroll/calculate - Run payroll calculation engine for a month
router.post('/calculate', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.body;
    if (!month) {
      return res.status(400).json({ error: 'Payroll month (YYYY-MM) is required.' });
    }

    // A payroll run covers every active employee in every company, so an account limited
    // to a subset of companies must not be able to trigger, and thereby rewrite, the
    // whole organisation's month.
    if (companyScopeOf(req.user) !== null) {
      return res.status(403).json({
        error: 'Your account is limited to specific companies and cannot run an organisation-wide payroll calculation.',
      });
    }

    const existingPayroll = db.payroll.getByMonth(month);
    if (existingPayroll && existingPayroll.status === 'Finalized') {
      return res.status(400).json({
        error: `Payroll for ${month} is Finalized. Click 'Revise Payroll' to unlock revisions.`
      });
    }

    const activeEmployees = db.employees.getAll().filter(e => e.isActive);
    const attendanceRecords = db.attendance.getByMonth(month);
    const activeLoans = db.loans.getAll().filter(l => l.status === 'Active');
    // Only Approved leave touches pay. A request still awaiting a decision must never
    // change what an employee is paid.
    const approvedLeave = db.leaveRequests
      .getAll()
      .filter(l => l.status === 'Approved' && leaveDaysInMonth(l.startDate, l.endDate, month) > 0);

    const payrollId = existingPayroll?.id || crypto.randomUUID();
    const existingLinesMap = new Map<string, PayrollLine>();
    if (existingPayroll?.lines) {
      for (const line of existingPayroll.lines) {
        existingLinesMap.set(normalizeEmployeeId(line.employeeId), line);
      }
    }

    const lines: PayrollLine[] = activeEmployees.map(emp => {
      const existingLine = existingLinesMap.get(normalizeEmployeeId(emp.employeeId));
      return calculateEmployeeLine(emp, attendanceRecords, payrollId, existingLine, activeLoans, month, approvedLeave);
    });

    const totalOvertimePay = roundOMR(lines.reduce((s, l) => s + (l.overtimePay || 0), 0));
    const totalGross = roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0));
    const totalAdditions = roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0));
    const totalDeductions = roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0));
    const totalNet = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
    const totalWps = roundOMR(lines.reduce((s, l) => s + l.wpsSalary, 0));
    const totalRecoverable = roundOMR(lines.reduce((s, l) => s + l.recoverableSalary, 0));

    const timestamp = new Date().toISOString();
    const payrollData: MonthlyPayroll = {
      id: payrollId,
      payrollMonth: month,
      status: existingPayroll?.status === 'In Revision' ? 'In Revision' : 'Draft',
      totalEmployees: lines.length,
      totalGrossSalary: totalGross,
      totalAdditions,
      totalDeductions,
      totalNetSalary: totalNet,
      totalWpsSalary: totalWps,
      totalRecoverableSalary: totalRecoverable,
      totalOvertimePay,
      revisionNumber: existingPayroll?.revisionNumber || 0,
      createdAt: existingPayroll?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    const saved = await db.payroll.saveDraft(payrollData, lines);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PAYROLL_CALCULATED',
      module: 'Payroll',
      recordId: saved.id,
      description: `Calculated payroll draft for ${month} with ${lines.length} employees (Gross: OMR ${totalGross.toFixed(3)}, Net: OMR ${totalNet.toFixed(3)}).`,
    });

    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate payroll' });
  }
});

// PUT /api/payroll/:month/lines/:lineId - Update individual payroll line (allow rate override, additions, deductions)
router.put('/:month/lines/:lineId', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { month, lineId } = req.params;
    const payroll = db.payroll.getByMonth(month);

    if (!payroll) return res.status(404).json({ error: 'Payroll not found.' });
    if (payroll.status === 'Finalized') {
      return res.status(400).json({ error: 'Cannot edit finalized payroll. Please initiate a revision.' });
    }

    const lines = payroll.lines || [];
    const lineIndex = lines.findIndex(l => l.id === lineId);
    if (lineIndex === -1) return res.status(404).json({ error: 'Payroll line not found.' });

    const currentLine = lines[lineIndex];
    if (!canSeeCompany(companyScopeOf(req.user), currentLine.employeeCompany)) {
      return res.status(404).json({ error: 'Payroll line not found.' });
    }
    const {
      basicSalaryOrRate,
      houseAllowance,
      transportAllowance,
      bonus,
      otherAllowance,
      loanRecovery,
      otherDeductions,
      paymentMethod,
      wpsSalary,
      recoverFrom,
      overtimeRate,
      resetRateToMaster,
    } = req.body;

    // "Reset to master" clears the override so the next recalculation tracks Employee
    // Master again; any other rate edit marks the line as deliberately overridden.
    const rateEdited = basicSalaryOrRate !== undefined;
    const newRateOverridden = resetRateToMaster === true
      ? false
      : rateEdited
        ? true
        : currentLine.rateOverridden === true;
    const newRate = resetRateToMaster === true
      ? roundOMR(Number(currentLine.masterRate ?? currentLine.basicSalaryOrRate))
      : rateEdited
        ? roundOMR(Number(basicSalaryOrRate))
        : currentLine.basicSalaryOrRate;
    const newHouse = houseAllowance !== undefined ? roundOMR(Number(houseAllowance)) : currentLine.houseAllowance;
    const newTransport = transportAllowance !== undefined ? roundOMR(Number(transportAllowance)) : currentLine.transportAllowance;
    const newBonus = bonus !== undefined ? roundOMR(Number(bonus)) : currentLine.bonus;
    const newOtherAdd = otherAllowance !== undefined ? roundOMR(Number(otherAllowance)) : currentLine.otherAllowance;
    const newLoanRec = loanRecovery !== undefined ? roundOMR(Number(loanRecovery)) : currentLine.loanRecovery;
    const newOtherDed = otherDeductions !== undefined ? roundOMR(Number(otherDeductions)) : currentLine.otherDeductions;
    const newWpsSalary = wpsSalary !== undefined ? roundOMR(Number(wpsSalary)) : currentLine.wpsSalary;
    const newOvertimeRate = overtimeRate !== undefined
      ? roundOMR(Number(overtimeRate))
      : roundOMR(Number(currentLine.overtimeRate) || 0);

    const negativeFieldChecks: [string, number][] = [
      ['Basic Salary / Wage Rate', newRate],
      ['House Allowance', newHouse],
      ['Transport Allowance', newTransport],
      ['Bonus', newBonus],
      ['Other Allowance', newOtherAdd],
      ['Loan Recovery', newLoanRec],
      ['Other Deductions', newOtherDed],
      ['WPS Salary', newWpsSalary],
      ['Overtime Rate', newOvertimeRate],
    ];
    for (const [label, value] of negativeFieldChecks) {
      if (!Number.isFinite(value)) {
        return res.status(400).json({ error: `${label} must be a number.` });
      }
      if (value < 0) {
        return res.status(400).json({ error: `${label} cannot be negative.` });
      }
    }

    // Recalculate line. Wage basis follows wageType, and paid leave counts as time
    // worked, exactly as in the calculation engine -- otherwise editing an allowance on
    // a line would silently strip the employee's leave pay out of it.
    const hourly = isHourlyPaid(currentLine);
    const linePaidLeaveDays = Number(currentLine.paidLeaveDays) || 0;
    let newGross = 0;
    let newPayableDays = currentLine.daysWorked;
    let newPayableHours = currentLine.hoursWorked;
    if (hourly) {
      newPayableHours = roundOMR(currentLine.hoursWorked + linePaidLeaveDays * STANDARD_HOURS_PER_DAY);
      newGross = roundOMR(newPayableHours * newRate);
    } else {
      newPayableDays = Math.min(currentLine.daysWorked + linePaidLeaveDays, STANDARD_DAYS_PER_MONTH);
      newGross = roundOMR((newRate / STANDARD_DAYS_PER_MONTH) * newPayableDays);
    }

    const newOvertimePay = roundOMR((Number(currentLine.overtimeHours) || 0) * newOvertimeRate);
    const attendanceBonus = roundOMR(Number(currentLine.attendanceBonus) || 0);
    const attendanceDeduction = roundOMR(Number(currentLine.attendanceDeduction) || 0);

    const newTotalAdd = roundOMR(newHouse + newTransport + newBonus + newOtherAdd + newOvertimePay + attendanceBonus);
    const newTotalDed = roundOMR(newLoanRec + newOtherDed + attendanceDeduction);
    const newNet = roundOMR(newGross + newTotalAdd - newTotalDed);

    // A negative net salary is never a payable outcome: it would mean the employee owes
    // the company through the payroll run, which this system has no mechanism to collect,
    // and it corrupts every downstream total (outstanding salary, WPS recoverable,
    // company/period roll-ups) that sums net across employees.
    if (newNet < 0) {
      return res.status(400).json({
        error:
          `Deductions (OMR ${newTotalDed.toFixed(3)}) exceed gross salary plus additions ` +
          `(OMR ${roundOMR(newGross + newTotalAdd).toFixed(3)}). Net salary cannot be negative — ` +
          'reduce the loan recovery or other deductions, or carry the balance to a later month.',
      });
    }

    // Same wage-basis gate as the calculation engine: no work, no recoverable.
    const hasWageBasis = newPayableHours > 0 || newPayableDays > 0;
    let newRecoverable = 0;
    if (currentLine.wpsEmployee === 'Yes' && newWpsSalary > 0 && hasWageBasis) {
      newRecoverable = roundOMR(Math.max(newWpsSalary - newNet, 0));
    }

    lines[lineIndex] = {
      ...currentLine,
      basicSalaryOrRate: newRate,
      rateOverridden: newRateOverridden,
      overtimeRate: newOvertimeRate,
      overtimePay: newOvertimePay,
      grossSalary: newGross,
      houseAllowance: newHouse,
      transportAllowance: newTransport,
      bonus: newBonus,
      otherAllowance: newOtherAdd,
      totalAdditions: newTotalAdd,
      loanRecovery: newLoanRec,
      otherDeductions: newOtherDed,
      totalDeductions: newTotalDed,
      netSalary: newNet,
      paymentMethod: paymentMethod || currentLine.paymentMethod,
      wpsSalary: newWpsSalary,
      recoverableSalary: newRecoverable,
      recoverFrom: recoverFrom !== undefined ? recoverFrom : currentLine.recoverFrom,
      updatedAt: new Date().toISOString(),
    };

    // Update payroll totals
    payroll.totalGrossSalary = roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0));
    payroll.totalAdditions = roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0));
    payroll.totalDeductions = roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0));
    payroll.totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
    payroll.totalWpsSalary = roundOMR(lines.reduce((s, l) => s + l.wpsSalary, 0));
    payroll.totalRecoverableSalary = roundOMR(lines.reduce((s, l) => s + l.recoverableSalary, 0));
    payroll.totalOvertimePay = roundOMR(lines.reduce((s, l) => s + (l.overtimePay || 0), 0));

    const saved = await db.payroll.saveDraft(payroll, lines);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update payroll line' });
  }
});

// POST /api/payroll/:month/finalize - Finalize payroll
router.post('/:month/finalize', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const { overrideReason } = req.body || {};
    const user = req.user?.username || 'Admin';

    // Finalisation locks every company's lines for the month, so it is not available to
    // an account limited to a subset of companies.
    if (companyScopeOf(req.user) !== null) {
      return res.status(403).json({
        error: 'Your account is limited to specific companies and cannot finalize an organisation-wide payroll.',
      });
    }

    // Attendance approval now gates finalisation. The four-stage attendance workflow
    // previously had no effect on payroll at all -- a month could be finalised straight
    // from unapproved Draft attendance. An override remains possible so an in-flight
    // month is never locked out, but it must carry a reason and is recorded as such.
    const attendanceMonth = db.attendanceMonths.getByMonth(month);
    const attendanceStatus = attendanceMonth?.status || 'Draft';
    const attendanceApproved = attendanceStatus === 'Approved' || attendanceStatus === 'Finalized';
    const reason = overrideReason ? String(overrideReason).trim() : '';

    if (!attendanceApproved && !reason) {
      return res.status(400).json({
        error:
          `Attendance for ${month} is ${attendanceStatus}, not Approved. ` +
          'Approve the attendance first, or supply an override reason to finalize payroll anyway.',
        attendanceStatus,
        requiresOverride: true,
      });
    }

    const finalized = await db.payroll.finalize(month, user);

    await db.audit.log({
      userId: req.user?.id,
      username: user,
      userRole: req.user?.role || 'Payroll User',
      action: 'PAYROLL_FINALIZED',
      module: 'Payroll',
      recordId: finalized.id,
      description:
        `Finalized payroll for ${month}. Total Net Salary: OMR ${finalized.totalNetSalary.toFixed(3)}. Snapshot locked. ` +
        (attendanceApproved
          ? `Attendance status: ${attendanceStatus}.`
          : `OVERRIDE: finalized against ${attendanceStatus} attendance. Reason: ${reason}`),
      newValue: { attendanceStatus, overrideUsed: !attendanceApproved, overrideReason: reason || undefined },
    });

    res.json(finalized);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to finalize payroll.' });
  }
});

// POST /api/payroll/:month/revise - Request revision of finalized payroll
router.post('/:month/revise', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const { reason } = req.body;
    const user = req.user?.username || 'Admin';

    if (companyScopeOf(req.user) !== null) {
      return res.status(403).json({
        error: 'Your account is limited to specific companies and cannot revise an organisation-wide payroll.',
      });
    }

    const result = await db.payroll.revise(month, reason || 'Revision requested', user);

    await db.audit.log({
      userId: req.user?.id,
      username: user,
      userRole: req.user?.role || 'Payroll User',
      action: 'PAYROLL_REVISION_INITIATED',
      module: 'Payroll',
      recordId: result.payroll.id,
      description: `Initiated Revision #${result.revision.revisionNumber} for ${month}. Reason: ${result.revision.reason}`,
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to initiate revision.' });
  }
});

// GET /api/payroll/:month/revisions - Get revision history for a month
router.get('/:month/revisions', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const revisions = db.payroll.getRevisions(month);
    res.json(revisions);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch revisions' });
  }
});

// GET /api/payroll/:month/export - Export monthly payroll sheet to Excel
router.get('/:month/export', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.params;
    const payroll = db.payroll.getByMonth(month);

    if (!payroll || !payroll.lines || payroll.lines.length === 0) {
      return res.status(404).json({ error: `No payroll records found for ${month}` });
    }

    const data = payroll.lines.map((l, idx) => ({
      'Sr#': idx + 1,
      'Employee ID': l.employeeId,
      'Employee Name': l.employeeName,
      'Employee Type': l.employeeType,
      'Designation': l.designation,
      'Company': l.employeeCompany,
      'Salary Paid By': l.salaryPaidBy,
      'Projects Summary': l.projectsSummary,
      'Days Worked': l.daysWorked,
      'Hours Worked': l.hoursWorked,
      'Basic Salary / Rate (OMR)': roundOMR(l.basicSalaryOrRate).toFixed(3),
      'Gross Salary (OMR)': roundOMR(l.grossSalary).toFixed(3),
      'House Allowance (OMR)': roundOMR(l.houseAllowance).toFixed(3),
      'Transport (OMR)': roundOMR(l.transportAllowance).toFixed(3),
      'Bonus (OMR)': roundOMR(l.bonus).toFixed(3),
      'Other Allowance (OMR)': roundOMR(l.otherAllowance).toFixed(3),
      'Total Additions (OMR)': roundOMR(l.totalAdditions).toFixed(3),
      'Loan Recovery (OMR)': roundOMR(l.loanRecovery).toFixed(3),
      'Other Deductions (OMR)': roundOMR(l.otherDeductions).toFixed(3),
      'Total Deductions (OMR)': roundOMR(l.totalDeductions).toFixed(3),
      'Net Salary (OMR)': roundOMR(l.netSalary).toFixed(3),
      'Payment Method': l.paymentMethod,
      'WPS Salary (OMR)': roundOMR(l.wpsSalary).toFixed(3),
      'Recoverable Salary (OMR)': roundOMR(l.recoverableSalary).toFixed(3),
      'Recover From': l.recoverFrom || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 20 },
      { wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 12 },
      { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 },
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 16 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Payroll_${month}`);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Payroll_Sheet_${month}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export payroll' });
  }
});

export default router;
