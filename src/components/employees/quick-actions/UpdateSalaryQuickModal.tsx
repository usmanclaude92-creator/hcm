import React, { useState, useEffect } from 'react';
import { TrendingUp, X, CheckCircle2, AlertCircle, CreditCard, Loader2, ArrowRight } from 'lucide-react';
import { apiRequest, formatOMR } from '../../../api/client';
import type { Employee, WageType, SalaryPaidBy, WPSStatus } from '../../../types/index';

interface UpdateSalaryQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onSuccess: () => void;
}

const PAID_BY_OPTIONS: SalaryPaidBy[] = ['DGO', 'SMI', 'NC', 'Supplier'];

export const UpdateSalaryQuickModal: React.FC<UpdateSalaryQuickModalProps> = ({
  isOpen,
  onClose,
  employee,
  onSuccess,
}) => {
  const [wageType, setWageType] = useState<WageType>('Fixed Monthly');
  const [monthlySalaryOrRate, setMonthlySalaryOrRate] = useState('0.000');
  const [actualSalary, setActualSalary] = useState('0.000');
  const [wpsEmployee, setWpsEmployee] = useState<WPSStatus>('No');
  const [wpsSalary, setWpsSalary] = useState('0.000');
  const [salaryPaidBy, setSalaryPaidBy] = useState<SalaryPaidBy>('DGO');
  const [recoverFrom, setRecoverFrom] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && employee) {
      setWageType(employee.wageType || 'Fixed Monthly');
      setMonthlySalaryOrRate(Number(employee.monthlySalaryOrRate || 0).toFixed(3));
      setActualSalary(Number(employee.actualSalary || employee.monthlySalaryOrRate || 0).toFixed(3));
      setWpsEmployee(employee.wpsEmployee === 'Yes' ? 'Yes' : 'No');
      setWpsSalary(Number(employee.wpsSalary || 0).toFixed(3));
      setSalaryPaidBy(employee.salaryPaidBy || 'DGO');
      setRecoverFrom(employee.recoverFrom || employee.employeeCompany || 'DGO');
      setReason('');
      setError(null);
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee) return null;

  const numRate = Number(monthlySalaryOrRate) || 0;
  const numActual = Number(actualSalary) || 0;
  const numWps = Number(wpsSalary) || 0;
  const wpsDiff = wpsEmployee === 'Yes' ? numWps - numActual : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numRate < 0) {
      setError('Salary / Wage Rate cannot be negative');
      return;
    }
    if (numActual < 0) {
      setError('Actual salary cannot be negative');
      return;
    }
    if (wpsEmployee === 'Yes' && numWps < 0) {
      setError('WPS registered salary cannot be negative');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await apiRequest(`/api/employees/${employee.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          wageType,
          monthlySalaryOrRate: numRate,
          actualSalary: numActual,
          wpsEmployee,
          wpsSalary: wpsEmployee === 'Yes' ? numWps : 0,
          salaryPaidBy,
          recoverFrom: recoverFrom.trim() || salaryPaidBy,
          salaryRevisionReason: reason.trim() || undefined,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update salary');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <TrendingUp className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Quick Action: Update Salary</h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                Revise wage structure, remuneration rate &amp; WPS compliance parameters
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
        <div className="px-6 py-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold font-mono text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
              {employee.employeeId}
            </span>
            <span className="font-semibold text-slate-800">{employee.employeeName}</span>
            <span className="text-slate-500">({employee.designation} • {employee.employeeCompany})</span>
          </div>
          <div className="text-slate-600">
            Current: <strong className="font-mono text-slate-900">OMR {formatOMR(employee.monthlySalaryOrRate)}</strong>
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
            {/* Wage Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Wage Basis / Calculation Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={wageType}
                onChange={(e) => setWageType(e.target.value as WageType)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-hidden transition-all"
              >
                <option value="Fixed Monthly">Fixed Monthly Salary</option>
                <option value="Per Hour">Per Hour (Hourly Rate)</option>
              </select>
            </div>

            {/* Base Salary or Hourly Rate */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {wageType === 'Per Hour' ? 'Hourly Wage Rate (OMR/hr)' : 'Base Monthly Salary (OMR)'} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  OMR
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  value={monthlySalaryOrRate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMonthlySalaryOrRate(val);
                    if (wageType === 'Fixed Monthly') {
                      setActualSalary(val);
                    }
                  }}
                  className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-hidden transition-all"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Actual Take-Home Base Salary */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Actual Target Net Base (OMR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  OMR
                </span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  value={actualSalary}
                  onChange={(e) => setActualSalary(e.target.value)}
                  className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-hidden transition-all"
                />
              </div>
            </div>

            {/* WPS Enrolled */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                WPS Enrolled (CBO SIF Transfer) <span className="text-rose-500">*</span>
              </label>
              <select
                value={wpsEmployee}
                onChange={(e) => {
                  const val = e.target.value as WPSStatus;
                  setWpsEmployee(val);
                  if (val === 'Yes' && (!wpsSalary || Number(wpsSalary) === 0)) {
                    setWpsSalary(actualSalary || monthlySalaryOrRate);
                  }
                }}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-hidden transition-all"
              >
                <option value="Yes">Yes — Registered on WPS</option>
                <option value="No">No — Non-WPS / Direct Cash</option>
              </select>
            </div>
          </div>

          {wpsEmployee === 'Yes' && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    WPS Bank Registered Salary (OMR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      OMR
                    </span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={wpsSalary}
                      onChange={(e) => setWpsSalary(e.target.value)}
                      className="w-full pl-12 pr-3 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:border-emerald-600 outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Recover WPS Differential From
                  </label>
                  <input
                    type="text"
                    value={recoverFrom}
                    onChange={(e) => setRecoverFrom(e.target.value)}
                    placeholder="e.g. DGO, SMI, NC..."
                    className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-lg focus:border-emerald-600 outline-hidden"
                  />
                </div>
              </div>

              {wpsDiff > 0 && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-center justify-between">
                  <span>WPS Differential (WPS Transfer &gt; Actual Net):</span>
                  <strong className="font-mono text-amber-900">+OMR {formatOMR(wpsDiff)} to recover</strong>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Salary Paid By */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Disbursement Entity / Paid By <span className="text-rose-500">*</span>
              </label>
              <select
                value={salaryPaidBy}
                onChange={(e) => setSalaryPaidBy(e.target.value as SalaryPaidBy)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 outline-hidden transition-all"
              >
                {PAID_BY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c} Corporate Account
                  </option>
                ))}
              </select>
            </div>

            {/* Revision Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Revision
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Annual increment, promotion, role change"
                className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-emerald-600 outline-hidden transition-all"
              />
            </div>
          </div>

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
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Revision...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Update Salary Rate</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
