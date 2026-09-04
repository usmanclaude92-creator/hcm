import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requireWritePermission, AuthRequest, companyScopeOf, canSeeCompany } from '../auth.js';
import type { WPSRecoveryTransaction, EmployeeCompany } from '../../src/types/index';

const router = Router();

// WPS recovery records carry the employee ID but not the company, so scope is resolved
// through Employee Master. A record whose employee no longer exists stays visible to
// unscoped accounts only, rather than disappearing from every view.
function wpsVisibleTo(scope: EmployeeCompany[] | null, employeeId: string): boolean {
  if (scope === null) return true;
  const emp = db.employees.findByEmployeeId(normalizeEmployeeId(employeeId));
  return canSeeCompany(scope, emp?.employeeCompany);
}

// GET /api/wps - List all WPS Recovery tracking records
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month, status, search } = req.query;
    const scope = companyScopeOf(req.user);
    let list = db.wps.getAll().filter(w => wpsVisibleTo(scope, w.employeeId));

    if (search) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(w =>
        w.employeeId.toLowerCase().includes(q) ||
        w.employeeName.toLowerCase().includes(q) ||
        (w.recoveredFrom && w.recoveredFrom.toLowerCase().includes(q))
      );
    }

    if (month && month !== 'ALL') {
      list = list.filter(w => w.payrollMonth === month);
    }

    if (status && status !== 'ALL') {
      list = list.filter(w => w.status === status);
    }

    list.sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth) || a.employeeId.localeCompare(b.employeeId));

    const totalRecoverable = roundOMR(list.reduce((s, w) => s + w.totalRecoverable, 0));
    const totalRecovered = roundOMR(list.reduce((s, w) => s + w.totalRecovered, 0));
    const totalRemaining = roundOMR(list.reduce((s, w) => s + w.remainingBalance, 0));

    res.json({
      summary: {
        totalRecoverable,
        totalRecovered,
        totalRemaining,
        outstandingCount: list.filter(w => w.status === 'Outstanding').length,
        partiallyRecoveredCount: list.filter(w => w.status === 'Partially Recovered').length,
        fullyRecoveredCount: list.filter(w => w.status === 'Fully Recovered').length,
      },
      items: list,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch WPS recoveries' });
  }
});

// POST /api/wps/transactions - Add a WPS recovery transaction
router.post('/transactions', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { wpsRecoveryId, recoveryAmount, recoveryDate, recoveredFrom, remarks } = req.body;

    if (!wpsRecoveryId || !recoveryAmount || !recoveryDate || !recoveredFrom) {
      return res.status(400).json({ error: 'WPS Recovery ID, Amount, Date, and Recovered From are required.' });
    }

    const numAmount = roundOMR(Number(recoveryAmount));
    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Recovery amount must be greater than zero.' });
    }

    const wps = db.wps.findById(wpsRecoveryId);
    if (!wps) {
      return res.status(404).json({ error: 'WPS Recovery record not found.' });
    }
    if (!wpsVisibleTo(companyScopeOf(req.user), wps.employeeId)) {
      return res.status(404).json({ error: 'WPS Recovery record not found.' });
    }

    if (numAmount > wps.remainingBalance) {
      return res.status(400).json({
        error: `Recovery amount OMR ${numAmount.toFixed(3)} cannot exceed remaining balance of OMR ${wps.remainingBalance.toFixed(3)}.`
      });
    }

    const tx: WPSRecoveryTransaction = {
      id: crypto.randomUUID(),
      wpsRecoveryId,
      employeeId: wps.employeeId,
      payrollMonth: wps.payrollMonth,
      recoveredFrom: String(recoveredFrom).trim(),
      recoveryAmount: numAmount,
      recoveryDate,
      remarks: remarks ? String(remarks).trim() : '',
      createdBy: req.user?.username || 'Admin',
      createdAt: new Date().toISOString(),
    };

    await db.wps.addTransaction(tx);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'WPS_RECOVERY_RECORDED',
      module: 'WPS Recovery',
      recordId: wpsRecoveryId,
      description: `Recovered OMR ${numAmount.toFixed(3)} for ${wps.employeeId} (${wps.employeeName}) for ${wps.payrollMonth} from '${tx.recoveredFrom}'.`,
    });

    res.status(201).json(db.wps.findById(wpsRecoveryId));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to record WPS recovery' });
  }
});

// GET /api/wps/export - Export WPS Recovery report to Excel
router.get('/export', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;
    const exportScope = companyScopeOf(req.user);
    let list = db.wps.getAll().filter(w => wpsVisibleTo(exportScope, w.employeeId));
    if (month && month !== 'ALL') {
      list = list.filter(w => w.payrollMonth === month);
    }

    const data = list.map((w, idx) => ({
      'Sr#': idx + 1,
      'Employee ID': w.employeeId,
      'Employee Name': w.employeeName,
      'Salary Month': w.payrollMonth,
      'WPS Salary (OMR)': roundOMR(w.wpsSalary).toFixed(3),
      'Net Salary (OMR)': roundOMR(w.netSalary).toFixed(3),
      'Total Recoverable (OMR)': roundOMR(w.totalRecoverable).toFixed(3),
      'Recovered From': w.recoveredFrom,
      'Total Recovered (OMR)': roundOMR(w.totalRecovered).toFixed(3),
      'Remaining Balance (OMR)': roundOMR(w.remainingBalance).toFixed(3),
      'Status': w.status,
      'Transactions Count': w.transactions ? w.transactions.length : 0,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 18 },
      { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 22 },
      { wch: 18 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'WPS_Recovery_Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="WPS_Recovery_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export WPS recoveries' });
  }
});

export default router;
