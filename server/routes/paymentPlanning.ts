import { Router, Response } from 'express';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requirePermission, AuthRequest } from '../auth.js';

const router = Router();

// GET /api/payment-planning - full dataset across every finalized payroll month.
// Filtering happens client-side against this single response so the Payment Planning
// UI's "Total Should Pay" and filters react instantly with zero round-trips.
router.get('/', verifyAuth, requirePermission('payment_planning.view'), (req: AuthRequest, res: Response) => {
  try {
    const allPayrolls = db.payroll.getAll().filter(p => p.status === 'Finalized');
    const allPayments = db.salaryPayments.getAll().filter(p => !p.isReversed);

    const rows: any[] = [];
    for (const payroll of allPayrolls) {
      const details = db.payroll.getByMonth(payroll.payrollMonth);
      if (!details?.lines) continue;

      const plan = db.paymentPlans.getByPayrollMonth(payroll.payrollMonth);
      const planLineMap = new Map<string, any>();
      (plan?.lines || []).forEach(l => planLineMap.set(normalizeEmployeeId(l.employeeId), l));

      for (const line of details.lines) {
        const normId = normalizeEmployeeId(line.employeeId);
        const linePayments = allPayments.filter(
          p => normalizeEmployeeId(p.employeeId) === normId && p.payrollMonth === payroll.payrollMonth
        );

        const totalPaid = roundOMR(linePayments.reduce((s, p) => s + p.payAmount, 0));
        const outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));

        let status = 'Unpaid';
        if (totalPaid >= line.netSalary) status = 'Fully Paid';
        else if (totalPaid > 0) status = 'Partially Paid';

        const lastPayment = linePayments.reduce(
          (latest: any, p) => (!latest || p.paymentDate > latest.paymentDate ? p : latest),
          null as any
        );

        const planLine = planLineMap.get(normId);

        rows.push({
          payrollId: payroll.id,
          payrollMonth: payroll.payrollMonth,
          employeeId: line.employeeId,
          employeeName: line.employeeName,
          employeeCompany: line.employeeCompany,
          salaryPaidBy: line.salaryPaidBy,
          wpsEmployee: line.wpsEmployee,
          wageType: line.wageType,
          netSalary: line.netSalary,
          totalPaid,
          outstanding,
          status,
          lastPaidSalary: lastPayment ? lastPayment.payAmount : 0,
          lastPaymentDate: lastPayment ? lastPayment.paymentDate : null,
          // Should Pay defaults to current outstanding until a plan is explicitly saved.
          shouldPayAmount: planLine ? planLine.shouldPayAmount : outstanding,
          remarks: planLine ? planLine.remarks : '',
        });
      }
    }

    rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.payrollMonth.localeCompare(b.payrollMonth));
    res.json({ rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payment planning data' });
  }
});

// PUT /api/payment-planning/:payrollId - upsert the plan for a single payroll month
router.put('/:payrollId', verifyAuth, requirePermission('payment_planning.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { payrollId } = req.params;
    const { lines } = req.body;
    if (!Array.isArray(lines)) {
      return res.status(400).json({ error: 'lines array is required.' });
    }

    const payroll = db.payroll.getAll().find(p => p.id === payrollId);
    if (!payroll) {
      return res.status(404).json({ error: 'Payroll not found.' });
    }

    const saved = await db.paymentPlans.upsert(payroll.payrollMonth, payrollId, lines, req.user?.username || 'Admin');

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PAYMENT_PLAN_SAVED',
      module: 'Payment Planning',
      recordId: saved.id,
      description: `Saved payment plan for ${payroll.payrollMonth} (${lines.length} lines).`,
    });

    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save payment plan' });
  }
});

// POST /api/payment-planning/save - batch-save plans across one or more months at once
// (the entry point the Payment Planning UI's "Save Payment Plan" button actually calls,
// since edits can span multiple visible months in a single sitting).
router.post('/save', verifyAuth, requirePermission('payment_planning.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { plans } = req.body;
    if (!Array.isArray(plans) || plans.length === 0) {
      return res.status(400).json({ error: 'No plans provided to save.' });
    }

    let savedCount = 0;
    for (const p of plans) {
      const { payrollMonth, payrollId, lines } = p;
      if (!payrollMonth || !Array.isArray(lines)) continue;
      await db.paymentPlans.upsert(payrollMonth, payrollId, lines, req.user?.username || 'Admin');
      savedCount++;
    }

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PAYMENT_PLAN_SAVED',
      module: 'Payment Planning',
      description: `Saved payment plans for ${savedCount} month(s).`,
    });

    res.json({ success: true, savedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save payment plans' });
  }
});

export default router;
