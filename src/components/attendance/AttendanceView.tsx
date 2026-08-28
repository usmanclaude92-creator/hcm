import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarCheck,
  Download,
  Upload,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Briefcase,
  Users,
  Clock,
  Calendar,
  Send,
  ThumbsUp,
  Lock,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import type { Project, AttendanceStatus } from '../../types/index';

interface AttendanceGroup {
  employeeId: string;
  employeeName: string;
  employeeType: 'Worker' | 'Staff';
  designation: string;
  employeeCompany: string;
  salaryPaidBy: string;
  monthlySalaryOrRate: number;
  wageType: string;
  totalDays: number;
  totalHours: number;
  totalOvertimeHours: number;
  totalBonus: number;
  totalDeduction: number;
  records: {
    id?: string;
    projectId: string;
    projectCode: string;
    projectName: string;
    daysWorked: number;
    hoursWorked: number;
    overtimeHours: number;
    bonus: number;
    deduction: number;
  }[];
}

const STATUS_FLOW: AttendanceStatus[] = ['Draft', 'Submitted', 'Approved', 'Finalized'];
const STATUS_BADGE_CLASS: Record<AttendanceStatus, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-300',
  Submitted: 'bg-amber-100 text-amber-800 border-amber-300',
  Approved: 'bg-blue-100 text-blue-800 border-blue-300',
  Finalized: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

export const AttendanceView: React.FC = () => {
  const { canWrite, hasPermission } = useAuth();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [grouped, setGrouped] = useState<AttendanceGroup[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [monthStatus, setMonthStatus] = useState<{ status: AttendanceStatus } | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [showExceptions, setShowExceptions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
  const [revertReason, setRevertReason] = useState('');

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const isFinalized = monthStatus?.status === 'Finalized';
  const isReadOnly = isFinalized || !canWrite;

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, dash] = await Promise.all([
        apiRequest(`/api/attendance?month=${month}`),
        apiRequest(`/api/attendance/${month}/dashboard`),
      ]);
      setGrouped(data.grouped || []);
      setAllProjects(data.allProjects || []);
      setMonthStatus(data.monthStatus || null);
      setDashboard(dash);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleWorkflowAction = async (action: 'submit' | 'approve' | 'finalize') => {
    try {
      setWorkflowBusy(true);
      setError(null);
      await apiRequest(`/api/attendance/${month}/${action}`, { method: 'POST' });
      setSuccessMsg(`Attendance for ${month} moved to the next workflow stage.`);
      fetchAttendance();
    } catch (err: any) {
      setError(err.message || `Failed to ${action} attendance`);
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleConfirmRevert = async () => {
    if (!revertReason.trim()) return;
    try {
      setWorkflowBusy(true);
      setError(null);
      await apiRequest(`/api/attendance/${month}/revert`, {
        method: 'POST',
        body: JSON.stringify({ reason: revertReason.trim() }),
      });
      setIsRevertModalOpen(false);
      setRevertReason('');
      setSuccessMsg(`Attendance for ${month} reverted to Approved.`);
      fetchAttendance();
    } catch (err: any) {
      setError(err.message || 'Failed to revert attendance');
    } finally {
      setWorkflowBusy(false);
    }
  };

  const handleAddProjectRow = (empIndex: number) => {
    if (allProjects.length === 0) {
      alert('No projects available. Please create active projects in Project Master first.');
      return;
    }
    const updated = [...grouped];
    const defaultProj = allProjects[0];
    updated[empIndex].records.push({
      projectId: defaultProj.id,
      projectCode: defaultProj.projectCode,
      projectName: defaultProj.projectName,
      daysWorked: 0,
      hoursWorked: 0,
      overtimeHours: 0,
      bonus: 0,
      deduction: 0,
    });
    setGrouped(updated);
  };

  const handleRemoveProjectRow = (empIndex: number, recIndex: number) => {
    const updated = [...grouped];
    updated[empIndex].records.splice(recIndex, 1);
    setGrouped(updated);
  };

  const handleRecordChange = (
    empIndex: number,
    recIndex: number,
    field: 'projectId' | 'daysWorked' | 'hoursWorked' | 'overtimeHours' | 'bonus' | 'deduction',
    value: any
  ) => {
    const updated = [...grouped];
    const rec = updated[empIndex].records[recIndex];

    if (field === 'projectId') {
      const proj = allProjects.find(p => p.id === value);
      if (proj) {
        rec.projectId = proj.id;
        rec.projectCode = proj.projectCode;
        rec.projectName = proj.projectName;
      }
    } else {
      rec[field] = Math.max(0, Number(value) || 0);
    }

    setGrouped(updated);
  };

  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      // Flatten records with validation
      const flatRecords: any[] = [];
      for (const g of grouped) {
        const totalDays = g.records.reduce((s, r) => s + (Number(r.daysWorked) || 0), 0);
        if (g.employeeType === 'Staff' && totalDays > 30) {
          throw new Error(`Total days worked for Staff ${g.employeeId} (${g.employeeName}) cannot exceed 30 days. Currently entered: ${totalDays} days.`);
        }

        for (const r of g.records) {
          flatRecords.push({
            employeeId: g.employeeId,
            projectId: r.projectId,
            daysWorked: r.daysWorked,
            hoursWorked: r.hoursWorked,
            overtimeHours: r.overtimeHours,
            bonus: r.bonus,
            deduction: r.deduction,
          });
        }
      }

      await apiRequest('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          month,
          records: flatRecords,
        }),
      });

      setSuccessMsg(`Attendance records for ${month} saved successfully.`);
      fetchAttendance();
    } catch (err: any) {
      setError(err.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleExportTemplate = () => {
    window.location.href = `/api/attendance/export/template?month=${month}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/attendance/import/validate', {
          method: 'POST',
          body: JSON.stringify({ fileData: base64, month }),
        });
        setImportPreview(res);
      } catch (err: any) {
        alert(err.message || 'Failed to parse attendance file');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadErrorReport = () => {
    if (!importPreview?.rows) return;
    const invalidRows = importPreview.rows.filter((r: any) => r.status === 'Invalid');
    if (invalidRows.length === 0) {
      alert('No invalid rows to report -- every row validated successfully.');
      return;
    }
    const data = invalidRows.map((r: any) => ({
      'Row #': r.rowNumber,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Project Code': r.projectCode,
      'Reason': r.reason,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
    XLSX.writeFile(wb, `Attendance_Import_Errors_${month}.xlsx`);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const res = await apiRequest('/api/attendance/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          month,
          rows: importPreview.rows,
        }),
      });
      alert(res.message);
      setIsImportModalOpen(false);
      setImportPreview(null);
      fetchAttendance();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            Monthly Attendance Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Staff: Days Worked (max 30) • Workers: Hours Worked • Multi-Project Allocation
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
            onClick={handleExportTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Attendance Template
          </button>

          {canWrite && !isFinalized && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Attendance
              </button>

              <button
                onClick={handleSaveAttendance}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Workflow Status Bar */}
      {monthStatus && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Attendance Status:</span>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_BADGE_CLASS[monthStatus.status]}`}>
              {monthStatus.status}
            </span>
            <div className="hidden sm:flex items-center gap-1 ml-2">
              {STATUS_FLOW.map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <span className="text-slate-300">→</span>}
                  <span className={`text-[10px] ${s === monthStatus.status ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{s}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {monthStatus.status === 'Draft' && hasPermission('attendance.submit') && (
              <button
                onClick={() => handleWorkflowAction('submit')}
                disabled={workflowBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> Submit for Approval
              </button>
            )}
            {monthStatus.status === 'Submitted' && hasPermission('attendance.approve') && (
              <button
                onClick={() => handleWorkflowAction('approve')}
                disabled={workflowBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                <ThumbsUp className="w-3.5 h-3.5" /> Approve
              </button>
            )}
            {monthStatus.status === 'Approved' && hasPermission('attendance.finalize') && (
              <button
                onClick={() => handleWorkflowAction('finalize')}
                disabled={workflowBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" /> Finalize Attendance
              </button>
            )}
            {monthStatus.status === 'Finalized' && hasPermission('attendance.revert') && (
              <button
                onClick={() => setIsRevertModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Revert
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dashboard Summary + Exceptions */}
      {dashboard && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-medium text-slate-500">Employees</span>
              <div className="text-lg font-bold text-slate-900">{dashboard.totalEmployees}</div>
              <span className="text-[10px] text-slate-400">{dashboard.totalStaff} Staff • {dashboard.totalWorkers} Workers</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-medium text-slate-500">Total Days</span>
              <div className="text-lg font-bold text-slate-900">{dashboard.totalDays}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-medium text-slate-500">Total Hours</span>
              <div className="text-lg font-bold text-slate-900">{dashboard.totalHours}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
              <span className="text-[10px] font-medium text-amber-700">Overtime Hours</span>
              <div className="text-lg font-bold text-amber-800">{dashboard.totalOvertimeHours}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
              <span className="text-[10px] font-medium text-emerald-700">Completion</span>
              <div className="text-lg font-bold text-emerald-800">{dashboard.completionPercentage}%</div>
            </div>
            <button
              onClick={() => setShowExceptions(!showExceptions)}
              className={`p-3 rounded-xl border shadow-xs text-left transition-colors cursor-pointer ${
                dashboard.exceptions.length > 0 ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className={`text-[10px] font-medium ${dashboard.exceptions.length > 0 ? 'text-rose-700' : 'text-slate-500'}`}>Exceptions</span>
              <div className={`text-lg font-bold ${dashboard.exceptions.length > 0 ? 'text-rose-800' : 'text-slate-900'}`}>{dashboard.exceptions.length}</div>
            </button>
          </div>

          {showExceptions && dashboard.exceptions.length > 0 && (
            <div className="bg-white rounded-xl border border-rose-200 shadow-xs p-4 space-y-2">
              <h3 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Exceptions & Alerts ({dashboard.exceptions.length})
              </h3>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {dashboard.exceptions.map((exc: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-rose-50/50 rounded-lg text-[11px]">
                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-semibold shrink-0">{exc.type}</span>
                    <span className="text-slate-600">{exc.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dashboard.projectAllocation?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
              <h3 className="text-xs font-bold text-slate-800 mb-2">Project Allocation</h3>
              <div className="space-y-1.5">
                {dashboard.projectAllocation.map((p: any) => (
                  <div key={p.projectCode} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 font-mono font-semibold text-slate-700 shrink-0">{p.projectCode}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${p.percentage}%` }} />
                    </div>
                    <span className="w-12 text-right font-semibold text-slate-600">{p.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Attendance Table -- every field (Project, Hrs/Days, Overtime, Bonus,
          Deductions) is its own column; an employee's project allocations become
          aligned sub-rows sharing the employee-level columns via rowSpan. */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-3 py-3">Company</th>
                <th className="px-3 py-3">Pay By</th>
                <th className="px-3 py-3 min-w-[180px]">Project</th>
                <th className="px-3 py-3 text-right">Hrs / Days</th>
                <th className="px-3 py-3 text-right">Overtime</th>
                <th className="px-3 py-3 text-right">Bonus (OMR)</th>
                <th className="px-3 py-3 text-right">Deductions (OMR)</th>
                <th className="px-4 py-3 text-right">Total Worked</th>
                {canWrite && <th className="px-3 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {grouped.map((emp, empIdx) => {
                const totalDays = emp.records.reduce((s, r) => s + (Number(r.daysWorked) || 0), 0);
                const totalHours = emp.records.reduce((s, r) => s + (Number(r.hoursWorked) || 0), 0);
                const totalOvertime = emp.records.reduce((s, r) => s + (Number(r.overtimeHours) || 0), 0);
                const groupRowSpan = Math.max(emp.records.length, 1);

                const employeeCell = (
                  <td key="employee" rowSpan={groupRowSpan} className="px-4 py-3 align-top border-r border-slate-100">
                    <span className="font-mono font-bold text-blue-600 block">{emp.employeeId}</span>
                    <span className="font-semibold text-slate-900">{emp.employeeName}</span>
                  </td>
                );
                const typeCell = (
                  <td key="type" rowSpan={groupRowSpan} className="px-3 py-3 align-top border-r border-slate-100">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      emp.employeeType === 'Staff' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                    }`}>
                      {emp.employeeType}
                    </span>
                  </td>
                );
                const designationCell = (
                  <td key="designation" rowSpan={groupRowSpan} className="px-3 py-3 align-top text-slate-600 border-r border-slate-100">
                    {emp.designation}
                  </td>
                );
                const companyCell = (
                  <td key="company" rowSpan={groupRowSpan} className="px-3 py-3 align-top text-slate-600 border-r border-slate-100">
                    {emp.employeeCompany}
                  </td>
                );
                const payByCell = (
                  <td key="payBy" rowSpan={groupRowSpan} className="px-3 py-3 align-top text-slate-600 border-r border-slate-100">
                    {emp.salaryPaidBy}
                  </td>
                );
                const totalWorkedCell = (
                  <td key="totalWorked" rowSpan={groupRowSpan} className="px-4 py-3 text-right align-top border-l border-slate-100">
                    {emp.employeeType === 'Staff' ? (
                      <div>
                        <strong className={`font-mono text-sm ${totalDays > 30 ? 'text-rose-600 font-bold' : 'text-slate-900'}`}>
                          {totalDays} / 30
                        </strong>
                        <span className="block text-[10px] text-slate-500">Days Total</span>
                      </div>
                    ) : (
                      <div>
                        <strong className="font-mono text-sm text-indigo-700">
                          {totalHours} hrs
                        </strong>
                        <span className="block text-[10px] text-slate-500">Hours Total</span>
                      </div>
                    )}
                    {totalOvertime > 0 && <span className="block text-[10px] text-amber-600 mt-0.5">+{totalOvertime} OT hrs</span>}
                  </td>
                );

                if (emp.records.length === 0) {
                  return (
                    <tr key={emp.employeeId} className="hover:bg-slate-50/70 transition-colors">
                      {employeeCell}
                      {typeCell}
                      {designationCell}
                      {companyCell}
                      {payByCell}
                      <td colSpan={4} className="px-4 py-3 text-[11px] text-slate-400 italic">
                        No project allocated yet. Click '+ Project' to assign.
                      </td>
                      {totalWorkedCell}
                      {canWrite && (
                        <td className="px-3 py-3 text-right align-top">
                          {!isReadOnly && (
                            <button
                              onClick={() => handleAddProjectRow(empIdx)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Project
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                }

                return emp.records.map((rec, recIdx) => {
                  const isFirst = recIdx === 0;
                  const isLast = recIdx === emp.records.length - 1;
                  return (
                    <tr
                      key={`${emp.employeeId}-${recIdx}`}
                      className={`hover:bg-slate-50/70 transition-colors ${isLast ? 'border-b-2 border-slate-300' : ''}`}
                    >
                      {isFirst && employeeCell}
                      {isFirst && typeCell}
                      {isFirst && designationCell}
                      {isFirst && companyCell}
                      {isFirst && payByCell}

                      {/* Project */}
                      <td className="px-3 py-2">
                        <select
                          disabled={isReadOnly}
                          value={rec.projectId}
                          onChange={(e) => handleRecordChange(empIdx, recIdx, 'projectId', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-indigo-500"
                        >
                          {allProjects.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.projectCode} - {p.projectName}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Hrs / Days */}
                      <td className="px-3 py-2 text-right">
                        {emp.employeeType === 'Staff' ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min="0"
                              max="30"
                              step="0.5"
                              disabled={isReadOnly}
                              value={rec.daysWorked}
                              onChange={(e) => handleRecordChange(empIdx, recIdx, 'daysWorked', e.target.value)}
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-[10px] text-slate-500">days</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              disabled={isReadOnly}
                              value={rec.hoursWorked}
                              onChange={(e) => handleRecordChange(empIdx, recIdx, 'hoursWorked', e.target.value)}
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-[10px] text-slate-500">hrs</span>
                          </div>
                        )}
                      </td>

                      {/* Overtime */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          disabled={isReadOnly}
                          value={rec.overtimeHours}
                          onChange={(e) => handleRecordChange(empIdx, recIdx, 'overtimeHours', e.target.value)}
                          title="Overtime Hours"
                          className="w-16 px-2 py-1 bg-white border border-amber-200 rounded text-xs text-center font-bold text-amber-700 focus:ring-1 focus:ring-amber-500"
                        />
                      </td>

                      {/* Bonus */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          disabled={isReadOnly}
                          value={rec.bonus}
                          onChange={(e) => handleRecordChange(empIdx, recIdx, 'bonus', e.target.value)}
                          title="Bonus (OMR)"
                          className="w-20 px-2 py-1 bg-white border border-emerald-200 rounded text-xs text-center font-bold text-emerald-700 focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>

                      {/* Deductions */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          disabled={isReadOnly}
                          value={rec.deduction}
                          onChange={(e) => handleRecordChange(empIdx, recIdx, 'deduction', e.target.value)}
                          title="Deductions (OMR)"
                          className="w-20 px-2 py-1 bg-white border border-rose-200 rounded text-xs text-center font-bold text-rose-700 focus:ring-1 focus:ring-rose-500"
                        />
                      </td>

                      {isFirst && totalWorkedCell}

                      {/* Action -- remove this specific allocation, and (on the group's
                          last row) add another project allocation for this employee. */}
                      {canWrite && (
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isReadOnly && (
                              <button
                                onClick={() => handleRemoveProjectRow(empIdx, recIdx)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Remove this project allocation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isLast && !isReadOnly && (
                              <button
                                onClick={() => handleAddProjectRow(empIdx)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                Project
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Import Monthly Attendance Spreadsheet</h3>
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
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                  <FileSpreadsheet className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Upload Filled Attendance Template for {month}</p>
                  <p className="text-xs text-slate-500 mt-1">Columns: Company, Payroll Type, Employee ID, Employee Name, Employee Type, Designation, Project Code, Days Worked, Hours Worked, Overtime Hours, Bonus, Deductions, Pay By</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="mt-4 text-xs file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div>
                      <span>Total Rows: <strong>{importPreview.summary.totalRows}</strong></span> •{' '}
                      <span className="text-emerald-700">Valid: <strong>{importPreview.summary.validCount}</strong></span> •{' '}
                      <span className="text-rose-700">Invalid: <strong>{importPreview.summary.invalidCount}</strong></span>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Employee ID</th>
                          <th className="px-3 py-2">Company</th>
                          <th className="px-3 py-2">Project</th>
                          <th className="px-3 py-2">Days</th>
                          <th className="px-3 py-2">Hours</th>
                          <th className="px-3 py-2">OT</th>
                          <th className="px-3 py-2">Bonus</th>
                          <th className="px-3 py-2">Ded.</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : ''}>
                            <td className="px-3 py-2 text-slate-400 font-mono">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                            <td className="px-3 py-2">{r.company}</td>
                            <td className="px-3 py-2">{r.projectCode}</td>
                            <td className="px-3 py-2">{r.daysWorked}</td>
                            <td className="px-3 py-2">{r.hoursWorked}</td>
                            <td className="px-3 py-2">{r.overtimeHours}</td>
                            <td className="px-3 py-2">{r.bonus}</td>
                            <td className="px-3 py-2">{r.deduction}</td>
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
              {importPreview && importPreview.summary.invalidCount > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
                >
                  Download Error Report
                </button>
              )}
              {importPreview && (
                <button
                  type="button"
                  disabled={importing || importPreview.summary.validCount === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Commit Attendance'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revert Confirmation Modal */}
      {isRevertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50">
              <h3 className="font-bold text-rose-900 text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Revert Finalized Attendance
              </h3>
              <button
                onClick={() => setIsRevertModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600">
                This reverts attendance for {month} from Finalized back to Approved so corrections can be made.
                This action is recorded permanently in the audit trail. A reason is required.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Revert Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder="e.g. Correcting a data-entry mistake for EMP003..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                onClick={() => setIsRevertModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevert}
                disabled={workflowBusy || !revertReason.trim()}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm disabled:opacity-50"
              >
                Confirm Revert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
