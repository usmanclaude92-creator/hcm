import React, { useEffect, useState } from 'react';
import { apiRequest, formatOMR } from '../../api/client';
import { PaymentLiabilityAnalytics } from './PaymentLiabilityAnalytics';
import {
  Users,
  Building,
  CreditCard,
  RefreshCw,
  Landmark,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PieChart as PieIcon,
  DollarSign,
  Briefcase,
  ArrowRight,
  Wallet,
  UserX,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

function MonthOverMonthBadge({ current, previous }: { current?: number; previous?: number }) {
  if (current === undefined || previous === undefined || !previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}% vs last month
    </span>
  );
}

function ProgressBar({ percentage, colorClass }: { percentage: number; colorClass: string }) {
  const clamped = Math.min(100, Math.max(0, percentage || 0));
  return (
    <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-1.5 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

interface DashboardViewProps {
  onNavigate: (view: string) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const res = await apiRequest('/api/dashboard');
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard metrics');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading payroll intelligence metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const { counts, currentPayroll, finances, loanAnalytics, workforceCostByCategory, distribution, monthlyTrends } = data || {};

  // Derived executive indicators -- all computed from data already returned by /api/dashboard,
  // nothing fabricated.
  const prevMonthTrend = monthlyTrends?.[monthlyTrends.length - 2];
  const currMonthTrend = monthlyTrends?.[monthlyTrends.length - 1];
  const paidPercentage = finances?.totalFinalizedNetSalary > 0
    ? (finances.totalActuallyPaid / finances.totalFinalizedNetSalary) * 100
    : 0;
  const wpsRecoveryPercentage = finances?.totalWpsRecoverable > 0
    ? (finances.totalWpsRecovered / finances.totalWpsRecoverable) * 100
    : 0;
  const avgNetSalary = counts?.activeEmployees > 0 && currentPayroll?.netSalary
    ? currentPayroll.netSalary / counts.activeEmployees
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner: Financial Separation Rule Reminder */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
              Financial Separation Enforced
            </span>
            <span className="text-xs text-slate-400">Payroll Month: <strong className="text-white">{currentPayroll?.month}</strong></span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Executive Payroll & WPS Operations Dashboard
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Calculations adhere to strict separation: <strong>Monthly Payroll</strong> (Salary Owed) • <strong>Salary Payments</strong> (Actual Disbursals) • <strong>WPS Recovery</strong> (Excess WPS) • <strong>Loans</strong> (Principal Balances).
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('payroll')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            Open Monthly Payroll
          </button>
          <button
            onClick={() => onNavigate('payments')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            Salary Disbursals
          </button>
        </div>
      </div>

      {/* Primary Financial Metric Cards (4 Pillars) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Finalized Payroll Owed */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Finalized Net Salary Owed</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              OMR {formatOMR(finances?.totalFinalizedNetSalary)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Status:</span>
              <span className={`font-semibold ${currentPayroll?.status === 'Finalized' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {currentPayroll?.status || 'Draft'}
              </span>
            </div>
            <div className="mt-1.5">
              <MonthOverMonthBadge current={currMonthTrend?.netSalary} previous={prevMonthTrend?.netSalary} />
            </div>
          </div>
        </div>

        {/* Card 2: Actual Disbursals */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Salary Disbursed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-600 tracking-tight">
              OMR {formatOMR(finances?.totalActuallyPaid)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Unpaid Balance:</span>
              <span className="font-semibold text-rose-600">OMR {formatOMR(finances?.totalOutstandingSalary)}</span>
            </div>
            <ProgressBar percentage={paidPercentage} colorClass="bg-emerald-500" />
            <span className="text-[10px] text-slate-400 mt-1 block">{paidPercentage.toFixed(1)}% of finalized payroll paid</span>
          </div>
        </div>

        {/* Card 3: WPS Recoverable */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">WPS Excess Recoverable</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <RefreshCw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-600 tracking-tight">
              OMR {formatOMR(finances?.totalWpsRecoverable)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Pending Recovery:</span>
              <span className="font-semibold text-slate-700">OMR {formatOMR(finances?.totalWpsRemaining)}</span>
            </div>
            <ProgressBar percentage={wpsRecoveryPercentage} colorClass="bg-amber-500" />
            <span className="text-[10px] text-slate-400 mt-1 block">{wpsRecoveryPercentage.toFixed(1)}% recovered</span>
          </div>
        </div>

        {/* Card 4: Active Loans */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Outstanding Loans</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-purple-600 tracking-tight">
              OMR {formatOMR(finances?.totalOutstandingLoans)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Recovered:</span>
              <span className="font-semibold text-emerald-600">OMR {formatOMR(loanAnalytics?.totalRecovered)}</span>
            </div>
            <ProgressBar percentage={loanAnalytics?.recoveryPercentage} colorClass="bg-purple-500" />
            <span className="text-[10px] text-slate-400 mt-1 block">
              {(loanAnalytics?.recoveryPercentage ?? 0).toFixed(1)}% recovered • {loanAnalytics?.activeLoanCount ?? 0} active loans
            </span>
          </div>
        </div>
      </div>

      {/* Workforce Statistics Pills */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500">Active Workforce:</span>
            <strong className="ml-1.5 text-sm text-slate-900">{counts?.activeEmployees} / {counts?.totalEmployees} Employees</strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium">
            Staff: <strong className="text-blue-600">{counts?.staff}</strong>
          </span>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium">
            Workers: <strong className="text-indigo-600">{counts?.workers}</strong>
          </span>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium">
            Omani Nationals: <strong className="text-emerald-600">{counts?.omani}</strong>
          </span>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium">
            Expatriates: <strong className="text-slate-900">{counts?.expat}</strong>
          </span>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium flex items-center gap-1">
            <UserX className="w-3 h-3 text-slate-400" />
            Inactive: <strong className="text-slate-500">{counts?.inactiveEmployees ?? 0}</strong>
          </span>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-700 font-medium flex items-center gap-1">
            <Wallet className="w-3 h-3 text-slate-400" />
            Avg. Net Salary: <strong className="text-slate-900">OMR {formatOMR(avgNetSalary)}</strong>
          </span>
        </div>
      </div>

      {/* Interactive Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Payroll & Payment Trend Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Monthly Payroll & Payment Trends</h3>
              <p className="text-xs text-slate-500">Gross Salary vs. Net Salary vs. Actually Paid (OMR)</p>
            </div>
            <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md font-medium">
              Last 6 Months
            </span>
          </div>

          <div className="h-80 w-full">
            {monthlyTrends && monthlyTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(val: any) => [`OMR ${formatOMR(val)}`, '']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="grossSalary" name="Gross Salary" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netSalary" name="Net Salary (Owed)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paidSalary" name="Actually Disbursed" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No monthly payroll trends available yet.
              </div>
            )}
          </div>
        </div>

        {/* Workforce Distribution Pie Chart */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col">
          <div className="mb-2">
            <h3 className="font-semibold text-slate-900 text-sm">Workforce Composition</h3>
            <p className="text-xs text-slate-500">Staff vs. Worker Distribution</p>
          </div>

          <div className="flex-1 h-80 w-full flex items-center justify-center">
            {distribution?.employeeTypes && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution.employeeTypes}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={4}
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#6366f1" />
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any) => [`${val} Employees`, name]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 flex items-center justify-around text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-slate-600">Staff: {counts?.staff}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-slate-600">Workers: {counts?.workers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* WPS Analysis + Workforce Cost Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                WPS Analysis
              </h3>
              <p className="text-xs text-slate-500">WPS Salary Liability vs. Recovery Progress</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500">WPS Salary (current month)</span>
              <div className="text-base font-bold text-slate-900">OMR {formatOMR(currentPayroll?.wpsSalary)}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <span className="text-[11px] text-amber-700">Total Recoverable</span>
              <div className="text-base font-bold text-amber-800">OMR {formatOMR(finances?.totalWpsRecoverable)}</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <span className="text-[11px] text-emerald-700">Recovered</span>
              <div className="text-base font-bold text-emerald-800">OMR {formatOMR(finances?.totalWpsRecovered)}</div>
            </div>
            <div className="p-3 bg-rose-50 rounded-lg">
              <span className="text-[11px] text-rose-700">Pending Recovery</span>
              <div className="text-base font-bold text-rose-800">OMR {formatOMR(finances?.totalWpsRemaining)}</div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>Recovery Progress</span>
              <span className="font-semibold text-amber-700">{wpsRecoveryPercentage.toFixed(1)}%</span>
            </div>
            <ProgressBar percentage={wpsRecoveryPercentage} colorClass="bg-amber-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              Workforce Cost Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Avg. Net Salary by Category {data?.workforceCostSourceMonth ? `(${data.workforceCostSourceMonth} Payroll)` : ''}
            </p>
          </div>
          <div className="h-52 w-full">
            {workforceCostByCategory && workforceCostByCategory.some((c: any) => c.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workforceCostByCategory} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} width={60} />
                  <Tooltip
                    formatter={(val: any, name: any) => [name === 'avgNetSalary' ? `OMR ${formatOMR(val)}` : val, name === 'avgNetSalary' ? 'Avg. Net Salary' : 'Employees']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="avgNetSalary" name="Avg. Net Salary" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No finalized payroll data available yet.
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3 flex items-center justify-around text-xs">
            {workforceCostByCategory?.map((c: any) => (
              <div key={c.name} className="text-center">
                <span className="text-slate-500">{c.name}</span>
                <div className="font-semibold text-slate-800">{c.count} employees</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Loan & Recovery Analysis + Payroll Variance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-purple-600" />
              Loan &amp; Recovery Analysis
            </h3>
            <p className="text-xs text-slate-500">Active Employee Loans &amp; Monthly Recovery Progress</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-[11px] text-slate-500">Total Principal (Active)</span>
              <div className="text-base font-bold text-slate-900">OMR {formatOMR(loanAnalytics?.totalPrincipal)}</div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <span className="text-[11px] text-emerald-700">Total Recovered</span>
              <div className="text-base font-bold text-emerald-800">OMR {formatOMR(loanAnalytics?.totalRecovered)}</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <span className="text-[11px] text-purple-700">Outstanding Balance</span>
              <div className="text-base font-bold text-purple-800">OMR {formatOMR(loanAnalytics?.outstandingBalance)}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <span className="text-[11px] text-blue-700">This Month's Recovery</span>
              <div className="text-base font-bold text-blue-800">OMR {formatOMR(loanAnalytics?.monthlyRecovery)}</div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>Recovery Progress • {loanAnalytics?.activeLoanCount ?? 0} Active Loan(s)</span>
              <span className="font-semibold text-purple-700">{(loanAnalytics?.recoveryPercentage ?? 0).toFixed(1)}%</span>
            </div>
            <ProgressBar percentage={loanAnalytics?.recoveryPercentage} colorClass="bg-purple-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="mb-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Payroll Variance / Month-over-Month
            </h3>
            <p className="text-xs text-slate-500">Net Salary Owed vs. Actually Disbursed, by Month</p>
          </div>
          {monthlyTrends && monthlyTrends.length > 0 ? (
            <div className="space-y-2">
              {monthlyTrends.map((m: any, idx: number) => {
                const prev = monthlyTrends[idx - 1];
                const variance = m.netSalary - m.paidSalary;
                return (
                  <div key={m.month} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                    <div className="font-semibold text-slate-700 w-20">{m.month}</div>
                    <div className="text-slate-500">
                      Net: <span className="font-mono font-semibold text-slate-900">OMR {formatOMR(m.netSalary)}</span>
                    </div>
                    <div className="text-slate-500">
                      Paid: <span className="font-mono font-semibold text-emerald-700">OMR {formatOMR(m.paidSalary)}</span>
                    </div>
                    <div className="text-slate-500">
                      Variance: <span className="font-mono font-semibold text-rose-600">OMR {formatOMR(variance)}</span>
                    </div>
                    <div className="w-28 text-right">
                      <MonthOverMonthBadge current={m.netSalary} previous={prev?.netSalary} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-xs text-slate-400">
              No monthly payroll trends available yet.
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Navigation Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('employees')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-sm cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Employee Master</h4>
              <p className="text-xs text-slate-500">Excel Import/Export & Histories</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        <div
          onClick={() => onNavigate('attendance')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-sm cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Attendance Ledger</h4>
              <p className="text-xs text-slate-500">Multi-Project Days & Hours</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
        </div>

        <div
          onClick={() => onNavigate('reports')}
          className="p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-sm cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Financial Reports</h4>
              <p className="text-xs text-slate-500">5 Categorical Excel Ledgers</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>

      {/* Payment Planning & Salary Liability Analytics -- a separate, read-only executive
          section over the Payment Planning dataset; the Payment Planning Sheet itself
          stays a focused operational page. */}
      <PaymentLiabilityAnalytics onNavigateToPlanning={() => onNavigate('payment-planning')} />
    </div>
  );
};
