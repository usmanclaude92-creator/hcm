import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiRequest, formatOMR } from '../../api/client';
import { PaymentLiabilityAnalytics } from './PaymentLiabilityAnalytics';
import { PayrollPeriodFilter, type PeriodMode } from './PayrollPeriodFilter';
import { DocumentExpiryMonitoringSection } from './DocumentExpiryMonitoringSection';
import { WorkforceDeploymentView, type WorkforceDeploymentViewHandle } from '../workforce/WorkforceDeploymentView';
import {
  Users,
  CreditCard,
  RefreshCw,
  RotateCcw,
  Landmark,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Briefcase,
  ArrowRight,
  Wallet,
  UserX,
  MapPin,
  ShieldAlert,
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

const JOB_COLORS = [
  '#2563eb', // blue
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#64748b', // slate
  '#e11d48', // rose
  '#84cc16', // lime
];

function MonthOverMonthBadge({ current, previous }: { current?: number; previous?: number }) {
  if (current === undefined || previous === undefined || !previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {isUp ? '+' : '−'}{Math.abs(pct).toFixed(1)}% vs previous month
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
  onNavigate: (view: string, params?: Record<string, any>) => void;
  initialTab?: DashboardTab;
}

type DashboardTab = 'payroll-insights' | 'workforce-deployment' | 'document-expiry';

// Default period is the previous calendar month relative to today's real date -- per
// explicit product requirement, never the current in-progress month.
function getDefaultPeriodMonth(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

// ...but if that month has no payroll at all, the dashboard opened on a wall of
// OMR 0.000 while real money was outstanding. Fall back to the most recent month that
// actually has a payroll run, so the first thing an executive sees is real figures.
function resolveInitialMonth(availableMonths: string[]): string {
  const preferred = getDefaultPeriodMonth();
  if (availableMonths.includes(preferred)) return preferred;
  const earlier = availableMonths.filter(m => m <= preferred).sort();
  if (earlier.length > 0) return earlier[earlier.length - 1];
  return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : preferred;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, initialTab }) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab || 'payroll-insights');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workforce Deployment's own live-poll status, lifted up so the header's tab row can
  // show the LIVE badge + Refresh control (the view itself still owns all fetching/polling).
  const workforceViewRef = useRef<WorkforceDeploymentViewHandle>(null);
  const [workforceLastUpdated, setWorkforceLastUpdated] = useState<Date | null>(null);

  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultPeriodMonth());
  const [fromMonth, setFromMonth] = useState<string>(getDefaultPeriodMonth());
  const [toMonth, setToMonth] = useState<string>(getDefaultPeriodMonth());
  const [compositionMode, setCompositionMode] = useState<'job' | 'type'>('job');

  // Whether the user has touched the period control yet. Once they have, the initial
  // resolution below must never move the selection under them.
  const [periodTouched, setPeriodTouched] = useState(false);

  // Fetched once, purely to populate the period filter's month dropdowns -- and to
  // resolve the opening month to one that actually has a payroll.
  useEffect(() => {
    async function fetchMonths() {
      try {
        const res = await apiRequest('/api/payroll');
        const months = (Array.from(new Set((Array.isArray(res) ? res : []).map((p: any) => p.payrollMonth))) as string[]).sort();
        setAvailableMonths(months);
        if (months.length > 0) {
          setPeriodTouched(touched => {
            if (!touched) {
              const resolved = resolveInitialMonth(months);
              setSelectedMonth(resolved);
              setFromMonth(resolved);
              setToMonth(resolved);
            }
            return touched;
          });
        }
      } catch {
        // Non-critical -- the period filter still functions with just the default month.
      }
    }
    fetchMonths();
  }, []);

  const dashboardQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('periodMode', periodMode);
    if (periodMode === 'month') params.set('month', selectedMonth);
    if (periodMode === 'range') {
      params.set('fromMonth', fromMonth);
      params.set('toMonth', toMonth);
    }
    return params.toString();
  }, [periodMode, selectedMonth, fromMonth, toMonth]);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const res = await apiRequest(`/api/dashboard?${dashboardQuery()}`);
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard metrics');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [dashboardQuery]);

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

  const { counts, currentPayroll, finances, loanAnalytics, workforceCostByCategory, distribution, monthlyTrends, periodLabel, periodMonths } = data || {};

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
  // Server-computed across every finalized payroll line in the selected period. It used
  // to divide the LATEST payroll's net by the active headcount, so in All Time mode a
  // newer empty draft made it read OMR 0.000 over months of real pay.
  const avgNetSalary = data?.averageNetSalary ?? 0;

  const TABS: { id: DashboardTab; label: string; icon: any }[] = [
    { id: 'payroll-insights', label: 'Payroll Insights', icon: Calculator },
    { id: 'workforce-deployment', label: 'Workforce Deployment', icon: MapPin },
    { id: 'document-expiry', label: 'Document Expiry Monitoring', icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header + Tab Navigation + Period Filter */}
      <div className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 pt-5 pb-4 bg-gradient-to-r from-slate-900 to-indigo-950">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
            Executive Command Center
          </span>
          <h1 className="text-xl font-bold uppercase tracking-tight text-white mt-1.5">Executive Dashboard</h1>
        </div>
        {/* Main navigation: tabs (left) + period filter / live status (right) -- same
            default themed toolbar background in both tab states. */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-xl p-1.5 self-start">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'payroll-insights' ? (
            <PayrollPeriodFilter
              mode={periodMode}
              onModeChange={(m) => { setPeriodTouched(true); setPeriodMode(m); }}
              selectedMonth={selectedMonth}
              onSelectedMonthChange={(m) => { setPeriodTouched(true); setSelectedMonth(m); }}
              fromMonth={fromMonth}
              onFromChange={(m) => { setPeriodTouched(true); setFromMonth(m); }}
              toMonth={toMonth}
              onToChange={(m) => { setPeriodTouched(true); setToMonth(m); }}
              availableMonths={availableMonths}
            />
          ) : activeTab === 'workforce-deployment' ? (
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] font-bold text-emerald-700">LIVE</span>
                <span className="text-[11px] text-slate-400">•</span>
                <span className="text-[11px] text-slate-500">
                  Last Updated: {workforceLastUpdated ? formatTime(workforceLastUpdated) : '—'}
                </span>
              </div>
              <button
                onClick={() => workforceViewRef.current?.refresh()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activeTab === 'workforce-deployment' ? (
        <WorkforceDeploymentView
          ref={workforceViewRef}
          onStatusChange={(s) => setWorkforceLastUpdated(s.lastUpdated)}
          onSelectEmployee={(empId) => onNavigate('employee-ledger', { employeeId: empId })}
        />
      ) : activeTab === 'document-expiry' ? (
        <DocumentExpiryMonitoringSection
          onNavigateToEmployees={(filters) => onNavigate('employees', filters)}
          onNavigateToCompliance={() => onNavigate('compliance')}
          onNavigateToDocuments={() => onNavigate('documents')}
        />
      ) : (
        <>

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

          {/* Workforce Statistics Pills -- live current headcount, not period-scoped */}
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
                  {periodLabel || 'Trend'}
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

            {/* Job & Workforce Composition Pie Chart */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">
                    {compositionMode === 'job' ? 'Job Composition' : 'Workforce Composition'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {compositionMode === 'job'
                      ? `Workforce by Job Designation (${(distribution?.jobComposition || []).length} Roles)`
                      : 'Staff vs. Worker Distribution'}
                  </p>
                </div>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCompositionMode('job')}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      compositionMode === 'job'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    By Job
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompositionMode('type')}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      compositionMode === 'type'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Staff / Worker
                  </button>
                </div>
              </div>

              {(() => {
                const jobData = distribution?.jobComposition || [];
                const typeData = distribution?.employeeTypes || [];
                const totalJobEmployees = jobData.reduce((s: number, j: any) => s + Number(j.value || 0), 0) || counts?.activeEmployees || 1;
                const totalTypeEmployees = typeData.reduce((s: number, t: any) => s + Number(t.value || 0), 0) || counts?.activeEmployees || 1;

                if (compositionMode === 'job') {
                  return (
                    <>
                      <div className="flex-1 h-80 w-full flex items-center justify-center">
                        {jobData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={jobData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={90}
                                innerRadius={50}
                                paddingAngle={jobData.length > 1 ? 3 : 0}
                              >
                                {jobData.map((_: any, idx: number) => (
                                  <Cell key={`job-cell-${idx}`} fill={JOB_COLORS[idx % JOB_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(val: any, name: any) => [
                                  `${val} Employees (${Math.round((Number(val) / totalJobEmployees) * 100)}%)`,
                                  name,
                                ]}
                                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-slate-400">
                            No job designations recorded yet.
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-100 pt-3 max-h-24 overflow-y-auto pr-1">
                        <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-xs">
                          {jobData.map((job: any, idx: number) => {
                            const color = JOB_COLORS[idx % JOB_COLORS.length];
                            const pct = Math.round((Number(job.value || 0) / totalJobEmployees) * 100);
                            return (
                              <div key={job.name} className="flex items-center gap-1.5" title={`${job.name}: ${job.value} (${pct}%)`}>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span className="text-slate-600 truncate max-w-[120px]">{job.name}:</span>
                                <span className="font-bold text-slate-800">{job.value}</span>
                                <span className="text-[10px] text-slate-400">({pct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    <div className="flex-1 h-80 w-full flex items-center justify-center">
                      {typeData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={typeData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={90}
                              innerRadius={50}
                              paddingAngle={4}
                            >
                              <Cell fill="#2563eb" />
                              <Cell fill="#6366f1" />
                            </Pie>
                            <Tooltip
                              formatter={(val: any, name: any) => [
                                `${val} Employees (${Math.round((Number(val) / totalTypeEmployees) * 100)}%)`,
                                name,
                              ]}
                              contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          No workforce data available.
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex items-center justify-around text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-blue-600" />
                        <span className="text-slate-600">Staff: <strong className="text-slate-900">{counts?.staff}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-indigo-600" />
                        <span className="text-slate-600">Workers: <strong className="text-slate-900">{counts?.workers}</strong></span>
                      </div>
                    </div>
                  </>
                );
              })()}
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
                  <span className="text-[11px] text-slate-500">WPS Salary (Selected Period)</span>
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
                {/* Names every month in scope, not just the newest -- this panel
                    aggregates the whole period, and labelling it with one month read as
                    if the other months were excluded. */}
                <p className="text-xs text-slate-500">
                  Avg. Net Salary per employee-month
                  {data?.workforceCostMonths?.length
                    ? data.workforceCostMonths.length === 1
                      ? ` (${data.workforceCostMonths[0]} payroll)`
                      : ` (${data.workforceCostMonths.length} finalized payrolls: ${data.workforceCostMonths[0]} – ${data.workforceCostMonths[data.workforceCostMonths.length - 1]})`
                    : ''}
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
                <p className="text-xs text-slate-500">Active Employee Loans &amp; Recovery Progress</p>
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
                  <span className="text-[11px] text-blue-700">Recovery (Selected Period)</span>
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
                  <h4 className="text-sm font-semibold text-slate-900">Attendance Register</h4>
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
              stays a focused operational page. Scoped to the same selected period. */}
          <PaymentLiabilityAnalytics onNavigateToPlanning={() => onNavigate('payment-planning')} periodMonths={periodMonths ?? null} />
        </>
      )}
    </div>
  );
};
