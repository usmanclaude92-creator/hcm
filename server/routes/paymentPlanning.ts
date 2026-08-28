import { Router, Response } from 'express';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requirePermission, AuthRequest } from '../auth.js';

const router = Router();

const VARIANCE_TOLERANCE = 0.001;

// Builds one row per employee x finalized-payroll-month, exactly as before, PLUS an
// `isOldestUnpaid` flag: true only for the first (chronologically earliest) row per
// employee whose status isn't Fully Paid. This is the single source of truth for both
// the read endpoint and the save-validation path below -- never a second independent
// calculation engine. isOldestUnpaid is a factual property of payment history and is
// always computed from the FULL dataset, never from a filtered subset.
function computePlanningRows(): any[] {
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
        // Provisional -- overwritten below once isOldestUnpaid is known for every row.
        savedShouldPay: planLine ? planLine.shouldPayAmount : null,
        remarks: planLine ? (planLine.remarks || '') : '',
      });
    }
  }

  rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.payrollMonth.localeCompare(b.payrollMonth));

  // Second pass: flag the first (oldest) non-Fully-Paid row per employee.
  const oldestFoundFor = new Set<string>();
  for (const r of rows) {
    const normId = normalizeEmployeeId(r.employeeId);
    if (r.status !== 'Fully Paid' && !oldestFoundFor.has(normId)) {
      r.isOldestUnpaid = true;
      oldestFoundFor.add(normId);
    } else {
      r.isOldestUnpaid = false;
    }
  }

  // Should Pay is editable on every unpaid/partially-paid row (not just the oldest --
  // isOldestUnpaid above is kept purely for the "Total of Last Unpaid Months" tile).
  // A fully paid row is forced to 0 regardless of any stale saved plan line.
  for (const r of rows) {
    if (r.status !== 'Fully Paid') {
      const saved = r.savedShouldPay;
      const requested = saved !== null && saved !== undefined ? roundOMR(Number(saved) || 0) : r.outstanding;
      r.shouldPayAmount = Math.min(Math.max(0, requested), r.outstanding);
    } else {
      r.shouldPayAmount = 0;
    }
    delete r.savedShouldPay;
  }

  return rows;
}

// Re-derives authoritative status/outstanding for `payrollMonth` and validates the
// client-submitted lines against it. Returns { normalized } on success or { error } on the
// first violation found -- the whole save is rejected rather than partially written.
function validateAndNormalizeLines(
  payrollMonth: string,
  lines: any[]
): { normalized: Array<{ employeeId: string; employeeName: string; shouldPayAmount: number; remarks: string }>; error?: string } {
  const authoritative = computePlanningRows().filter(r => r.payrollMonth === payrollMonth);
  const byEmp = new Map(authoritative.map(r => [normalizeEmployeeId(r.employeeId), r]));

  const normalized: Array<{ employeeId: string; employeeName: string; shouldPayAmount: number; remarks: string }> = [];

  for (const line of lines) {
    const normId = normalizeEmployeeId(line.employeeId);
    const auth = byEmp.get(normId);
    if (!auth) continue; // unknown employee/month combination -- nothing to validate against, skip

    let shouldPayAmount = 0;
    const hasValue = line.shouldPayAmount !== undefined && line.shouldPayAmount !== null && line.shouldPayAmount !== '';

    if (auth.status !== 'Fully Paid' && hasValue) {
      const requested = Number(line.shouldPayAmount);
      if (!Number.isFinite(requested) || requested < 0) {
        return { normalized: [], error: `Should Pay for ${line.employeeId} (${payrollMonth}) must be a non-negative number.` };
      }
      if (requested > auth.outstanding + VARIANCE_TOLERANCE) {
        return {
          normalized: [],
          error: `Should Pay for ${line.employeeId} (${payrollMonth}) cannot exceed the outstanding balance of OMR ${auth.outstanding.toFixed(3)}.`,
        };
      }
      shouldPayAmount = roundOMR(requested);
    }
    // Fully paid month -- silently force 0, regardless of whatever value the client sent
    // (never trust client-echoed eligibility).

    normalized.push({
      employeeId: line.employeeId,
      employeeName: line.employeeName,
      shouldPayAmount,
      remarks: typeof line.remarks === 'string' ? line.remarks : '',
    });
  }

  return { normalized };
}

// GET /api/payment-planning - full dataset across every finalized payroll month.
// Filtering happens client-side against this single response so the Payment Planning
// UI's summary tiles and filters react instantly with zero round-trips.
router.get('/', verifyAuth, requirePermission('payment_planning.view'), (req: AuthRequest, res: Response) => {
  try {
    res.json({ rows: computePlanningRows() });
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

    const { normalized, error } = validateAndNormalizeLines(payroll.payrollMonth, lines);
    if (error) {
      return res.status(400).json({ error });
    }

    const saved = await db.paymentPlans.upsert(payroll.payrollMonth, payrollId, normalized, req.user?.username || 'Admin');

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PAYMENT_PLAN_SAVED',
      module: 'Payment Planning',
      recordId: saved.id,
      description: `Saved payment plan for ${payroll.payrollMonth} (${normalized.length} lines).`,
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

    // Validate every month up front -- reject the whole batch on the first violation
    // rather than partially persisting some months and not others.
    const toSave: Array<{ payrollMonth: string; payrollId: string; normalized: any[] }> = [];
    for (const p of plans) {
      const { payrollMonth, payrollId, lines } = p;
      if (!payrollMonth || !Array.isArray(lines)) continue;
      const { normalized, error } = validateAndNormalizeLines(payrollMonth, lines);
      if (error) {
        return res.status(400).json({ error });
      }
      toSave.push({ payrollMonth, payrollId, normalized });
    }

    let savedCount = 0;
    for (const { payrollMonth, payrollId, normalized } of toSave) {
      await db.paymentPlans.upsert(payrollMonth, payrollId, normalized, req.user?.username || 'Admin');
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
