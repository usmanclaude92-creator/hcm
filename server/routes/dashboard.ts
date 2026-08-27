import { Router, Response } from 'express';
import { db, roundOMR } from '../db.js';
import { verifyAuth, AuthRequest } from '../auth.js';

const router = Router();

// GET /api/dashboard - Aggregated stats and real-time trends for dashboard
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const employees = db.employees.getAll();
    const activeEmployees = employees.filter(e => e.isActive);
    const workers = activeEmployees.filter(e => e.employeeType === 'Worker');
    const staff = activeEmployees.filter(e => e.employeeType === 'Staff');
    const omani = activeEmployees.filter(e => e.nationalityType === 'Omani');
    const expat = activeEmployees.filter(e => e.nationalityType === 'Expat');

    const payrolls = db.payroll.getAll().sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth));
    const latestPayroll = payrolls[0] || null;

    // Financial balances
    const allFinalizedPayrolls = payrolls.filter(p => p.status === 'Finalized');
    const allPayments = db.salaryPayments.getAll().filter(p => !p.isReversed);

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

    // Loan balances
    const loans = db.loans.getAll();
    const activeLoans = loans.filter(l => l.status === 'Active');
    const totalOutstandingLoans = roundOMR(activeLoans.reduce((s, l) => s + l.outstandingBalance, 0));
    const totalActiveLoanPrincipal = roundOMR(activeLoans.reduce((s, l) => s + l.loanAmount, 0));
    const totalLoanRecovered = roundOMR(activeLoans.reduce((s, l) => s + (l.totalRecovered || 0), 0));
    const loanRecoveryPercentage = totalActiveLoanPrincipal > 0
      ? roundOMR((totalLoanRecovered / totalActiveLoanPrincipal) * 100)
      : 0;
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const monthlyLoanRecovery = roundOMR(
      loans.reduce((sum, l) => {
        const recoveriesThisMonth = (l.recoveries || []).filter(r => (r.recoveryDate || '').startsWith(currentMonthStr));
        return sum + recoveriesThisMonth.reduce((s, r) => s + (r.recoveryAmount || 0), 0);
      }, 0)
    );

    // WPS Recoveries
    const wpsList = db.wps.getAll();
    const totalWpsRecoverable = roundOMR(wpsList.reduce((s, w) => s + w.totalRecoverable, 0));
    const totalWpsRecovered = roundOMR(wpsList.reduce((s, w) => s + w.totalRecovered, 0));
    const totalWpsRemaining = roundOMR(wpsList.reduce((s, w) => s + w.remainingBalance, 0));

    // Workforce cost distribution by employee type, from the latest finalized payroll's lines
    // (real per-line data, not a fabricated split).
    const latestFinalizedDetails = allFinalizedPayrolls.length > 0
      ? db.payroll.getByMonth(allFinalizedPayrolls[0].payrollMonth)
      : null;
    const workforceCostByCategory = ['Staff', 'Worker'].map(type => {
      const lines = (latestFinalizedDetails?.lines || []).filter(l => l.employeeType === type);
      const totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
      return {
        name: type,
        count: lines.length,
        totalNetSalary,
        avgNetSalary: lines.length > 0 ? roundOMR(totalNetSalary / lines.length) : 0,
      };
    });

    // Monthly trends for last 6 months
    const monthlyTrends = payrolls.slice(0, 6).reverse().map(p => {
      const paymentsForMonth = allPayments.filter(tx => tx.payrollMonth === p.payrollMonth);
      const paidAmount = roundOMR(paymentsForMonth.reduce((s, tx) => s + tx.payAmount, 0));
      return {
        month: p.payrollMonth,
        grossSalary: roundOMR(p.totalGrossSalary),
        netSalary: roundOMR(p.totalNetSalary),
        paidSalary: paidAmount,
        status: p.status,
      };
    });

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
        month: latestPayroll ? latestPayroll.payrollMonth : new Date().toISOString().slice(0, 7),
        status: latestPayroll ? latestPayroll.status : 'No Payroll Run',
        grossSalary: latestPayroll ? roundOMR(latestPayroll.totalGrossSalary) : 0,
        netSalary: latestPayroll ? roundOMR(latestPayroll.totalNetSalary) : 0,
        wpsSalary: latestPayroll ? roundOMR(latestPayroll.totalWpsSalary) : 0,
        recoverableSalary: latestPayroll ? roundOMR(latestPayroll.totalRecoverableSalary) : 0,
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
        monthlyRecovery: monthlyLoanRecovery,
      },
      workforceCostByCategory,
      workforceCostSourceMonth: latestFinalizedDetails?.payrollMonth || null,
      distribution: {
        employeeTypes: [
          { name: 'Staff', value: staff.length },
          { name: 'Workers', value: workers.length },
        ],
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
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard data' });
  }
});

export default router;
