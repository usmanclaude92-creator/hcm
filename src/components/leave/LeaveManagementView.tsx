import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarDays,
  Plus,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  Ban,
  X,
  Save,
  Search,
} from 'lucide-react';
import type { Employee, LeaveType, LeaveRequest, LeaveBalance } from '../../types/index';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';

type TabKey = 'requests' | 'balances' | 'types';

interface LeaveSummary {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  cancelled: number;
  approvedPaidDays: number;
  approvedUnpaidDays: number;
}

const STATUS_STYLES: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  Cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
};

const todayISO = () => new Date().toISOString().split('T')[0];

export const LeaveManagementView: React.FC = () => {
  const { canWrite, isManager, user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('requests');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // New-request modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    startDate: todayISO(),
    endDate: todayISO(),
    reason: '',
  });

  const selectedType = useMemo(
    () => leaveTypes.find(t => t.id === form.leaveTypeId) || null,
    [leaveTypes, form.leaveTypeId]
  );

  const previewDays = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(`${form.startDate}T00:00:00Z`).getTime();
    const e = new Date(`${form.endDate}T00:00:00Z`).getTime();
    if (isNaN(s) || isNaN(e) || e < s) return 0;
    return Math.round((e - s) / 86400000) + 1;
  }, [form.startDate, form.endDate]);

  const fetchTypes = async () => {
    const data = await apiRequest<LeaveType[]>('/api/leave/types?includeInactive=true');
    setLeaveTypes(data || []);
  };

  const fetchRequests = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'ALL') params.append('status', statusFilter);
    if (typeFilter !== 'ALL') params.append('leaveTypeId', typeFilter);
    if (year !== 'ALL') params.append('year', year);
    const data = await apiRequest<{ summary: LeaveSummary; requests: LeaveRequest[] }>(
      `/api/leave/requests?${params.toString()}`
    );
    setRequests(data.requests || []);
    setSummary(data.summary || null);
  };

  const fetchBalances = async () => {
    const y = year === 'ALL' ? new Date().getFullYear() : year;
    const data = await apiRequest<{ year: number; balances: LeaveBalance[] }>(
      `/api/leave/balances?year=${y}`
    );
    setBalances(data.balances || []);
  };

  const fetchEmployees = async () => {
    const data = await apiRequest<Employee[]>('/api/employees?status=active');
    setEmployees(data || []);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchTypes(), fetchRequests(), fetchBalances(), fetchEmployees()]);
    } catch (err: any) {
      setError(err.message || 'Failed to load leave data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        setError(null);
        await Promise.all([fetchRequests(), fetchBalances()]);
      } catch (err: any) {
        setError(err.message || 'Failed to refresh leave data.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, year]);

  const refresh = async () => {
    try {
      await Promise.all([fetchRequests(), fetchBalances()]);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh leave data.');
    }
  };

  const act = async (endpoint: string, body?: any, successMessage?: string) => {
    try {
      setError(null);
      setNotice(null);
      await apiRequest(endpoint, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (successMessage) setNotice(successMessage);
      await refresh();
    } catch (err: any) {
      setError(err.message || 'The action could not be completed.');
    }
  };

  const handleReject = async (r: LeaveRequest) => {
    const reason = window.prompt(
      `Reject ${r.leaveTypeName} for ${r.employeeId} (${r.employeeName})?\n\nA reason is mandatory and is written to the audit trail.`,
      ''
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    await act(`/api/leave/requests/${r.id}/reject`, { reason: reason.trim() }, 'Leave request rejected.');
  };

  const handleCancel = async (r: LeaveRequest) => {
    const reason = window.prompt(
      `Cancel ${r.leaveTypeName} for ${r.employeeId} (${r.employeeName})?\n\nOptional reason:`,
      ''
    );
    if (reason === null) return;
    await act(`/api/leave/requests/${r.id}/cancel`, { reason: reason.trim() }, 'Leave request cancelled.');
  };

  const openModal = () => {
    setForm({
      employeeId: '',
      leaveTypeId: leaveTypes.find(t => t.isActive)?.id || '',
      startDate: todayISO(),
      endDate: todayISO(),
      reason: '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (submit: boolean) => {
    if (!form.employeeId || !form.leaveTypeId || !form.startDate || !form.endDate) {
      setError('Employee, leave type, start date and end date are all required.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await apiRequest('/api/leave/requests', {
        method: 'POST',
        body: JSON.stringify({ ...form, submit }),
      });
      setIsModalOpen(false);
      setNotice(submit ? 'Leave request submitted for approval.' : 'Leave request saved as a draft.');
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to record the leave request.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const y = year === 'ALL' ? new Date().getFullYear() : year;
      await downloadAuthenticatedFile(`/api/leave/export?year=${y}`, `Leave_Register_${y}.xlsx`);
    } catch (err: any) {
      setError(err.message || 'Failed to export the leave register.');
    }
  };

  const visibleRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      r =>
        r.employeeId.toLowerCase().includes(q) ||
        r.employeeName.toLowerCase().includes(q) ||
        r.leaveTypeName.toLowerCase().includes(q)
    );
  }, [requests, search]);

  const visibleBalances = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return balances;
    return balances.filter(
      b =>
        b.employeeId.toLowerCase().includes(q) ||
        b.employeeName.toLowerCase().includes(q) ||
        b.leaveTypeName.toLowerCase().includes(q)
    );
  }, [balances, search]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current + 1, current, current - 1, current - 2].map(String);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
        Loading leave data…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-sky-600" />
            Leave Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Approved paid leave is folded into the payroll of the month the days fall in. Unpaid leave is
            recorded but never paid.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600" />
            Export Leave Register
          </button>

          {canWrite && (
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Record Leave
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Leave Requests</span>
            <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">{summary.total}</strong>
            <span className="text-[11px] text-slate-400 mt-0.5 block">{summary.draft} draft</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
            <span className="text-xs font-semibold text-amber-700">Awaiting Approval</span>
            <strong className="block text-xl font-bold text-amber-800 mt-1 font-mono">{summary.submitted}</strong>
            <span className="text-[11px] text-amber-600 mt-0.5 block">Submitted, not yet decided</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
            <span className="text-xs font-semibold text-emerald-700">Approved Paid Days</span>
            <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">{summary.approvedPaidDays}</strong>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">Payable through payroll</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Approved Unpaid Days</span>
            <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">{summary.approvedUnpaidDays}</strong>
            <span className="text-[11px] text-slate-400 mt-0.5 block">{summary.rejected} rejected · {summary.cancelled} cancelled</span>
          </div>
        </div>
      )}

      {/* Tabs + filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 border-b border-slate-200">
          <div className="flex items-center gap-1">
            {([
              ['requests', 'Requests'],
              ['balances', 'Balances'],
              ['types', 'Leave Types'],
            ] as [TabKey, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-current={activeTab === key ? 'page' : undefined}
                className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
                  activeTab === key
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employee or type…"
                aria-label="Search leave records"
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <select
              value={year}
              onChange={e => setYear(e.target.value)}
              aria-label="Filter by year"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
              <option value="ALL">All years</option>
            </select>

            {activeTab === 'requests' && (
              <>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="ALL">All statuses</option>
                  {['Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  aria-label="Filter by leave type"
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="ALL">All leave types</option>
                  {leaveTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {activeTab === 'requests' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Employee</th>
                  <th className="text-left font-semibold px-4 py-2.5">Leave Type</th>
                  <th className="text-left font-semibold px-4 py-2.5">From</th>
                  <th className="text-left font-semibold px-4 py-2.5">To</th>
                  <th className="text-right font-semibold px-4 py-2.5">Days</th>
                  <th className="text-left font-semibold px-4 py-2.5">Paid</th>
                  <th className="text-left font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left font-semibold px-4 py-2.5">Decided By</th>
                  <th className="text-right font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRequests.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      No leave requests match the current filters.
                    </td>
                  </tr>
                )}
                {visibleRequests.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-800">{r.employeeId}</span>
                      <span className="block text-slate-500">{r.employeeName}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{r.leaveTypeName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(r.startDate)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(r.endDate)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">{r.days}</td>
                    <td className="px-4 py-2.5">
                      <span className={r.isPaid ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                        {r.isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_STYLES[r.status] || ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {r.decidedBy ? (
                        <>
                          <span className="block">{r.decidedBy}</span>
                          {r.decisionReason && (
                            <span className="block text-[10px] text-slate-400 italic">{r.decisionReason}</span>
                          )}
                        </>
                      ) : r.submittedBy ? (
                        <span className="text-[10px]">submitted by {r.submittedBy}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {canWrite && r.status === 'Draft' && (
                          <button
                            type="button"
                            onClick={() => act(`/api/leave/requests/${r.id}/submit`, undefined, 'Leave request submitted for approval.')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Send className="w-3 h-3" /> Submit
                          </button>
                        )}
                        {isManager && r.status === 'Submitted' && (
                          <>
                            <button
                              type="button"
                              onClick={() => act(`/api/leave/requests/${r.id}/approve`, undefined, 'Leave approved.')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(r)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          </>
                        )}
                        {canWrite && (r.status === 'Draft' || r.status === 'Submitted' || r.status === 'Approved') && (
                          <button
                            type="button"
                            onClick={() => handleCancel(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            <Ban className="w-3 h-3" /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'balances' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Employee</th>
                  <th className="text-left font-semibold px-4 py-2.5">Company</th>
                  <th className="text-left font-semibold px-4 py-2.5">Leave Type</th>
                  <th className="text-right font-semibold px-4 py-2.5">Entitlement</th>
                  <th className="text-right font-semibold px-4 py-2.5">Taken</th>
                  <th className="text-right font-semibold px-4 py-2.5">Pending</th>
                  <th className="text-right font-semibold px-4 py-2.5">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleBalances.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      No leave balances to show for {year === 'ALL' ? new Date().getFullYear() : year}.
                    </td>
                  </tr>
                )}
                {visibleBalances.map(b => (
                  <tr key={`${b.employeeId}-${b.leaveTypeId}`} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-slate-800">{b.employeeId}</span>
                      <span className="block text-slate-500">{b.employeeName}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{b.employeeCompany}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {b.leaveTypeName}
                      <span className={`ml-1.5 text-[10px] ${b.isPaid ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {b.isPaid ? '(paid)' : '(unpaid)'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {b.entitlementDays > 0 ? b.entitlementDays : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">{b.approvedDays}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-700">{b.pendingDays}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${
                      b.remainingDays === null ? 'text-slate-400'
                        : b.remainingDays < 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}>
                      {b.remainingDays === null ? 'n/a' : b.remainingDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'types' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Code</th>
                  <th className="text-left font-semibold px-4 py-2.5">Leave Type</th>
                  <th className="text-left font-semibold px-4 py-2.5">Payroll Treatment</th>
                  <th className="text-right font-semibold px-4 py-2.5">Annual Entitlement</th>
                  <th className="text-left font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left font-semibold px-4 py-2.5">Basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveTypes.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{t.code}</td>
                    <td className="px-4 py-2.5 text-slate-700">{t.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={t.isPaid ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                        {t.isPaid ? 'Paid — counts as worked days' : 'Unpaid — not payable'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {t.annualEntitlementDays > 0 ? `${t.annualEntitlementDays} days` : 'No fixed entitlement'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        t.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{t.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Leave modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-sky-600" />
                Record Leave
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Employee</label>
                <SearchableEmployeeSelect
                  employees={employees}
                  value={form.employeeId}
                  onChange={id => setForm(f => ({ ...f, employeeId: id }))}
                  width="w-full"
                  required
                />
              </div>

              <div>
                <label htmlFor="leave-type" className="block text-xs font-semibold text-slate-700 mb-1.5">Leave Type</label>
                <select
                  id="leave-type"
                  value={form.leaveTypeId}
                  onChange={e => setForm(f => ({ ...f, leaveTypeId: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select a leave type…</option>
                  {leaveTypes.filter(t => t.isActive).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {t.isPaid ? 'paid' : 'unpaid'}
                      {t.annualEntitlementDays > 0 ? ` (${t.annualEntitlementDays} days/yr)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="leave-start" className="block text-xs font-semibold text-slate-700 mb-1.5">Start Date</label>
                  <input
                    id="leave-start"
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="leave-end" className="block text-xs font-semibold text-slate-700 mb-1.5">End Date</label>
                  <input
                    id="leave-end"
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                <span>
                  {previewDays > 0
                    ? `${previewDays} calendar day${previewDays === 1 ? '' : 's'} inclusive of both ends. `
                    : 'The end date must not be before the start date. '}
                  {selectedType
                    ? selectedType.isPaid
                      ? 'This type is paid, so approved days are added to the payable days of the month they fall in.'
                      : 'This type is unpaid, so the days are recorded but never paid.'
                    : 'The final day count is recalculated on the server.'}
                </span>
              </div>

              <div>
                <label htmlFor="leave-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">Reason (optional)</label>
                <textarea
                  id="leave-reason"
                  rows={2}
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50/60 rounded-b-xl">
              <span className="text-[11px] text-slate-500">
                {isManager
                  ? 'Submitted requests must be approved by a different user than the one who submitted them.'
                  : `Signed in as ${user?.username || 'user'} — a manager approves the request.`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : 'Save & Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
