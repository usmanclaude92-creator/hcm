import { Router, Response } from 'express';
import { db, roundOMR } from '../db.js';
import { verifyAuth, AuthRequest } from '../auth.js';

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

    const employees = db.employees.getAll();
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
    const allPayments = db.salaryPayments.getAll().filter(p => !p.isReversed && periodMonthSet.has(p.payrollMonth));

    let totalFinalizedNetSalary = 0;
    let totalActuallyPaid = 0;

    for (const p of allFinalizedPayrolls) {
      const details = db.payroll.getByMonth(p.payrollMonth);
      if (details?.lines) {
        for (const line of details.lines) {
          totalFinalizedNetSalary = roundOMR(totalFinalizedNetSalary + line.netSalary);
        }
      }
    }

    totalActuallyPaid = roundOMR(allPayments.reduce((s, p) => s + p.payAmount, 0));
    const totalOutstandingSalary = roundOMR(Math.max(0, totalFinalizedNetSalary - totalActuallyPaid));

    // Loan balances -- outstanding/principal/recovered/count stay a live, current-moment
    // snapshot (no historical per-month loan-balance snapshot exists to reconstruct from);
    // only "recovery within the selected period" is period-scoped.
    const loans = db.loans.getAll();
    const activeLoans = loans.filter(l => l.status === 'Active');
    const totalOutstandingLoans = roundOMR(activeLoans.reduce((s, l) => s + l.outstandingBalance, 0));
    const totalActiveLoanPrincipal = roundOMR(activeLoans.reduce((s, l) => s + l.loanAmount, 0));
    const totalLoanRecovered = roundOMR(activeLoans.reduce((s, l) => s + (l.totalRecovered || 0), 0));
    const loanRecoveryPercentage = totalActiveLoanPrincipal > 0
      ? roundOMR((totalLoanRecovered / totalActiveLoanPrincipal) * 100)
      : 0;
    const periodRecovery = roundOMR(
      loans.reduce((sum, l) => {
        const recoveriesInPeriod = (l.recoveries || []).filter(r => periodMonthSet.has((r.recoveryDate || '').slice(0, 7)));
        return sum + recoveriesInPeriod.reduce((s, r) => s + (r.recoveryAmount || 0), 0);
      }, 0)
    );

    // WPS Recoveries -- scoped to the selected period.
    const wpsList = db.wps.getAll().filter(w => periodMonthSet.has((w.payrollMonth || (w as any).month || '') as string));
    const totalWpsRecoverable = roundOMR(wpsList.reduce((s, w) => s + w.totalRecoverable, 0));
    const totalWpsRecovered = roundOMR(wpsList.reduce((s, w) => s + w.totalRecovered, 0));
    const totalWpsRemaining = roundOMR(wpsList.reduce((s, w) => s + w.remainingBalance, 0));

    // Workforce cost distribution by employee type -- aggregated across every finalized
    // payroll in the selected period (collapses to the old "single latest payroll" behavior
    // when scope = exactly one month, so no regression for the common case).
    const workforceCostByCategory = ['Staff', 'Worker'].map(type => {
      const lines = allFinalizedPayrolls.flatMap(p => (db.payroll.getByMonth(p.payrollMonth)?.lines || [])).filter(l => l.employeeType === type);
      const totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
      return {
        name: type,
        count: lines.length,
        totalNetSalary,
        avgNetSalary: lines.length > 0 ? roundOMR(totalNetSalary / lines.length) : 0,
      };
    });
    const workforceCostSourceMonth = allFinalizedPayrolls.length > 0
      ? [...allFinalizedPayrolls].sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth))[0].payrollMonth
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
    const allPaymentsForTrends = db.salaryPayments.getAll().filter(p => !p.isReversed);
    const monthlyTrends = trendMonths.map(month => {
      const p = payrolls.find(pr => pr.payrollMonth === month);
      const paymentsForMonth = allPaymentsForTrends.filter(tx => tx.payrollMonth === month);
      const paidAmount = roundOMR(paymentsForMonth.reduce((s, tx) => s + tx.payAmount, 0));
      return {
        month,
        grossSalary: p ? roundOMR(p.totalGrossSalary) : 0,
        netSalary: p ? roundOMR(p.totalNetSalary) : 0,
        paidSalary: paidAmount,
        status: p ? p.status : 'No Payroll Run',
      };
    });

    // currentPayroll reflects the primary month of the current view: the selected month
    // itself (month mode), the most recent month in scope (range mode), or the latest
    // payroll ever (all mode, unchanged from prior behavior).
    let currentPayrollSource = latestPayroll;
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
