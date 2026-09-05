import { Router, Response } from 'express';
import { db, roundOMR, normalizeEmployeeId } from '../db.js';
import { verifyAuth, AuthRequest, companyScopeOf, canSeeCompany } from '../auth.js';

const router = Router();

type PeriodMode = 'month' | 'range' | 'all';

// Generates every consecutive YYYY-MM string from start to end, inclusive.
function monthRange(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function monthBefore(month: string, count: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// GET /api/dashboard - Aggregated stats and real-time trends for dashboard
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const periodMode: PeriodMode = (req.query.periodMode as PeriodMode) || 'month';
    const monthParam = (req.query.month as string) || '';
    const fromMonth = (req.query.fromMonth as string) || '';
    const toMonth = (req.query.toMonth as string) || '';

    // Company isolation. Every figure below is derived from these collections, so scoping
    // them here scopes the whole dashboard -- headcount, payroll, payments, WPS and loans.
    const scope = companyScopeOf(req.user);
    const inScopeEmployeeIds = new Set(
      db.employees.getAll()
        .filter(e => canSeeCompany(scope, e.employeeCompany))
        .map(e => normalizeEmployeeId(e.employeeId))
    );
    const employeeInScope = (employeeId: string) =>
      scope === null || inScopeEmployeeIds.has(normalizeEmployeeId(employeeId));

    const employees = db.employees.getAll().filter(e => canSeeCompany(scope, e.employeeCompany));
    const activeEmployees = employees.filter(e => e.isActive);
    const workers = activeEmployees.filter(e => e.employeeType === 'Worker');
    const staff = activeEmployees.filter(e => e.employeeType === 'Staff');
    const omani = activeEmployees.filter(e => e.nationalityType === 'Omani');
    const expat = activeEmployees.filter(e => e.nationalityType === 'Expat');

    // Job / Designation distribution for active workforce
    const jobMap: Record<string, number> = {};
    activeEmployees.forEach(e => {
      const job = (e.designation || 'General Worker').trim();
      jobMap[job] = (jobMap[job] || 0) + 1;
    });
    const jobComposition = Object.entries(jobMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const payrolls = db.payroll.getAll().sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth));
    const allMonthsAsc = [...payrolls].map(p => p.payrollMonth).sort((a, b) => a.localeCompare(b));
    const latestPayroll = payrolls[0] || null;

    // Resolve which real payroll months are in scope for this period.
    let periodMonths: string[];
    if (periodMode === 'month') {
      periodMonths = payrolls.some(p => p.payrollMonth === monthParam) ? [monthParam] : [];
    } else if (periodMode === 'range') {
      periodMonths = payrolls
        .filter(p => p.payrollMonth >= fromMonth && p.payrollMonth <= toMonth)
        .map(p => p.payrollMonth);
    } else {
      periodMonths = allMonthsAsc;
    }
    const periodMonthSet = new Set(periodMonths);

    let periodLabel: string;
    if (periodMode === 'month') {
      periodLabel = monthParam ? formatMonthLabel(monthParam) : 'No Period Selected';
    } else if (periodMode === 'range') {
      periodLabel = fromMonth && toMonth ? `${formatMonthLabel(fromMonth)} – ${formatMonthLabel(toMonth)}` : 'No Range Selected';
    } else {
      periodLabel = 'All Time';
    }

    // Financial balances -- scoped to the selected period's finalized payrolls/payments/WPS.
    const allFinalizedPayrolls = payrolls.filter(p => p.status === 'Finalized' && periodMonthSet.has(p.payrollMonth));
    const allPayments = db.salaryPayments
      .getAll()
      .filter(p => !p.isReversed && periodMonthSet.has(p.payrollMonth) && employeeInScope(p.employeeId));

    let totalFinalizedNetSalary = 0;
    let totalActuallyPaid = 0;
    // Outstanding must be summed PER PAYROLL LINE, not derived from the aggregate
    // (net - paid). Aggregating first lets a negative or zero-net line, or an
    // employee paid in full, absorb another employee's unpaid balance, so the
    // dashboard reported less owed than Salary Payments and the reports did.
    let totalOutstandingPerLine = 0;

    for (const p of allFinalizedPayrolls) {
      const details = db.payroll.getByMonth(p.payrollMonth);
      if (details?.lines) {
        for (const line of details.lines) {
          if (!canSeeCompany(scope, line.employeeCompany)) continue;
          totalFinalizedNetSalary = roundOMR(totalFinalizedNetSalary + line.netSalary);
          const paidForLine = roundOMR(
            allPayments
              .filter(t => t.payrollMonth === p.payrollMonth && normalizeEmployeeId(t.employeeId) === normalizeEmployeeId(line.employeeId))
              .reduce((s, t) => s + t.payAmount, 0)
          );
          totalOutstandingPerLine = roundOMR(totalOutstandingPerLine + Math.max(0, roundOMR(line.netSalary - paidForLine)));
        }
      }
    }

    totalActuallyPaid = roundOMR(allPayments.reduce((s, p) => s + p.payAmount, 0));
    const totalOutstandingSalary = roundOMR(Math.max(0, totalOutstandingPerLine));

    // Loan balances -- outstanding/principal/recovered/count stay a live, current-moment
    // snapshot (no historical per-month loan-balance snapshot exists to reconstruct from);
    // only "recovery within the selected period" is period-scoped.
    const loans = db.loans.getAll().filter(l => employeeInScope(l.employeeId));
    const activeLoans = loans.filter(l => l.status === 'Active');
    const totalOutstandingLoans = roundOMR(activeLoans.reduce((s, l) => s + l.outstandingBalance, 0));
    const totalActiveLoanPrincipal = roundOMR(activeLoans.reduce((s, l) => s + l.loanAmount, 0));
    const totalLoanRecovered = roundOMR(activeLoans.reduce((s, l) => s + (l.totalRecovered || 0), 0));
    const loanRecoveryPercentage = totalActiveLoanPrincipal > 0
      ? roundOMR((totalLoanRecovered / totalActiveLoanPrincipal) * 100)
      : 0;
    // Recovery in period: match on the payroll month the recovery belongs to (falling back
    // to the recovery date only for direct, non-payroll repayments), and exclude reversed
    // recoveries -- a revised payroll's rolled-back deduction was still being counted, so
    // this KPI over-reported recovery by the reversed amount.
    const periodRecovery = roundOMR(
      loans.reduce((sum, l) => {
        const recoveriesInPeriod = ((l as any).recoveries || []).filter((r: any) =>
          !r.isReversed && periodMonthSet.has(r.payrollMonth || (r.recoveryDate || '').slice(0, 7))
        );
        return sum + recoveriesInPeriod.reduce((s: number, r: any) => s + (r.recoveryAmount || 0), 0);
      }, 0)
    );

    // WPS Recoveries -- scoped to the selected period.
    const wpsList = db.wps
      .getAll()
      .filter(w => periodMonthSet.has((w.payrollMonth || (w as any).month || '') as string) && employeeInScope(w.employeeId));
    const totalWpsRecoverable = roundOMR(wpsList.reduce((s, w) => s + w.totalRecoverable, 0));
    const totalWpsRecovered = roundOMR(wpsList.reduce((s, w) => s + w.totalRecovered, 0));
    const totalWpsRemaining = roundOMR(wpsList.reduce((s, w) => s + w.remainingBalance, 0));

    // Workforce cost distribution by employee type -- aggregated across every finalized
    // payroll in the selected period (collapses to the old "single latest payroll" behavior
    // when scope = exactly one month, so no regression for the common case).
    // Counts are DISTINCT EMPLOYEES, not payroll lines. Summing lines across months
    // counted the same person once per month, so "7 Staff" appeared against an actual
    // workforce of 6 -- and the average was divided by that inflated number too.
    const workforceCostByCategory = ['Staff', 'Worker'].map(type => {
      const lines = allFinalizedPayrolls
        .flatMap(p => (db.payroll.getByMonth(p.payrollMonth)?.lines || []))
        .filter(l => l.employeeType === type && canSeeCompany(scope, l.employeeCompany));
      const distinctEmployees = new Set(lines.map(l => normalizeEmployeeId(l.employeeId)));
      const totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
      return {
        name: type,
        count: distinctEmployees.size,
        lineCount: lines.length,
        totalNetSalary,
        // Average per employee per month: total pay over the number of monthly lines,
        // which is what "average net salary" means for a multi-month period.
        avgNetSalary: lines.length > 0 ? roundOMR(totalNetSalary / lines.length) : 0,
      };
    });
    // The months this distribution actually covers. Labelling the panel with only the
    // latest month while aggregating several was misleading whenever the period spanned
    // more than one payroll.
    const workforceCostMonths = [...allFinalizedPayrolls]
      .map(p => p.payrollMonth)
      .sort((a, b) => a.localeCompare(b));
    const workforceCostSourceMonth = workforceCostMonths.length > 0
      ? workforceCostMonths[workforceCostMonths.length - 1]
      : null;

    // Monthly trends -- calendar-continuous and zero-filled (never silently skips a
    // calendar gap), windowed per the period mode: a trailing window ending at the
    // selected month, the exact selected range, or full history.
    let trendMonths: string[];
    if (periodMode === 'month' && monthParam) {
      trendMonths = monthRange(monthBefore(monthParam, 5), monthParam);
    } else if (periodMode === 'range' && fromMonth && toMonth) {
      trendMonths = monthRange(fromMonth, toMonth);
    } else if (allMonthsAsc.length > 0) {
      trendMonths = monthRange(allMonthsAsc[0], allMonthsAsc[allMonthsAsc.length - 1]);
    } else {
      trendMonths = [];
    }
    const allPaymentsForTrends = db.salaryPayments
      .getAll()
      .filter(p => !p.isReversed && employeeInScope(p.employeeId));
    const monthlyTrends = trendMonths.map(month => {
      const p = payrolls.find(pr => pr.payrollMonth === month);
      const paymentsForMonth = allPaymentsForTrends.filter(tx => tx.payrollMonth === month);
      const paidAmount = roundOMR(paymentsForMonth.reduce((s, tx) => s + tx.payAmount, 0));
      // Stored payroll totals cover every company, so a scoped account recomputes the
      // trend from the lines it may actually see.
      const monthLines = p && scope !== null
        ? (db.payroll.getByMonth(month)?.lines || []).filter(l => canSeeCompany(scope, l.employeeCompany))
        : null;
      return {
        month,
        grossSalary: monthLines
          ? roundOMR(monthLines.reduce((s, l) => s + l.grossSalary, 0))
          : p ? roundOMR(p.totalGrossSalary) : 0,
        netSalary: monthLines
          ? roundOMR(monthLines.reduce((s, l) => s + l.netSalary, 0))
          : p ? roundOMR(p.totalNetSalary) : 0,
        paidSalary: paidAmount,
        status: p ? p.status : 'No Payroll Run',
      };
    });

    // currentPayroll reflects the primary month of the current view: the selected month
    // itself (month mode), the most recent month in scope (range mode), or the latest
    // payroll ever (all mode, unchanged from prior behavior).
    // In All Time mode the tile summarises the whole period's FINALIZED figures, so it
    // must not be stamped with the status of the newest payroll of any kind: a fresh
    // empty draft made an all-time finalized total read "Draft".
    let currentPayrollSource = allFinalizedPayrolls.length > 0
      ? [...allFinalizedPayrolls].sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth))[0]
      : latestPayroll;
    if (periodMode === 'month') {
      currentPayrollSource = monthParam ? (payrolls.find(p => p.payrollMonth === monthParam) || null) : null;
    } else if (periodMode === 'range' && periodMonths.length > 0) {
      const lastMonthInScope = [...periodMonths].sort((a, b) => b.localeCompare(a))[0];
      currentPayrollSource = payrolls.find(p => p.payrollMonth === lastMonthInScope) || null;
    }

    res.json({
      counts: {
        totalEmployees: employees.length,
        activeEmployees: activeEmployees.length,
        inactiveEmployees: employees.length - activeEmployees.length,
        workers: workers.length,
        staff: staff.length,
        omani: omani.length,
        expat: expat.length,
      },
      currentPayroll: {
        month: currentPayrollSource ? currentPayrollSource.payrollMonth : (monthParam || new Date().toISOString().slice(0, 7)),
        status: currentPayrollSource ? currentPayrollSource.status : 'No Payroll Run',
        grossSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalGrossSalary) : 0,
        netSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalNetSalary) : 0,
        wpsSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalWpsSalary) : 0,
        recoverableSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalRecoverableSalary) : 0,
      },
      finances: {
        totalFinalizedNetSalary,
        totalActuallyPaid,
        totalOutstandingSalary,
        totalOutstandingLoans,
        totalWpsRecoverable,
        totalWpsRecovered,
        totalWpsRemaining,
      },
      loanAnalytics: {
        totalPrincipal: totalActiveLoanPrincipal,
        totalRecovered: totalLoanRecovered,
        outstandingBalance: totalOutstandingLoans,
        activeLoanCount: activeLoans.length,
        recoveryPercentage: loanRecoveryPercentage,
        monthlyRecovery: periodRecovery,
      },
      workforceCostByCategory,
      workforceCostSourceMonth,
      workforceCostMonths,
      // Average net salary across the period's finalized lines. Previously the UI derived
      // this from currentPayroll, which in All Time mode is the newest payroll of any
      // status -- so a fresh empty draft made the whole period read OMR 0.000.
      averageNetSalary: (() => {
        const allLines = allFinalizedPayrolls
          .flatMap(p => db.payroll.getByMonth(p.payrollMonth)?.lines || [])
          .filter(l => canSeeCompany(scope, l.employeeCompany));
        return allLines.length > 0
          ? roundOMR(allLines.reduce((s, l) => s + l.netSalary, 0) / allLines.length)
          : 0;
      })(),
      distribution: {
        employeeTypes: [
          { name: 'Staff', value: staff.length },
          { name: 'Workers', value: workers.length },
        ],
        jobComposition,
        nationalities: [
          { name: 'Omani', value: omani.length },
          { name: 'Expat', value: expat.length },
        ],
        salaryStatus: [
          { name: 'Paid Salary', value: totalActuallyPaid },
          { name: 'Unpaid Outstanding', value: totalOutstandingSalary },
        ],
        wpsStatus: [
          { name: 'Recovered', value: totalWpsRecovered },
          { name: 'Pending Recovery', value: totalWpsRemaining },
        ],
      },
      monthlyTrends,
      periodMode,
      periodLabel,
      periodMonths,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard data' });
  }
});

export default router;
