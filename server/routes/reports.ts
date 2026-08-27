import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, AuthRequest } from '../auth.js';

const router = Router();

// GET /api/reports/employee - Employee category reports
router.get('/employee', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { reportType, company, nationality, wageType, exportFormat } = req.query;
    let employees = db.employees.getAll();

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

    const allPayrolls = db.payroll.getAll();
    let lines: any[] = [];

    for (const p of allPayrolls) {
      if (month && month !== 'ALL' && p.payrollMonth !== month) continue;
      const details = db.payroll.getByMonth(p.payrollMonth);
      if (details?.lines) {
        for (const l of details.lines) {
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
        if (company && company !== 'ALL' && line.employeeCompany !== company) continue;
        if (paidBy && paidBy !== 'ALL' && line.salaryPaidBy !== paidBy) continue;

        const normId = normalizeEmployeeId(line.employeeId);
        const linePayments = allPayments.filter(
          tx => normalizeEmployeeId(tx.employeeId) === normId && tx.payrollMonth === p.payrollMonth
        );

        const totalPaid = roundOMR(linePayments.reduce((s, tx) => s + tx.payAmount, 0));
        const outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));

        let payStatus = 'Unpaid';
        if (totalPaid >= line.netSalary) payStatus = 'Fully Paid';
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

export default router;
