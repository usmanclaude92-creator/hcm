import React, { useEffect, useState } from 'react';
import { apiRequest, formatOMR } from '../../api/client';
import {
  Users,
  Building,
  CreditCard,
  RefreshCw,
  Landmark,
  Calculator,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  PieChart as PieIcon,
  DollarSign,
  Briefcase,
  ArrowRight,
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

  const { counts, currentPayroll, finances, distribution, monthlyTrends } = data || {};

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Recovered from monthly payroll deductions</span>
            </div>
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

          <div className="h-64 w-full">
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

          <div className="flex-1 h-52 w-full flex items-center justify-center">
            {distribution?.employeeTypes && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution.employeeTypes}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    innerRadius={35}
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
    </div>
  );
};
