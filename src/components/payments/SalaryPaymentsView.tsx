import React, { useState, useEffect } from 'react';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ReceiptViewerModal } from '../common/ReceiptViewerModal';
import {
  CreditCard,
  Download,
  Upload,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Paperclip,
  Trash2,
  Calendar,
  X,
  Save,
  FileSpreadsheet,
  Building,
  DollarSign,
  Eye,
} from 'lucide-react';
import type { PaymentLedgerRow, SalaryPayment, PaymentMode } from '../../types/index';

export const SalaryPaymentsView: React.FC = () => {
  const { canWrite } = useAuth();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [ledger, setLedger] = useState<PaymentLedgerRow[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PaymentLedgerRow | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedEmployeeHistory, setSelectedEmployeeHistory] = useState<SalaryPayment[]>([]);

  // Receipt Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerData, setViewerData] = useState<{ url: string; name?: string; empName?: string; amount?: number } | null>(null);

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // Payment Form
  const [payForm, setPayForm] = useState({
    amountPaid: '0.000',
    paymentDate: new Date().toISOString().split('T')[0],
    payTo: '',
    paymentMode: 'Bank Transfer' as PaymentMode,
    referenceNumber: '',
    bankName: 'Bank Muscat',
    receiptAttachment: null as string | null,
    receiptFileName: null as string | null,
    remarks: '',
  });

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const grouped = await apiRequest(`/api/payments/grouped?month=${month}`);

      const rows: PaymentLedgerRow[] = [];
      let totalNetSalaryOwed = 0;
      let totalActuallyPaid = 0;
      let totalRemainingBalance = 0;
      let unpaidCount = 0;
      let partiallyPaidCount = 0;
      let fullyPaidCount = 0;

      for (const emp of grouped) {
        const m = emp.months?.[0];
        if (!m) continue;

        const lastPaymentDate = m.transactions.length > 0
          ? m.transactions.reduce((latest: string | null, tx: any) => (!latest || tx.paymentDate > latest ? tx.paymentDate : latest), null)
          : null;

        rows.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          employeeCompany: emp.employeeCompany,
          salaryPaidBy: emp.salaryPaidBy,
          wpsEmployee: emp.wpsEmployee,
          employeeType: m.employeeType,
          designation: m.designation,
          paymentMethod: m.paymentMethod,
          payrollLineId: m.payrollLineId,
          netSalaryOwed: m.netSalary,
          totalPaid: m.totalPaid,
          remainingBalance: m.outstanding,
          paymentStatus: m.status,
          receiptStatus: m.receiptStatus,
          lastPaymentDate,
          transactionsCount: m.transactions.length,
          receipts: m.transactions
            .filter((tx: any) => tx.receiptUrl)
            .map((tx: any) => ({ receiptUrl: tx.receiptUrl, fileName: tx.receiptFileName, amount: tx.payAmount })),
        });

        totalNetSalaryOwed += m.netSalary;
        totalActuallyPaid += m.totalPaid;
        totalRemainingBalance += m.outstanding;
        if (m.status === 'Unpaid') unpaidCount++;
        else if (m.status === 'Partially Paid') partiallyPaidCount++;
        else if (m.status === 'Fully Paid') fullyPaidCount++;
      }

      setLedger(rows);
      setSummary({
        totalNetSalaryOwed,
        totalActuallyPaid,
        totalRemainingBalance,
        totalEmployees: rows.length,
        unpaidCount,
        partiallyPaidCount,
        fullyPaidCount,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payment ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [month]);

  const filteredLedger = ledger.filter((row) => {
    if (statusFilter !== 'ALL' && row.paymentStatus !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        row.employeeId.toLowerCase().includes(q) ||
        row.employeeName.toLowerCase().includes(q) ||
        row.designation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenPay = (row: PaymentLedgerRow) => {
    setSelectedRow(row);
    setPayForm({
      amountPaid: formatOMR(row.remainingBalance > 0 ? row.remainingBalance : row.netSalaryOwed),
      paymentDate: new Date().toISOString().split('T')[0],
      payTo: '',
      paymentMode: row.paymentMethod === 'WPS' ? 'WPS Transfer' : 'Bank Transfer',
      referenceNumber: '',
      bankName: 'Bank Muscat',
      receiptAttachment: null,
      receiptFileName: null,
      remarks: `Salary payment for ${month}`,
    });
    setIsPayModalOpen(true);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setPayForm((prev) => ({
        ...prev,
        receiptAttachment: evt.target?.result as string,
        receiptFileName: file.name,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow) return;

    const amt = Number(payForm.amountPaid);
    if (isNaN(amt) || amt <= 0) {
      alert('Payment amount must be greater than zero.');
      return;
    }
    if (!payForm.payTo.trim()) {
      alert('Pay To is required.');
      return;
    }

    try {
      await apiRequest('/api/payments/transactions', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: selectedRow.employeeId,
          payrollMonth: month,
          payrollLineId: selectedRow.payrollLineId,
          payAmount: amt,
          paymentDate: payForm.paymentDate,
          payTo: payForm.payTo,
          receiptUrl: payForm.receiptAttachment,
          receiptFileName: payForm.receiptFileName,
          remarks: payForm.remarks,
        }),
      });

      setIsPayModalOpen(false);
      fetchPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to disburse payment');
    }
  };

  const handleOpenHistory = async (row: PaymentLedgerRow) => {
    setSelectedRow(row);
    try {
      const data = await apiRequest(`/api/payments/transactions?employeeId=${row.employeeId}&month=${month}`);
      setSelectedEmployeeHistory(data);
      setIsHistoryModalOpen(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReversePayment = async (paymentId: string) => {
    const reason = window.prompt('Reason for reversing this payment transaction (required):');
    if (!reason || !reason.trim()) return;
    try {
      await apiRequest(`/api/payments/transactions/${paymentId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setIsHistoryModalOpen(false);
      fetchPayments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportPayments = () => {
    window.location.href = `/api/payments/export/data?month=${month}`;
  };

  const handleDownloadTemplate = () => {
    window.location.href = `/api/payments/export/template?month=${month}`;
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/payments/import/validate', {
          method: 'POST',
          body: JSON.stringify({ fileData: base64, month }),
        });
        setImportPreview(res);
      } catch (err: any) {
        alert(err.message || 'Failed to parse payment file');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const res = await apiRequest('/api/payments/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          month,
          rows: importPreview.rows,
        }),
      });
      alert(res.message);
      setIsImportModalOpen(false);
      setImportPreview(null);
      fetchPayments();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Salary Payment & Disbursal Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict Separation: Actual Disbursals vs. Net Salary Owed • Partial Payments • Digital Receipt Attachments
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Picker */}
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Payment Template
          </button>

          <button
            onClick={handleExportPayments}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export Disbursals
          </button>

          {canWrite && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk Import Payments
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

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Total Net Salary Owed</span>
            <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
              OMR {formatOMR(summary.totalNetSalaryOwed)}
            </strong>
            <span className="text-[11px] text-slate-400 mt-0.5 block">{summary.totalEmployees} Employees</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
            <span className="text-xs font-semibold text-emerald-700">Total Actually Disbursed</span>
            <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
              OMR {formatOMR(summary.totalActuallyPaid)}
            </strong>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">
              {summary.fullyPaidCount} Paid • {summary.partiallyPaidCount} Partial
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
            <span className="text-xs font-semibold text-rose-700">Remaining Unpaid Balance</span>
            <strong className="block text-xl font-bold text-rose-800 mt-1 font-mono">
              OMR {formatOMR(summary.totalRemainingBalance)}
            </strong>
            <span className="text-[11px] text-rose-600 mt-0.5 block">{summary.unpaidCount} Employees Unpaid</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-center">
            <span className="text-xs font-medium text-slate-500">Disbursal Progress</span>
            <div className="mt-2 w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    summary.totalNetSalaryOwed > 0
                      ? Math.min(100, (summary.totalActuallyPaid / summary.totalNetSalaryOwed) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="text-[11px] font-semibold text-slate-600 mt-1.5 text-right">
              {summary.totalNetSalaryOwed > 0
                ? ((summary.totalActuallyPaid / summary.totalNetSalaryOwed) * 100).toFixed(1)
                : '0.0'}
              % Disbursed
            </span>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee by ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">All Payment Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Fully Paid">Fully Paid</option>
          </select>
        </div>
      </div>

      {/* Main Payment Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Company / Paid By</th>
                <th className="px-4 py-3 text-right">Net Owed (OMR)</th>
                <th className="px-4 py-3 text-right">Actually Disbursed</th>
                <th className="px-4 py-3 text-right">Remaining Balance</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Receipts</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    No payment records found for {month}. Ensure payroll is calculated and finalized.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((row) => (
                  <tr key={row.employeeId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-blue-600 block">{row.employeeId}</span>
                      <span className="font-semibold text-slate-900">{row.employeeName}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        row.employeeType === 'Staff' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {row.employeeType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <span>{row.employeeCompany}</span>
                      <span className="block text-[10px] text-slate-400">by {row.salaryPaidBy}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      OMR {formatOMR(row.netSalaryOwed)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      OMR {formatOMR(row.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={row.remainingBalance > 0 ? 'text-rose-600' : 'text-slate-400'}>
                        OMR {formatOMR(row.remainingBalance)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.paymentStatus === 'Fully Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : row.paymentStatus === 'Partially Paid'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.receipts && row.receipts.length > 0 ? (
                        <div className="flex items-center justify-center gap-1">
                          {row.receipts.map((r, rIdx) => (
                            <button
                              key={rIdx}
                              onClick={() => {
                                setViewerData({
                                  url: r.receiptUrl,
                                  name: r.fileName,
                                  empName: row.employeeName,
                                  amount: r.amount,
                                });
                                setViewerOpen(true);
                              }}
                              title={`View receipt: ${r.fileName || 'Attachment'}`}
                              className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenHistory(row)}
                          title="View Payment Transactions"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {canWrite && row.remainingBalance > 0 && (
                          <button
                            onClick={() => handleOpenPay(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Pay Now
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

      {/* Disburse Salary Modal */}
      {isPayModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Disburse Salary Payment: {selectedRow.employeeId} - {selectedRow.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Month: {month} • Net Owed: OMR {formatOMR(selectedRow.netSalaryOwed)} • Balance: OMR {formatOMR(selectedRow.remainingBalance)}
                </p>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Amount */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount to Disburse (OMR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={payForm.amountPaid}
                    onChange={(e) => setPayForm({ ...payForm, amountPaid: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">Can be full or partial amount</span>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Disbursal Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pay To <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={payForm.payTo}
                  onChange={(e) => setPayForm({ ...payForm, payTo: e.target.value })}
                  placeholder="e.g. Ahmed, Cash, Bank Transfer, Authorized Representative"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Mode */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Mode <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={payForm.paymentMode}
                    onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value as PaymentMode })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="WPS Transfer">WPS Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                {/* Bank */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={payForm.bankName}
                    onChange={(e) => setPayForm({ ...payForm, bankName: e.target.value })}
                    placeholder="e.g. Bank Muscat"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank Reference / Cheque No.
                </label>
                <input
                  type="text"
                  value={payForm.referenceNumber}
                  onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })}
                  placeholder="e.g. TXN987654321 / CHQ0045"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              {/* Receipt File Attachment */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                  Attach Digital Payment Receipt / Transfer Slip (JPG, PNG, PDF)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleReceiptFileChange}
                  className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 cursor-pointer"
                />
                {payForm.receiptFileName && (
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Attached: {payForm.receiptFileName}
                  </p>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Confirm & Disburse
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction History & Reversal Modal */}
      {isHistoryModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Payment Ledger History: {selectedRow.employeeId} - {selectedRow.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Month: {month} • Net Owed: OMR {formatOMR(selectedRow.netSalaryOwed)} • Disbursed: OMR {formatOMR(selectedRow.totalPaid)}
                </p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedEmployeeHistory.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No disbursals recorded for this month yet.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Pay To</th>
                        <th className="px-3 py-2">Remarks</th>
                        <th className="px-3 py-2 text-right">Amount (OMR)</th>
                        <th className="px-3 py-2 text-center">Receipt</th>
                        <th className="px-3 py-2">Disbursed By</th>
                        {canWrite && <th className="px-3 py-2 text-right">Reversal</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {selectedEmployeeHistory.map((p) => (
                        <tr key={p.id} className={p.isReversed ? 'opacity-50' : ''}>
                          <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                          <td className="px-3 py-2">{p.payTo}</td>
                          <td className="px-3 py-2 text-slate-500">
                            {p.remarks || '—'}
                            {p.isReversed && <span className="ml-1.5 text-rose-600 font-semibold">(Reversed)</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                            OMR {formatOMR(p.payAmount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.receiptUrl ? (
                              <button
                                onClick={() => {
                                  setViewerData({
                                    url: p.receiptUrl!,
                                    name: p.receiptFileName || undefined,
                                    empName: selectedRow.employeeName,
                                    amount: p.payAmount,
                                  });
                                  setViewerOpen(true);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-3 h-3" /> View
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{p.createdBy}</td>
                          {canWrite && (
                            <td className="px-3 py-2 text-right">
                              {!p.isReversed && (
                                <button
                                  onClick={() => handleReversePayment(p.id)}
                                  className="text-rose-600 hover:text-rose-800 font-semibold p-1 hover:bg-rose-50 rounded"
                                  title="Void / Reverse Transaction"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Bulk Import Salary Payments</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!importPreview ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-500 transition-colors">
                  <FileSpreadsheet className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Upload Filled Payment Disbursal File for {month}</p>
                  <p className="text-xs text-slate-500 mt-1">Columns: Employee ID, Amount Paid, Payment Date, Payment Mode, Ref No, Bank</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImportFileChange}
                    className="mt-4 text-xs file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <span>Total Rows: <strong>{importPreview.summary.totalRows}</strong></span> •{' '}
                    <span className="text-emerald-700">Valid: <strong>{importPreview.summary.validCount}</strong></span> •{' '}
                    <span className="text-rose-700">Invalid: <strong>{importPreview.summary.invalidCount}</strong></span>
                  </div>

                  <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">EMP ID</th>
                          <th className="px-3 py-2">Amount (OMR)</th>
                          <th className="px-3 py-2">Mode</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : ''}>
                            <td className="px-3 py-2 font-mono text-slate-400">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                            <td className="px-3 py-2 font-mono">OMR {formatOMR(r.amountPaid)}</td>
                            <td className="px-3 py-2">{r.paymentMode}</td>
                            <td className="px-3 py-2 font-bold">{r.status}</td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              {importPreview && (
                <button
                  type="button"
                  disabled={importing || importPreview.summary.validCount === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importing Payments...' : 'Commit Payment Disbursals'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reusable Receipt Viewer */}
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
