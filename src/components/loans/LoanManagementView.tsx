import React, { useState, useEffect } from 'react';
import { apiRequest, formatOMR, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ReceiptViewerModal } from '../common/ReceiptViewerModal';
import {
  Landmark,
  Plus,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Paperclip,
  FileSpreadsheet,
  Calendar,
  X,
  Save,
  DollarSign,
  Users,
} from 'lucide-react';
import type { EmployeeLoan, LoanRepayment, Employee } from '../../types/index';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';

export const LoanManagementView: React.FC = () => {
  const { canWrite } = useAuth();
  const [loans, setLoans] = useState<EmployeeLoan[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isNewLoanModalOpen, setIsNewLoanModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<EmployeeLoan | null>(null);
  const [repaymentsList, setRepaymentsList] = useState<LoanRepayment[]>([]);

  // Receipt Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerData, setViewerData] = useState<{ url: string; name?: string; empName?: string; amount?: number } | null>(null);

  // New Loan Form
  const [loanForm, setLoanForm] = useState({
    employeeId: '',
    loanAmount: '0.000',
    loanDate: new Date().toISOString().split('T')[0],
    monthlyDeduction: '0.000',
    purpose: '',
  });

  // Direct Repay Form
  const [repayForm, setRepayForm] = useState({
    amount: '0.000',
    repaymentDate: new Date().toISOString().split('T')[0],
    repaymentMode: 'Cash',
    referenceNumber: '',
    receiptAttachment: null as string | null,
    receiptFileName: null as string | null,
    remarks: '',
  });

  const fetchLoans = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const [loansData, empData] = await Promise.all([
        apiRequest(`/api/loans?${params.toString()}`),
        apiRequest('/api/employees?status=active'),
      ]);

      setLoans(loansData.loans || []);
      setSummary(loansData.summary || null);
      setEmployees(empData || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch loan management data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, [statusFilter]);

  const filteredLoans = loans.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        l.employeeId.toLowerCase().includes(q) ||
        l.employeeName.toLowerCase().includes(q) ||
        (l.remarks && l.remarks.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleOpenNewLoan = () => {
    if (employees.length === 0) {
      alert('No active employees found in Employee Master.');
      return;
    }
    setLoanForm({
      employeeId: employees[0].employeeId,
      loanAmount: '500.000',
      loanDate: new Date().toISOString().split('T')[0],
      monthlyDeduction: '50.000',
      purpose: 'Personal Emergency Advance',
    });
    setIsNewLoanModalOpen(true);
  };

  const handleSaveNewLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(loanForm.loanAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Loan principal amount must be greater than zero.');
      return;
    }

    try {
      await apiRequest('/api/loans', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: loanForm.employeeId,
          loanAmount: amt,
          loanDate: loanForm.loanDate,
          monthlyRecoveryAmount: Number(loanForm.monthlyDeduction) || 0,
          remarks: loanForm.purpose,
        }),
      });

      setIsNewLoanModalOpen(false);
      fetchLoans();
    } catch (err: any) {
      alert(err.message || 'Failed to issue loan');
    }
  };

  const handleOpenDirectRepay = (loan: EmployeeLoan) => {
    setSelectedLoan(loan);
    const balance = loan.remainingBalance ?? loan.outstandingBalance ?? 0;
    const deduction = loan.monthlyDeduction ?? loan.monthlyRecoveryAmount ?? 0;
    setRepayForm({
      amount: formatOMR(deduction > 0 ? Math.min(deduction, balance) : balance),
      repaymentDate: new Date().toISOString().split('T')[0],
      repaymentMode: 'Cash',
      referenceNumber: '',
      receiptAttachment: null,
      receiptFileName: null,
      remarks: 'Direct loan repayment',
    });
    setIsRepayModalOpen(true);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      setRepayForm((prev) => ({
        ...prev,
        receiptAttachment: evt.target?.result as string,
        receiptFileName: file.name,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDirectRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    const amt = Number(repayForm.amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Repayment amount must be greater than zero.');
      return;
    }

    try {
      await apiRequest(`/api/loans/${selectedLoan.id}/repayments`, {
        method: 'POST',
        body: JSON.stringify({
          recoveryAmount: amt,
          recoveryDate: repayForm.repaymentDate,
          repaymentMode: repayForm.repaymentMode,
          referenceNumber: repayForm.referenceNumber,
          receiptAttachment: repayForm.receiptAttachment,
          receiptFileName: repayForm.receiptFileName,
          remarks: repayForm.remarks,
        }),
      });

      setIsRepayModalOpen(false);
      fetchLoans();
    } catch (err: any) {
      alert(err.message || 'Failed to record repayment');
    }
  };

  const handleOpenHistory = (loan: EmployeeLoan) => {
    setSelectedLoan(loan);
    setRepaymentsList(loan.recoveries || []);
    setIsHistoryModalOpen(true);
  };

  const handleExportLoans = async () => {
    try {
      await downloadAuthenticatedFile('/api/loans/export', 'Loans_Export.xlsx');
    } catch (err: any) {
      alert(err.message || 'Failed to export loans.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-5 h-5 text-purple-600" />
            Employee Loan Management
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportLoans}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />
            Export Loans Ledger
          </button>

          {canWrite && (
            <button
              onClick={handleOpenNewLoan}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Issue New Loan
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

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Total Loan Principal Granted</span>
            <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
              OMR {formatOMR(summary.totalLoanAmount)}
            </strong>
            <span className="text-[11px] text-slate-400 mt-0.5 block">{(summary.activeCount || 0) + (summary.completedCount || 0)} Total Loan Agreements</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
            <span className="text-xs font-semibold text-emerald-700">Total Principal Repaid</span>
            <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
              OMR {formatOMR(summary.totalRecovered)}
            </strong>
            <span className="text-[11px] text-emerald-600 mt-0.5 block">{summary.completedCount} Loans Closed</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/30 shadow-xs">
            <span className="text-xs font-semibold text-purple-700">Outstanding Loan Balance</span>
            <strong className="block text-xl font-bold text-purple-800 mt-1 font-mono">
              OMR {formatOMR(summary.totalOutstanding)}
            </strong>
            <span className="text-[11px] text-purple-600 mt-0.5 block">{summary.activeCount} Active Repayment Loans</span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee ID, name, or loan purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">All Loan Statuses</option>
            <option value="Active">Active Loans</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Loan Date</th>
                <th className="px-4 py-3 text-right">Principal (OMR)</th>
                <th className="px-3 py-3 text-right">Repaid (OMR)</th>
                <th className="px-4 py-3 text-right font-bold text-purple-900">Remaining Balance</th>
                <th className="px-3 py-3 text-right">Target / Mo.</th>
                <th className="px-3 py-3">Purpose</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    No loan records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLoans.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-blue-600 block">{l.employeeId}</span>
                      <span className="font-semibold text-slate-900">{l.employeeName}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(l.loanDate)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      OMR {formatOMR(l.loanAmount)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-emerald-700">
                      OMR {formatOMR(l.totalRecovered)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={l.outstandingBalance > 0 ? 'text-purple-700' : 'text-slate-400'}>
                        OMR {formatOMR(l.outstandingBalance)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600">
                      {l.monthlyRecoveryAmount > 0 ? `OMR ${formatOMR(l.monthlyRecoveryAmount)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate" title={l.remarks}>
                      {l.remarks || '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        l.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenHistory(l)}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          Repayments
                        </button>
                        {canWrite && l.outstandingBalance > 0 && (
                          <button
                            onClick={() => handleOpenDirectRepay(l)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-md transition-colors shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Direct Repay
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

      {/* Issue New Loan Modal */}
      {isNewLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Landmark className="w-4 h-4 text-purple-600" />
                Issue Employee Loan Agreement
              </h3>
              <button
                onClick={() => setIsNewLoanModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewLoan} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Employee <span className="text-rose-500">*</span>
                </label>
                <SearchableEmployeeSelect
                  employees={employees}
                  value={loanForm.employeeId}
                  onChange={(empId) => setLoanForm({ ...loanForm, employeeId: empId })}
                  placeholder="Search & Select Employee..."
                  width="w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Loan Principal (OMR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={loanForm.loanAmount}
                    onChange={(e) => setLoanForm({ ...loanForm, loanAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Agreement Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={loanForm.loanDate}
                    onChange={(e) => setLoanForm({ ...loanForm, loanDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Monthly Payroll Deduction Target (OMR)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={loanForm.monthlyDeduction}
                  onChange={(e) => setLoanForm({ ...loanForm, monthlyDeduction: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-[10px] text-slate-400">Auto-suggested in monthly payroll calculation deductions</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Loan Reason / Notes
                </label>
                <textarea
                  rows={2}
                  value={loanForm.purpose}
                  onChange={(e) => setLoanForm({ ...loanForm, purpose: e.target.value })}
                  placeholder="e.g. Advance for medical / housing..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewLoanModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Issue Loan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Repay Modal */}
      {isRepayModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Record Direct Repayment: {selectedLoan.employeeId} - {selectedLoan.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Principal: OMR {formatOMR(selectedLoan.loanAmount)} • Remaining: OMR {formatOMR(selectedLoan.outstandingBalance)}
                </p>
              </div>
              <button
                onClick={() => setIsRepayModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDirectRepay} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Repayment Amount (OMR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={repayForm.amount}
                    onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-purple-900 focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={repayForm.repaymentDate}
                    onChange={(e) => setRepayForm({ ...repayForm, repaymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mode
                  </label>
                  <select
                    value={repayForm.repaymentMode}
                    onChange={(e) => setRepayForm({ ...repayForm, repaymentMode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Cash">Cash Deposit</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference / Receipt No.
                  </label>
                  <input
                    type="text"
                    value={repayForm.referenceNumber}
                    onChange={(e) => setRepayForm({ ...repayForm, referenceNumber: e.target.value })}
                    placeholder="e.g. RCP-00234"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Receipt File */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                  Attach Repayment Proof / Deposit Slip
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleReceiptFileChange}
                  className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                />
                {repayForm.receiptFileName && (
                  <p className="text-[11px] text-purple-700 font-medium">
                    Attached: {repayForm.receiptFileName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks
                </label>
                <textarea
                  rows={2}
                  value={repayForm.remarks}
                  onChange={(e) => setRepayForm({ ...repayForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRepayModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Record Repayment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repayments History Modal */}
      {isHistoryModalOpen && selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Repayment Track Record: {selectedLoan.employeeId} - {selectedLoan.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Principal: OMR {formatOMR(selectedLoan.loanAmount)} • Repaid: OMR {formatOMR(selectedLoan.totalRecovered)} • Balance: OMR {formatOMR(selectedLoan.outstandingBalance)}
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
              {repaymentsList.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No repayments recorded for this loan agreement yet.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Source / Mode</th>
                        <th className="px-3 py-2">Payroll Month</th>
                        <th className="px-3 py-2 text-right">Amount (OMR)</th>
                        <th className="px-3 py-2 text-center">Receipt</th>
                        <th className="px-3 py-2">Recorded By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {repaymentsList.map((r) => (
                        <tr key={r.id} className={r.isReversed ? 'opacity-50' : ''}>
                          <td className="px-3 py-2">{formatDate(r.recoveryDate)}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              r.recoverySource === 'Payroll' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {r.recoverySource === 'Payroll' ? 'Payroll Deduction' : r.recoverySource}
                            </span>
                            {r.isReversed && <span className="ml-1.5 text-rose-600 font-semibold text-[10px]">(Reversed)</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{r.payrollMonth || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-purple-700">
                            OMR {formatOMR(r.recoveryAmount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {r.receiptAttachment ? (
                              <button
                                onClick={() => {
                                  setViewerData({
                                    url: r.receiptAttachment!,
                                    name: r.receiptFileName || undefined,
                                    empName: selectedLoan.employeeName,
                                    amount: r.recoveryAmount,
                                  });
                                  setViewerOpen(true);
                                }}
                                className="text-purple-600 hover:text-purple-800 font-semibold inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-3 h-3" /> View
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{r.createdByName || r.createdBy}</td>
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
                Close
              </button>
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
