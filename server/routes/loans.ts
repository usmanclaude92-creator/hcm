import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requireWritePermission, AuthRequest } from '../auth.js';
import type { EmployeeLoan, LoanRecoveryTransaction, LoanStatus } from '../../src/types/index';

const router = Router();

// GET /api/loans - List all loans with summary
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { status, search } = req.query;
    let loans = db.loans.getAll();

    if (search) {
      const q = String(search).trim().toLowerCase();
      loans = loans.filter(l =>
        l.employeeId.toLowerCase().includes(q) ||
        l.employeeName.toLowerCase().includes(q) ||
        (l.remarks && l.remarks.toLowerCase().includes(q))
      );
    }

    if (status && status !== 'ALL') {
      loans = loans.filter(l => l.status === status);
    }

    loans.sort((a, b) => new Date(b.loanDate).getTime() - new Date(a.loanDate).getTime());

    const totalLoanAmount = roundOMR(loans.reduce((s, l) => s + l.loanAmount, 0));
    const totalRecovered = roundOMR(loans.reduce((s, l) => s + l.totalRecovered, 0));
    const totalOutstanding = roundOMR(loans.reduce((s, l) => s + l.outstandingBalance, 0));

    res.json({
      summary: {
        totalLoanAmount,
        totalRecovered,
        totalOutstanding,
        activeCount: loans.filter(l => l.status === 'Active').length,
        completedCount: loans.filter(l => l.status === 'Completed').length,
      },
      loans,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch loans' });
  }
});

// POST /api/loans - Create new employee loan
router.post('/', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, loanAmount, loanDate, monthlyRecoveryAmount, remarks } = req.body;

    if (!employeeId || !loanAmount || !loanDate || !monthlyRecoveryAmount) {
      return res.status(400).json({ error: 'Employee ID, Loan Amount, Date, and Monthly Recovery are mandatory.' });
    }

    const normId = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(normId);
    if (!emp) {
      return res.status(404).json({ error: `Employee '${normId}' not found.` });
    }

    const numAmount = roundOMR(Number(loanAmount));
    const numMonthly = roundOMR(Number(monthlyRecoveryAmount));

    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Loan Amount must be greater than zero.' });
    }
    if (numMonthly <= 0) {
      return res.status(400).json({ error: 'Monthly Recovery Amount must be greater than zero.' });
    }

    const timestamp = new Date().toISOString();
    const newLoan: EmployeeLoan = {
      id: crypto.randomUUID(),
      employeeId: normId,
      employeeName: emp.employeeName,
      loanAmount: numAmount,
      loanDate,
      monthlyRecoveryAmount: numMonthly,
      totalRecovered: 0,
      outstandingBalance: numAmount,
      status: 'Active',
      remarks: remarks ? String(remarks).trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp,
      recoveries: [],
    };

    await db.loans.create(newLoan);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LOAN_CREATED',
      module: 'Loan Management',
      recordId: newLoan.id,
      description: `Issued loan of OMR ${numAmount.toFixed(3)} to ${normId} (${emp.employeeName}). Monthly recovery: OMR ${numMonthly.toFixed(3)}.`,
    });

    res.status(201).json(newLoan);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create loan' });
  }
});

// POST /api/loans/:id/repayments - Record a direct loan repayment
router.post('/:id/repayments', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { recoveryAmount, recoveryDate, remarks } = req.body;

    const loan = db.loans.findById(id);
    if (!loan) return res.status(404).json({ error: 'Loan not found.' });

    const numAmount = roundOMR(Number(recoveryAmount));
    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Repayment amount must be greater than zero.' });
    }
    if (numAmount > loan.outstandingBalance) {
      return res.status(400).json({
        error: `Repayment amount OMR ${numAmount.toFixed(3)} exceeds outstanding balance of OMR ${loan.outstandingBalance.toFixed(3)}.`
      });
    }

    const rec: LoanRecoveryTransaction = {
      id: crypto.randomUUID(),
      loanId: id,
      employeeId: loan.employeeId,
      recoverySource: 'Direct Payment',
      recoveryAmount: numAmount,
      recoveryDate: recoveryDate || new Date().toISOString().split('T')[0],
      remarks: remarks ? String(remarks).trim() : 'Direct cashier repayment',
      createdAt: new Date().toISOString(),
    };

    await db.loans.addRecovery(rec);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LOAN_REPAYMENT_RECORDED',
      module: 'Loan Management',
      recordId: id,
      description: `Recorded direct loan repayment of OMR ${numAmount.toFixed(3)} for ${loan.employeeId}.`,
    });

    res.status(201).json(db.loans.findById(id));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to record repayment' });
  }
});

// PATCH /api/loans/:id/status - Update loan status (e.g. Cancel or Complete)
router.patch('/:id/status', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Completed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid loan status.' });
    }

    const updated = await db.loans.updateStatus(id, status as LoanStatus);
    if (!updated) return res.status(404).json({ error: 'Loan not found.' });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LOAN_STATUS_UPDATED',
      module: 'Loan Management',
      recordId: id,
      description: `Updated status of loan for ${updated.employeeId} to ${status}.`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update status' });
  }
});

// GET /api/loans/export - Export loan report to Excel
router.get('/export', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const loans = db.loans.getAll();

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
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 18 },
      { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Loan_Management_Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Loans_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export loans' });
  }
});

export default router;
