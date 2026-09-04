import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, AuthRequest, companyScopeOf, canSeeCompany } from '../auth.js';
import type { EmployeeCompany } from '../../src/types/index';

const router = Router();

// Company isolation for every report in this file. Reports read straight from payroll
// lines and employee records, so each entry point applies the caller's scope before any
// user-supplied filter -- clearing the company filter can never widen the result set.
function scopedEmployees(req: AuthRequest) {
  const scope = companyScopeOf(req.user);
  return db.employees.getAll().filter(e => canSeeCompany(scope, e.employeeCompany));
}

function lineInScope(req: AuthRequest, line: { employeeCompany?: string }): boolean {
  return canSeeCompany(companyScopeOf(req.user), line.employeeCompany);
}

// GET /api/reports/employee - Employee category reports
router.get('/employee', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { reportType, company, nationality, wageType, exportFormat } = req.query;
    let employees = scopedEmployees(req);

    if (reportType === 'active') employees = employees.filter(e => e.isActive);
    else if (reportType === 'former') employees = employees.filter(e => !e.isActive);
    else if (reportType === 'staff') employees = employees.filter(e => e.employeeType === 'Staff');
    else if (reportType === 'workers') employees = employees.filter(e => e.employeeType === 'Worker');
    else if (reportType === 'omani') employees = employees.filter(e => e.nationalityType === 'Omani');
    else if (reportType === 'expat') employees = employees.filter(e => e.nationalityType === 'Expat');

    if (company && company !== 'ALL') employees = employees.filter(e => e.employeeCompany === company);
    if (nationality && nationality !== 'ALL') employees = employees.filter(e => e.nationalityType === nationality);
    if (wageType && wageType !== 'ALL') employees = employees.filter(e => e.wageType === wageType);

    if (exportFormat === 'excel') {
      const data = employees.map((e, idx) => ({
        'Sr#': idx + 1,
        'Employee ID': e.employeeId,
        'Employee Name': e.employeeName,
        'Employee Type': e.employeeType,
        'Nationality': e.nationalityType,
        'Wage Type': e.wageType,
        'Company': e.employeeCompany,
        'Paid By': e.salaryPaidBy,
        'Designation': e.designation,
        'Joining Date': e.dateOfJoining,
        'Leaving Date': e.dateOfLeaving || '',
        'Monthly Rate (OMR)': roundOMR(e.monthlySalaryOrRate).toFixed(3),
        'WPS Status': e.wpsEmployee,
        'Status': e.isActive ? 'Active' : 'Inactive',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Employee_Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Employee_Report_${reportType || 'all'}.xlsx"`);
      return res.send(buffer);
    }

    res.json(employees);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate employee report' });
  }
});

// GET /api/reports/payroll - Monthly and employee-wise payroll reports
router.get('/payroll', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month, company, paidBy, employeeType, exportFormat } = req.query;

    // Draft months are uncommitted and are excluded here, matching /reports/salary-payroll.
    // Including them previously made the two payroll reports disagree on the same period.
    // includeDraft=true is available for a deliberate work-in-progress view.
    const includeDraft = String(req.query.includeDraft || '') === 'true';
    const allPayrolls = db.payroll.getAll().filter(p => includeDraft || p.status !== 'Draft');
    let lines: any[] = [];

    for (const p of allPayrolls) {
      if (month && month !== 'ALL' && p.payrollMonth !== month) continue;
      const details = db.payroll.getByMonth(p.payrollMonth);
      if (details?.lines) {
        for (const l of details.lines) {
          if (!lineInScope(req, l)) continue;
          if (company && company !== 'ALL' && l.employeeCompany !== company) continue;
          if (paidBy && paidBy !== 'ALL' && l.salaryPaidBy !== paidBy) continue;
          if (employeeType && employeeType !== 'ALL' && l.employeeType !== employeeType) continue;

          lines.push({
            payrollMonth: p.payrollMonth,
            payrollStatus: p.status,
            ...l,
          });
        }
      }
    }

    if (exportFormat === 'excel') {
      const data = lines.map((l, idx) => ({
        'Sr#': idx + 1,
        'Month': l.payrollMonth,
        'Employee ID': l.employeeId,
        'Employee Name': l.employeeName,
        'Type': l.employeeType,
        'Designation': l.designation,
        'Company': l.employeeCompany,
        'Paid By': l.salaryPaidBy,
        'Projects': l.projectsSummary,
        'Gross Salary (OMR)': roundOMR(l.grossSalary).toFixed(3),
        'Total Additions (OMR)': roundOMR(l.totalAdditions).toFixed(3),
        'Total Deductions (OMR)': roundOMR(l.totalDeductions).toFixed(3),
        'Net Salary (OMR)': roundOMR(l.netSalary).toFixed(3),
        'WPS Salary (OMR)': roundOMR(l.wpsSalary).toFixed(3),
        'Recoverable WPS (OMR)': roundOMR(l.recoverableSalary).toFixed(3),
        'Payment Method': l.paymentMethod,
        'Status': l.payrollStatus,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Payroll_Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Payroll_Report.xlsx"');
      return res.send(buffer);
    }

    const totalGrossSalary = roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0));
    const totalAdditions = roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0));
    const totalDeductions = roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0));
    const totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
    const matchingPayroll = month && month !== 'ALL' ? allPayrolls.find(p => p.payrollMonth === month) : undefined;

    res.json({
      totalGrossSalary,
      totalAdditions,
      totalDeductions,
      totalNetSalary,
      status: matchingPayroll?.status || 'Draft',
      lines,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate payroll report' });
  }
});

// GET /api/reports/payments - Salary payments report
router.get('/payments', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month, status, company, paidBy, receiptStatus, exportFormat } = req.query;

    const allPayrolls = db.payroll.getAll().filter(p => p.status === 'Finalized');
    const allPayments = db.salaryPayments.getAll().filter(p => !p.isReversed);

    const rows: any[] = [];
    let sr = 1;

    for (const p of allPayrolls) {
      if (month && month !== 'ALL' && p.payrollMonth !== month) continue;
      const details = db.payroll.getByMonth(p.payrollMonth);
      if (!details?.lines) continue;

      for (const line of details.lines) {
        if (!lineInScope(req, line)) continue;
        if (company && company !== 'ALL' && line.employeeCompany !== company) continue;
        if (paidBy && paidBy !== 'ALL' && line.salaryPaidBy !== paidBy) continue;

        const normId = normalizeEmployeeId(line.employeeId);
        const linePayments = allPayments.filter(
          tx => normalizeEmployeeId(tx.employeeId) === normId && tx.payrollMonth === p.payrollMonth
        );

        const totalPaid = roundOMR(linePayments.reduce((s, tx) => s + tx.payAmount, 0));
        const outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));

        let payStatus = 'Unpaid';
        // Nothing payable is its own state -- see PaymentStatus in src/types.
        if (line.netSalary <= 0 && totalPaid <= 0) payStatus = 'No Payable';
        else if (totalPaid >= line.netSalary) payStatus = 'Fully Paid';
        else if (totalPaid > 0) payStatus = 'Partially Paid';

        if (status && status !== 'ALL' && payStatus !== status) continue;

        let lineReceiptStatus = 'No Payments';
        if (linePayments.length > 0) {
          const hasPending = linePayments.some(tx => tx.receiptStatus === 'Attachment Pending');
          lineReceiptStatus = hasPending ? 'Attachment Pending' : 'Attached';
        }

        if (receiptStatus && receiptStatus !== 'ALL' && lineReceiptStatus !== receiptStatus) continue;

        rows.push({
          sr: sr++,
          employeeId: line.employeeId,
          employeeName: line.employeeName,
          payrollMonth: p.payrollMonth,
          company: line.employeeCompany,
          salaryPaidBy: line.salaryPaidBy,
          grossSalary: line.grossSalary,
          totalAdditions: line.totalAdditions,
          totalDeductions: line.totalDeductions,
          netSalary: line.netSalary,
          totalPaid,
          outstanding,
          status: payStatus,
          receiptStatus: lineReceiptStatus,
          paymentCount: linePayments.length,
        });
      }
    }

    if (exportFormat === 'excel') {
      const data = rows.map(r => ({
        'Sr#': r.sr,
        'Employee ID': r.employeeId,
        'Employee Name': r.employeeName,
        'Salary Month': r.payrollMonth,
        'Company': r.company,
        'Paid By': r.salaryPaidBy,
        'Gross (OMR)': roundOMR(r.grossSalary).toFixed(3),
        'Additions (OMR)': roundOMR(r.totalAdditions).toFixed(3),
        'Deductions (OMR)': roundOMR(r.totalDeductions).toFixed(3),
        'Net Salary (OMR)': roundOMR(r.netSalary).toFixed(3),
        'Total Paid (OMR)': roundOMR(r.totalPaid).toFixed(3),
        'Outstanding (OMR)': roundOMR(r.outstanding).toFixed(3),
        'Payment Status': r.status,
        'Receipt Status': r.receiptStatus,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Salary_Payments_Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Salary_Payments_Report.xlsx"');
      return res.send(buffer);
    }

    res.json({
      summary: {
        totalNetSalaryOwed: roundOMR(rows.reduce((s, r) => s + r.netSalary, 0)),
        totalActuallyPaid: roundOMR(rows.reduce((s, r) => s + r.totalPaid, 0)),
        totalRemainingBalance: roundOMR(rows.reduce((s, r) => s + r.outstanding, 0)),
      },
      ledger: rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate payments report' });
  }
});

// GET /api/reports/wps - WPS Recovery reports
router.get('/wps', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month, status, exportFormat } = req.query;
    let list = db.wps.getAll();

    if (month && month !== 'ALL') list = list.filter(w => w.payrollMonth === month);
    if (status && status !== 'ALL') list = list.filter(w => w.status === status);

    if (exportFormat === 'excel') {
      const data = list.map((w, idx) => ({
        'Sr#': idx + 1,
        'Employee ID': w.employeeId,
        'Employee Name': w.employeeName,
        'Month': w.payrollMonth,
        'WPS Salary (OMR)': roundOMR(w.wpsSalary).toFixed(3),
        'Net Salary (OMR)': roundOMR(w.netSalary).toFixed(3),
        'Total Recoverable (OMR)': roundOMR(w.totalRecoverable).toFixed(3),
        'Recovered From': w.recoveredFrom,
        'Total Recovered (OMR)': roundOMR(w.totalRecovered).toFixed(3),
        'Remaining Balance (OMR)': roundOMR(w.remainingBalance).toFixed(3),
        'Status': w.status,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'WPS_Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="WPS_Recovery_Report.xlsx"');
      return res.send(buffer);
    }

    res.json({
      summary: {
        totalRecoverable: roundOMR(list.reduce((s, w) => s + w.totalRecoverable, 0)),
        totalRecovered: roundOMR(list.reduce((s, w) => s + w.totalRecovered, 0)),
        totalRemaining: roundOMR(list.reduce((s, w) => s + w.remainingBalance, 0)),
      },
      records: list,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate WPS report' });
  }
});

// GET /api/reports/loans - Loans reports
router.get('/loans', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { status, exportFormat } = req.query;
    let loans = db.loans.getAll();

    if (status && status !== 'ALL') loans = loans.filter(l => l.status === status);

    if (exportFormat === 'excel') {
      const data = loans.map((l, idx) => ({
        'Sr#': idx + 1,
        'Employee ID': l.employeeId,
        'Employee Name': l.employeeName,
        'Loan Date': l.loanDate,
        'Loan Amount (OMR)': roundOMR(l.loanAmount).toFixed(3),
        'Monthly Recovery (OMR)': roundOMR(l.monthlyRecoveryAmount).toFixed(3),
        'Total Recovered (OMR)': roundOMR(l.totalRecovered).toFixed(3),
        'Outstanding Balance (OMR)': roundOMR(l.outstandingBalance).toFixed(3),
        'Status': l.status,
        'Remarks': l.remarks || '',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Loans_Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Loans_Report.xlsx"');
      return res.send(buffer);
    }

    res.json({
      summary: {
        totalPrincipal: roundOMR(loans.reduce((s, l) => s + l.loanAmount, 0)),
        totalRepaid: roundOMR(loans.reduce((s, l) => s + l.totalRecovered, 0)),
        totalOutstanding: roundOMR(loans.reduce((s, l) => s + l.outstandingBalance, 0)),
      },
      loans,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate loans report' });
  }
});

// GET /api/reports/project-costing - Per-project labor & cost analysis (Attendance + Timesheet)
router.get('/project-costing', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month, projectId } = req.query as { month?: string; projectId?: string };
    if (!month) return res.status(400).json({ error: 'month is required (YYYY-MM)' });

    const projects = db.projects.getAll().filter(p => !projectId || p.id === projectId);
    const attendanceRecords = db.attendance.getByMonth(month);
    const timesheetEntries = db.timesheets.getByMonth(month);
    const employees = scopedEmployees(req);
    const employeeById = new Map(employees.map(e => [normalizeEmployeeId(e.employeeId), e]));

    const rows = projects.map(project => {
      const attForProject = attendanceRecords.filter(a =>
        a.projectId === project.id || a.projectCode === project.projectCode
      );
      const tsForProject = timesheetEntries.filter(t =>
        t.projectId === project.id || t.projectCode === project.projectCode
      );

      const employeeIds = new Set<string>([
        ...attForProject.map(a => normalizeEmployeeId(a.employeeId)),
        ...tsForProject.map(t => normalizeEmployeeId(t.employeeId)),
      ]);

      let totalDays = 0;
      let totalHours = 0;
      let totalOvertimeHours = 0;
      let totalBonus = 0;
      let totalDeduction = 0;
      let estimatedCost = 0;

      for (const empId of employeeIds) {
        const emp = employeeById.get(empId);
        const empAttendance = attForProject.filter(a => normalizeEmployeeId(a.employeeId) === empId);
        const empTimesheet = tsForProject.filter(t => normalizeEmployeeId(t.employeeId) === empId);

        const days = empAttendance.reduce((s, a) => s + (Number(a.daysWorked) || 0), 0);
        const hours = empAttendance.reduce((s, a) => s + (Number(a.hoursWorked) || 0), 0)
          + empTimesheet.reduce((s, t) => s + (Number(t.normalHours) || 0), 0);
        const overtime = empAttendance.reduce((s, a) => s + (Number(a.overtimeHours) || 0), 0)
          + empTimesheet.reduce((s, t) => s + (Number(t.overtimeHours) || 0), 0);
        const bonus = empAttendance.reduce((s, a) => s + (Number(a.bonus) || 0), 0);
        const deduction = empAttendance.reduce((s, a) => s + (Number(a.deduction) || 0), 0);

        totalDays += days;
        totalHours += hours;
        totalOvertimeHours += overtime;
        totalBonus += bonus;
        totalDeduction += deduction;

        if (emp) {
          const rate = roundOMR(Number(emp.monthlySalaryOrRate) || 0);
          estimatedCost += emp.employeeType === 'Worker'
            ? roundOMR(hours * rate)
            : roundOMR((rate / 30) * Math.min(days, 30));
        }
      }

      return {
        projectId: project.id,
        projectCode: project.projectCode,
        projectName: project.projectName,
        status: project.status,
        employeeCount: employeeIds.size,
        totalDays: roundOMR(totalDays),
        totalHours: roundOMR(totalHours),
        totalOvertimeHours: roundOMR(totalOvertimeHours),
        totalBonus: roundOMR(totalBonus),
        totalDeduction: roundOMR(totalDeduction),
        estimatedCost: roundOMR(estimatedCost),
        timesheetEntryCount: tsForProject.length,
      };
    });

    res.json({
      month,
      summary: {
        totalProjects: rows.length,
        totalEstimatedCost: roundOMR(rows.reduce((s, r) => s + r.estimatedCost, 0)),
        totalEmployeeAllocations: rows.reduce((s, r) => s + r.employeeCount, 0),
      },
      projects: rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate project costing report' });
  }
});

// ==================== Salary & Payroll Report (comprehensive) ====================
// Pipeline: buildUnifiedReportRows -> applyReportFilters -> computeReportAnalytics /
// computeReportExceptions -> sort/paginate. Reuses calculateEmployeeLine's existing
// Gross/Additions/Deductions/Net fields (already on PayrollLine) and the exact
// Finalized-only paid/outstanding/status formula already used by /payments and
// paymentPlanning.ts's computePlanningRows() -- never re-derived, never duplicated.
//
// Payroll status gating (see plan's "Critical correctness finding"): Draft months are
// excluded entirely (not yet committed). Finalized + In Revision months are included for
// Gross/Additions/Deductions/Net, but paid/outstanding/paymentStatus are only ever
// computed for Finalized rows -- an In-Revision row gets paymentStatus:'In Revision' and
// totalPaid/outstanding: null, never a fabricated Unpaid/0, since db.payroll.revise()
// flips status without touching salaryPayments (a real payment could exist against a
// month whose Gross/Net has since changed).

const REPORT_EXCEPTION_TOLERANCE = 0.001;

function buildUnifiedReportRows(scope: EmployeeCompany[] | null = null): any[] {
  const allPayrolls = db.payroll.getAll().filter(p => p.status === 'Finalized' || p.status === 'In Revision');
  const allPayments = db.salaryPayments.getAll().filter(p => !p.isReversed);

  const rows: any[] = [];
  for (const payroll of allPayrolls) {
    const details = db.payroll.getByMonth(payroll.payrollMonth);
    if (!details?.lines) continue;

    for (const line of details.lines) {
      if (!canSeeCompany(scope, line.employeeCompany)) continue;
      const normId = normalizeEmployeeId(line.employeeId);

      let totalPaid: number | null = null;
      let outstanding: number | null = null;
      let paymentStatus = 'In Revision';

      if (payroll.status === 'Finalized') {
        const linePayments = allPayments.filter(
          tx => normalizeEmployeeId(tx.employeeId) === normId && tx.payrollMonth === payroll.payrollMonth
        );
        totalPaid = roundOMR(linePayments.reduce((s, tx) => s + tx.payAmount, 0));
        outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));
        if (line.netSalary <= 0 && totalPaid <= 0) paymentStatus = 'No Payable';
        else if (totalPaid >= line.netSalary) paymentStatus = 'Fully Paid';
        else if (totalPaid > 0) paymentStatus = 'Partially Paid';
        else paymentStatus = 'Unpaid';
      }

      rows.push({
        payrollMonth: payroll.payrollMonth,
        payrollStatus: payroll.status,
        employeeId: line.employeeId,
        employeeName: line.employeeName,
        employeeType: line.employeeType,
        nationalityType: line.nationalityType,
        designation: line.designation,
        employeeCompany: line.employeeCompany,
        salaryPaidBy: line.salaryPaidBy,
        projectsSummary: line.projectsSummary,
        daysWorked: line.daysWorked,
        hoursWorked: line.hoursWorked,
        basicSalaryOrRate: line.basicSalaryOrRate,
        grossSalary: line.grossSalary,
        houseAllowance: line.houseAllowance,
        transportAllowance: line.transportAllowance,
        bonus: line.bonus,
        otherAllowance: line.otherAllowance,
        totalAdditions: line.totalAdditions,
        loanRecovery: line.loanRecovery,
        otherDeductions: line.otherDeductions,
        totalDeductions: line.totalDeductions,
        netSalary: line.netSalary,
        wpsEmployee: line.wpsEmployee,
        wpsSalary: line.wpsSalary,
        recoverableSalary: line.recoverableSalary,
        totalPaid,
        outstanding,
        paymentStatus,
      });
    }
  }
  return rows;
}

function parseMultiParam(v: any): string[] | null {
  if (v === undefined || v === null || v === '') return null;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const cleaned = arr.map(s => String(s).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function applyReportFilters(rows: any[], query: any) {
  const month = parseMultiParam(query.month);
  const company = parseMultiParam(query.company);
  const payBy = parseMultiParam(query.payBy);
  const employeeType = parseMultiParam(query.employeeType);
  const wpsStatus = parseMultiParam(query.wpsStatus);
  const paymentStatus = parseMultiParam(query.paymentStatus);
  const designation = parseMultiParam(query.designation);
  const nationality = parseMultiParam(query.nationality);
  const payrollStatus = parseMultiParam(query.payrollStatus);
  const project = parseMultiParam(query.project);
  const search = query.search ? String(query.search).toLowerCase() : '';
  const grossMin = query.grossMin !== undefined && query.grossMin !== '' ? Number(query.grossMin) : undefined;
  const grossMax = query.grossMax !== undefined && query.grossMax !== '' ? Number(query.grossMax) : undefined;
  const netMin = query.netMin !== undefined && query.netMin !== '' ? Number(query.netMin) : undefined;
  const netMax = query.netMax !== undefined && query.netMax !== '' ? Number(query.netMax) : undefined;
  const outstandingMin = query.outstandingMin !== undefined && query.outstandingMin !== '' ? Number(query.outstandingMin) : undefined;
  const outstandingMax = query.outstandingMax !== undefined && query.outstandingMax !== '' ? Number(query.outstandingMax) : undefined;

  return rows.filter(r => {
    if (month && !month.includes(r.payrollMonth)) return false;
    if (company && !company.includes(r.employeeCompany)) return false;
    if (payBy && !payBy.includes(r.salaryPaidBy)) return false;
    if (employeeType && !employeeType.includes(r.employeeType)) return false;
    if (wpsStatus && !wpsStatus.includes(r.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS')) return false;
    if (paymentStatus && !paymentStatus.includes(r.paymentStatus)) return false;
    if (designation && !designation.includes(r.designation)) return false;
    if (nationality && !nationality.includes(r.nationalityType)) return false;
    if (payrollStatus && !payrollStatus.includes(r.payrollStatus)) return false;
    if (project && !project.some(p => (r.projectsSummary || '').includes(p))) return false;
    if (search) {
      const hay = `${r.employeeId} ${r.employeeName} ${r.designation} ${r.employeeCompany} ${r.projectsSummary}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (grossMin !== undefined && r.grossSalary < grossMin) return false;
    if (grossMax !== undefined && r.grossSalary > grossMax) return false;
    if (netMin !== undefined && r.netSalary < netMin) return false;
    if (netMax !== undefined && r.netSalary > netMax) return false;
    if (outstandingMin !== undefined && (r.outstanding ?? -Infinity) < outstandingMin) return false;
    if (outstandingMax !== undefined && (r.outstanding ?? Infinity) > outstandingMax) return false;
    return true;
  });
}

function computeReportAnalytics(rows: any[]) {
  const sum = (arr: any[], sel: (r: any) => number) => roundOMR(arr.reduce((s, r) => s + (Number(sel(r)) || 0), 0));

  const groupBy = (keyFn: (r: any) => string) => {
    const map = new Map<string, any[]>();
    rows.forEach(r => {
      const key = keyFn(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  };

  const buildBreakdown = (map: Map<string, any[]>, labelKey: string) =>
    Array.from(map.entries()).map(([key, groupRows]) => {
      const finalizedGroup = groupRows.filter(r => r.payrollStatus === 'Finalized');
      return {
        [labelKey]: key,
        employees: new Set(groupRows.map(r => r.employeeId)).size,
        gross: sum(groupRows, r => r.grossSalary),
        additions: sum(groupRows, r => r.totalAdditions),
        deductions: sum(groupRows, r => r.totalDeductions),
        net: sum(groupRows, r => r.netSalary),
        paid: sum(finalizedGroup, r => r.totalPaid || 0),
        outstanding: sum(finalizedGroup, r => r.outstanding || 0),
      };
    }).sort((a: any, b: any) => b.gross - a.gross);

  const companyBreakdown = buildBreakdown(groupBy(r => r.employeeCompany), 'company');
  const payByBreakdown = buildBreakdown(groupBy(r => r.salaryPaidBy), 'payBy');
  const employeeTypeBreakdown = buildBreakdown(groupBy(r => r.employeeType), 'employeeType');
  const wpsBreakdown = buildBreakdown(groupBy(r => (r.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS')), 'wpsStatus');
  const paymentStatusBreakdown = buildBreakdown(groupBy(r => r.paymentStatus), 'paymentStatus');

  // Real configured categories only -- exactly what calculateEmployeeLine() computes.
  const additionsBreakdown = [
    { type: 'House Allowance', employees: rows.filter(r => r.houseAllowance > 0).length, amount: sum(rows, r => r.houseAllowance) },
    { type: 'Transport Allowance', employees: rows.filter(r => r.transportAllowance > 0).length, amount: sum(rows, r => r.transportAllowance) },
    { type: 'Bonus', employees: rows.filter(r => r.bonus > 0).length, amount: sum(rows, r => r.bonus) },
    { type: 'Other Allowance', employees: rows.filter(r => r.otherAllowance > 0).length, amount: sum(rows, r => r.otherAllowance) },
  ];
  const deductionsBreakdown = [
    { type: 'Loan Recovery', employees: rows.filter(r => r.loanRecovery > 0).length, amount: sum(rows, r => r.loanRecovery) },
    { type: 'Other Deductions', employees: rows.filter(r => r.otherDeductions > 0).length, amount: sum(rows, r => r.otherDeductions) },
  ];

  // Project breakdown from the existing projectsSummary text (e.g. "PRJ-A (12d), PRJ-B (5d)").
  // An employee working multiple projects has their full line attributed to each project they
  // appear in -- this is an allocation view, not a cost split -- so it must never be summed
  // into company/pay-by/employee-type totals (those group by employeeId once, above).
  const projectMap = new Map<string, { employees: Set<string>; gross: number; additions: number; deductions: number; net: number }>();
  rows.forEach(r => {
    if (!r.projectsSummary || r.projectsSummary === 'No Attendance') return;
    r.projectsSummary.split(',').map((s: string) => s.trim()).forEach((part: string) => {
      // projectsSummary segments are "<projectCode> (<value><unit>)" -- the code itself may
      // contain spaces (e.g. "Project A"), so strip only the trailing "(...)" suffix rather
      // than naively splitting on the first space.
      const code = part.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (!code) return;
      if (!projectMap.has(code)) projectMap.set(code, { employees: new Set(), gross: 0, additions: 0, deductions: 0, net: 0 });
      const p = projectMap.get(code)!;
      p.employees.add(r.employeeId);
      p.gross += r.grossSalary;
      p.additions += r.totalAdditions;
      p.deductions += r.totalDeductions;
      p.net += r.netSalary;
    });
  });
  const projectBreakdown = Array.from(projectMap.entries()).map(([project, p]) => ({
    project,
    employees: p.employees.size,
    gross: roundOMR(p.gross),
    additions: roundOMR(p.additions),
    deductions: roundOMR(p.deductions),
    net: roundOMR(p.net),
  })).sort((a, b) => b.gross - a.gross);

  const monthMap = new Map<string, any[]>();
  rows.forEach(r => {
    if (!monthMap.has(r.payrollMonth)) monthMap.set(r.payrollMonth, []);
    monthMap.get(r.payrollMonth)!.push(r);
  });
  const monthlyTrend = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, monthRows]) => {
      const finalizedMonthRows = monthRows.filter(r => r.payrollStatus === 'Finalized');
      return {
        month,
        gross: sum(monthRows, r => r.grossSalary),
        net: sum(monthRows, r => r.netSalary),
        paid: sum(finalizedMonthRows, r => r.totalPaid || 0),
        outstanding: sum(finalizedMonthRows, r => r.outstanding || 0),
      };
    });

  const finalizedRows = rows.filter(r => r.payrollStatus === 'Finalized');
  const totalGross = sum(rows, r => r.grossSalary);
  const totalAdditions = sum(rows, r => r.totalAdditions);
  const totalDeductions = sum(rows, r => r.totalDeductions);
  const totalNet = sum(rows, r => r.netSalary);
  const totalPaid = sum(finalizedRows, r => r.totalPaid || 0);
  const totalOutstanding = sum(finalizedRows, r => r.outstanding || 0);

  return {
    reconciliation: {
      grossSalary: totalGross,
      additions: totalAdditions,
      deductions: totalDeductions,
      netSalary: totalNet,
      paid: totalPaid,
      outstanding: totalOutstanding,
      // Cash still owed on finalised payroll: what was earned (net of additions and
      // deductions) less what has actually been paid. This was previously Gross - Paid,
      // which silently discarded every allowance and deduction and so disagreed with
      // Outstanding by exactly the additions/deductions net.
      cashLiability: roundOMR(sum(finalizedRows, r => r.netSalary) - totalPaid),
    },
    companyBreakdown,
    payByBreakdown,
    employeeTypeBreakdown,
    wpsBreakdown,
    paymentStatusBreakdown,
    additionsBreakdown,
    deductionsBreakdown,
    projectBreakdown,
    monthlyTrend,
  };
}

function computeReportExceptions(rows: any[], query: any, scope: EmployeeCompany[] | null = null) {
  const exceptions: { type: string; severity: 'critical' | 'warning'; employeeId: string; payrollMonth: string; message: string }[] = [];

  rows.forEach(r => {
    if (r.grossSalary < 0 || r.netSalary < 0 || r.totalAdditions < 0 || r.totalDeductions < 0) {
      exceptions.push({
        type: 'Invalid Value', severity: 'critical', employeeId: r.employeeId, payrollMonth: r.payrollMonth,
        message: `${r.employeeId} — ${r.employeeName} (${r.payrollMonth}): negative payroll value detected`,
      });
    }
    const expectedNet = roundOMR(r.grossSalary + r.totalAdditions - r.totalDeductions);
    if (Math.abs(expectedNet - r.netSalary) > REPORT_EXCEPTION_TOLERANCE) {
      exceptions.push({
        type: 'Gross/Net Mismatch', severity: 'critical', employeeId: r.employeeId, payrollMonth: r.payrollMonth,
        message: `${r.employeeId} — ${r.employeeName} (${r.payrollMonth}): stored Net (OMR ${r.netSalary.toFixed(3)}) doesn't match Gross+Additions-Deductions (OMR ${expectedNet.toFixed(3)})`,
      });
    }
    if (!r.employeeCompany || !r.salaryPaidBy || !r.basicSalaryOrRate) {
      exceptions.push({
        type: 'Missing Core Fields', severity: 'warning', employeeId: r.employeeId, payrollMonth: r.payrollMonth,
        message: `${r.employeeId} — ${r.employeeName} (${r.payrollMonth}): missing company, pay-by, or rate`,
      });
    }
    if (r.daysWorked === 0 && r.hoursWorked === 0) {
      exceptions.push({
        type: 'No Attendance', severity: 'warning', employeeId: r.employeeId, payrollMonth: r.payrollMonth,
        message: `${r.employeeId} — ${r.employeeName} (${r.payrollMonth}): no attendance recorded for this payroll line`,
      });
    }
    // Unclamped check -- outstanding above is Math.max(0, ...) and would hide an overpayment.
    if (r.payrollStatus === 'Finalized' && r.totalPaid !== null && r.totalPaid > r.netSalary + REPORT_EXCEPTION_TOLERANCE) {
      exceptions.push({
        type: 'Overpayment', severity: 'critical', employeeId: r.employeeId, payrollMonth: r.payrollMonth,
        message: `${r.employeeId} — ${r.employeeName} (${r.payrollMonth}): paid (OMR ${r.totalPaid.toFixed(3)}) exceeds net salary (OMR ${r.netSalary.toFixed(3)})`,
      });
    }
  });

  // Duplicate payroll record -- can only fire from genuine data corruption, since payroll is
  // one-record-per-month by construction (revisions overwrite in place, never duplicate).
  const dupMap = new Map<string, number>();
  rows.forEach(r => {
    const key = `${normalizeEmployeeId(r.employeeId)}_${r.payrollMonth}`;
    dupMap.set(key, (dupMap.get(key) || 0) + 1);
  });
  dupMap.forEach((count, key) => {
    if (count > 1) {
      const [empId, month] = key.split('_');
      exceptions.push({
        type: 'Duplicate Record', severity: 'critical', employeeId: empId, payrollMonth: month,
        message: `${empId} (${month}): ${count} payroll lines found for the same employee and month`,
      });
    }
  });

  // Active employees missing from the latest included payroll month -- the comparison roster
  // is narrowed by the same employee-level filters already applied to `rows`, so this doesn't
  // false-positive when the user has filtered to e.g. one company.
  const months = Array.from(new Set(rows.map(r => r.payrollMonth))).sort();
  const latestMonth = months[months.length - 1];
  if (latestMonth) {
    const presentIds = new Set(rows.filter(r => r.payrollMonth === latestMonth).map(r => normalizeEmployeeId(r.employeeId)));
    const company = parseMultiParam(query.company);
    const payBy = parseMultiParam(query.payBy);
    const employeeType = parseMultiParam(query.employeeType);
    const nationality = parseMultiParam(query.nationality);
    const designation = parseMultiParam(query.designation);

    const candidateEmployees = db.employees.getAll().filter(e => {
      if (!e.isActive) return false;
      if (!canSeeCompany(scope, e.employeeCompany)) return false;
      if (company && !company.includes(e.employeeCompany)) return false;
      if (payBy && !payBy.includes(e.salaryPaidBy)) return false;
      if (employeeType && !employeeType.includes(e.employeeType)) return false;
      if (nationality && !nationality.includes(e.nationalityType)) return false;
      if (designation && !designation.includes(e.designation)) return false;
      return true;
    });

    candidateEmployees.forEach(e => {
      if (!presentIds.has(normalizeEmployeeId(e.employeeId))) {
        exceptions.push({
          type: 'Missing From Payroll', severity: 'warning', employeeId: e.employeeId, payrollMonth: latestMonth,
          message: `${e.employeeId} — ${e.employeeName}: active employee not found in ${latestMonth}'s payroll`,
        });
      }
    });
  }

  return exceptions;
}

function sortReportRows(rows: any[], sortBy?: string, sortDir?: string) {
  if (!sortBy) return rows;
  const dir = sortDir === 'desc' ? -1 : 1;
  const numericCols = ['grossSalary', 'netSalary', 'totalAdditions', 'totalDeductions', 'outstanding', 'totalPaid', 'daysWorked', 'hoursWorked'];
  return [...rows].sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (numericCols.includes(sortBy)) return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
    return String(av || '').localeCompare(String(bv || '')) * dir;
  });
}

const REPORT_COLUMN_DEFS: Record<string, { label: string; get: (r: any, idx: number) => any }> = {
  sr: { label: 'Sr#', get: (_r, idx) => idx + 1 },
  company: { label: 'Company', get: r => r.employeeCompany },
  payBy: { label: 'Pay By', get: r => r.salaryPaidBy },
  month: { label: 'Month', get: r => r.payrollMonth },
  wpsStatus: { label: 'WPS Status', get: r => (r.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS') },
  employeeId: { label: 'Employee ID', get: r => r.employeeId },
  employeeName: { label: 'Employee Name', get: r => r.employeeName },
  employeeType: { label: 'Employee Type', get: r => r.employeeType },
  nationality: { label: 'Nationality', get: r => r.nationalityType },
  designation: { label: 'Designation', get: r => r.designation },
  project: { label: 'Project', get: r => r.projectsSummary },
  rate: { label: 'Salary / Rate (OMR)', get: r => roundOMR(r.basicSalaryOrRate).toFixed(3) },
  hrsOrDays: { label: 'Hrs / Days', get: r => (r.employeeType === 'Staff' ? `${r.daysWorked}d` : `${r.hoursWorked}h`) },
  houseAllowance: { label: 'House Allowance (OMR)', get: r => roundOMR(r.houseAllowance).toFixed(3) },
  transportAllowance: { label: 'Transport Allowance (OMR)', get: r => roundOMR(r.transportAllowance).toFixed(3) },
  bonus: { label: 'Bonus (OMR)', get: r => roundOMR(r.bonus).toFixed(3) },
  otherAllowance: { label: 'Other Allowance (OMR)', get: r => roundOMR(r.otherAllowance).toFixed(3) },
  grossSalary: { label: 'Gross Salary (OMR)', get: r => roundOMR(r.grossSalary).toFixed(3) },
  totalAdditions: { label: 'Total Additions (OMR)', get: r => roundOMR(r.totalAdditions).toFixed(3) },
  loanRecovery: { label: 'Loan Recovery (OMR)', get: r => roundOMR(r.loanRecovery).toFixed(3) },
  otherDeductions: { label: 'Other Deductions (OMR)', get: r => roundOMR(r.otherDeductions).toFixed(3) },
  totalDeductions: { label: 'Total Deductions (OMR)', get: r => roundOMR(r.totalDeductions).toFixed(3) },
  netSalary: { label: 'Net Salary (OMR)', get: r => roundOMR(r.netSalary).toFixed(3) },
  totalPaid: { label: 'Total Paid (OMR)', get: r => (r.totalPaid === null ? '—' : roundOMR(r.totalPaid).toFixed(3)) },
  outstanding: { label: 'Outstanding (OMR)', get: r => (r.outstanding === null ? '—' : roundOMR(r.outstanding).toFixed(3)) },
  paymentStatus: { label: 'Payment Status', get: r => r.paymentStatus },
  wpsSalary: { label: 'WPS Amount (OMR)', get: r => roundOMR(r.wpsSalary).toFixed(3) },
  payrollStatus: { label: 'Payroll Status', get: r => r.payrollStatus },
};

const DEFAULT_DETAIL_COLUMNS = [
  'sr', 'company', 'payBy', 'month', 'wpsStatus', 'employeeId', 'employeeName',
  'rate', 'hrsOrDays', 'grossSalary', 'totalAdditions', 'totalDeductions', 'netSalary', 'paymentStatus',
];

// GET /api/reports/salary-payroll - Comprehensive Salary & Payroll Report (Summary + Details)
router.get('/salary-payroll', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const query = req.query as any;
    const allRows = buildUnifiedReportRows(companyScopeOf(req.user));
    const filteredRows = applyReportFilters(allRows, query);
    const analytics = computeReportAnalytics(filteredRows);
    const exceptions = computeReportExceptions(filteredRows, query, companyScopeOf(req.user));
    const sortedRows = sortReportRows(filteredRows, query.sortBy, query.sortDir);

    if (query.exportFormat === 'excel') {
      const columns = parseMultiParam(query.columns) || DEFAULT_DETAIL_COLUMNS;
      const data = sortedRows.map((r, idx) => {
        const out: Record<string, any> = {};
        columns.forEach(col => {
          const def = REPORT_COLUMN_DEFS[col];
          if (def) out[def.label] = def.get(r, idx);
        });
        return out;
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Salary_Payroll_Report');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Salary_Payroll_Report.xlsx"');
      return res.send(buffer);
    }

    const totalCount = sortedRows.length;
    const page = Math.max(1, Number(query.page) || 1);
    // Grouping needs full group membership to subtotal correctly -- bypass pagination
    // whenever a groupBy is requested, or when the client explicitly asks for everything.
    const wantsAll = query.groupBy || query.pageSize === 'all';
    const pageSize = wantsAll ? totalCount || 1 : Math.max(1, Number(query.pageSize) || 25);
    const start = (page - 1) * pageSize;
    const pagedRows = wantsAll ? sortedRows : sortedRows.slice(start, start + pageSize);

    const relevantKeys = new Set(filteredRows.map(r => `${normalizeEmployeeId(r.employeeId)}_${r.payrollMonth}`));
    const wpsRecords = db.wps.getAll().filter(w => relevantKeys.has(`${normalizeEmployeeId(w.employeeId)}_${w.payrollMonth}`));

    const months = Array.from(new Set(filteredRows.map(r => r.payrollMonth))).sort();

    res.json({
      reportingPeriod: { from: months[0] || null, to: months[months.length - 1] || null },
      summary: {
        totalEmployees: new Set(filteredRows.map(r => r.employeeId)).size,
        grossSalary: analytics.reconciliation.grossSalary,
        totalAdditions: analytics.reconciliation.additions,
        totalDeductions: analytics.reconciliation.deductions,
        netSalary: analytics.reconciliation.netSalary,
        totalPaid: analytics.reconciliation.paid,
        totalOutstanding: analytics.reconciliation.outstanding,
        wpsSalary: roundOMR(filteredRows.filter(r => r.wpsEmployee === 'Yes').reduce((s, r) => s + r.wpsSalary, 0)),
        wpsExceptions: wpsRecords.filter(w => w.status === 'Outstanding').length,
      },
      analytics,
      exceptions,
      rows: pagedRows,
      totalCount,
      page,
      pageSize,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate salary & payroll report' });
  }
});

export default router;
