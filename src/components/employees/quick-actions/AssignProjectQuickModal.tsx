import React, { useState, useEffect } from 'react';
import { Briefcase, X, CheckCircle2, AlertCircle, Building, Loader2, Calendar, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../../../api/client';
import type { Employee, Project, AttendanceRecord } from '../../../types/index';

interface AssignProjectQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  currentProject?: string;
  onSuccess: () => void;
}

export const AssignProjectQuickModal: React.FC<AssignProjectQuickModalProps> = ({
  isOpen,
  onClose,
  employee,
  currentProject,
  onSuccess,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [daysWorked, setDaysWorked] = useState('25');
  const [hoursWorked, setHoursWorked] = useState('200');
  const [activityNote, setActivityNote] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && employee) {
      setMonth(new Date().toISOString().slice(0, 7));
      setDaysWorked(employee.wageType === 'Fixed Monthly' ? '25' : '0');
      setHoursWorked(employee.wageType === 'Per Hour' ? '200' : '0');
      setActivityNote(`Assigned ${employee.designation} to project site.`);
      setError(null);

      // Fetch projects
      setLoadingProjects(true);
      apiRequest('/api/projects?status=Active')
        .then((data) => {
          const projs = Array.isArray(data) ? data : [];
          setProjects(projs);
          if (projs.length > 0) {
            // Find current project or select first permitted project
            const match = projs.find(
              (p) =>
                currentProject?.includes(p.projectCode) ||
                (p.allowedCompanies && p.allowedCompanies.includes(employee.employeeCompany))
            );
            setSelectedProjectId(match ? match.id : projs[0].id);
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to load projects');
        })
        .finally(() => {
          setLoadingProjects(false);
        });
    }
  }, [isOpen, employee, currentProject]);

  if (!isOpen || !employee) return null;

  const selectedProj = projects.find((p) => p.id === selectedProjectId);
  const isCompanyAllowed =
    !selectedProj?.allowedCompanies ||
    selectedProj.allowedCompanies.length === 0 ||
    selectedProj.allowedCompanies.includes(employee.employeeCompany);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      setError('Please select a target project.');
      return;
    }
    if (!isCompanyAllowed) {
      setError(
        `Employee company '${employee.employeeCompany}' is not allowed on project ${selectedProj?.projectCode} (allowed: ${selectedProj?.allowedCompanies?.join(
          ', '
        )})`
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 1. Fetch current month's attendance records to preserve other employees' entries
      const attRes = await apiRequest(`/api/attendance?month=${month}`);
      const rawRecords: AttendanceRecord[] = attRes.rawRecords || [];
      const allProjs: Project[] = attRes.allProjects || projects;
      const targetProj = allProjs.find((p) => p.id === selectedProjectId) || selectedProj;

      // Filter out this employee's existing records for this month to re-assign cleanly
      const otherRecords = rawRecords.filter(
        (r) => r.employeeId.trim().toUpperCase() !== employee.employeeId.trim().toUpperCase()
      );

      const newRecord: AttendanceRecord = {
        id: crypto.randomUUID(),
        employeeId: employee.employeeId,
        month,
        payrollMonth: month,
        projectId: selectedProjectId,
        projectCode: targetProj?.projectCode || 'PRJ',
        projectName: targetProj?.projectName || 'Project',
        daysWorked: employee.wageType === 'Per Hour' ? 0 : Number(daysWorked) || 25,
        hoursWorked: employee.wageType === 'Per Hour' ? Number(hoursWorked) || 200 : 0,
        overtimeHours: 0,
        bonus: 0,
        deduction: 0,
        company: employee.employeeCompany,
        payrollType: 'Monthly',
        payBy: employee.salaryPaidBy,
      };

      const updatedRecords = [...otherRecords, newRecord];

      // Save updated attendance for month
      await apiRequest('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          month,
          records: updatedRecords,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign employee to project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-cyan-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <Briefcase className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Quick Action: Assign Project</h3>
              <p className="text-xs text-blue-200 mt-0.5">
                Deploy employee to active project site &amp; update workforce attendance
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
        <div className="px-6 py-3 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold font-mono text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
              {employee.employeeId}
            </span>
            <span className="font-semibold text-slate-800">{employee.employeeName}</span>
            <span className="text-slate-500">({employee.employeeCompany})</span>
          </div>
          <div className="text-slate-600">
            Current: <strong className="text-slate-900">{currentProject || '—'}</strong>
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

          {/* Project select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Target Project Site <span className="text-rose-500">*</span>
            </label>
            {loadingProjects ? (
              <div className="py-2 text-xs text-slate-400">Loading active projects...</div>
            ) : (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-hidden transition-all"
              >
                {projects.map((p) => {
                  const allowed =
                    !p.allowedCompanies ||
                    p.allowedCompanies.length === 0 ||
                    p.allowedCompanies.includes(employee.employeeCompany);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.projectName} {!allowed ? '⚠️ (Company Restricted)' : ''}
                    </option>
                  );
                })}
              </select>
            )}

            {selectedProj && !isCompanyAllowed && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                <span>
                  Company <strong>{employee.employeeCompany}</strong> is restricted on this project (Permitted: {selectedProj.allowedCompanies?.join(', ')}).
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Payroll Month */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Effective Payroll Month <span className="text-rose-500">*</span>
              </label>
              <input
                type="month"
                required
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-200 outline-hidden transition-all"
              />
            </div>

            {/* Allocation Units */}
            {employee.wageType === 'Per Hour' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly Allocated Hours <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="400"
                  required
                  value={hoursWorked}
                  onChange={(e) => setHoursWorked(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-blue-600 outline-hidden"
                  placeholder="200"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monthly Allocated Days <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={daysWorked}
                  onChange={(e) => setDaysWorked(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-blue-600 outline-hidden"
                  placeholder="25"
                />
              </div>
            )}
          </div>

          {/* Activity / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Assignment Activity / Task Notes
            </label>
            <input
              type="text"
              value={activityNote}
              onChange={(e) => setActivityNote(e.target.value)}
              placeholder="e.g. Site Supervision, Structural Civil Work..."
              className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-blue-600 outline-hidden transition-all"
            />
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
              disabled={saving || !isCompanyAllowed}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Project Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
