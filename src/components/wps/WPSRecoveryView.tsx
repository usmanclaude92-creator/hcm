import React, { useState, useEffect } from 'react';
import { apiRequest, formatOMR, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ReceiptViewerModal } from '../common/ReceiptViewerModal';
import {
  RefreshCw,
  Download,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Paperclip,
  FileSpreadsheet,
  Calendar,
  X,
  Save,
  Building,
  Info,
  DollarSign,
} from 'lucide-react';
import type { WPSRecoveryRecord, WPSRecoveryTransaction } from '../../types/index';

export const WPSRecoveryView: React.FC = () => {
  const { canWrite } = useAuth();
  const [records, setRecords] = useState<WPSRecoveryRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('');

  // Modals
  const [selectedRecord, setSelectedRecord] = useState<WPSRecoveryRecord | null>(null);
  const [isRecoverModalOpen, setIsRecoverModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [recoveryLogs, setRecoveryLogs] = useState<WPSRecoveryTransaction[]>([]);

  // Receipt Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerData, setViewerData] = useState<{ url: string; name?: string; empName?: string; amount?: number } | null>(null);

  // Form State
  const [recoveryForm, setRecoveryForm] = useState({
    amount: '0.000',
    recoveryDate: new Date().toISOString().split('T')[0],
    recoveredFrom: '',
    recoveryMode: 'Bank Transfer',
    referenceNumber: '',
    receiptAttachment: null as string | null,
    receiptFileName: null as string | null,
    remarks: '',
  });

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (monthFilter) params.append('month', monthFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const data = await apiRequest(`/api/wps?${params.toString()}`);
      setRecords(data.items || []);
      setSummary(data.summary || null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch WPS recovery records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [monthFilter, statusFilter]);

  const filteredRecords = records.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        r.employeeId.toLowerCase().includes(q) ||
        r.employeeName.toLowerCase().includes(q) ||
        (r.recoveredFrom && r.recoveredFrom.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleOpenRecover = (rec: WPSRecoveryRecord) => {
    setSelectedRecord(rec);
    setRecoveryForm({
      amount: formatOMR(rec.remainingBalance),
      recoveryDate: new Date().toISOString().split('T')[0],
      recoveredFrom: rec.recoveredFrom || '',
      recoveryMode: 'Bank Transfer',
      referenceNumber: '',
      receiptAttachment: null,
      receiptFileName: null,
      remarks: `WPS recovery for ${rec.payrollMonth}`,
    });
    setIsRecoverModalOpen(true);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setRecoveryForm((prev) => ({
        ...prev,
        receiptAttachment: evt.target?.result as string,
        receiptFileName: file.name,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    const amt = Number(recoveryForm.amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Recovery amount must be greater than zero.');
      return;
    }

    if (!recoveryForm.recoveredFrom.trim()) {
      alert('Recovered From is required.');
      return;
    }

    try {
      await apiRequest('/api/wps/transactions', {
        method: 'POST',
        body: JSON.stringify({
          wpsRecoveryId: selectedRecord.id,
          recoveryAmount: amt,
          recoveryDate: recoveryForm.recoveryDate,
          recoveredFrom: recoveryForm.recoveredFrom,
          remarks: recoveryForm.remarks,
        }),
      });

      setIsRecoverModalOpen(false);
      fetchRecords();
    } catch (err: any) {
      alert(err.message || 'Failed to record recovery');
    }
  };

  const handleOpenLogs = (rec: WPSRecoveryRecord) => {
    setSelectedRecord(rec);
    setRecoveryLogs(rec.transactions || []);
    setIsLogsModalOpen(true);
  };

  const handleExportWPS = async () => {
    try {
      await downloadAuthenticatedFile(`/api/wps/export?month=${encodeURIComponent(monthFilter)}`, `WPS_Recovery_${monthFilter}.xlsx`);
    } catch (err: any) {
      alert(err.message || 'Failed to export WPS records.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            WPS Recovery Management
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Optional Month Picker */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-hidden"
              placeholder="All Months"
            />
            {monthFilter && (
              <button onClick={() => setMonthFilter('')} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xs">
                Clear
              </button>
            )}
          </div>

          <button
            onClick={handleExportWPS}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            Export WPS Ledger
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total WPS Recoverable Excess</span>
            <strong className="block text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono">
              OMR {formatOMR(summary.totalRecoverable)}
            </strong>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 block">{(summary.outstandingCount||0)+(summary.partiallyRecoveredCount||0)+(summary.fullyRecoveredCount||0)} WPS Excess Instances</span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 shadow-xs">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Total Excess Recovered</span>
            <strong className="block text-xl font-bold text-emerald-800 dark:text-emerald-300 mt-1 font-mono">
              OMR {formatOMR(summary.totalRecovered)}
            </strong>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 block">{summary.fullyRecoveredCount} Fully Recovered</span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/30 shadow-xs">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Pending Recovery Balance</span>
            <strong className="block text-xl font-bold text-amber-800 dark:text-amber-300 mt-1 font-mono">
              OMR {formatOMR(summary.totalRemaining)}
            </strong>
            <span className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 block">{summary.outstandingCount} Pending Recovery</span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee or recover entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">All Recovery Statuses</option>
            <option value="Outstanding">Outstanding</option>
            <option value="Partially Recovered">Partially Recovered</option>
            <option value="Fully Recovered">Fully Recovered</option>
          </select>
        </div>
      </div>

      {/* WPS Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3 text-right">WPS Salary (OMR)</th>
                <th className="px-3 py-3 text-right">Net Owed (OMR)</th>
                <th className="px-4 py-3 text-right font-bold text-amber-900 dark:text-amber-300">Recoverable (OMR)</th>
                <th className="px-3 py-3 text-right">Recovered</th>
                <th className="px-4 py-3 text-right">Remaining Balance</th>
                <th className="px-3 py-3">Recover From</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-slate-400 dark:text-slate-500">
                    No WPS recoverable records found. WPS records are generated upon monthly payroll calculation for WPS employees where WPS Salary &gt; Net Salary Owed.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{r.payrollMonth}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block">{r.employeeId}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{r.employeeName}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      OMR {formatOMR(r.wpsSalary)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      OMR {formatOMR(r.netSalary)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                      OMR {formatOMR(r.totalRecoverable)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700 dark:text-emerald-300 font-semibold">
                      OMR {formatOMR(r.totalRecovered)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={r.remainingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}>
                        OMR {formatOMR(r.remainingBalance)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-300">{r.recoveredFrom || 'DGO'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.status === 'Fully Recovered'
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                          : r.status === 'Partially Recovered'
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                          : 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenLogs(r)}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md transition-colors"
                        >
                          Logs
                        </button>
                        {canWrite && r.remainingBalance > 0 && (
                          <button
                            onClick={() => handleOpenRecover(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-md transition-colors shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Record Recovery
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Recovery Modal */}
      {isRecoverModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Record WPS Recovery: {selectedRecord.employeeId} - {selectedRecord.employeeName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Month: {selectedRecord.payrollMonth} • Excess Recoverable: OMR {formatOMR(selectedRecord.totalRecoverable)} • Balance: OMR {formatOMR(selectedRecord.remainingBalance)}
                </p>
              </div>
              <button
                onClick={() => setIsRecoverModalOpen(false)}
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecovery} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recovery Amount (OMR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={recoveryForm.amount}
                    onChange={(e) => setRecoveryForm({ ...recoveryForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-amber-900 dark:text-amber-300 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recovery Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={recoveryForm.recoveryDate}
                    onChange={(e) => setRecoveryForm({ ...recoveryForm, recoveryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recovered From <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={recoveryForm.recoveredFrom}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, recoveredFrom: e.target.value })}
                  placeholder="e.g. DGO, SMI, NC, Supplier"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Recovery Mode
                  </label>
                  <select
                    value={recoveryForm.recoveryMode}
                    onChange={(e) => setRecoveryForm({ ...recoveryForm, recoveryMode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash Deposit</option>
                    <option value="Salary Offset">Salary Offset</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reference / Cheque No.
                  </label>
                  <input
                    type="text"
                    value={recoveryForm.referenceNumber}
                    onChange={(e) => setRecoveryForm({ ...recoveryForm, referenceNumber: e.target.value })}
                    placeholder="e.g. REC98765"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Receipt File */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Attach Recovery Proof / Slip
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleReceiptFileChange}
                  className="text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200 cursor-pointer"
                />
                {recoveryForm.receiptFileName && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                    Attached: {recoveryForm.receiptFileName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Remarks / Entity Account Info
                </label>
                <textarea
                  rows={2}
                  value={recoveryForm.remarks}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRecoverModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Record Recovery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recovery Logs Modal */}
      {isLogsModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  WPS Recovery Transactions: {selectedRecord.employeeId} - {selectedRecord.employeeName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Month: {selectedRecord.payrollMonth} • Recovered: OMR {formatOMR(selectedRecord.totalRecovered)} of OMR {formatOMR(selectedRecord.totalRecoverable)}
                </p>
              </div>
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {recoveryLogs.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No recoveries recorded for this excess yet.</p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Recovered From</th>
                        <th className="px-3 py-2">Remarks</th>
                        <th className="px-3 py-2 text-right">Amount (OMR)</th>
                        <th className="px-3 py-2 text-center">Proof</th>
                        <th className="px-3 py-2">Recorded By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {recoveryLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2">{formatDate(l.recoveryDate)}</td>
                          <td className="px-3 py-2">{l.recoveredFrom}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.remarks || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 dark:text-amber-300">
                            OMR {formatOMR(l.recoveryAmount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {l.receiptAttachment ? (
                              <button
                                onClick={() => {
                                  setViewerData({
                                    url: l.receiptAttachment!,
                                    name: l.receiptFileName || undefined,
                                    empName: selectedRecord.employeeName,
                                    amount: l.recoveryAmount,
                                  });
                                  setViewerOpen(true);
                                }}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-800 font-semibold inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-3 h-3" /> View
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.createdBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex justify-end">
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Viewer Modal */}
      <ReceiptViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        receiptUrl={viewerData?.url}
        fileName={viewerData?.name}
        employeeName={viewerData?.empName}
        amount={viewerData?.amount}
      />
    </div>
  );
};
