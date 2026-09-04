import React, { useState, useEffect } from 'react';
import {
  Building,
  Briefcase,
  Calendar,
  Save,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { formatDate, apiRequest } from '../../../api/client';
import type {
  Employee,
  EmployeeCompany,
  EmployeeType,
  NationalityType,
} from '../../../types/index';

interface EmploymentPlacementTabProps {
  employee: Employee | null;
  employmentForm: {
    employeeCompany: EmployeeCompany;
    designation: string;
    employeeType: EmployeeType;
    nationalityType: NationalityType;
    dateOfJoining: string;
    dateOfLeaving?: string;
    isActive: boolean;
    promotionReason?: string;
  };
  setEmploymentForm: React.Dispatch<
    React.SetStateAction<{
      employeeCompany: EmployeeCompany;
      designation: string;
      employeeType: EmployeeType;
      nationalityType: NationalityType;
      dateOfJoining: string;
      dateOfLeaving?: string;
      isActive: boolean;
      promotionReason?: string;
    }>
  >;
  canWrite: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  designationHistory?: Array<{
    id: string;
    designation: string;
    effectiveDate: string;
    reason?: string;
    changedBy?: string;
    createdAt: string;
  }>;
  onContinueToCompensation?: () => void;
  isNewEmployee?: boolean;
  basicInfoForm?: {
    employeeId: string;
    employeeName: string;
    nationalityType: NationalityType;
  };
  setBasicInfoForm?: React.Dispatch<
    React.SetStateAction<{
      employeeId: string;
      employeeName: string;
      nationalityType: NationalityType;
    }>
  >;
  onNavigateToPersonal?: () => void;
}

export const EmploymentPlacementTab: React.FC<EmploymentPlacementTabProps> = ({
  employee,
  employmentForm,
  setEmploymentForm,
  canWrite,
  saving,
  onSave,
  designationHistory = [],
  onContinueToCompensation,
  isNewEmployee = false,
  basicInfoForm,
  setBasicInfoForm,
  onNavigateToPersonal,
}) => {
  // Designation is governed master data now. The field stays a text input so an existing
  // record is never invalidated and a new role can still be typed, but the master list is
  // offered as suggestions, which is what stops "Site Engineer" and "site engineer"
  // becoming two roles.
  const [designationOptions, setDesignationOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiRequest<Array<{ title: string }>>('/api/masters/designations')
      .then(list => {
        if (!cancelled) setDesignationOptions((list || []).map(d => d.title));
      })
      .catch(() => {
        // A master-data outage must not block employee editing; the field simply loses
        // its suggestions.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const designationIsNew =
    !!employmentForm.designation.trim() &&
    designationOptions.length > 0 &&
    !designationOptions.some(
      t => t.trim().toLowerCase() === employmentForm.designation.trim().toLowerCase()
    );

  return (
    <div className="space-y-6">
      {/* Draft Profile Banner for New Employee Registration */}
      {isNewEmployee && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold font-mono">
              {basicInfoForm?.employeeId ? basicInfoForm.employeeId.slice(-3) : 'NEW'}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm">
                {basicInfoForm?.employeeName || 'New Employee (Name Pending)'}
              </p>
              <p className="text-slate-500 text-[11px]">
                ID: <strong className="font-mono text-blue-700">{basicInfoForm?.employeeId || 'Not Assigned'}</strong> • Nationality: <strong>{employmentForm.nationalityType}</strong>
              </p>
            </div>
          </div>
          {onNavigateToPersonal && (
            <button
              type="button"
              onClick={onNavigateToPersonal}
              className="text-xs text-blue-700 hover:text-blue-800 font-semibold underline self-start sm:self-auto cursor-pointer"
            >
              Edit Identity Details (Tab 1)
            </button>
          )}
        </div>
      )}

      {/* SECTION 1: Corporate Placement & Role */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Building className="text-blue-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Corporate Placement &amp; Organizational Role
            </h3>
          </div>
          {employee && (
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                employmentForm.isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {employmentForm.isActive ? '● Active in Payroll' : '○ Inactive / Relieved'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Employing Company */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Employing / Sponsoring Company <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={!canWrite}
              value={employmentForm.employeeCompany}
              onChange={(e) =>
                setEmploymentForm({
                  ...employmentForm,
                  employeeCompany: e.target.value as EmployeeCompany,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
            >
              <option value="DGO">DGO (Dar Global Oman LLC)</option>
              <option value="SMI">SMI (Seven Mountain International LLC)</option>
              <option value="NC">NC (Northern Crown Trading &amp; Contracting)</option>
              <option value="Supplier">Supplier / Manpower Outsourcing</option>
              <option value="Azad">Azad / Freelance Work Visa</option>
            </select>
          </div>

          {/* Job Role / Designation */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Internal Job Designation <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!canWrite}
              list="designation-master-list"
              placeholder="e.g. Project Engineer, Mason, Heavy Driver"
              value={employmentForm.designation}
              onChange={(e) =>
                setEmploymentForm({
                  ...employmentForm,
                  designation: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-900"
            />
            <datalist id="designation-master-list">
              {designationOptions.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
            {designationIsNew && (
              <p className="text-[10px] text-amber-700 mt-1">
                Not in the designation master. Saving keeps this title on the employee, but add it
                under Organisation Master Data so reports group it with the rest.
              </p>
            )}
          </div>

          {/* Nationality Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nationality Status <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={!canWrite}
              value={employmentForm.nationalityType}
              onChange={(e) => {
                const val = e.target.value as NationalityType;
                setEmploymentForm({
                  ...employmentForm,
                  nationalityType: val,
                });
                if (setBasicInfoForm) {
                  setBasicInfoForm((prev) => ({ ...prev, nationalityType: val }));
                }
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
            >
              <option value="Omani">Omani (Citizen)</option>
              <option value="Expat">Expat (Foreign Resident)</option>
            </select>
          </div>

          {/* Employee Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Employee Category / Pay Basis <span className="text-rose-500">*</span>
            </label>
            <select
              disabled={!canWrite}
              value={employmentForm.employeeType}
              onChange={(e) =>
                setEmploymentForm({
                  ...employmentForm,
                  employeeType: e.target.value as EmployeeType,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="Staff">Staff (Days-Worked Attendance Basis)</option>
              <option value="Worker">Worker (Hours-Worked Timesheet Basis)</option>
            </select>
          </div>

          {/* Date of Joining */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date of Joining (DOJ) <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              disabled={!canWrite}
              value={employmentForm.dateOfJoining}
              onChange={(e) =>
                setEmploymentForm({
                  ...employmentForm,
                  dateOfJoining: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-900"
            />
          </div>

          {/* Date of Leaving */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date of Leaving / End of Service (DOL)
            </label>
            <input
              type="date"
              disabled={!canWrite}
              value={employmentForm.dateOfLeaving || ''}
              onChange={(e) =>
                setEmploymentForm({
                  ...employmentForm,
                  dateOfLeaving: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Active Status */}
          <div className="flex flex-col justify-end">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none pb-2">
              <input
                type="checkbox"
                disabled={!canWrite}
                checked={employmentForm.isActive}
                onChange={(e) =>
                  setEmploymentForm({
                    ...employmentForm,
                    isActive: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-800">
                Active in Site Allocations, Attendance &amp; Payroll
              </span>
            </label>
          </div>
        </div>

        {/* Designation Change Log Reason (if updating existing) */}
        {employee && employee.designation !== employmentForm.designation && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <label className="block text-xs font-bold text-amber-900 mb-1">
              Designation Change Note / Justification
            </label>
            <input
              type="text"
              placeholder="e.g. Promoted to Senior Project Engineer after site review"
              value={employmentForm.promotionReason || ''}
              onChange={(e) =>
                setEmploymentForm({
                  ...employmentForm,
                  promotionReason: e.target.value,
                })
              }
              className="w-full px-3 py-1.5 text-xs border border-amber-300 rounded-lg bg-white"
            />
          </div>
        )}
      </div>

      {/* SECTION 2: Role & Designation Promotion History */}
      {employee && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <History className="text-slate-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Designation &amp; Role Promotion History
            </h3>
          </div>

          {designationHistory && designationHistory.length > 0 ? (
            <div className="relative border-l-2 border-slate-200 ml-4 space-y-4 py-2">
              {designationHistory.map((item, idx) => (
                <div key={item.id || idx} className="relative pl-5">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-600 border-2 border-white" />
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-800 font-semibold">{item.designation}</strong>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {formatDate(item.effectiveDate || item.createdAt)}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="text-slate-600 text-[11px] mt-0.5">{item.reason}</p>
                    )}
                    {item.changedBy && (
                      <span className="text-[10px] text-slate-400">Logged by: {item.changedBy}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic py-2">
              Initial designation {employee.designation} established on joining (
              {formatDate(employee.dateOfJoining)}). No subsequent transfers or promotions logged.
            </p>
          )}
        </div>
      )}

      {/* Action Footer */}
      {canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {isNewEmployee ? (
              <span>Corporate placement defaults will be registered to the new profile.</span>
            ) : (
              <span>Updates to company or designation are tracked in corporate history logs.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isNewEmployee ? (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <CheckCircle2 size={15} />
                  <span>{saving ? 'Registering...' : 'Save & Register Employee'}</span>
                </button>
                {onContinueToCompensation && (
                  <button
                    type="button"
                    onClick={onContinueToCompensation}
                    disabled={saving}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                  >
                    <span>Continue to Compensation &amp; WPS</span>
                    <ArrowRight size={15} />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Save size={15} />
                <span>{saving ? 'Saving Placement...' : 'Save Employment & Placement'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
