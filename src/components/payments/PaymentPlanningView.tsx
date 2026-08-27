import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  ClipboardList,
  Search,
  Save,
  FileDown,
  AlertCircle,
  RefreshCw,
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
}

export const PaymentPlanningView: React.FC = () => {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [paidByFilter, setPaidByFilter] = useState('ALL');
  const [wpsFilter, setWpsFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const canEdit = hasPermission('payment_planning.edit');
  const canExport = hasPermission('payment_planning.export');

  const rowKey = (r: { employeeId: string; payrollMonth: string }) => `${r.employeeId}_${r.payrollMonth}`;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/payment-planning');
      setRows(data.rows || []);
      setDirtyKeys(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payment planning data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const availableMonths = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.payrollMonth))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (monthFilter !== 'ALL' && r.payrollMonth !== monthFilter) return false;
      if (companyFilter !== 'ALL' && r.employeeCompany !== companyFilter) return false;
      if (paidByFilter !== 'ALL' && r.salaryPaidBy !== paidByFilter) return false;
      if (wpsFilter !== 'ALL' && r.wpsEmployee !== wpsFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.employeeId.toLowerCase().includes(q) && !r.employeeName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, monthFilter, companyFilter, paidByFilter, wpsFilter, statusFilter, search]);

  // Live, client-side only -- recomputes on every edit and every filter change, no round-trip.
  const totalShouldPay = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (Number(r.shouldPayAmount) || 0), 0),
    [filteredRows]
  );

  const handleShouldPayChange = (key: string, value: string) => {
    const numeric = Number(value);
    setRows(prev => prev.map(r => (rowKey(r) === key ? { ...r, shouldPayAmount: isNaN(numeric) ? 0 : numeric } : r)));
    setDirtyKeys(prev => new Set(prev).add(key));
  };

  const handleRemarksChange = (key: string, value: string) => {
    setRows(prev => prev.map(r => (rowKey(r) === key ? { ...r, remarks: value } : r)));
    setDirtyKeys(prev => new Set(prev).add(key));
  };

  const handleSavePlan = async () => {
    if (dirtyKeys.size === 0) {
      alert('No changes to save.');
      return;
    }

    // Full-replace semantics per month: for any month with a dirty row, resend ALL of that
    // month's rows (from the complete unfiltered set) so other employees' saved plan lines
    // for the same month aren't wiped out.
    const dirtyMonths = new Set(rows.filter(r => dirtyKeys.has(rowKey(r))).map(r => r.payrollMonth));

    const plans = Array.from(dirtyMonths).map(month => {
      const monthRows = rows.filter(r => r.payrollMonth === month);
      return {
        payrollMonth: month,
        payrollId: monthRows[0]?.payrollId,
        lines: monthRows.map(r => ({
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          shouldPayAmount: r.shouldPayAmount,
          remarks: r.remarks,
        })),
      };
    });

    try {
      setSaving(true);
      await apiRequest('/api/payment-planning/save', {
        method: 'POST',
        body: JSON.stringify({ plans }),
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save payment plan');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Payment Planning Sheet', 14, 16);
    doc.setFontSize(9);
    const filterSummary = [
      monthFilter !== 'ALL' ? `Month: ${monthFilter}` : 'Month: All',
      companyFilter !== 'ALL' ? `Company: ${companyFilter}` : null,
      paidByFilter !== 'ALL' ? `Paid By: ${paidByFilter}` : null,
      wpsFilter !== 'ALL' ? `WPS: ${wpsFilter}` : null,
      statusFilter !== 'ALL' ? `Status: ${statusFilter}` : null,
    ].filter(Boolean).join(' • ');
    doc.text(filterSummary, 14, 22);
    doc.text(`Total Should Pay: OMR ${formatOMR(totalShouldPay)}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [['Employee ID', 'Employee Name', 'Month', 'Net Salary', 'Actual Paid (ref.)', 'Should Pay', 'Variance']],
      body: filteredRows.map(r => [
        r.employeeId,
        r.employeeName,
        r.payrollMonth,
        formatOMR(r.netSalary),
        formatOMR(r.totalPaid),
        formatOMR(r.shouldPayAmount),
        formatOMR(r.shouldPayAmount - r.outstanding),
      ]),
      foot: [['', '', '', '', '', 'Total Should Pay', formatOMR(totalShouldPay)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`Payment_Planning_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            Payment Planning Sheet
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Intended disbursal planning only • Saving a plan never creates a payment or changes Total Paid / Outstanding
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {canExport && (
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-600" />
              Export PDF
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleSavePlan}
              disabled={saving || dirtyKeys.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : `Save Payment Plan${dirtyKeys.size > 0 ? ` (${dirtyKeys.size})` : ''}`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Live Total Should Pay */}
      <div className="bg-white p-5 rounded-xl border border-indigo-200 bg-indigo-50/30 shadow-xs">
        <span className="text-xs font-semibold text-indigo-700">Total Should Pay</span>
        <strong className="block text-3xl font-bold text-indigo-900 mt-1 font-mono">
          OMR {formatOMR(totalShouldPay)}
        </strong>
        <span className="text-[11px] text-indigo-500 mt-1 block">
          Across {filteredRows.length} planning line(s) matching current filters — updates instantly, no refresh needed.
        </span>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee by ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500">
            <option value="ALL">All Months</option>
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500">
            <option value="ALL">All Companies</option>
            <option value="DGO">DGO</option>
            <option value="SMI">SMI</option>
            <option value="NC">NC</option>
            <option value="Supplier">Supplier</option>
            <option value="Azad">Azad</option>
          </select>
          <select value={paidByFilter} onChange={(e) => setPaidByFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500">
            <option value="ALL">All Paid By</option>
            <option value="DGO">DGO</option>
            <option value="SMI">SMI</option>
            <option value="NC">NC</option>
            <option value="Supplier">Supplier</option>
          </select>
          <select value={wpsFilter} onChange={(e) => setWpsFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500">
            <option value="ALL">WPS: All</option>
            <option value="Yes">WPS Employees</option>
            <option value="No">Non-WPS</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500">
            <option value="ALL">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Fully Paid">Fully Paid</option>
          </select>
        </div>
      </div>

      {/* Planning Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Month</th>
                <th className="px-4 py-3 text-right">Net Salary</th>
                <th className="px-4 py-3 text-right">Last Paid</th>
                <th className="px-3 py-3">Last Payment Date</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Current Outstanding</th>
                <th className="px-4 py-3 text-right">Should Pay</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-400">Loading planning sheet...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-400">No planning rows match the selected filters.</td></tr>
              ) : (
                (() => {
                  let lastEmp: string | null = null;
                  const groupSizes = new Map<string, number>();
                  filteredRows.forEach(r => groupSizes.set(r.employeeId, (groupSizes.get(r.employeeId) || 0) + 1));

                  return filteredRows.map((r) => {
                    const isFirst = r.employeeId !== lastEmp;
                    lastEmp = r.employeeId;
                    const key = rowKey(r);
                    return (
                      <tr key={key} className={dirtyKeys.has(key) ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'}>
                        {isFirst && (
                          <td className="px-4 py-3 align-top" rowSpan={groupSizes.get(r.employeeId)}>
                            <span className="font-mono font-bold text-blue-600 block">{r.employeeId}</span>
                            <span className="font-semibold text-slate-900">{r.employeeName}</span>
                          </td>
                        )}
                        <td className="px-3 py-3 font-mono text-slate-600">{r.payrollMonth}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">OMR {formatOMR(r.netSalary)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">OMR {formatOMR(r.lastPaidSalary)}</td>
                        <td className="px-3 py-3 text-slate-500">{r.lastPaymentDate ? formatDate(r.lastPaymentDate) : '—'}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === 'Fully Paid' ? 'bg-emerald-100 text-emerald-800' :
                            r.status === 'Partially Paid' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-rose-600">OMR {formatOMR(r.outstanding)}</td>
                        <td className="px-4 py-3 text-right">
                          {canEdit ? (
                            <input
                              type="number"
                              step="0.001"
                              value={r.shouldPayAmount}
                              onChange={(e) => handleShouldPayChange(key, e.target.value)}
                              className="w-28 px-2 py-1 text-right font-mono font-bold text-indigo-800 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="font-mono font-bold text-indigo-800">OMR {formatOMR(r.shouldPayAmount)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <input
                              type="text"
                              value={r.remarks}
                              onChange={(e) => handleRemarksChange(key, e.target.value)}
                              placeholder="Optional notes..."
                              className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="text-slate-500">{r.remarks || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
