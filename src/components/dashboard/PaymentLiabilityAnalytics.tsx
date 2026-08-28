import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest, formatOMR } from '../../api/client';
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
import {
  TrendingUp,
  Building2,
  Users,
  RefreshCw,
  Clock,
  Trophy,
  CalendarClock,
  Scale,
  AlertTriangle,
  Layers,
} from 'lucide-react';

interface PlanRow {
  payrollId: string;
  payrollMonth: string;
  employeeId: string;
  employeeName: string;
  employeeCompany: string;
  salaryPaidBy: string;
  wpsEmployee: string;
  wageType: string;
  netSalary: number;
  totalPaid: number;
  outstanding: number;
  status: string;
  lastPaidSalary: number;
  lastPaymentDate: string | null;
  shouldPayAmount: number;
  remarks: string;
  isOldestUnpaid: boolean;
  employeeType: string;
}

interface Props {
  onNavigateToPlanning: () => void;
}

// Copied verbatim from DashboardView.tsx's local (unexported) ProgressBar, to stay
// visually consistent with the rest of the app without importing across view files.
function ProgressBar({ percentage, colorClass }: { percentage: number; colorClass: string }) {
  const clamped = Math.min(100, Math.max(0, percentage || 0));
  return (
    <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-1.5 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

// Named, visible thresholds (not hidden magic numbers) for the exceptions panel --
// an employee with outstanding balances spanning this many distinct payroll months
// is flagged Critical/Attention. No due-date concept exists in this system to define
// a day-based "overdue" rule against, so this is the only real signal the data supports.
const CRITICAL_MONTHS_THRESHOLD = 3;
const ATTENTION_MONTHS_THRESHOLD = 2;

// This is a read-only Executive Dashboard view over the full, unfiltered Payment
// Planning dataset -- there is no operational table on this page to filter or scroll
// into, so every breakdown here reflects everything, and row clicks navigate to the
// Payment Planning Sheet itself rather than filtering in place.
export const PaymentLiabilityAnalytics: React.FC<Props> = ({ onNavigateToPlanning }) => {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wpsItems, setWpsItems] = useState<any[] | null>(null);
  const [wpsFailed, setWpsFailed] = useState(false);
  const [trendMode, setTrendMode] = useState<'amount' | 'count'>('amount');
  const [showAttention, setShowAttention] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/payment-planning')
      .then((res) => {
        if (!cancelled) setRows(res.rows || []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to fetch payment planning data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    apiRequest('/api/wps')
      .then((res) => {
        if (!cancelled) setWpsItems(res.items || []);
      })
      .catch(() => {
        if (!cancelled) setWpsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Chronological month order from the full dataset -- aging distance must be measured
  // against real history.
  const allMonthsSorted = useMemo(() => Array.from(new Set(rows.map((r) => r.payrollMonth))).sort(), [rows]);
  const latestKnownMonth = allMonthsSorted[allMonthsSorted.length - 1];
  const monthIndex = (m: string) => allMonthsSorted.indexOf(m);

  const totalOutstanding = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.outstanding) || 0), 0), [rows]);
  const totalPlanned = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.shouldPayAmount) || 0), 0), [rows]);
  const coveragePercent = totalOutstanding > 0 ? (totalPlanned / totalOutstanding) * 100 : 0;

  // Salary Outstanding Aging -- also serves as the "Payment Delay" view, since this
  // system has no day-level due-date data, only month payroll cycles.
  const agingBuckets = useMemo(() => {
    const buckets = [
      { key: 0, name: 'Current Month', amount: 0, employees: new Set<string>() },
      { key: 1, name: '1 Month Outstanding', amount: 0, employees: new Set<string>() },
      { key: 2, name: '2 Months Outstanding', amount: 0, employees: new Set<string>() },
      { key: 3, name: '3 Months Outstanding', amount: 0, employees: new Set<string>() },
      { key: 4, name: '4+ Months Outstanding', amount: 0, employees: new Set<string>() },
    ];
    if (!latestKnownMonth) return buckets.map((b) => ({ name: b.name, amount: 0, employees: 0 }));
    const latestIdx = monthIndex(latestKnownMonth);
    rows.forEach((r) => {
      if (r.outstanding <= 0) return;
      const behind = Math.max(0, latestIdx - monthIndex(r.payrollMonth));
      const bucket = buckets[Math.min(behind, 4)];
      bucket.amount += r.outstanding;
      bucket.employees.add(r.employeeId);
    });
    return buckets.map((b) => ({ name: b.name, amount: b.amount, employees: b.employees.size }));
  }, [rows, latestKnownMonth]);

  // Monthly Outstanding Trend
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, { month: string; netSalary: number; totalPaid: number; outstanding: number; shouldPay: number; employees: Set<string> }>();
    rows.forEach((r) => {
      if (!map.has(r.payrollMonth)) {
        map.set(r.payrollMonth, { month: r.payrollMonth, netSalary: 0, totalPaid: 0, outstanding: 0, shouldPay: 0, employees: new Set() });
      }
      const m = map.get(r.payrollMonth)!;
      m.netSalary += r.netSalary;
      m.totalPaid += r.totalPaid;
      m.outstanding += r.outstanding;
      m.shouldPay += r.shouldPayAmount;
      m.employees.add(r.employeeId);
    });
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        netSalary: m.netSalary,
        totalPaid: m.totalPaid,
        outstanding: m.outstanding,
        shouldPay: m.shouldPay,
        employeeCount: m.employees.size,
      }));
  }, [rows]);

  // Company-Wise Liability
  const companyBreakdown = useMemo(() => {
    const map = new Map<string, { company: string; employees: Set<string>; outstanding: number; planned: number }>();
    rows.forEach((r) => {
      if (!map.has(r.employeeCompany)) map.set(r.employeeCompany, { company: r.employeeCompany, employees: new Set(), outstanding: 0, planned: 0 });
      const c = map.get(r.employeeCompany)!;
      c.employees.add(r.employeeId);
      c.outstanding += r.outstanding;
      c.planned += r.shouldPayAmount;
    });
    return Array.from(map.values())
      .map((c) => ({ company: c.company, employees: c.employees.size, outstanding: c.outstanding, planned: c.planned, pending: c.outstanding - c.planned }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [rows]);

  // Pay-By Analysis
  const payByBreakdown = useMemo(() => {
    const map = new Map<string, { payBy: string; employees: Set<string>; outstanding: number; planned: number }>();
    rows.forEach((r) => {
      if (!map.has(r.salaryPaidBy)) map.set(r.salaryPaidBy, { payBy: r.salaryPaidBy, employees: new Set(), outstanding: 0, planned: 0 });
      const c = map.get(r.salaryPaidBy)!;
      c.employees.add(r.employeeId);
      c.outstanding += r.outstanding;
      c.planned += r.shouldPayAmount;
    });
    return Array.from(map.values())
      .map((c) => ({ payBy: c.payBy, employees: c.employees.size, outstanding: c.outstanding, planned: c.planned, pending: c.outstanding - c.planned }))
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [rows]);

  // Staff vs Worker Analysis
  const employeeTypeBreakdown = useMemo(() => {
    const map = new Map<string, { type: string; employees: Set<string>; outstanding: number; planned: number }>();
    rows.forEach((r) => {
      const type = r.employeeType || 'Unknown';
      if (!map.has(type)) map.set(type, { type, employees: new Set(), outstanding: 0, planned: 0 });
      const c = map.get(type)!;
      c.employees.add(r.employeeId);
      c.outstanding += r.outstanding;
      c.planned += r.shouldPayAmount;
    });
    return Array.from(map.values()).map((c) => {
      const count = c.employees.size;
      return {
        type: c.type,
        count,
        outstanding: c.outstanding,
        planned: c.planned,
        pending: c.outstanding - c.planned,
        avgOutstanding: count > 0 ? c.outstanding / count : 0,
      };
    });
  }, [rows]);

  // WPS Analysis
  const wpsAnalysis = useMemo(() => {
    if (!wpsItems) return null;
    const keys = new Set(rows.map((r) => `${r.employeeId}_${r.payrollMonth}`));
    const relevant = wpsItems.filter((w: any) => keys.has(`${w.employeeId}_${w.payrollMonth}`));
    const recoverable = relevant.reduce((s: number, w: any) => s + (w.totalRecoverable || 0), 0);
    const recovered = relevant.reduce((s: number, w: any) => s + (w.totalRecovered || 0), 0);
    const remaining = relevant.reduce((s: number, w: any) => s + (w.remainingBalance || 0), 0);
    const exceptions = relevant.filter((w: any) => w.status === 'Outstanding').length;
    return {
      applicable: relevant.length,
      recoverable,
      recovered,
      remaining,
      exceptions,
      coverage: recoverable > 0 ? (recovered / recoverable) * 100 : 0,
    };
  }, [wpsItems, rows]);

  // Last Payment Analysis
  const lastPaymentAnalysis = useMemo(() => {
    const latest = rows.reduce((max: string | null, r) => (!max || r.payrollMonth > max ? r.payrollMonth : max), null as string | null);
    if (!latest) return null;
    const cycleRows = rows.filter((r) => r.payrollMonth === latest);
    const now = Date.now();
    const daysSince = rows.filter((r) => r.lastPaymentDate).map((r) => (now - new Date(r.lastPaymentDate!).getTime()) / 86400000);
    return {
      month: latest,
      totalPaid: cycleRows.reduce((s, r) => s + r.totalPaid, 0),
      fullyPaid: cycleRows.filter((r) => r.status === 'Fully Paid').length,
      partiallyPaid: cycleRows.filter((r) => r.status === 'Partially Paid').length,
      unpaid: cycleRows.filter((r) => r.status === 'Unpaid').length,
      avgDaysSincePayment: daysSince.length > 0 ? daysSince.reduce((a, b) => a + b, 0) / daysSince.length : null,
    };
  }, [rows]);

  // Top 10 Outstanding Employees
  const topOutstandingEmployees = useMemo(() => {
    const byEmp = new Map<string, { employeeId: string; employeeName: string; employeeCompany: string; totalOutstanding: number }>();
    rows.forEach((r) => {
      if (!byEmp.has(r.employeeId)) byEmp.set(r.employeeId, { employeeId: r.employeeId, employeeName: r.employeeName, employeeCompany: r.employeeCompany, totalOutstanding: 0 });
      byEmp.get(r.employeeId)!.totalOutstanding += r.outstanding;
    });
    return Array.from(byEmp.values())
      .filter((e) => e.totalOutstanding > 0)
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 10)
      .map((e) => {
        const oldestRow = rows.find((r) => r.employeeId === e.employeeId && r.isOldestUnpaid);
        return {
          ...e,
          oldestMonth: oldestRow?.payrollMonth || '—',
          oldestOutstanding: oldestRow?.outstanding || 0,
          oldestPlanned: oldestRow?.shouldPayAmount || 0,
        };
      });
  }, [rows]);

  // Payment Attention Required
  const paymentAttention = useMemo(() => {
    const byEmp = new Map<string, PlanRow[]>();
    rows.forEach((r) => {
      if (!byEmp.has(r.employeeId)) byEmp.set(r.employeeId, []);
      byEmp.get(r.employeeId)!.push(r);
    });
    const items: { type: string; message: string; order: number }[] = [];
    byEmp.forEach((empRows) => {
      const empId = empRows[0].employeeId;
      const empName = empRows[0].employeeName;
      const distinctOutstandingMonths = new Set(empRows.filter((r) => r.outstanding > 0).map((r) => r.payrollMonth)).size;
      if (distinctOutstandingMonths >= CRITICAL_MONTHS_THRESHOLD) {
        items.push({ type: 'Critical', order: 0, message: `${empId} — ${empName}: ${distinctOutstandingMonths} months outstanding` });
      } else if (distinctOutstandingMonths >= ATTENTION_MONTHS_THRESHOLD) {
        items.push({ type: 'Attention', order: 1, message: `${empId} — ${empName}: ${distinctOutstandingMonths} months outstanding` });
      }
      const partialRow = empRows.find((r) => r.status === 'Partially Paid' && r.outstanding > 0);
      if (partialRow) {
        items.push({ type: 'Partial Payment', order: 2, message: `${empId} — ${empName}: OMR ${formatOMR(partialRow.outstanding)} remaining (${partialRow.payrollMonth})` });
      }
    });
    return items.sort((a, b) => a.order - b.order);
  }, [rows]);

  // Oldest Unpaid Month Distribution
  const oldestUnpaidDistribution = useMemo(() => {
    const map = new Map<string, { month: string; employees: number; amount: number }>();
    rows
      .filter((r) => r.isOldestUnpaid)
      .forEach((r) => {
        if (!map.has(r.payrollMonth)) map.set(r.payrollMonth, { month: r.payrollMonth, employees: 0, amount: 0 });
        const m = map.get(r.payrollMonth)!;
        m.employees += 1;
        m.amount += r.outstanding;
      });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [rows]);

  // Planned Payment by Month -- grouped by every row's own month, not just the
  // oldest-unpaid one, since Should Pay is editable on any unpaid/partial row.
  const plannedByMonth = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      map.set(r.payrollMonth, (map.get(r.payrollMonth) || 0) + r.shouldPayAmount);
    });
    return Array.from(map.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .filter((m) => m.amount > 0);
  }, [rows]);

  const remainingPending = totalOutstanding - totalPlanned;
  const barMax = Math.max(totalOutstanding, totalPlanned, Math.abs(remainingPending), 1);

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-xs flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading payment liability analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">Payment Planning &amp; Salary Liability Analytics</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Executive, read-only view over the full Payment Planning dataset — derived entirely from existing planning/WPS data, no separate calculation engine
        </p>
      </div>

      {/* Row: Monthly Outstanding Trend + Payment Plan Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Monthly Salary Outstanding Trend
              </h3>
              <p className="text-xs text-slate-500">Net Salary vs. Paid vs. Outstanding vs. Planned, by month</p>
            </div>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['amount', 'count'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTrendMode(mode)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                    trendMode === mode ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  {mode === 'amount' ? 'Amount' : 'Employees'}
                </button>
              ))}
            </div>
          </div>
          <div className="h-80 w-full">
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(val: any, name: any) => [trendMode === 'amount' ? `OMR ${formatOMR(val)}` : val, name]}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  {trendMode === 'amount' ? (
                    <>
                      <Bar dataKey="netSalary" name="Net Salary" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="totalPaid" name="Paid" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outstanding" name="Outstanding" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="shouldPay" name="Planned" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="employeeCount" name="Employees" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No payment planning data available yet.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-center">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Payment Plan Coverage</h3>
          <p className="text-xs text-slate-500 mb-4">Share of outstanding liability currently planned</p>
          <div className="text-3xl font-bold text-indigo-900 font-mono">{coveragePercent.toFixed(1)}% Planned</div>
          <ProgressBar percentage={coveragePercent} colorClass="bg-indigo-500" />
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <span className="text-indigo-700 block">Planned</span>
              <span className="font-bold text-indigo-900">OMR {formatOMR(totalPlanned)}</span>
            </div>
            <div className="p-2 bg-rose-50 rounded-lg">
              <span className="text-rose-700 block">Total Outstanding</span>
              <span className="font-bold text-rose-900">OMR {formatOMR(totalOutstanding)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row: Salary Aging + Oldest Unpaid Month Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            Salary Outstanding Aging
          </h3>
          <p className="text-xs text-slate-500 mb-4">How many payroll months behind each outstanding balance is</p>
          <div className="h-64 w-full">
            {agingBuckets.some((b) => b.amount > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingBuckets} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#334155' }} width={130} />
                  <Tooltip
                    formatter={(val: any, name: any) => [name === 'amount' ? `OMR ${formatOMR(val)}` : val, name === 'amount' ? 'Outstanding' : 'Employees']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="amount" name="Outstanding" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No outstanding balances currently.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <CalendarClock className="w-4 h-4 text-purple-600" />
            Oldest Unpaid Month
          </h3>
          <p className="text-xs text-slate-500 mb-3">Employees whose earliest outstanding month falls in each period</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {oldestUnpaidDistribution.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No oldest-unpaid rows currently.</p>
            ) : (
              oldestUnpaidDistribution.map((m) => (
                <div key={m.month} className="w-full flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs">
                  <span className="font-semibold text-slate-700">{m.month}</span>
                  <span className="text-slate-500">{m.employees} emp</span>
                  <span className="font-mono font-bold text-purple-700">OMR {formatOMR(m.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row: Company-Wise Liability + Staff vs Worker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <Building2 className="w-4 h-4 text-rose-600" />
            Outstanding by Company
          </h3>
          <p className="text-xs text-slate-500 mb-4">Ranked by outstanding salary liability</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-2">Company</th>
                  <th className="py-2 pr-2 text-right">Employees</th>
                  <th className="py-2 pr-2 text-right">Outstanding</th>
                  <th className="py-2 pr-2 text-right">Planned</th>
                  <th className="py-2 text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companyBreakdown.map((c) => (
                  <tr key={c.company}>
                    <td className="py-2 pr-2 font-semibold text-slate-800">{c.company}</td>
                    <td className="py-2 pr-2 text-right">{c.employees}</td>
                    <td className="py-2 pr-2 text-right font-mono font-bold text-rose-700">OMR {formatOMR(c.outstanding)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-indigo-700">OMR {formatOMR(c.planned)}</td>
                    <td className="py-2 text-right font-mono text-slate-600">OMR {formatOMR(c.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <Users className="w-4 h-4 text-indigo-600" />
            Staff vs Worker Liability
          </h3>
          <p className="text-xs text-slate-500 mb-2">Outstanding salary by employee type</p>
          <div className="flex-1 h-52 w-full flex items-center justify-center">
            {employeeTypeBreakdown.some((c) => c.outstanding > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={employeeTypeBreakdown} dataKey="outstanding" nameKey="type" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={4}>
                    {employeeTypeBreakdown.map((c, idx) => (
                      <Cell key={c.type} fill={idx === 0 ? '#3b82f6' : '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any, name: any) => [`OMR ${formatOMR(val)}`, name]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">No outstanding balances currently.</div>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
            {employeeTypeBreakdown.map((c) => (
              <div key={c.type} className="flex items-center justify-between">
                <span className="text-slate-600">{c.type} ({c.count})</span>
                <span className="font-mono font-semibold text-slate-800">Avg OMR {formatOMR(c.avgOutstanding)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row: Planned vs Outstanding + WPS Analysis + Last Payment Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <Scale className="w-4 h-4 text-slate-600" />
            Planned vs Outstanding
          </h3>
          <p className="text-xs text-slate-500 mb-4">Remaining Pending here is Outstanding minus Planned</p>
          <div className="space-y-3">
            {[
              { label: 'Outstanding', value: totalOutstanding, color: 'bg-rose-500' },
              { label: 'Planned', value: totalPlanned, color: 'bg-indigo-500' },
              { label: 'Remaining Pending', value: remainingPending, color: remainingPending >= 0 ? 'bg-amber-500' : 'bg-emerald-500' },
            ].map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>{r.label}</span>
                  <span className="font-mono font-semibold text-slate-800">OMR {formatOMR(r.value)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full ${r.color}`}
                    style={{ width: `${Math.min(100, (Math.abs(r.value) / barMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <RefreshCw className="w-4 h-4 text-amber-600" />
            WPS Analysis
          </h3>
          <p className="text-xs text-slate-500 mb-4">From the existing WPS recovery data</p>
          {wpsFailed ? (
            <p className="text-xs text-slate-400 italic">WPS data unavailable right now.</p>
          ) : !wpsAnalysis ? (
            <p className="text-xs text-slate-400 italic">Loading WPS data...</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-slate-500 block">Applicable</span>
                  <span className="font-bold text-slate-900">{wpsAnalysis.applicable} employees</span>
                </div>
                <div className="p-2 bg-rose-50 rounded-lg">
                  <span className="text-rose-700 block">Pending</span>
                  <span className="font-bold text-rose-800">OMR {formatOMR(wpsAnalysis.remaining)}</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <span className="text-emerald-700 block">Recovered</span>
                  <span className="font-bold text-emerald-800">OMR {formatOMR(wpsAnalysis.recovered)}</span>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <span className="text-amber-700 block">Exceptions</span>
                  <span className="font-bold text-amber-800">{wpsAnalysis.exceptions} employees</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>WPS Coverage</span>
                  <span className="font-semibold text-amber-700">{wpsAnalysis.coverage.toFixed(1)}%</span>
                </div>
                <ProgressBar percentage={wpsAnalysis.coverage} colorClass="bg-amber-500" />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <Layers className="w-4 h-4 text-blue-600" />
            Last Payment Performance
          </h3>
          <p className="text-xs text-slate-500 mb-4">Most recent payroll cycle</p>
          {!lastPaymentAnalysis ? (
            <p className="text-xs text-slate-400 italic">No payment planning data available.</p>
          ) : (
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg">
                <span className="text-blue-700">Last Payment ({lastPaymentAnalysis.month})</span>
                <span className="font-mono font-bold text-blue-900">OMR {formatOMR(lastPaymentAnalysis.totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg">
                <span className="text-emerald-700">Fully Paid</span>
                <span className="font-bold text-emerald-800">{lastPaymentAnalysis.fullyPaid}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-amber-50 rounded-lg">
                <span className="text-amber-700">Partially Paid</span>
                <span className="font-bold text-amber-800">{lastPaymentAnalysis.partiallyPaid}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-rose-50 rounded-lg">
                <span className="text-rose-700">Unpaid</span>
                <span className="font-bold text-rose-800">{lastPaymentAnalysis.unpaid}</span>
              </div>
              {lastPaymentAnalysis.avgDaysSincePayment !== null && (
                <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <span className="text-slate-500">Avg. Days Since Payment</span>
                  <span className="font-bold text-slate-800">{lastPaymentAnalysis.avgDaysSincePayment.toFixed(0)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row: Top 10 Outstanding Employees + Payment Attention Required */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-1">
            <Trophy className="w-4 h-4 text-amber-600" />
            Top 10 Employees by Outstanding Salary
          </h3>
          <p className="text-xs text-slate-500 mb-4">Click a row to open the Payment Planning Sheet</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-2">Employee</th>
                  <th className="py-2 pr-2">Company</th>
                  <th className="py-2 pr-2">Oldest Month</th>
                  <th className="py-2 pr-2 text-right">Outstanding</th>
                  <th className="py-2 text-right">Planned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topOutstandingEmployees.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">No outstanding balances currently.</td></tr>
                ) : (
                  topOutstandingEmployees.map((e) => (
                    <tr key={e.employeeId} onClick={onNavigateToPlanning} className="hover:bg-amber-50/50 cursor-pointer transition-colors">
                      <td className="py-2 pr-2">
                        <span className="font-mono font-bold text-blue-600 block">{e.employeeId}</span>
                        <span className="text-slate-700">{e.employeeName}</span>
                      </td>
                      <td className="py-2 pr-2 text-slate-600">{e.employeeCompany}</td>
                      <td className="py-2 pr-2 text-slate-600">{e.oldestMonth}</td>
                      <td className="py-2 pr-2 text-right font-mono font-bold text-rose-700">OMR {formatOMR(e.totalOutstanding)}</td>
                      <td className="py-2 text-right font-mono text-indigo-700">OMR {formatOMR(e.oldestPlanned)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <button
            onClick={() => setShowAttention(!showAttention)}
            className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer mb-3 ${
              paymentAttention.length > 0 ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className={`text-xs font-semibold ${paymentAttention.length > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
              Payment Attention Required
            </span>
            <div className={`text-xl font-bold ${paymentAttention.length > 0 ? 'text-rose-800' : 'text-slate-900'}`}>
              {paymentAttention.length}
            </div>
          </button>
          {showAttention && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Attention Required ({paymentAttention.length})
              </h4>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {paymentAttention.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No employees require immediate attention right now.</p>
              ) : (
                paymentAttention.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-rose-50/50 rounded-lg text-[11px]">
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                        item.type === 'Critical' ? 'bg-rose-100 text-rose-700' : item.type === 'Attention' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-slate-600">{item.message}</span>
                  </div>
                ))
              )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row: Pay-By Analysis + Planned Payment by Month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Salary Liability by Pay By</h3>
          <p className="text-xs text-slate-500 mb-4">Outstanding grouped by who pays each employee's salary</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-2">Pay By</th>
                  <th className="py-2 pr-2 text-right">Employees</th>
                  <th className="py-2 pr-2 text-right">Outstanding</th>
                  <th className="py-2 pr-2 text-right">Planned</th>
                  <th className="py-2 text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payByBreakdown.map((c) => (
                  <tr key={c.payBy}>
                    <td className="py-2 pr-2 font-semibold text-slate-800">{c.payBy}</td>
                    <td className="py-2 pr-2 text-right">{c.employees}</td>
                    <td className="py-2 pr-2 text-right font-mono font-bold text-rose-700">OMR {formatOMR(c.outstanding)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-indigo-700">OMR {formatOMR(c.planned)}</td>
                    <td className="py-2 text-right font-mono text-slate-600">OMR {formatOMR(c.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Planned Payment Distribution</h3>
          <p className="text-xs text-slate-500 mb-4">How the current plan is spread across payroll months</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {plannedByMonth.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No planned payments currently.</p>
            ) : (
              plannedByMonth.map((m) => (
                <div key={m.month} className="flex items-center justify-between p-2 bg-indigo-50/50 rounded-lg text-xs">
                  <span className="font-semibold text-slate-700">{m.month}</span>
                  <span className="font-mono font-bold text-indigo-700">OMR {formatOMR(m.amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
