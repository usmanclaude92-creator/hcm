import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR, ConcurrencyConflictError } from '../db.js';
import {
  verifyAuth,
  requirePermission,
  AuthRequest,
  companyScopeOf,
  canSeeCompany,
} from '../auth.js';
import { decodeReceiptDataUrl, validateReceiptFile, uploadReceipt, getSignedReceiptUrl } from '../storage.js';
import type {
  SalaryPaymentTransaction,
  PaymentStatus,
  EmployeeSalaryPaymentSummary,
  EmployeeCompany,
  SalaryPaidBy,
  WPSStatus,
} from '../../src/types/index';

const router = Router();

// Helper to calculate payment summary across all finalized payroll lines
function getGroupedPaymentSummaries(filters: {
  search?: string;
  month?: string;
  status?: string;
  company?: string;
  paidBy?: string;
  wps?: string;
  wageType?: string;
  receiptStatus?: string;
  // Companies the caller may see; null means all. Applied inside the loop so no caller
  // can bypass it by omitting the company filter.
  scope?: EmployeeCompany[] | null;
}) {
  const allPayrolls = db.payroll.getAll().filter(p => p.status === 'Finalized');
  const allPayments = db.salaryPayments.getAll().filter(p => !p.isReversed);
  const allEmployees = db.employees.getAll();

  const empMap = new Map<string, any>();
  for (const emp of allEmployees) {
    empMap.set(normalizeEmployeeId(emp.employeeId), emp);
  }

  const employeeGroupMap = new Map<string, EmployeeSalaryPaymentSummary>();

  for (const payroll of allPayrolls) {
    if (filters.month && filters.month !== 'ALL' && payroll.payrollMonth !== filters.month) {
      continue;
    }

    const payrollDetails = db.payroll.getByMonth(payroll.payrollMonth);
    if (!payrollDetails || !payrollDetails.lines) continue;

    for (const line of payrollDetails.lines) {
      const normId = normalizeEmployeeId(line.employeeId);
      const emp = empMap.get(normId);

      // Filter checks
      if (filters.search) {
        const q = filters.search.trim().toLowerCase();
        if (!normId.toLowerCase().includes(q) && !line.employeeName.toLowerCase().includes(q)) {
          continue;
        }
      }
      if (filters.company && filters.company !== 'ALL' && line.employeeCompany !== filters.company) {
        continue;
      }
      if (filters.paidBy && filters.paidBy !== 'ALL' && line.salaryPaidBy !== filters.paidBy) {
        continue;
      }
      if (filters.wps && filters.wps !== 'ALL' && line.wpsEmployee !== filters.wps) {
        continue;
      }
      if (filters.wageType && filters.wageType !== 'ALL' && line.wageType !== filters.wageType) {
        continue;
      }

      // Calculate total paid for this line
      const linePayments = allPayments.filter(
        p => normalizeEmployeeId(p.employeeId) === normId && p.payrollMonth === payroll.payrollMonth
      );

      // Company isolation: a scoped account never sees another company's salary or
      // payment history, whatever filters it sends.
      if (!canSeeCompany(filters.scope ?? null, line.employeeCompany)) continue;

      const totalPaid = roundOMR(linePayments.reduce((sum, p) => sum + p.payAmount, 0));
      const outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));

      let paymentStatus: PaymentStatus = 'Unpaid';
      if (line.netSalary <= 0 && totalPaid <= 0) {
        // Nothing was ever payable for this month, so "Fully Paid" would be misleading.
        paymentStatus = 'No Payable';
      } else if (totalPaid >= line.netSalary) {
        paymentStatus = 'Fully Paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'Partially Paid';
      }

      if (filters.status && filters.status !== 'ALL' && paymentStatus !== filters.status) {
        continue;
      }

      let lineReceiptStatus: 'Attached' | 'Attachment Pending' | 'No Payments' = 'No Payments';
      if (linePayments.length > 0) {
        const hasPending = linePayments.some(p => p.receiptStatus === 'Attachment Pending');
        lineReceiptStatus = hasPending ? 'Attachment Pending' : 'Attached';
      }

      if (filters.receiptStatus && filters.receiptStatus !== 'ALL') {
        if (filters.receiptStatus === 'Attached' && lineReceiptStatus !== 'Attached') continue;
        if (filters.receiptStatus === 'Attachment Pending' && lineReceiptStatus !== 'Attachment Pending') continue;
      }

      if (!employeeGroupMap.has(normId)) {
        employeeGroupMap.set(normId, {
          employeeId: line.employeeId,
          employeeName: line.employeeName,
          employeeCompany: line.employeeCompany as EmployeeCompany,
          salaryPaidBy: line.salaryPaidBy as SalaryPaidBy,
          wpsEmployee: line.wpsEmployee as WPSStatus,
          months: [],
          totalNetSalary: 0,
          totalPaid: 0,
          totalOutstanding: 0,
        });
      }

      const summary = employeeGroupMap.get(normId)!;
      summary.months.push({
        payrollMonth: payroll.payrollMonth,
        payrollLineId: line.id,
        employeeType: line.employeeType,
        designation: line.designation,
        paymentMethod: line.paymentMethod,
        grossSalary: line.grossSalary,
        totalAdditions: line.totalAdditions,
        totalDeductions: line.totalDeductions,
        netSalary: line.netSalary,
        totalPaid,
        outstanding,
        status: paymentStatus,
        receiptStatus: lineReceiptStatus,
        transactions: linePayments,
      });

      summary.totalNetSalary = roundOMR(summary.totalNetSalary + line.netSalary);
      summary.totalPaid = roundOMR(summary.totalPaid + totalPaid);
      summary.totalOutstanding = roundOMR(summary.totalOutstanding + outstanding);
    }
  }

  return Array.from(employeeGroupMap.values());
}

// GET /api/payments/summary - Overall stats for dashboard and payments overview
router.get('/summary', verifyAuth, requirePermission('salary_payment.view'), (req: AuthRequest, res: Response) => {
  try {
    const { month, company, paidBy, status, search, wps, wageType, receiptStatus } = req.query;
    const summaries = getGroupedPaymentSummaries({
      month: month as string,
      company: company as string,
      paidBy: paidBy as string,
      status: status as string,
      search: search as string,
      wps: wps as string,
      wageType: wageType as string,
      receiptStatus: receiptStatus as string,
      scope: companyScopeOf(req.user),
    });

    let totalNetSalary = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let unpaidCount = 0;
    let partiallyPaidCount = 0;
    let fullyPaidCount = 0;
    let noPayableCount = 0;
    let pendingReceiptsCount = 0;

    for (const emp of summaries) {
      for (const m of emp.months) {
        totalNetSalary = roundOMR(totalNetSalary + m.netSalary);
        totalPaid = roundOMR(totalPaid + m.totalPaid);
        totalOutstanding = roundOMR(totalOutstanding + m.outstanding);

        if (m.status === 'Unpaid') unpaidCount++;
        else if (m.status === 'Partially Paid') partiallyPaidCount++;
        else if (m.status === 'Fully Paid') fullyPaidCount++;
        else if (m.status === 'No Payable') noPayableCount++;

        for (const tx of m.transactions) {
          if (tx.receiptStatus === 'Attachment Pending') {
            pendingReceiptsCount++;
          }
        }
      }
    }

    res.json({
      totalNetSalary,
      totalPaid,
      totalOutstanding,
      unpaidCount,
      partiallyPaidCount,
      fullyPaidCount,
      noPayableCount,
      pendingReceiptsCount,
      totalEmployeeGroups: summaries.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payment summary' });
  }
});

// GET /api/payments/grouped - Grouped table view for Salary Payments
router.get('/grouped', verifyAuth, requirePermission('salary_payment.view'), (req: AuthRequest, res: Response) => {
  try {
    const { month, status, company, paidBy, search, wps, wageType, receiptStatus } = req.query;
    const grouped = getGroupedPaymentSummaries({
      month: month as string,
      status: status as string,
      company: company as string,
      paidBy: paidBy as string,
      search: search as string,
      wps: wps as string,
      wageType: wageType as string,
      receiptStatus: receiptStatus as string,
      scope: companyScopeOf(req.user),
    });

    // Sort by employeeId
    grouped.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

    res.json(grouped);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payment grouped data' });
  }
});

// GET /api/payments/transactions - List all raw payment transactions
router.get('/transactions', verifyAuth, requirePermission('salary_payment.view'), (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, month } = req.query;
    const scope = companyScopeOf(req.user);
    let transactions = db.salaryPayments.getAll().filter(t => {
      if (scope === null) return true;
      const emp = db.employees.findByEmployeeId(normalizeEmployeeId(t.employeeId));
      return canSeeCompany(scope, emp?.employeeCompany);
    });

    if (employeeId) {
      const norm = normalizeEmployeeId(String(employeeId));
      transactions = transactions.filter(t => normalizeEmployeeId(t.employeeId) === norm);
    }

    if (month && month !== 'ALL') {
      transactions = transactions.filter(t => t.payrollMonth === month);
    }

    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(transactions);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch transactions' });
  }
});

// POST /api/payments/check-duplicate - Check for possible identical transaction
router.post('/check-duplicate', verifyAuth, requirePermission('salary_payment.create'), (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, payrollMonth, paymentDate, payAmount, payTo } = req.body;
    const normId = normalizeEmployeeId(employeeId);
    const amount = roundOMR(Number(payAmount) || 0);

    const existingTx = db.salaryPayments.getAll().find(t =>
      !t.isReversed &&
      normalizeEmployeeId(t.employeeId) === normId &&
      t.payrollMonth === payrollMonth &&
      t.paymentDate === paymentDate &&
      roundOMR(t.payAmount) === amount &&
      t.payTo.trim().toLowerCase() === String(payTo || '').trim().toLowerCase()
    );

    if (existingTx) {
      return res.json({
        isDuplicate: true,
        warning: `Possible duplicate payment transaction: An identical payment of OMR ${amount.toFixed(3)} to '${payTo}' on ${paymentDate} already exists for ${normId} (${payrollMonth}).`,
      });
    }

    res.json({ isDuplicate: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/transactions - Pay Now: Create a new salary payment transaction
router.post('/transactions', verifyAuth, requirePermission('salary_payment.create'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      employeeId,
      payrollMonth,
      payrollLineId,
      paymentDate,
      payAmount,
      payTo,
      paymentMode,
      bankName,
      referenceNumber,
      receiptFileData,
      receiptFileName,
      remarks,
    } = req.body;

    if (!employeeId || !payrollMonth || !paymentDate || !payAmount || !payTo) {
      return res.status(400).json({ error: 'Employee ID, Month, Payment Date, Amount, and Pay To are required.' });
    }

    const normId = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(normId);
    if (!emp) {
      return res.status(404).json({ error: `Employee '${normId}' not found.` });
    }
    if (!canSeeCompany(companyScopeOf(req.user), emp.employeeCompany)) {
      return res.status(404).json({ error: `Employee '${normId}' not found.` });
    }

    const payroll = db.payroll.getByMonth(payrollMonth);
    if (!payroll) {
      return res.status(404).json({ error: `Payroll for month ${payrollMonth} does not exist.` });
    }
    if (payroll.status !== 'Finalized') {
      return res.status(400).json({ error: `Payroll for ${payrollMonth} must be Finalized before recording salary payments.` });
    }

    const line = payroll.lines?.find(l => normalizeEmployeeId(l.employeeId) === normId);
    if (!line) {
      return res.status(404).json({ error: `No payroll line found for ${normId} in ${payrollMonth}.` });
    }

    const numericAmount = roundOMR(Number(payAmount));
    if (numericAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }

    // The duplicate check used to live only in a separate advisory endpoint the UI called
    // first, so anything that posted straight to this route could record the same payment
    // twice. It is enforced here as well; `allowDuplicate: true` records it deliberately
    // (a genuine second payment of the same amount on the same day).
    if (req.body?.allowDuplicate !== true) {
      const duplicate = db.salaryPayments.getAll().find(t =>
        !t.isReversed &&
        normalizeEmployeeId(t.employeeId) === normId &&
        t.payrollMonth === payrollMonth &&
        t.paymentDate === paymentDate &&
        roundOMR(t.payAmount) === numericAmount &&
        t.payTo.trim().toLowerCase() === String(payTo || '').trim().toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({
          error:
            `An identical payment of OMR ${numericAmount.toFixed(3)} to '${payTo}' on ${paymentDate} ` +
            `is already recorded for ${normId} (${payrollMonth}). Confirm to record it anyway.`,
          isDuplicate: true,
          existingTransactionId: duplicate.id,
        });
      }
    }

    // Calculate current total paid and outstanding balance
    const existingPayments = db.salaryPayments.getByEmployeeAndMonth(normId, payrollMonth);
    const totalPaidBefore = roundOMR(existingPayments.reduce((s, p) => s + p.payAmount, 0));
    const currentOutstanding = roundOMR(Math.max(0, line.netSalary - totalPaidBefore));

    if (numericAmount > currentOutstanding) {
      return res.status(400).json({
        error: `Payment amount OMR ${numericAmount.toFixed(3)} cannot exceed current outstanding salary of OMR ${currentOutstanding.toFixed(3)}.`
      });
    }

    let receiptStoragePath: string | null = null;
    let uploadedReceiptFileName: string | null = null;
    if (receiptFileData) {
      const { buffer, mimeType } = decodeReceiptDataUrl(receiptFileData);
      validateReceiptFile(mimeType, buffer.length);
      const uploaded = await uploadReceipt(buffer, mimeType, normId, payrollMonth);
      receiptStoragePath = uploaded.path;
      uploadedReceiptFileName = uploaded.fileName;
    }

    const timestamp = new Date().toISOString();
    const newTransaction: SalaryPaymentTransaction = {
      id: crypto.randomUUID(),
      employeeId: normId,
      employeeName: line.employeeName,
      payrollMonth,
      payrollLineId: line.id || payrollLineId,
      paymentDate: paymentDate || timestamp.split('T')[0],
      payAmount: numericAmount,
      payTo: String(payTo).trim(),
      paymentMode: paymentMode || undefined,
      bankName: bankName ? String(bankName).trim() : undefined,
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : undefined,
      receiptStoragePath,
      receiptFileName: receiptFileName || uploadedReceiptFileName,
      receiptStatus: receiptStoragePath ? 'Attached' : 'Attachment Pending',
      remarks: remarks ? String(remarks).trim() : '',
      createdBy: req.user?.username || 'Admin',
      isReversed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.salaryPayments.create(newTransaction, () => {
      const freshExisting = db.salaryPayments.getByEmployeeAndMonth(normId, payrollMonth);
      const freshPaidBefore = roundOMR(freshExisting.reduce((s, p) => s + p.payAmount, 0));
      const freshOutstanding = roundOMR(Math.max(0, line.netSalary - freshPaidBefore));
      if (numericAmount > freshOutstanding) {
        throw new Error(
          `Payment amount OMR ${numericAmount.toFixed(3)} cannot exceed current outstanding salary of OMR ${freshOutstanding.toFixed(3)}.`
        );
      }
    });

    const totalPaidAfter = roundOMR(totalPaidBefore + numericAmount);
    const outstandingAfter = roundOMR(Math.max(0, line.netSalary - totalPaidAfter));

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'SALARY_PAYMENT_RECORDED',
      module: 'Salary Payments',
      recordId: newTransaction.id,
      description: `Recorded payment of OMR ${numericAmount.toFixed(3)} to '${newTransaction.payTo}' for ${normId} (${line.employeeName}) - ${payrollMonth}. Remaining Outstanding: OMR ${outstandingAfter.toFixed(3)}.`,
    });

    res.status(201).json({
      transaction: newTransaction,
      summary: {
        totalPaid: totalPaidAfter,
        outstanding: outstandingAfter,
        status: totalPaidAfter >= line.netSalary ? 'Fully Paid' : 'Partially Paid',
      }
    });
  } catch (err: any) {
    if (err instanceof ConcurrencyConflictError) {
      return res.status(409).json({ error: 'This record changed concurrently; please retry.' });
    }
    res.status(500).json({ error: err.message || 'Failed to record payment' });
  }
});

// PUT /api/payments/transactions/:id - Edit an existing payment transaction
router.put('/transactions/:id', verifyAuth, requirePermission('salary_payment.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { payAmount, payTo, paymentDate, paymentMode, bankName, referenceNumber, receiptFileData, receiptFileName, remarks } = req.body;

    const existingTx = db.salaryPayments.getAll().find(t => t.id === id);
    if (!existingTx) {
      return res.status(404).json({ error: 'Payment transaction not found.' });
    }
    if (existingTx.isReversed) {
      return res.status(400).json({ error: 'Cannot edit a reversed payment transaction.' });
    }

    const normId = normalizeEmployeeId(existingTx.employeeId);
    const payroll = db.payroll.getByMonth(existingTx.payrollMonth);
    if (!payroll || payroll.status !== 'Finalized') {
      return res.status(400).json({ error: `Payroll for ${existingTx.payrollMonth} is no longer Finalized and cannot receive payment edits.` });
    }
    const line = payroll?.lines?.find(l => normalizeEmployeeId(l.employeeId) === normId);
    if (!line) {
      return res.status(404).json({ error: 'Associated payroll line not found.' });
    }

    const newAmount = payAmount !== undefined ? roundOMR(Number(payAmount)) : existingTx.payAmount;
    if (newAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }

    // Check outstanding with other payments
    const otherPayments = db.salaryPayments.getByEmployeeAndMonth(normId, existingTx.payrollMonth).filter(p => p.id !== id);
    const otherPaidSum = roundOMR(otherPayments.reduce((s, p) => s + p.payAmount, 0));
    const maxAllowed = roundOMR(Math.max(0, line.netSalary - otherPaidSum));

    if (newAmount > maxAllowed) {
      return res.status(400).json({
        error: `Updated amount OMR ${newAmount.toFixed(3)} exceeds allowable maximum of OMR ${maxAllowed.toFixed(3)}.`
      });
    }

    const updates: Partial<SalaryPaymentTransaction> = {
      payAmount: newAmount,
      payTo: payTo ? String(payTo).trim() : existingTx.payTo,
      paymentDate: paymentDate || existingTx.paymentDate,
      paymentMode: paymentMode !== undefined ? paymentMode : existingTx.paymentMode,
      bankName: bankName !== undefined ? String(bankName).trim() : existingTx.bankName,
      referenceNumber: referenceNumber !== undefined ? String(referenceNumber).trim() : existingTx.referenceNumber,
      remarks: remarks !== undefined ? String(remarks).trim() : existingTx.remarks,
    };

    if (receiptFileData) {
      const { buffer, mimeType } = decodeReceiptDataUrl(receiptFileData);
      validateReceiptFile(mimeType, buffer.length);
      const uploaded = await uploadReceipt(buffer, mimeType, normId, existingTx.payrollMonth);
      updates.receiptStoragePath = uploaded.path;
      updates.receiptFileName = receiptFileName || uploaded.fileName;
      updates.receiptStatus = 'Attached';
    }

    const updated = await db.salaryPayments.update(id, updates, () => {
      const freshOthers = db.salaryPayments.getByEmployeeAndMonth(normId, existingTx.payrollMonth).filter(p => p.id !== id);
      const freshOtherPaidSum = roundOMR(freshOthers.reduce((s, p) => s + p.payAmount, 0));
      const freshMaxAllowed = roundOMR(Math.max(0, line.netSalary - freshOtherPaidSum));
      if (newAmount > freshMaxAllowed) {
        throw new Error(`Updated amount OMR ${newAmount.toFixed(3)} exceeds allowable maximum of OMR ${freshMaxAllowed.toFixed(3)}.`);
      }
    });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'SALARY_PAYMENT_EDITED',
      module: 'Salary Payments',
      recordId: id,
      description: `Edited payment transaction for ${normId} (${existingTx.payrollMonth}). Amount: OMR ${newAmount.toFixed(3)}.`,
    });

    res.json(updated);
  } catch (err: any) {
    if (err instanceof ConcurrencyConflictError) {
      return res.status(409).json({ error: 'This record changed concurrently; please retry.' });
    }
    res.status(500).json({ error: err.message || 'Failed to update payment transaction' });
  }
});

// POST /api/payments/transactions/:id/reverse - Soft reversal of payment transaction
router.post('/transactions/:id/reverse', verifyAuth, requirePermission('salary_payment.reverse'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user?.username || 'Admin';

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Reversal reason is mandatory for financial audit trail.' });
    }

    const reversed = await db.salaryPayments.reverse(id, String(reason).trim(), user);

    await db.audit.log({
      userId: req.user?.id,
      username: user,
      userRole: req.user?.role || 'Payroll User',
      action: 'SALARY_PAYMENT_REVERSED',
      module: 'Salary Payments',
      recordId: id,
      description: `Reversed payment of OMR ${reversed.payAmount.toFixed(3)} for ${reversed.employeeId} (${reversed.payrollMonth}). Reason: ${reason}`,
    });

    res.json(reversed);
  } catch (err: any) {
    if (err instanceof ConcurrencyConflictError) {
      return res.status(409).json({ error: 'This record changed concurrently; please retry.' });
    }
    res.status(400).json({ error: err.message || 'Failed to reverse payment transaction' });
  }
});

// GET /api/payments/receipts/:transactionId/signed-url - Short-lived access link for a receipt
router.get('/receipts/:transactionId/signed-url', verifyAuth, requirePermission('salary_payment.view'), async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId } = req.params;
    const tx = db.salaryPayments.getAll().find(t => t.id === transactionId);
    if (!tx) {
      return res.status(404).json({ error: 'Payment transaction not found.' });
    }
    if (!tx.receiptStoragePath) {
      return res.status(404).json({ error: 'No receipt is attached to this payment.' });
    }
    const { url, expiresIn } = await getSignedReceiptUrl(tx.receiptStoragePath);
    res.json({ url, expiresIn });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate receipt access link.' });
  }
});

// GET /api/payments/export/template - Excel template for bulk payment import
router.get('/export/template', verifyAuth, requirePermission('salary_payment.import'), (req: AuthRequest, res: Response) => {
  try {
    const headers = [
      'Employee ID',
      'Salary Month',
      'Payment Date',
      'Pay Amount',
      'Pay To',
      'Receipt Reference',
      'Remarks'
    ];

    const instructions = [
      ['SALARY PAYMENT IMPORT GUIDELINES'],
      ['1. Employee ID: Must match a registered active/historical employee.'],
      ['2. Salary Month: Format YYYY-MM (e.g. 2026-07). That month must be FINALIZED.'],
      ['3. Payment Date: Format YYYY-MM-DD (e.g. 2026-08-15).'],
      ['4. Pay Amount: Numeric amount in OMR. Must not exceed current outstanding salary.'],
      ['5. Pay To: Person or entity received payment (e.g. Ahmed, Cash, Bank Transfer).'],
      ['6. Receipt Reference: Optional check/reference/voucher number.'],
      ['7. Remarks: Optional transaction notes.'],
    ];

    const wb = XLSX.utils.book_new();
    const wsTemplate = XLSX.utils.aoa_to_sheet([headers]);
    wsTemplate['!cols'] = [
      { wch: 15 }, { wch: 14 }, { wch: 15 }, { wch: 16 }, { wch: 25 }, { wch: 20 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Payment_Import_Template');

    const wsInst = XLSX.utils.aoa_to_sheet(instructions);
    wsInst['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Payment_Import_Template.xlsx"');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate payment template' });
  }
});

// POST /api/payments/import/validate - Validate uploaded payment Excel
router.post('/import/validate', verifyAuth, requirePermission('salary_payment.import'), (req: AuthRequest, res: Response) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No Excel file provided.' });

    const buffer = Buffer.from(fileData.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'Spreadsheet has no data rows.' });
    }

    const previewRows: any[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;

    const accumulatedPayments = new Map<string, number>();

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNum = i + 2;

      const rawId = String(r['Employee ID'] || r['EmployeeID'] || '').trim();
      const rawMonth = String(r['Salary Month'] || r['Month'] || '').trim();
      const rawDate = String(r['Payment Date'] || r['Date'] || '').trim();
      const rawAmount = r['Pay Amount'] || r['Amount'] || 0;
      const rawPayTo = String(r['Pay To'] || r['PayTo'] || '').trim();
      const rawRef = String(r['Receipt Reference'] || r['Reference'] || '').trim();
      const rawRemarks = String(r['Remarks'] || '').trim();

      const normId = normalizeEmployeeId(rawId);
      const emp = db.employees.findByEmployeeId(normId);
      const numAmount = roundOMR(Number(rawAmount) || 0);

      let status: 'Valid' | 'Invalid' | 'Duplicate' = 'Valid';
      let message = 'Ready';

      const payroll = rawMonth ? db.payroll.getByMonth(rawMonth) : null;
      const line = payroll?.lines?.find(l => normalizeEmployeeId(l.employeeId) === normId);

      if (!normId) {
        status = 'Invalid';
        message = 'Employee ID is required';
      } else if (!emp) {
        status = 'Invalid';
        message = `Employee '${normId}' not found`;
      } else if (!rawMonth) {
        status = 'Invalid';
        message = 'Salary Month is required';
      } else if (!payroll) {
        status = 'Invalid';
        message = `No payroll found for month ${rawMonth}`;
      } else if (payroll.status !== 'Finalized') {
        status = 'Invalid';
        message = `Payroll for ${rawMonth} is not finalized (${payroll.status})`;
      } else if (!line) {
        status = 'Invalid';
        message = `No payroll line for ${normId} in ${rawMonth}`;
      } else if (numAmount <= 0) {
        status = 'Invalid';
        message = 'Pay Amount must be greater than zero';
      } else {
        // Calculate outstanding balance
        const empMonthKey = `${normId}_${rawMonth}`;
        const priorDbPayments = db.salaryPayments.getByEmployeeAndMonth(normId, rawMonth);
        const dbPaid = roundOMR(priorDbPayments.reduce((s, p) => s + p.payAmount, 0));
        const fileAccum = accumulatedPayments.get(empMonthKey) || 0;
        const totalSoFar = roundOMR(dbPaid + fileAccum);
        const outstanding = roundOMR(Math.max(0, line.netSalary - totalSoFar));

        if (numAmount > outstanding) {
          status = 'Invalid';
          message = `Amount OMR ${numAmount.toFixed(3)} exceeds current outstanding balance of OMR ${outstanding.toFixed(3)}`;
        } else {
          // Check for duplicate warning
          const isIdentical = priorDbPayments.some(
            p => p.paymentDate === rawDate && roundOMR(p.payAmount) === numAmount && p.payTo.toLowerCase() === rawPayTo.toLowerCase()
          );
          if (isIdentical) {
            status = 'Duplicate';
            message = 'Possible duplicate: Identical payment already recorded in system';
          } else {
            accumulatedPayments.set(empMonthKey, roundOMR(fileAccum + numAmount));
          }
        }
      }

      if (status === 'Valid') validCount++;
      else if (status === 'Duplicate') duplicateCount++;
      else invalidCount++;

      previewRows.push({
        rowNumber: rowNum,
        employeeId: normId,
        employeeName: emp ? emp.employeeName : '—',
        payrollMonth: rawMonth,
        paymentDate: rawDate || new Date().toISOString().split('T')[0],
        payAmount: numAmount,
        payTo: rawPayTo || (emp ? emp.employeeName : 'Employee'),
        receiptReference: rawRef,
        remarks: rawRemarks,
        status,
        message,
      });
    }

    res.json({
      summary: {
        totalRows: rawRows.length,
        validCount,
        invalidCount,
        duplicateCount,
      },
      rows: previewRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to validate payment file.' });
  }
});

// POST /api/payments/import/confirm - Commit validated payment rows
router.post('/import/confirm', verifyAuth, requirePermission('salary_payment.import'), async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No validated rows provided.' });
    }

    const validRows = rows.filter(r => r.status === 'Valid');
    if (validRows.length === 0) {
      return res.status(400).json({ error: 'No valid rows to import.' });
    }

    let count = 0;
    const timestamp = new Date().toISOString();
    const errors: string[] = [];

    for (const r of validRows) {
      const normId = normalizeEmployeeId(r.employeeId);
      const payroll = db.payroll.getByMonth(r.payrollMonth);
      const line = payroll?.lines?.find(l => normalizeEmployeeId(l.employeeId) === normId);

      const numericAmount = roundOMR(Number(r.payAmount));
      if (isNaN(numericAmount) || numericAmount <= 0) {
        errors.push(`${normId} (${r.payrollMonth}): Pay Amount must be greater than zero.`);
        continue;
      }

      // A payment must always be anchored to a finalized payroll entitlement. Without this
      // guard an imported row for a month with no payroll line was recorded with no
      // ceiling and no link to what it was paying -- an unvalidated cash-out record.
      if (!payroll || payroll.status !== 'Finalized') {
        errors.push(`${normId} (${r.payrollMonth}): payroll for this month is not Finalized; payments cannot be imported against it.`);
        continue;
      }
      if (!line) {
        errors.push(`${normId} (${r.payrollMonth}): no payroll line exists for this employee in this month.`);
        continue;
      }

      const existingPayments = db.salaryPayments.getByEmployeeAndMonth(normId, r.payrollMonth);
      const totalPaidBefore = roundOMR(existingPayments.reduce((s, p) => s + p.payAmount, 0));
      const currentOutstanding = roundOMR(Math.max(0, line.netSalary - totalPaidBefore));
      if (numericAmount > currentOutstanding) {
        errors.push(`${normId} (${r.payrollMonth}): Amount OMR ${numericAmount.toFixed(3)} exceeds outstanding balance of OMR ${currentOutstanding.toFixed(3)}.`);
        continue;
      }

      const tx: SalaryPaymentTransaction = {
        id: crypto.randomUUID(),
        employeeId: normId,
        employeeName: line.employeeName,
        payrollMonth: r.payrollMonth,
        payrollLineId: line.id,
        paymentDate: r.paymentDate || timestamp.split('T')[0],
        payAmount: numericAmount,
        payTo: r.payTo || 'Employee',
        receiptFileName: r.receiptReference ? `Ref: ${r.receiptReference}` : null,
        receiptStatus: 'Attachment Pending',
        remarks: r.remarks || '',
        createdBy: req.user?.username || 'Admin',
        isReversed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await db.salaryPayments.create(tx);
      count++;
    }

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'SALARY_PAYMENTS_IMPORTED',
      module: 'Salary Payments',
      description: `Bulk imported ${count} salary payment transactions from Excel.`,
    });

    res.json({
      success: true,
      message: `Successfully recorded ${count} payment transactions.${errors.length > 0 ? ` ${errors.length} row(s) skipped.` : ''}`,
      count,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit payments import.' });
  }
});

// GET /api/payments/export/data - Export payment report to Excel
router.get('/export/data', verifyAuth, requirePermission('salary_payment.export'), (req: AuthRequest, res: Response) => {
  try {
    const { month, company, paidBy, status, search, wps, wageType, receiptStatus } = req.query;
    const summaries = getGroupedPaymentSummaries({
      month: month as string,
      company: company as string,
      paidBy: paidBy as string,
      status: status as string,
      search: search as string,
      wps: wps as string,
      wageType: wageType as string,
      receiptStatus: receiptStatus as string,
      scope: companyScopeOf(req.user),
    });

    const exportRows: any[] = [];
    let sr = 1;

    for (const emp of summaries) {
      for (const m of emp.months) {
        exportRows.push({
          'Sr#': sr++,
          'Employee ID': emp.employeeId,
          'Employee Name': emp.employeeName,
          'Salary Month': m.payrollMonth,
          'Gross Salary (OMR)': roundOMR(m.grossSalary).toFixed(3),
          'Additions (OMR)': roundOMR(m.totalAdditions).toFixed(3),
          'Deductions (OMR)': roundOMR(m.totalDeductions).toFixed(3),
          'Net Salary (OMR)': roundOMR(m.netSalary).toFixed(3),
          'Total Paid (OMR)': roundOMR(m.totalPaid).toFixed(3),
          'Outstanding (OMR)': roundOMR(m.outstanding).toFixed(3),
          'Status': m.status,
          'Receipt Status': m.receiptStatus,
          'Company': emp.employeeCompany,
          'Salary Paid By': emp.salaryPaidBy,
          'WPS Employee': emp.wpsEmployee,
        });
      }
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Salary_Payments_Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Salary_Payments_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export payments report' });
  }
});

export default router;
