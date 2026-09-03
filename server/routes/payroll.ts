import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requireWritePermission, requireRoles, AuthRequest } from '../auth.js';
import type { MonthlyPayroll, PayrollLine, PayrollStatus, PaymentMethod } from '../../src/types/index';

const router = Router();

// Helper to calculate a single employee line
function calculateEmployeeLine(
  emp: any,
  attendanceRecords: any[],
  payrollId: string,
  existingLine?: Partial<PayrollLine>,
  activeLoans: any[] = []
): PayrollLine {
  const empId = normalizeEmployeeId(emp.employeeId);
  const empAttendance = attendanceRecords.filter(a => normalizeEmployeeId(a.employeeId) === empId);

  // Summarize projects worked
  const projectsSummary = empAttendance.length > 0
    ? empAttendance.map(a => `${a.projectCode} (${emp.employeeType === 'Staff' ? a.daysWorked + 'd' : a.hoursWorked + 'h'})`).join(', ')
    : 'No Attendance';

  const daysWorked = empAttendance.reduce((sum, a) => sum + (Number(a.daysWorked) || 0), 0);
  const hoursWorked = empAttendance.reduce((sum, a) => sum + (Number(a.hoursWorked) || 0), 0);

  // Rate used: from existing line override if present, otherwise from Employee Master
  const basicSalaryOrRate = existingLine && existingLine.basicSalaryOrRate !== undefined
    ? roundOMR(Number(existingLine.basicSalaryOrRate))
    : roundOMR(Number(emp.monthlySalaryOrRate));

  // Gross Salary calculation rule
  let grossSalary = 0;
  if (emp.employeeType === 'Worker') {
    grossSalary = roundOMR(hoursWorked * basicSalaryOrRate);
  } else {
    // Staff: Gross = Monthly Salary ÷ 30 × Days Worked
    grossSalary = roundOMR((basicSalaryOrRate / 30) * Math.min(daysWorked, 30));
  }

  // Additions
  const houseAllowance = existingLine ? roundOMR(Number(existingLine.houseAllowance) || 0) : 0;
  const transportAllowance = existingLine ? roundOMR(Number(existingLine.transportAllowance) || 0) : 0;
  const bonus = existingLine ? roundOMR(Number(existingLine.bonus) || 0) : 0;
  const otherAllowance = existingLine ? roundOMR(Number(existingLine.otherAllowance) || 0) : 0;
  const totalAdditions = roundOMR(houseAllowance + transportAllowance + bonus + otherAllowance);

  // Deductions
  // If no existing line, suggest monthly recovery from active loan if available
  let loanRecovery = existingLine ? roundOMR(Number(existingLine.loanRecovery) || 0) : 0;
  if (!existingLine) {
    const activeLoan = activeLoans.find(l => normalizeEmployeeId(l.employeeId) === empId && l.status === 'Active');
    if (activeLoan && activeLoan.outstandingBalance > 0) {
      loanRecovery = Math.min(activeLoan.monthlyRecoveryAmount, activeLoan.outstandingBalance);
    }
  }

  const otherDeductions = existingLine ? roundOMR(Number(existingLine.otherDeductions) || 0) : 0;
  const totalDeductions = roundOMR(loanRecovery + otherDeductions);

  // Net Salary
  const netSalary = roundOMR(grossSalary + totalAdditions - totalDeductions);

  // WPS Calculations
  const wpsEmployee = emp.wpsEmployee === 'Yes' ? 'Yes' : 'No';
  const paymentMethod: PaymentMethod = existingLine?.paymentMethod || (wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS');
  const wpsSalary = roundOMR(Number(emp.wpsSalary) || 0);

  // WPS Recoverable formula: MAX(WPS Salary - Net Salary, 0)
  let recoverableSalary = 0;
  if (wpsEmployee === 'Yes' && wpsSalary > 0) {
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
    basicSalaryOrRate,
    grossSalary,
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

    res.json({
      exists: true,
      ...payroll,
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

    const existingPayroll = db.payroll.getByMonth(month);
    if (existingPayroll && existingPayroll.status === 'Finalized') {
      return res.status(400).json({
        error: `Payroll for ${month} is Finalized. Click 'Revise Payroll' to unlock revisions.`
      });
    }

    const activeEmployees = db.employees.getAll().filter(e => e.isActive);
    const attendanceRecords = db.attendance.getByMonth(month);
    const activeLoans = db.loans.getAll().filter(l => l.status === 'Active');

    const payrollId = existingPayroll?.id || crypto.randomUUID();
    const existingLinesMap = new Map<string, PayrollLine>();
    if (existingPayroll?.lines) {
      for (const line of existingPayroll.lines) {
        existingLinesMap.set(normalizeEmployeeId(line.employeeId), line);
      }
    }

    const lines: PayrollLine[] = activeEmployees.map(emp => {
      const existingLine = existingLinesMap.get(normalizeEmployeeId(emp.employeeId));
      return calculateEmployeeLine(emp, attendanceRecords, payrollId, existingLine, activeLoans);
    });

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
    } = req.body;

    const newRate = basicSalaryOrRate !== undefined ? roundOMR(Number(basicSalaryOrRate)) : currentLine.basicSalaryOrRate;
    const newHouse = houseAllowance !== undefined ? roundOMR(Number(houseAllowance)) : currentLine.houseAllowance;
    const newTransport = transportAllowance !== undefined ? roundOMR(Number(transportAllowance)) : currentLine.transportAllowance;
    const newBonus = bonus !== undefined ? roundOMR(Number(bonus)) : currentLine.bonus;
    const newOtherAdd = otherAllowance !== undefined ? roundOMR(Number(otherAllowance)) : currentLine.otherAllowance;
    const newLoanRec = loanRecovery !== undefined ? roundOMR(Number(loanRecovery)) : currentLine.loanRecovery;
    const newOtherDed = otherDeductions !== undefined ? roundOMR(Number(otherDeductions)) : currentLine.otherDeductions;
    const newWpsSalary = wpsSalary !== undefined ? roundOMR(Number(wpsSalary)) : currentLine.wpsSalary;

    const negativeFieldChecks: [string, number][] = [
      ['Basic Salary / Wage Rate', newRate],
      ['House Allowance', newHouse],
      ['Transport Allowance', newTransport],
      ['Bonus', newBonus],
      ['Other Allowance', newOtherAdd],
      ['Loan Recovery', newLoanRec],
      ['Other Deductions', newOtherDed],
      ['WPS Salary', newWpsSalary],
    ];
    for (const [label, value] of negativeFieldChecks) {
      if (isNaN(value) || value < 0) {
        return res.status(400).json({ error: `${label} cannot be negative.` });
      }
    }

    // Recalculate line
    let newGross = 0;
    if (currentLine.employeeType === 'Worker') {
      newGross = roundOMR(currentLine.hoursWorked * newRate);
    } else {
      newGross = roundOMR((newRate / 30) * Math.min(currentLine.daysWorked, 30));
    }

    const newTotalAdd = roundOMR(newHouse + newTransport + newBonus + newOtherAdd);
    const newTotalDed = roundOMR(newLoanRec + newOtherDed);
    const newNet = roundOMR(newGross + newTotalAdd - newTotalDed);

    let newRecoverable = 0;
    if (currentLine.wpsEmployee === 'Yes' && newWpsSalary > 0) {
      newRecoverable = roundOMR(Math.max(newWpsSalary - newNet, 0));
    }

    lines[lineIndex] = {
      ...currentLine,
      basicSalaryOrRate: newRate,
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
