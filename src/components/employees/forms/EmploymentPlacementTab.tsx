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
  MapPin,
  Clock,
} from 'lucide-react';
import { formatDate, apiRequest } from '../../../api/client';
import type {
  Employee,
  EmployeeCompany,
  EmployeeType,
  NationalityType,
  Project,
  ShiftMaster,
  EmployeeShiftAssignment,
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
    assignedProjectCode?: string;
    isSiteSupervisor?: boolean;
    isSiteManager?: boolean;
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
      assignedProjectCode?: string;
      isSiteSupervisor?: boolean;
      isSiteManager?: boolean;
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

// Individual employee shift override -- highest priority in shift resolution, ahead of
// the assigned project's (or Head Office's) default shift. Self-contained: it fetches and
// saves directly against /api/master/employee-shift-assignments and /api/master/shifts,
// independent of the Employment & Placement form's own save flow above, since this writes
// to its own table rather than a column on the employee record. Applies regardless of
// project (projectId left null) -- for a per-project default instead, use Master Data >
// Shifts > Project / Head Office Assignment.
const ShiftAssignmentCard: React.FC<{ employee: Employee; canWrite: boolean }> = ({ employee, canWrite }) => {
  const [shiftOptions, setShiftOptions] = useState<ShiftMaster[]>([]);
  const [current, setCurrent] = useState<EmployeeShiftAssignment | null>(null);
  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiRequest<ShiftMaster[]>('/api/master/shifts'),
      apiRequest<EmployeeShiftAssignment[]>(`/api/master/employee-shift-assignments?employeeId=${employee.id}`),
    ])
      .then(([shifts, assignments]) => {
        if (cancelled) return;
        setShiftOptions(Array.isArray(shifts) ? shifts : []);
        // The open-ended (effectiveTo null) active assignment is "this employee's current
        // shift" -- the same one the unique index treats as the single open-ended override.
        const openEnded = (Array.isArray(assignments) ? assignments : [])
          .filter(a => a.isActive && !a.effectiveTo)
          .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || ''))[0];
        if (openEnded) {
          setCurrent(openEnded);
          setShiftId(openEnded.shiftId);
          setEffectiveFrom(openEnded.effectiveFrom);
          setEffectiveTo(openEnded.effectiveTo || '');
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load shift data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  const handleAssign = async () => {
    if (!shiftId) {
      setError('Select a shift to assign.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body = {
        employeeId: employee.id,
        projectId: null,
        shiftId,
        isActive: true,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      };
      const result = current
        ? await apiRequest<EmployeeShiftAssignment>(`/api/master/employee-shift-assignments/${current.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await apiRequest<EmployeeShiftAssignment>('/api/master/employee-shift-assignments', {
            method: 'POST',
            body: JSON.stringify(body),
          });
      setCurrent(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to assign shift.');
    } finally {
      setSaving(false);
    }
  };

  const selectedShift = shiftOptions.find(s => s.id === shiftId);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="text-cyan-600 dark:text-cyan-400" size={18} />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Shift Assignment</h3>
        </div>
        {current && (
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
            Currently Assigned
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Loading shift data…</p>
      ) : (
        <>
          {shiftOptions.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-300 py-2">
              No shifts defined yet. Create one under Master Data &gt; Shifts &gt; Shift Master first.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Shift</label>
                <select
                  disabled={!canWrite}
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-slate-900 font-medium"
                >
                  <option value="">— Not Assigned (uses project/Head Office default) —</option>
                  {shiftOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shiftCode} — {s.shiftName} ({s.startTime?.slice(0, 5)}–{s.endTime?.slice(0, 5)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Effective From</label>
                <input
                  type="date"
                  disabled={!canWrite}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Effective To (optional)</label>
                <input
                  type="date"
                  disabled={!canWrite}
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
          )}

          {selectedShift && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              Standard hours: {selectedShift.standardWorkingHours}h · Break: {selectedShift.breakMinutes}min ·
              Grace In/Out: {selectedShift.graceInMinutes}m/{selectedShift.graceOutMinutes}m
            </p>
          )}

          {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
          {saved && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">Shift assignment saved.</p>}

          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
            This overrides the project/Head Office default shift for this employee during the effective period.
            Changing it does not affect already-recorded attendance.
          </p>

          {canWrite && shiftOptions.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleAssign}
                disabled={saving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : current ? 'Update Shift Assignment' : 'Assign Shift'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

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

  // Assigned Project is a real link to Project Master Data (Project.projectCode) -- a
  // dropdown sourced from there, not free text, so it can never drift from the master list.
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [projectsError, setProjectsError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiRequest<Project[]>('/api/projects')
      .then(list => {
        if (!cancelled) setProjectOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setProjectsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = projectOptions.find(
    p => p.projectCode.trim().toUpperCase() === (employmentForm.assignedProjectCode || '').trim().toUpperCase()
  );
  const isProjectCompanyAllowed =
    !selectedProject?.allowedCompanies ||
    selectedProject.allowedCompanies.length === 0 ||
    selectedProject.allowedCompanies.includes(employmentForm.employeeCompany);

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
        <div className="bg-blue-50/70 border border-blue-200 dark:border-blue-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold font-mono">
              {basicInfoForm?.employeeId ? basicInfoForm.employeeId.slice(-3) : 'NEW'}
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                {basicInfoForm?.employeeName || 'New Employee (Name Pending)'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                ID: <strong className="font-mono text-blue-700 dark:text-blue-300">{basicInfoForm?.employeeId || 'Not Assigned'}</strong> • Nationality: <strong>{employmentForm.nationalityType}</strong>
              </p>
            </div>
          </div>
          {onNavigateToPersonal && (
            <button
              type="button"
              onClick={onNavigateToPersonal}
              className="text-xs text-blue-700 dark:text-blue-300 hover:text-blue-800 font-semibold underline self-start sm:self-auto cursor-pointer"
            >
              Edit Identity Details (Tab 1)
            </button>
          )}
        </div>
      )}

      {/* SECTION 1: Corporate Placement & Role */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Building className="text-blue-600 dark:text-blue-400" size={18} />
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Corporate Placement &amp; Organizational Role
            </h3>
          </div>
          {employee && (
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                employmentForm.isActive
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {employmentForm.isActive ? '● Active in Payroll' : '○ Inactive / Relieved'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Employing Company */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 font-medium"
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
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-slate-100"
            />
            <datalist id="designation-master-list">
              {designationOptions.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
            {designationIsNew && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                Not in the designation master. Saving keeps this title on the employee, but add it
                under Organisation Master Data so reports group it with the rest.
              </p>
            )}
          </div>

          {/* Nationality Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 font-medium"
            >
              <option value="Omani">Omani (Citizen)</option>
              <option value="Expat">Expat (Foreign Resident)</option>
            </select>
          </div>

          {/* Employee Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            >
              <option value="Staff">Staff (Days-Worked Attendance Basis)</option>
              <option value="Worker">Worker (Hours-Worked Timesheet Basis)</option>
            </select>
          </div>

          {/* Assigned Project / Site -- linked to Project Master Data */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Assigned Project / Site
            </label>
            {projectsError ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 py-2">
                Could not load Project Master Data. Assigned Project cannot be changed right now.
              </p>
            ) : (
              <select
                disabled={!canWrite}
                value={employmentForm.assignedProjectCode || ''}
                onChange={(e) =>
                  setEmploymentForm({
                    ...employmentForm,
                    assignedProjectCode: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 font-medium"
              >
                <option value="">— Not Assigned —</option>
                {projectOptions.map((p) => {
                  const allowed =
                    !p.allowedCompanies ||
                    p.allowedCompanies.length === 0 ||
                    p.allowedCompanies.includes(employmentForm.employeeCompany);
                  return (
                    <option key={p.id} value={p.projectCode}>
                      {p.projectCode} — {p.projectName}
                      {p.status !== 'Active' ? ' (Inactive)' : ''}
                      {!allowed ? ' ⚠️ Company Restricted' : ''}
                    </option>
                  );
                })}
              </select>
            )}
            {selectedProject && !isProjectCompanyAllowed && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                <MapPin size={11} className="shrink-0" />
                Company <strong>{employmentForm.employeeCompany}</strong> is restricted on{' '}
                {selectedProject.projectCode} (allowed: {selectedProject.allowedCompanies?.join(', ')}). Saving
                will be rejected until this is resolved.
              </p>
            )}
          </div>

          {/* Date of Joining */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Date of Leaving */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
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
                className="w-4 h-4 rounded text-blue-600 dark:text-blue-400 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Active in Site Allocations, Attendance &amp; Payroll
              </span>
            </label>
          </div>
        </div>

        {/* Site Supervisor / Site Manager -- at most one active holder per project */}
        <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="text-blue-600" size={15} />
            <span className="text-xs font-bold text-slate-800">Site Role on Assigned Project</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={!canWrite}
                checked={!!employmentForm.isSiteSupervisor}
                onChange={(e) =>
                  setEmploymentForm({
                    ...employmentForm,
                    isSiteSupervisor: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-800">Site Supervisor</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={!canWrite}
                checked={!!employmentForm.isSiteManager}
                onChange={(e) =>
                  setEmploymentForm({
                    ...employmentForm,
                    isSiteManager: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-800">Site Manager</span>
            </label>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Only one employee can be Site Supervisor, and separately only one can be Site
            Manager, on the same Assigned Project at a time. Saving will be rejected with the
            current holder&apos;s name if either role is already taken on this project.
          </p>
        </div>

        {/* Designation Change Log Reason (if updating existing) */}
        {employee && employee.designation !== employmentForm.designation && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800/60">
            <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
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
              className="w-full px-3 py-1.5 text-xs border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
        )}
      </div>

      {/* SECTION 1B: Shift Assignment -- individual override for this employee, taking
          priority over their assigned project's (or Head Office's) default shift. Saves
          independently of the Employment & Placement form above since it writes to its
          own table (employee_shift_assignments), not a column on the employee record. */}
      {employee && <ShiftAssignmentCard employee={employee} canWrite={canWrite} />}

      {/* SECTION 2: Role & Designation Promotion History */}
      {employee && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <History className="text-slate-600 dark:text-slate-400" size={18} />
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Designation &amp; Role Promotion History
            </h3>
          </div>

          {designationHistory && designationHistory.length > 0 ? (
            <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-4 space-y-4 py-2">
              {designationHistory.map((item, idx) => (
                <div key={item.id || idx} className="relative pl-5">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-600 border-2 border-white" />
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-800 dark:text-slate-200 font-semibold">{item.designation}</strong>
                      <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                        {formatDate(item.effectiveDate || item.createdAt)}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">{item.reason}</p>
                    )}
                    {item.changedBy && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Logged by: {item.changedBy}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">
              Initial designation {employee.designation} established on joining (
              {formatDate(employee.dateOfJoining)}). No subsequent transfers or promotions logged.
            </p>
          )}
        </div>
      )}

      {/* Action Footer */}
      {canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400">
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
