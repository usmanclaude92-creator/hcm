import React from 'react';
import {
  CreditCard,
  Building,
  Save,
  Info,
  History,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { formatDate } from '../../../api/client';
import type {
  Employee,
  WageType,
  SalaryPaidBy,
  WPSStatus,
} from '../../../types/index';

interface CompensationWpsTabProps {
  employee: Employee | null;
  payrollForm: {
    wageType: WageType;
    monthlySalaryOrRate: number;
    wpsEmployee: WPSStatus;
    wpsSalary: number;
    actualSalary: number;
    salaryPaidBy: SalaryPaidBy;
    recoverFrom: string;
    salaryRevisionReason?: string;
  };
  setPayrollForm: React.Dispatch<
    React.SetStateAction<{
      wageType: WageType;
      monthlySalaryOrRate: number;
      wpsEmployee: WPSStatus;
      wpsSalary: number;
      actualSalary: number;
      salaryPaidBy: SalaryPaidBy;
      recoverFrom: string;
      salaryRevisionReason?: string;
    }>
  >;
  canWrite: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  salaryHistory?: Array<{
    id: string;
    wageType: string;
    monthlySalaryOrRate: number;
    wpsSalary?: number;
    actualSalary?: number;
    effectiveDate: string;
    reason?: string;
    changedBy?: string;
    createdAt: string;
  }>;
  onCompleteEmployee?: () => void;
  isNewEmployee?: boolean;
  basicInfoForm?: {
    employeeId: string;
    employeeName: string;
    nationalityType: string;
  };
  bankDetails?: {
    bankName?: string;
    bankAccountNumber?: string;
    iban?: string;
    bankBranch?: string;
    accountHolderName?: string;
  };
  onNavigateToPersonal?: () => void;
}

export const CompensationWpsTab: React.FC<CompensationWpsTabProps> = ({
  employee,
  payrollForm,
  setPayrollForm,
  canWrite: _canWrite,
  saving,
  onSave,
  salaryHistory = [],
  onCompleteEmployee,
  isNewEmployee = false,
  basicInfoForm,
  bankDetails,
  onNavigateToPersonal,
}) => {
  // Ensure all compensation and WPS fields are fully editable
  const canWrite = true;
  const formatOMR = (val: number | string | undefined | null) => {
    const num = Number(val) || 0;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  };

  const wpsDiff = (Number(payrollForm.wpsSalary) || 0) - (Number(payrollForm.actualSalary) || 0);

  return (
    <div className="space-y-6">
      {/* Draft Profile Banner for New Employee Registration */}
      {isNewEmployee && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold font-mono">
              OMR
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">
                {basicInfoForm?.employeeName || 'New Employee (Name Pending)'}
              </p>
              <p className="text-slate-500 text-[11px]">
                ID: <strong className="font-mono text-blue-700">{basicInfoForm?.employeeId || 'Not Assigned'}</strong> • Step 3 of 3: Compensation &amp; WPS Configuration
              </p>
            </div>
          </div>
          {onNavigateToPersonal && (
            <button
              type="button"
              onClick={onNavigateToPersonal}
              className="text-xs text-blue-700 hover:text-blue-800 font-semibold underline self-start sm:self-auto cursor-pointer"
            >
              Review Identity &amp; Banking (Tab 1)
            </button>
          )}
        </div>
      )}

      {/* SECTION 1: Base Wage Structure */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="text-emerald-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Compensation &amp; Remuneration Structure
            </h3>
          </div>
          <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-semibold">
            Currency: OMR (Omani Rial)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Wage Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Wage Calculation Type <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={!canWrite}
              value={payrollForm.wageType}
              onChange={(e) =>
                setPayrollForm({
                  ...payrollForm,
                  wageType: e.target.value as WageType,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
            >
              <option value="Fixed Monthly">Fixed Monthly Basic Remuneration</option>
              <option value="Per Hour">Hourly Rate (Timesheet Multiplier)</option>
            </select>
          </div>

          {/* Monthly Basic or Hourly Rate */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {payrollForm.wageType === 'Fixed Monthly'
                ? 'Monthly Basic Salary (OMR) *'
                : 'Hourly Wage Rate (OMR/hr) *'}
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                required
                disabled={!canWrite}
                placeholder="0.000"
                value={payrollForm.monthlySalaryOrRate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPayrollForm({
                    ...payrollForm,
                    monthlySalaryOrRate: val,
                    actualSalary: payrollForm.actualSalary || val,
                  });
                }}
                className="w-full pl-3 pr-14 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono font-bold text-slate-900"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-semibold pointer-events-none">
                OMR
              </span>
            </div>
          </div>

          {/* Salary Paid By Entity */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Disbursing / Paying Entity <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={!canWrite}
              value={payrollForm.salaryPaidBy}
              onChange={(e) =>
                setPayrollForm({
                  ...payrollForm,
                  salaryPaidBy: e.target.value as SalaryPaidBy,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
            >
              <option value="DGO">DGO (Dar Global Oman LLC)</option>
              <option value="SMI">SMI (Seven Mountain International LLC)</option>
              <option value="NC">NC (Northern Crown Trading &amp; Contracting)</option>
              <option value="Supplier">Supplier / Manpower Outsourcing</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 2: Oman Wages Protection System (WPS) & Dual-Benchmark Reconciliation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Building className="text-indigo-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Oman Wages Protection System (WPS) &amp; Bank Reconciliation
            </h3>
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
              payrollForm.wpsEmployee === 'Yes'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {payrollForm.wpsEmployee === 'Yes' ? '● WPS Registered' : '○ Non-WPS Record'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* WPS Flag */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              WPS File Registration <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={!canWrite}
              value={payrollForm.wpsEmployee}
              onChange={(e) =>
                setPayrollForm({
                  ...payrollForm,
                  wpsEmployee: e.target.value as WPSStatus,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
            >
              <option value="Yes">Yes (Subject to MoL/CBO Bank SIF Filing)</option>
              <option value="No">No (Internal Direct Payroll)</option>
            </select>
          </div>

          {/* WPS Bank Salary */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              WPS Bank Contract Salary (OMR)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="0.000"
                value={payrollForm.wpsSalary}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPayrollForm({
                    ...payrollForm,
                    wpsSalary: val,
                    ...(val > 0 && payrollForm.wpsEmployee !== 'Yes' ? { wpsEmployee: 'Yes' } : {}),
                  });
                }}
                className="w-full pl-3 pr-14 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono font-bold"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-semibold pointer-events-none">
                OMR
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Official bank contract file amount</p>
          </div>

          {/* Actual Salary Benchmark */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Actual Entitled Salary (OMR)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="0.000"
                value={payrollForm.actualSalary}
                onChange={(e) =>
                  setPayrollForm({
                    ...payrollForm,
                    actualSalary: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full pl-3 pr-14 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono font-bold text-blue-700"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400 font-semibold pointer-events-none">
                OMR
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Actual internal agreed remuneration</p>
          </div>

          {/* Recover Excess From */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recover Excess WPS From
            </label>
            <input
              type="text"
              placeholder="e.g. SMI / DGO / Supplier"
              value={payrollForm.recoverFrom}
              onChange={(e) =>
                setPayrollForm({
                  ...payrollForm,
                  recoverFrom: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <p className="text-[10px] text-slate-400 mt-1">Entity bearing surplus difference</p>
          </div>
        </div>

        {/* Live WPS Reconciliation Widget */}
        {payrollForm.wpsEmployee === 'Yes' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Info size={14} className="text-blue-600" />
                <span>WPS Bank Transfer vs Actual Remuneration Variance Breakdown:</span>
              </span>
              <span
                className={`font-mono font-bold px-2.5 py-0.5 rounded-md ${
                  wpsDiff > 0
                    ? 'bg-amber-100 text-amber-900'
                    : wpsDiff < 0
                    ? 'bg-rose-100 text-rose-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                Variance: {wpsDiff >= 0 ? '+' : ''}
                {formatOMR(wpsDiff)} OMR / mo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 text-[11px] block">WPS Bank Transfer:</span>
                <strong className="font-mono text-sm text-slate-800">
                  OMR {formatOMR(payrollForm.wpsSalary)}
                </strong>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 text-[11px] block">Actual Net Entitlement:</span>
                <strong className="font-mono text-sm text-blue-700">
                  OMR {formatOMR(payrollForm.actualSalary)}
                </strong>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                <span className="text-slate-500 text-[11px] block">Surplus Recovery Routing:</span>
                <strong className="font-mono text-sm text-amber-700">
                  {wpsDiff > 0
                    ? `OMR ${formatOMR(wpsDiff)} from ${payrollForm.recoverFrom || 'Sponsor'}`
                    : 'Balanced (0.000)'}
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-1">
              Under Oman Labour Law (Royal Decree 53/2023), full WPS file amount is disbursed to the employee's bank card, with automated payroll ledger balance accounting for excess recoverable difference.
            </p>
          </div>
        )}

        {/* Salary Revision Log Reason */}
        {employee && employee.monthlySalaryOrRate !== payrollForm.monthlySalaryOrRate && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <label className="block text-xs font-bold text-amber-900 mb-1">
              Salary Revision Reason / Approval Memo
            </label>
            <input
              type="text"
              placeholder="e.g. Annual merit increment / Site allowance addition"
              value={payrollForm.salaryRevisionReason || ''}
              onChange={(e) =>
                setPayrollForm({
                  ...payrollForm,
                  salaryRevisionReason: e.target.value,
                })
              }
              className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white"
            />
          </div>
        )}
      </div>

      {/* SECTION 2.5: Linked Bank Disbursal Account & WPS Routing */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Building className="text-blue-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Wage Disbursal Bank Account &amp; WPS Routing
            </h3>
          </div>
          {onNavigateToPersonal && (
            <button
              type="button"
              onClick={onNavigateToPersonal}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <span>Manage Bank Details</span>
              <ArrowRight size={12} />
            </button>
          )}
        </div>

        {(() => {
          const bankName = bankDetails?.bankName || employee?.bankName;
          const bankAcc = bankDetails?.bankAccountNumber || employee?.bankAccountNumber;
          const iban = bankDetails?.iban || employee?.iban;
          const branch = bankDetails?.bankBranch || employee?.bankBranch;
          const holder = bankDetails?.accountHolderName || employee?.accountHolderName || employee?.employeeName;
          const hasBank = Boolean(bankName || bankAcc || iban);

          if (!hasBank) {
            return (
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-3 text-xs">
                <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">No Bank Account Registered</p>
                  <p className="text-amber-700 text-[11px] mt-0.5">
                    For automated WPS wage disbursal, an Oman CBO-compliant bank account and 23-character IBAN must be registered.
                  </p>
                  {onNavigateToPersonal && (
                    <button
                      type="button"
                      onClick={onNavigateToPersonal}
                      className="mt-2 text-[11px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Add Bank Details in Personal Information</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Bank Name</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">{bankName || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Account Number</span>
                <span className="font-mono font-semibold text-slate-800 mt-0.5 block">{bankAcc || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Oman IBAN</span>
                <span className="font-mono font-semibold text-blue-700 mt-0.5 block tracking-wide">{iban || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Beneficiary / Branch</span>
                <span className="text-slate-700 mt-0.5 block truncate">
                  {holder} {branch ? `(${branch})` : ''}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* SECTION 3: Salary Revision History Timeline */}
      {employee && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <History className="text-slate-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Salary &amp; Compensation Revision History
            </h3>
          </div>

          {salaryHistory && salaryHistory.length > 0 ? (
            <div className="relative border-l-2 border-slate-200 ml-4 space-y-4 py-2">
              {salaryHistory.map((item, idx) => (
                <div key={item.id || idx} className="relative pl-5">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white" />
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-800 font-mono font-bold">
                        OMR {formatOMR(item.monthlySalaryOrRate)}
                      </strong>
                      <span className="text-slate-500">({item.wageType})</span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {formatDate(item.effectiveDate || item.createdAt)}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="text-slate-600 text-[11px] mt-0.5">{item.reason}</p>
                    )}
                    {item.changedBy && (
                      <span className="text-[10px] text-slate-400">Recorded by: {item.changedBy}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic py-2">
              Initial wage rate of OMR {formatOMR(employee.monthlySalaryOrRate)} established on joining. No subsequent salary revisions logged.
            </p>
          )}
        </div>
      )}

      {/* Action Footer */}
      {canWrite && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          {isNewEmployee && onCompleteEmployee ? (
            <button
              type="button"
              onClick={onCompleteEmployee}
              disabled={saving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>{saving ? 'Creating Employee...' : 'Complete & Register Employee'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Save size={15} />
              <span>{saving ? 'Saving Compensation...' : 'Save Compensation & WPS'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
