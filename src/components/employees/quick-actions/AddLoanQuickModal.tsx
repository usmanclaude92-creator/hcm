import React, { useState, useEffect } from 'react';
import { Landmark, X, CheckCircle2, AlertCircle, Calendar, DollarSign, Loader2 } from 'lucide-react';
import { apiRequest, formatOMR } from '../../../api/client';
import type { Employee } from '../../../types/index';

interface AddLoanQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onSuccess: () => void;
}

const COMMON_PURPOSES = [
  'Personal Emergency Advance',
  'Medical Expense Support',
  'Family Support / Remittance',
  'Vehicle Repair & Maintenance',
  'Housing & Rent Advance',
  'Education / Tuition Fee',
  'Tool & Equipment Purchase',
];

export const AddLoanQuickModal: React.FC<AddLoanQuickModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSuccess,
}) => {
  const [loanAmount, setLoanAmount] = useState('200.000');
  const [loanDate, setLoanDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [monthlyDeduction, setMonthlyDeduction] = useState('50.000');
  const [purpose, setPurpose] = useState(COMMON_PURPOSES[0]);
  const [customPurpose, setCustomPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && employee) {
      // Default to half month's salary or 200 OMR, recovery 25% of salary or 50 OMR
      const baseSalary = Number(employee.monthlySalaryOrRate) || Number(employee.actualSalary) || 400;
      const defaultLoan = Math.max(50, Math.round(baseSalary * 0.5));
      const defaultRecovery = Math.max(25, Math.round(defaultLoan / 4));
      
      setLoanAmount(defaultLoan.toFixed(3));
      setLoanDate(new Date().toISOString().split('T')[0]);
      setMonthlyDeduction(defaultRecovery.toFixed(3));
      setPurpose(COMMON_PURPOSES[0]);
      setCustomPurpose('');
      setError(null);
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  const numAmount = Number(loanAmount) || 0;
  const numDeduction = Number(monthlyDeduction) || 0;
  const estimatedMonths = numDeduction > 0 ? Math.ceil(numAmount / numDeduction) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('Loan amount must be greater than OMR 0.000');
      return;
    }
    if (numDeduction <= 0) {
      setError('Monthly recovery amount must be greater than OMR 0.000');
      return;
    }
    if (numDeduction > numAmount) {
      setError('Monthly recovery cannot exceed total loan amount');
      return;
    }

    const finalPurpose = purpose === 'Other' ? (customPurpose.trim() || 'Salary Advance') : purpose;

    try {
      setSaving(true);
      setError(null);
      await apiRequest('/api/loans', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: employee.employeeId,
          loanAmount: numAmount,
          loanDate,
          monthlyRecoveryAmount: numDeduction,
          remarks: finalPurpose,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to issue loan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <Landmark className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Quick Action: Issue Loan</h3>
              <p className="text-xs text-purple-200 mt-0.5">
                New loan disbursement &amp; payroll recovery schedule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Employee banner */}
        <div className="px-6 py-3 bg-purple-50/70 border-b border-purple-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold font-mono text-purple-900 bg-purple-100 px-2 py-0.5 rounded">
              {employee.employeeId}
            </span>
            <span className="font-semibold text-slate-800">{employee.employeeName}</span>
            <span className="text-slate-500">({employee.designation} • {employee.employeeCompany})</span>
          </div>
          <div className="text-slate-600 font-mono">
            Rate: <strong className="text-slate-900">OMR {formatOMR(employee.monthlySalaryOrRate)}</strong>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Loan Amount */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Loan Amount (OMR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  OMR
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 outline-hidden transition-all"
                  placeholder="0.000"
                />
              </div>
            </div>

            {/* Disbursement Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Disbursement Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={loanDate}
                onChange={(e) => setLoanDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 outline-hidden transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Monthly Recovery */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Monthly Recovery (OMR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  OMR
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={monthlyDeduction}
                  onChange={(e) => setMonthlyDeduction(e.target.value)}
                  className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 outline-hidden transition-all"
                  placeholder="0.000"
                />
              </div>
            </div>

            {/* Recovery Schedule projection */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Projected Recovery Duration
              </span>
              <div className="text-xs font-bold text-purple-900 mt-0.5">
                {estimatedMonths > 0 ? (
                  <span>
                    ~{estimatedMonths} month{estimatedMonths > 1 ? 's' : ''} of payroll deductions
                  </span>
                ) : (
                  <span className="text-slate-400">Enter recovery amount</span>
                )}
              </div>
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Loan Purpose / Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 outline-hidden transition-all"
            >
              {COMMON_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="Other">Other (Specify below)</option>
            </select>
          </div>

          {purpose === 'Other' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Custom Purpose Remarks
              </label>
              <input
                type="text"
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                placeholder="Enter loan purpose description..."
                className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-purple-600 outline-hidden transition-all"
              />
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Issuing Loan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm &amp; Issue Loan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
