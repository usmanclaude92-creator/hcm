import React, { useState, useEffect } from 'react';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Calculator,
  Download,
  Play,
  Lock,
  RotateCcw,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  History,
  FileSpreadsheet,
  Calendar,
  Save,
  X,
  Info,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import type { MonthlyPayroll, PayrollLine, PayrollRevision, PaymentMethod } from '../../types/index';

export const PayrollView: React.FC = () => {
  const { canWrite, isManager } = useAuth();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [payroll, setPayroll] = useState<MonthlyPayroll | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Line Editing Modal
  const [editingLine, setEditingLine] = useState<PayrollLine | null>(null);
  const [lineFormData, setLineFormData] = useState({
    basicSalaryOrRate: '0.000',
    houseAllowance: '0.000',
    transportAllowance: '0.000',
    bonus: '0.000',
    otherAllowance: '0.000',
    loanRecovery: '0.000',
    otherDeductions: '0.000',
    paymentMethod: 'Non-WPS' as PaymentMethod,
    wpsSalary: '0.000',
    recoverFrom: '',
  });

  // Revisions & Finalization Modals
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isReviseModalOpen, setIsReviseModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [isRevisionHistoryOpen, setIsRevisionHistoryOpen] = useState(false);
  const [revisionHistory, setRevisionHistory] = useState<PayrollRevision[]>([]);

  const fetchPayroll = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest(`/api/payroll/${month}`);
      if (data.exists) {
        setPayroll(data);
        setLines(data.lines || []);
      } else {
        setPayroll(null);
        setLines([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payroll');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, [month]);

  const handleRunCalculation = async () => {
    try {
      setCalculating(true);
      setError(null);
      const data = await apiRequest('/api/payroll/calculate', {
        method: 'POST',
        body: JSON.stringify({ month }),
      });
      setPayroll(data);
      setLines(data.lines || []);
    } catch (err: any) {
      setError(err.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const handleOpenEditLine = (line: PayrollLine) => {
    setEditingLine(line);
    setLineFormData({
      basicSalaryOrRate: formatOMR(line.basicSalaryOrRate),
      houseAllowance: formatOMR(line.houseAllowance),
      transportAllowance: formatOMR(line.transportAllowance),
      bonus: formatOMR(line.bonus),
      otherAllowance: formatOMR(line.otherAllowance),
      loanRecovery: formatOMR(line.loanRecovery),
      otherDeductions: formatOMR(line.otherDeductions),
      paymentMethod: line.paymentMethod,
      wpsSalary: formatOMR(line.wpsSalary),
      recoverFrom: line.recoverFrom || '',
    });
  };

  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLine) return;
    try {
      const updatedPayroll = await apiRequest(`/api/payroll/${month}/lines/${editingLine.id}`, {
        method: 'PUT',
        body: JSON.stringify(lineFormData),
      });
      setPayroll(updatedPayroll);
      setLines(updatedPayroll.lines || []);
      setEditingLine(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update payroll line');
    }
  };

  const handleFinalize = async () => {
    try {
      const result = await apiRequest(`/api/payroll/${month}/finalize`, {
        method: 'POST',
      });
      setPayroll(result);
      setLines(result.lines || []);
      setIsFinalizeModalOpen(false);
      alert(`Payroll for ${month} has been finalized. Financial snapshot locked and WPS excess registered.`);
    } catch (err: any) {
      alert(err.message || 'Finalization failed');
    }
  };

  const handleRevise = async () => {
    if (!revisionReason.trim()) {
      alert('A revision reason is mandatory.');
      return;
    }
    try {
      const res = await apiRequest(`/api/payroll/${month}/revise`, {
        method: 'POST',
        body: JSON.stringify({ reason: revisionReason }),
      });
      setPayroll(res.payroll);
      setLines(res.payroll.lines || []);
      setIsReviseModalOpen(false);
      setRevisionReason('');
      alert(`Payroll unlocked for Revision #${res.revision.revisionNumber}.`);
    } catch (err: any) {
      alert(err.message || 'Revision initiation failed');
    }
  };

  const handleViewRevisions = async () => {
    try {
      const data = await apiRequest(`/api/payroll/${month}/revisions`);
      setRevisionHistory(data);
      setIsRevisionHistoryOpen(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportPayroll = () => {
    window.location.href = `/api/payroll/${month}/export`;
  };

  // Preview Line Calculation
  const previewGross = editingLine?.employeeType === 'Worker'
    ? Number(lineFormData.basicSalaryOrRate || 0) * (editingLine?.hoursWorked || 0)
    : (Number(lineFormData.basicSalaryOrRate || 0) / 30) * Math.min(editingLine?.daysWorked || 0, 30);
  const previewAdditions = Number(lineFormData.houseAllowance || 0) + Number(lineFormData.transportAllowance || 0) + Number(lineFormData.bonus || 0) + Number(lineFormData.otherAllowance || 0);
  const previewDeductions = Number(lineFormData.loanRecovery || 0) + Number(lineFormData.otherDeductions || 0);
  const previewNet = previewGross + previewAdditions - previewDeductions;
  const previewWpsRecoverable = lineFormData.paymentMethod === 'WPS' && Number(lineFormData.wpsSalary || 0) > 0
    ? Math.max(Number(lineFormData.wpsSalary || 0) - previewNet, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              Monthly Payroll Calculation Engine
            </h2>
            {payroll && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                payroll.status === 'Finalized'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : payroll.status === 'In Revision'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}>
                {payroll.status} {payroll.revisionNumber > 0 ? `(Rev #${payroll.revisionNumber})` : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Workers (Hours × Rate) • Staff (Salary ÷ 30 × Days) • Additions • Loan Recovery • WPS Recoverable
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

          {payroll && lines.length > 0 && (
            <button
              onClick={handleExportPayroll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              Export Sheet
            </button>
          )}

          {payroll?.revisionNumber ? (
            <button
              onClick={handleViewRevisions}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-blue-600" />
              Revisions ({payroll.revisionNumber})
            </button>
          ) : null}

          {canWrite && (
            <>
              {payroll?.status !== 'Finalized' ? (
                <>
                  <button
                    onClick={handleRunCalculation}
                    disabled={calculating}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {calculating ? 'Calculating Engine...' : 'Calculate / Re-Run Payroll'}
                  </button>

                  {lines.length > 0 && isManager && (
                    <button
                      onClick={() => setIsFinalizeModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Finalize Payroll
                    </button>
                  )}
                </>
              ) : (
                isManager && (
                  <button
                    onClick={() => setIsReviseModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Revise Payroll
                  </button>
                )
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Metrics Bar */}
      {payroll && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Employees</span>
            <strong className="block text-lg font-bold text-slate-900 mt-0.5">{payroll.totalEmployees}</strong>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Gross Salary</span>
            <strong className="block text-lg font-bold text-slate-900 mt-0.5">OMR {formatOMR(payroll.totalGrossSalary)}</strong>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Total Additions</span>
            <strong className="block text-lg font-bold text-emerald-600 mt-0.5">+OMR {formatOMR(payroll.totalAdditions)}</strong>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500">Total Deductions</span>
            <strong className="block text-lg font-bold text-rose-600 mt-0.5">-OMR {formatOMR(payroll.totalDeductions)}</strong>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 shadow-xs">
            <span className="text-[11px] font-semibold text-blue-700">Net Salary (Owed)</span>
            <strong className="block text-lg font-bold text-blue-900 mt-0.5">OMR {formatOMR(payroll.totalNetSalary)}</strong>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 shadow-xs">
            <span className="text-[11px] font-semibold text-amber-700">WPS Recoverable</span>
            <strong className="block text-lg font-bold text-amber-900 mt-0.5">OMR {formatOMR(payroll.totalRecoverableSalary)}</strong>
          </div>
        </div>
      )}

      {/* Main Payroll Sheet Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3">Sr#</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Projects</th>
                <th className="px-3 py-3 text-right">Worked</th>
                <th className="px-3 py-3 text-right">Rate Used</th>
                <th className="px-3 py-3 text-right">Gross (OMR)</th>
                <th className="px-3 py-3 text-right">Additions</th>
                <th className="px-3 py-3 text-right">Deductions</th>
                <th className="px-4 py-3 text-right font-bold text-blue-900">Net Salary</th>
                <th className="px-3 py-3 text-center">Method</th>
                <th className="px-3 py-3 text-right">WPS Recov.</th>
                {canWrite && payroll?.status !== 'Finalized' && (
                  <th className="px-3 py-3 text-right">Edit</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-400">
                    <p className="text-sm font-semibold">No payroll calculated yet for {month}.</p>
                    <p className="text-xs mt-1">Ensure attendance is recorded, then click "Calculate / Re-Run Payroll".</p>
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => (
                  <tr key={line.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-blue-600 block">{line.employeeId}</span>
                      <span className="font-semibold text-slate-900">{line.employeeName}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        line.employeeType === 'Staff' ? 'bg-blue-50 text-blue-700' : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        {line.employeeType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500 max-w-[150px] truncate" title={line.projectsSummary}>
                      {line.projectsSummary}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold">
                      {line.employeeType === 'Staff' ? `${line.daysWorked}d` : `${line.hoursWorked}h`}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-slate-600">
                      OMR {formatOMR(line.basicSalaryOrRate)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatOMR(line.grossSalary)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-600">
                      +{formatOMR(line.totalAdditions)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-rose-600">
                      -{formatOMR(line.totalDeductions)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-blue-700 text-sm">
                      {formatOMR(line.netSalary)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        line.paymentMethod === 'WPS' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {line.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-amber-600">
                      {line.recoverableSalary > 0 ? formatOMR(line.recoverableSalary) : '—'}
                    </td>
                    {canWrite && payroll?.status !== 'Finalized' && (
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => handleOpenEditLine(line)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Line Edit Modal (Allowing monthly override, additions, deductions) */}
      {editingLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Edit Monthly Payroll Line: {editingLine.employeeId} - {editingLine.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingLine.employeeType} • Worked: {editingLine.employeeType === 'Staff' ? `${editingLine.daysWorked} Days` : `${editingLine.hoursWorked} Hours`}
                </p>
              </div>
              <button
                onClick={() => setEditingLine(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLine} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-blue-700 font-semibold block">Calculated Net Preview:</span>
                  <strong className="text-base text-blue-950 font-mono">OMR {formatOMR(previewNet)}</strong>
                </div>
                {previewWpsRecoverable > 0 && (
                  <div className="text-right">
                    <span className="text-amber-700 font-semibold block">WPS Excess Recoverable:</span>
                    <strong className="text-base text-amber-900 font-mono">OMR {formatOMR(previewWpsRecoverable)}</strong>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Rate Override */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Monthly Salary / Wage Rate (Override for {month})
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={lineFormData.basicSalaryOrRate}
                    onChange={(e) => setLineFormData({ ...lineFormData, basicSalaryOrRate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">Changing rate for this month does NOT alter Employee Master</span>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={lineFormData.paymentMethod}
                    onChange={(e) => setLineFormData({ ...lineFormData, paymentMethod: e.target.value as PaymentMethod })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WPS">WPS (Wage Protection System)</option>
                    <option value="Non-WPS">Non-WPS (Cash / Cheque / Direct)</option>
                  </select>
                </div>
              </div>

              {/* Additions Breakdown */}
              <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-3">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Salary Additions (OMR)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">House Allowance</label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.houseAllowance}
                      onChange={(e) => setLineFormData({ ...lineFormData, houseAllowance: e.target.value })}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Transport</label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.transportAllowance}
                      onChange={(e) => setLineFormData({ ...lineFormData, transportAllowance: e.target.value })}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Bonus</label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.bonus}
                      onChange={(e) => setLineFormData({ ...lineFormData, bonus: e.target.value })}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Other Allowance</label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.otherAllowance}
                      onChange={(e) => setLineFormData({ ...lineFormData, otherAllowance: e.target.value })}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Deductions Breakdown */}
              <div className="p-3.5 bg-rose-50/50 border border-rose-100 rounded-xl space-y-3">
                <p className="text-xs font-bold text-rose-800 uppercase tracking-wider">Salary Deductions (OMR)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Loan Recovery Amount</label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.loanRecovery}
                      onChange={(e) => setLineFormData({ ...lineFormData, loanRecovery: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Other Deductions</label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.otherDeductions}
                      onChange={(e) => setLineFormData({ ...lineFormData, otherDeductions: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* WPS Details */}
              {lineFormData.paymentMethod === 'WPS' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      WPS Registered Salary (OMR)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={lineFormData.wpsSalary}
                      onChange={(e) => setLineFormData({ ...lineFormData, wpsSalary: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Recover Excess WPS From
                    </label>
                    <input
                      type="text"
                      value={lineFormData.recoverFrom}
                      onChange={(e) => setLineFormData({ ...lineFormData, recoverFrom: e.target.value })}
                      placeholder="e.g. DGO"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingLine(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Apply Line Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {isFinalizeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">Finalize Payroll for {month}?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Finalizing locks the payroll snapshot, registers WPS recoverable balances, and deducts employee loans. Once finalized, salary payments can be disbursed.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Net Salary:</span>
                <strong className="text-slate-900 font-mono">OMR {formatOMR(payroll?.totalNetSalary)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">WPS Recoverable:</span>
                <strong className="text-amber-600 font-mono">OMR {formatOMR(payroll?.totalRecoverableSalary)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Employees Count:</span>
                <strong className="text-slate-900">{payroll?.totalEmployees}</strong>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsFinalizeModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm"
              >
                Confirm & Lock Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Modal */}
      {isReviseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">Initiate Payroll Revision</h3>
              <p className="text-xs text-slate-500 mt-1">
                Unlocking this payroll will create Revision #{(payroll?.revisionNumber || 0) + 1} and preserve the current snapshot in audit history.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Reason for Revision <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="e.g. Corrected overtime hours for Worker EMP004 as per site engineer revised sheet..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsReviseModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevise}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-sm"
              >
                Unlock for Revision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {isRevisionHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Revision Track Record for {month}</h3>
              </div>
              <button
                onClick={() => setIsRevisionHistoryOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {revisionHistory.map((rev) => (
                <div key={rev.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                      Revision #{rev.revisionNumber}
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(rev.revisionDate)} • By {rev.revisedBy}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">
                    Reason: <span className="text-slate-900 font-normal">{rev.reason}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/80">
                    <div>
                      <span className="text-slate-500">Previous Net:</span>{' '}
                      <strong className="text-slate-700 font-mono">OMR {formatOMR(rev.previousNet)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Revised Net:</span>{' '}
                      <strong className="text-blue-700 font-mono">OMR {formatOMR(rev.newNet)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsRevisionHistoryOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
