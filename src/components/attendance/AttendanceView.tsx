import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR, downloadAuthenticatedFile } from '../../api/client';
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
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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

export interface AttendanceViewProps {
  initialMonth?: string;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ initialMonth }) => {
  const { canWrite, hasPermission } = useAuth();
  const [month, setMonth] = useState<string>(() => initialMonth || new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (initialMonth && initialMonth !== month) {
      setMonth(initialMonth);
    }
  }, [initialMonth]);
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

  // Table Filters (Item 5: search, project, company, job, pay by, type)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState('ALL');
  const [filterCompany, setFilterCompany] = useState('ALL');
  const [filterJob, setFilterJob] = useState('ALL');
  const [filterPayBy, setFilterPayBy] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');

  // Sorting (Item 4: Project ASC -> Type Staff/Worker -> Company ASC -> Employee Code ASC)
  type SortColumn = 'default' | 'project' | 'type' | 'company' | 'employeeId' | 'employeeName' | 'job' | 'payBy' | 'hoursOrDays' | 'overtime' | 'totalWorked';
  const [sortColumn, setSortColumn] = useState<SortColumn>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Interactive row selection and focus state
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedRowKey(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

    if (recIndex === -1) {
      const defaultProj = field === 'projectId' ? (allProjects.find(p => p.id === value) || allProjects[0]) : allProjects[0];
      if (!defaultProj) return;
      updated[empIndex].records = [{
        projectId: defaultProj.id,
        projectCode: defaultProj.projectCode,
        projectName: defaultProj.projectName,
        daysWorked: field === 'daysWorked' ? Math.max(0, Number(value) || 0) : 0,
        hoursWorked: field === 'hoursWorked' ? Math.max(0, Number(value) || 0) : 0,
        overtimeHours: field === 'overtimeHours' ? Math.max(0, Number(value) || 0) : 0,
        bonus: 0,
        deduction: 0,
      }];
      setGrouped(updated);
      return;
    }

    const rec = updated[empIndex].records[recIndex];
    if (!rec) return;

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

  const handleExportTemplate = async () => {
    try {
      await downloadAuthenticatedFile(
        `/api/attendance/export/template?month=${encodeURIComponent(month)}`,
        `Attendance_Template_${month}.xlsx`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to download attendance template.');
    }
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
            Monthly Attendance Register
          </h2>
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
      {dashboard && (() => {
        const totalProjectsCount = dashboard.totalProjects ?? (allProjects.length > 0 ? allProjects.length : new Set(grouped.flatMap(e => e.records.map(r => r.projectCode)).filter(Boolean)).size);
        const totalJobsCount = dashboard.totalJobs ?? new Set(grouped.map(e => (e.designation || '').trim()).filter(Boolean)).size;

        return (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-medium text-slate-500">Employees</span>
                <div className="text-lg font-bold text-slate-900">{dashboard.totalEmployees}</div>
                <span className="text-[10px] text-slate-400">{dashboard.totalStaff} Staff • {dashboard.totalWorkers} Workers</span>
              </div>

              {/* Combined Days & Hours Widget */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-500">Total Days</span>
                  <span className="text-lg font-bold text-slate-900 leading-tight">{dashboard.totalDays}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-500">Total Hours</span>
                  <span className="text-lg font-bold text-slate-900 leading-tight">{dashboard.totalHours}</span>
                </div>
              </div>

              {/* Combined Projects & Jobs Widget */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-500">Total Projects</span>
                  <span className="text-lg font-bold text-slate-900 leading-tight">{totalProjectsCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-500">Total Jobs</span>
                  <span className="text-lg font-bold text-slate-900 leading-tight">{totalJobsCount}</span>
                </div>
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
        );
      })()}

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

      {/* Main Attendance Register Table with Filters & Arranged Columns */}
      {(() => {
        // Unique dropdown values for filters (item 5)
        const uniqueCompanies = Array.from(new Set(grouped.map(g => g.employeeCompany).filter(Boolean))).sort();
        const uniqueJobs = Array.from(new Set(grouped.map(g => g.designation).filter(Boolean))).sort();
        const uniquePayBys = Array.from(new Set(grouped.map(g => g.salaryPaidBy).filter(Boolean))).sort();

        const hasActiveFilters =
          searchQuery.trim() !== '' ||
          filterProject !== 'ALL' ||
          filterCompany !== 'ALL' ||
          filterJob !== 'ALL' ||
          filterPayBy !== 'ALL' ||
          filterType !== 'ALL' ||
          sortColumn !== 'default';

        const resetFilters = () => {
          setSearchQuery('');
          setFilterProject('ALL');
          setFilterCompany('ALL');
          setFilterJob('ALL');
          setFilterPayBy('ALL');
          setFilterType('ALL');
          setSortColumn('default');
          setSortDirection('asc');
        };

        const handleSort = (col: SortColumn) => {
          if (sortColumn === col) {
            if (sortDirection === 'asc') {
              setSortDirection('desc');
            } else {
              setSortColumn('default');
              setSortDirection('asc');
            }
          } else {
            setSortColumn(col);
            setSortDirection('asc');
          }
        };

        const renderSortIcon = (col: SortColumn) => {
          if (sortColumn === col) {
            return sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 inline ml-1" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 inline ml-1" />
            );
          }
          return <ArrowUpDown className="w-3 h-3 text-slate-400 inline ml-1 opacity-40 group-hover:opacity-100 transition-opacity" />;
        };

        interface FlattenedRow {
          key: string;
          empIdx: number;
          recIdx: number;
          employeeId: string;
          employeeName: string;
          employeeType: 'Staff' | 'Worker';
          designation: string;
          employeeCompany: string;
          salaryPaidBy: string;
          projectId: string;
          projectCode: string;
          projectName: string;
          daysWorked: number;
          hoursWorked: number;
          overtimeHours: number;
          totalDays: number;
          totalHours: number;
          totalOvertime: number;
        }

        const allRows: FlattenedRow[] = [];
        grouped.forEach((emp, empIdx) => {
          const totalDays = emp.records.reduce((s, r) => s + (Number(r.daysWorked) || 0), 0);
          const totalHours = emp.records.reduce((s, r) => s + (Number(r.hoursWorked) || 0), 0);
          const totalOvertime = emp.records.reduce((s, r) => s + (Number(r.overtimeHours) || 0), 0);

          if (emp.records.length === 0) {
            allRows.push({
              key: `${emp.employeeId}-empty`,
              empIdx,
              recIdx: -1,
              employeeId: emp.employeeId,
              employeeName: emp.employeeName,
              employeeType: emp.employeeType,
              designation: emp.designation,
              employeeCompany: emp.employeeCompany,
              salaryPaidBy: emp.salaryPaidBy,
              projectId: '',
              projectCode: '',
              projectName: '',
              daysWorked: 0,
              hoursWorked: 0,
              overtimeHours: 0,
              totalDays,
              totalHours,
              totalOvertime,
            });
          } else {
            emp.records.forEach((rec, recIdx) => {
              allRows.push({
                key: `${emp.employeeId}-${rec.projectId || recIdx}`,
                empIdx,
                recIdx,
                employeeId: emp.employeeId,
                employeeName: emp.employeeName,
                employeeType: emp.employeeType,
                designation: emp.designation,
                employeeCompany: emp.employeeCompany,
                salaryPaidBy: emp.salaryPaidBy,
                projectId: rec.projectId,
                projectCode: rec.projectCode,
                projectName: rec.projectName,
                daysWorked: rec.daysWorked,
                hoursWorked: rec.hoursWorked,
                overtimeHours: rec.overtimeHours,
                totalDays,
                totalHours,
                totalOvertime,
              });
            });
          }
        });

        const filteredRows = allRows.filter((row) => {
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchId = row.employeeId.toLowerCase().includes(q);
            const matchName = row.employeeName.toLowerCase().includes(q);
            if (!matchId && !matchName) return false;
          }
          if (filterProject !== 'ALL') {
            if (filterProject === '__UNASSIGNED__') {
              if (row.projectCode) return false;
            } else {
              if (row.projectId !== filterProject && row.projectCode !== filterProject) return false;
            }
          }
          if (filterCompany !== 'ALL' && row.employeeCompany !== filterCompany) {
            return false;
          }
          if (filterJob !== 'ALL' && row.designation !== filterJob) {
            return false;
          }
          if (filterPayBy !== 'ALL' && row.salaryPaidBy !== filterPayBy) {
            return false;
          }
          if (filterType !== 'ALL' && row.employeeType !== filterType) {
            return false;
          }
          return true;
        });

        // Prompt item 4:
        // Project (sort ascending), Type (sort Staff and Workers), Company (sort ascending), Employee Ccode (Ascending)
        const sortedRows = [...filteredRows].sort((a, b) => {
          const runDefaultSort = () => {
            // 1. Project (sort ascending; empty / unassigned at bottom)
            const pA = a.projectCode || 'ZZZZ_UNASSIGNED';
            const pB = b.projectCode || 'ZZZZ_UNASSIGNED';
            const pCmp = pA.localeCompare(pB);
            if (pCmp !== 0) return pCmp;

            // 2. Type (sort Staff and Workers)
            const tRankA = a.employeeType === 'Staff' ? 0 : 1;
            const tRankB = b.employeeType === 'Staff' ? 0 : 1;
            if (tRankA !== tRankB) return tRankA - tRankB;

            // 3. Company (sort ascending)
            const cCmp = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
            if (cCmp !== 0) return cCmp;

            // 4. Employee Code (Ascending)
            return (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
          };

          if (sortColumn === 'default') {
            return runDefaultSort();
          }

          let diff = 0;
          switch (sortColumn) {
            case 'project': {
              const pA = a.projectCode || 'ZZZZ_UNASSIGNED';
              const pB = b.projectCode || 'ZZZZ_UNASSIGNED';
              diff = pA.localeCompare(pB);
              break;
            }
            case 'type': {
              const tRankA = a.employeeType === 'Staff' ? 0 : 1;
              const tRankB = b.employeeType === 'Staff' ? 0 : 1;
              diff = tRankA - tRankB;
              break;
            }
            case 'company':
              diff = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
              break;
            case 'employeeId':
              diff = (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
              break;
            case 'employeeName':
              diff = (a.employeeName || '').localeCompare(b.employeeName || '');
              break;
            case 'job':
              diff = (a.designation || '').localeCompare(b.designation || '');
              break;
            case 'payBy':
              diff = (a.salaryPaidBy || '').localeCompare(b.salaryPaidBy || '');
              break;
            case 'hoursOrDays':
              diff = (a.employeeType === 'Staff' ? a.daysWorked : a.hoursWorked) - (b.employeeType === 'Staff' ? b.daysWorked : b.hoursWorked);
              break;
            case 'overtime':
              diff = a.overtimeHours - b.overtimeHours;
              break;
            case 'totalWorked':
              diff = (a.employeeType === 'Staff' ? a.totalDays : a.totalHours) - (b.employeeType === 'Staff' ? b.totalDays : b.totalHours);
              break;
            default:
              return runDefaultSort();
          }

          if (diff !== 0) {
            return sortDirection === 'asc' ? diff : -diff;
          }
          return runDefaultSort();
        });

        // Summary calculations for the currently filtered view
        const sumHoursWorked = Math.round(sortedRows.reduce((sum, r) => sum + (Number(r.hoursWorked) || 0), 0) * 100) / 100;
        const sumDaysWorked = Math.round(sortedRows.reduce((sum, r) => sum + (Number(r.daysWorked) || 0), 0) * 100) / 100;
        const sumOvertimeHours = Math.round(sortedRows.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0) * 100) / 100;
        const totalWorkedCombinedHours = Math.round((sumHoursWorked + sumOvertimeHours) * 100) / 100;
        const selectedRow = sortedRows.find(r => r.key === selectedRowKey);

        return (
          <div className="space-y-4">
            {/* Filters Above Table (Item 5: search, project, company, job, pay by, type) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Attendance Filters</span>
                  <span className="text-xs text-slate-500 font-medium">
                    (Showing {sortedRows.length} of {allRows.length} records)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700">
                    Total Worked: {sumHoursWorked.toLocaleString()} hrs
                    {sumOvertimeHours > 0 && <span className="text-amber-600 font-medium">(+{sumOvertimeHours.toLocaleString()} OT)</span>}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
                    Sort: <span className="font-semibold text-indigo-600">{sortColumn === 'default' ? 'Project (ASC) → Type (Staff/Worker) → Company (ASC) → Emp Code (ASC)' : `${sortColumn} (${sortDirection.toUpperCase()})`}</span>
                  </span>
                  {hasActiveFilters && (
                    <button
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                {/* 1. Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Emp ID / Name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Project */}
                <div>
                  <select
                    value={filterProject}
                    onChange={(e) => setFilterProject(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Project: All</option>
                    <option value="__UNASSIGNED__">Project: Unassigned</option>
                    {allProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode} - {p.projectName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Type */}
                <div>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Type: All (Staff/Worker)</option>
                    <option value="Staff">Type: Staff</option>
                    <option value="Worker">Type: Worker</option>
                  </select>
                </div>

                {/* 4. Company */}
                <div>
                  <select
                    value={filterCompany}
                    onChange={(e) => setFilterCompany(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Company: All</option>
                    {uniqueCompanies.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* 5. Job / Designation */}
                <div>
                  <select
                    value={filterJob}
                    onChange={(e) => setFilterJob(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Job: All</option>
                    {uniqueJobs.map(j => (
                      <option key={j} value={j}>{j}</option>
                    ))}
                  </select>
                </div>

                {/* 6. Pay By */}
                <div>
                  <select
                    value={filterPayBy}
                    onChange={(e) => setFilterPayBy(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">Pay By: All</option>
                    {uniquePayBys.map(pb => (
                      <option key={pb} value={pb}>{pb}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active Row Selection & Focus Banner */}
              {selectedRow && (
                <div className="pt-1">
                  <div className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] shrink-0">
                        ✓
                      </span>
                      <span className="font-semibold text-indigo-950">Focused Row:</span>
                      <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700">
                        {selectedRow.employeeId}
                      </span>
                      <span className="font-bold text-slate-900">{selectedRow.employeeName}</span>
                      <span className="text-slate-600">• {selectedRow.designation || 'General'}</span>
                      <span className="text-slate-600">• {selectedRow.employeeCompany}</span>
                      <span className="text-slate-600">
                        • Project: <strong className="text-indigo-700 font-mono">{selectedRow.projectCode}</strong>
                      </span>
                      <span className="text-slate-600">
                        • Total Worked:{' '}
                        <strong className="text-slate-900 font-mono">
                          {selectedRow.employeeType === 'Staff' ? `${selectedRow.daysWorked} days` : `${selectedRow.hoursWorked} hrs`}
                        </strong>
                      </span>
                      {selectedRow.overtimeHours > 0 && (
                        <span className="text-amber-800 font-semibold bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">
                          +{selectedRow.overtimeHours} hrs OT
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400 hidden lg:inline">Press [Esc] or click row to deselect</span>
                      <button
                        type="button"
                        onClick={() => setSelectedRowKey(null)}
                        className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-950 bg-white hover:bg-indigo-100 px-2.5 py-1 rounded border border-indigo-200 transition-colors cursor-pointer"
                      >
                        Clear Focus
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Main Attendance Table with Item 4 Columns:
                Project (sort ascending), Type (sort Staff and Workers), Company (sort ascending), Employee Ccode (Ascending), Employee Name, Job, Pay by, HRS/DAYS, Overtime, Total worked, Action */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider select-none">
                    <tr>
                      {/* 1. Project */}
                      <th
                        onClick={() => handleSort('project')}
                        className="px-3 py-3 min-w-[190px] cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Project {renderSortIcon('project')}
                      </th>

                      {/* 2. Type */}
                      <th
                        onClick={() => handleSort('type')}
                        className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Type {renderSortIcon('type')}
                      </th>

                      {/* 3. Company */}
                      <th
                        onClick={() => handleSort('company')}
                        className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Company {renderSortIcon('company')}
                      </th>

                      {/* 4. Employee Code */}
                      <th
                        onClick={() => handleSort('employeeId')}
                        className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Employee Code {renderSortIcon('employeeId')}
                      </th>

                      {/* 5. Employee Name */}
                      <th
                        onClick={() => handleSort('employeeName')}
                        className="px-3 py-3 min-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Employee Name {renderSortIcon('employeeName')}
                      </th>

                      {/* 6. Job */}
                      <th
                        onClick={() => handleSort('job')}
                        className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Job {renderSortIcon('job')}
                      </th>

                      {/* 7. Pay by */}
                      <th
                        onClick={() => handleSort('payBy')}
                        className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Pay by {renderSortIcon('payBy')}
                      </th>

                      {/* 8. HRS / DAYS */}
                      <th
                        onClick={() => handleSort('hoursOrDays')}
                        className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        HRS / DAYS {renderSortIcon('hoursOrDays')}
                      </th>

                      {/* 9. Overtime */}
                      <th
                        onClick={() => handleSort('overtime')}
                        className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Overtime {renderSortIcon('overtime')}
                      </th>

                      {/* 10. Total worked */}
                      <th
                        onClick={() => handleSort('totalWorked')}
                        className="px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                      >
                        Total worked {renderSortIcon('totalWorked')}
                      </th>

                      {/* 11. Action */}
                      {canWrite && <th className="px-3 py-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td colSpan={canWrite ? 11 : 10} className="py-10 text-center text-slate-400 text-xs italic">
                          No matching attendance records found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row) => {
                        const isSelected = selectedRowKey === row.key;
                        return (
                          <tr
                            key={row.key}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              const isControl = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON';
                              if (isControl) {
                                setSelectedRowKey(row.key);
                              } else {
                                setSelectedRowKey(prev => prev === row.key ? null : row.key);
                              }
                            }}
                            className={`transition-all duration-150 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50/90 text-indigo-950 ring-1 ring-inset ring-indigo-300 border-l-4 border-l-indigo-600 shadow-2xs'
                                : 'bg-white hover:bg-indigo-50/40 hover:text-slate-900 border-l-4 border-l-transparent hover:border-l-indigo-300'
                            }`}
                            title={isSelected ? "Selected / Focused row (click to deselect or press Esc)" : "Click row to focus and highlight"}
                          >
                            {/* 1. Project */}
                            <td className="px-3 py-2.5">
                              {row.recIdx >= 0 ? (
                                <div className="flex items-center gap-1.5">
                                  {isSelected && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0 animate-pulse" title="Active Focus" />
                                  )}
                                  <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                    isSelected ? 'text-indigo-800 bg-white border border-indigo-200 shadow-2xs' : 'text-indigo-700 bg-indigo-50'
                                  }`}>
                                    {row.projectCode}
                                  </span>
                                  <select
                                    disabled={isReadOnly}
                                    value={row.projectId}
                                    onChange={(e) => handleRecordChange(row.empIdx, row.recIdx, 'projectId', e.target.value)}
                                    className={`w-full min-w-[130px] px-2 py-1 bg-white border rounded text-xs text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500 truncate ${
                                      isSelected ? 'border-indigo-300 shadow-2xs font-semibold' : 'border-slate-200'
                                    }`}
                                  >
                                    {allProjects.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.projectCode} - {p.projectName}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {isSelected && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0 animate-pulse" title="Active Focus" />
                                  )}
                                  <span className="text-[11px] text-amber-700 italic bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                                    Unassigned
                                  </span>
                                  <select
                                    disabled={isReadOnly}
                                    value=""
                                    onChange={(e) => handleRecordChange(row.empIdx, -1, 'projectId', e.target.value)}
                                    className="w-full min-w-[130px] px-2 py-1 bg-white border border-amber-300 rounded text-xs text-amber-900 focus:ring-1 focus:ring-amber-500"
                                  >
                                    <option value="">+ Assign Project...</option>
                                    {allProjects.map(p => (
                                      <option key={p.id} value={p.id}>
                                        {p.projectCode} - {p.projectName}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </td>

                            {/* 2. Type */}
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                row.employeeType === 'Staff' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                              }`}>
                                {row.employeeType}
                              </span>
                            </td>

                            {/* 3. Company */}
                            <td className="px-3 py-2.5 text-slate-700 font-medium">
                              {row.employeeCompany}
                            </td>

                            {/* 4. Employee Code */}
                            <td className="px-3 py-2.5">
                              <span className={`font-mono font-bold text-xs ${isSelected ? 'text-indigo-700 underline decoration-indigo-300 underline-offset-2' : 'text-blue-600'}`}>
                                {row.employeeId}
                              </span>
                            </td>

                            {/* 5. Employee Name */}
                            <td className={`px-3 py-2.5 font-semibold ${isSelected ? 'text-indigo-950 font-bold' : 'text-slate-900'}`}>
                              {row.employeeName}
                            </td>

                            {/* 6. Job */}
                            <td className="px-3 py-2.5 text-slate-600">
                              {row.designation || '—'}
                            </td>

                            {/* 7. Pay by */}
                            <td className="px-3 py-2.5 text-slate-600 font-medium">
                              {row.salaryPaidBy || '—'}
                            </td>

                            {/* 8. HRS / DAYS */}
                            <td className="px-3 py-2.5 text-right">
                              {row.employeeType === 'Staff' ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    step="0.5"
                                    disabled={isReadOnly}
                                    value={row.daysWorked}
                                    onChange={(e) => handleRecordChange(row.empIdx, row.recIdx, 'daysWorked', e.target.value)}
                                    className={`w-16 px-2 py-1 bg-white border rounded text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500 ${
                                      isSelected ? 'border-indigo-400 ring-1 ring-indigo-200 shadow-2xs' : 'border-slate-200'
                                    }`}
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
                                    value={row.hoursWorked}
                                    onChange={(e) => handleRecordChange(row.empIdx, row.recIdx, 'hoursWorked', e.target.value)}
                                    className={`w-16 px-2 py-1 bg-white border rounded text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500 ${
                                      isSelected ? 'border-indigo-400 ring-1 ring-indigo-200 shadow-2xs' : 'border-slate-200'
                                    }`}
                                  />
                                  <span className="text-[10px] text-slate-500">hrs</span>
                                </div>
                              )}
                            </td>

                            {/* 9. Overtime */}
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                disabled={isReadOnly}
                                value={row.overtimeHours}
                                onChange={(e) => handleRecordChange(row.empIdx, row.recIdx, 'overtimeHours', e.target.value)}
                                title="Overtime Hours"
                                className={`w-16 px-2 py-1 bg-white border rounded text-xs text-center font-bold text-amber-700 focus:ring-1 focus:ring-amber-500 ${
                                  isSelected ? 'border-amber-400 ring-1 ring-amber-200 shadow-2xs' : 'border-amber-200'
                                }`}
                              />
                            </td>

                            {/* 10. Total worked */}
                            <td className="px-3 py-2.5 text-right">
                              {row.employeeType === 'Staff' ? (
                                <div>
                                  <strong className={`font-mono text-xs ${row.totalDays > 30 ? 'text-rose-600 font-bold' : 'text-slate-900'}`}>
                                    {row.totalDays} / 30
                                  </strong>
                                  <span className="block text-[10px] text-slate-500">Days Total</span>
                                </div>
                              ) : (
                                <div>
                                  <strong className="font-mono text-xs text-indigo-700">
                                    {row.totalHours} hrs
                                  </strong>
                                  <span className="block text-[10px] text-slate-500">Hours Total</span>
                                </div>
                              )}
                              {row.totalOvertime > 0 && (
                                <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">
                                  +{row.totalOvertime} OT hrs
                                </span>
                              )}
                            </td>

                            {/* 11. Action */}
                            {canWrite && (
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {row.recIdx >= 0 && !isReadOnly && (
                                    <button
                                      onClick={() => handleRemoveProjectRow(row.empIdx, row.recIdx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Remove this project allocation"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {!isReadOnly && (
                                    <button
                                      onClick={() => handleAddProjectRow(row.empIdx)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                                      title="Add another project allocation for this employee"
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
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 text-xs font-semibold text-slate-800">
                    <tr>
                      {/* Columns 1-7: Project, Type, Company, Employee Code, Employee Name, Job, Pay by */}
                      <td colSpan={7} className="px-4 py-3 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                            Total (Filtered View)
                          </span>
                          <span className="text-slate-500 font-normal text-xs">
                            — {sortedRows.length} {sortedRows.length === 1 ? 'record' : 'records'}
                          </span>
                        </div>
                      </td>

                      {/* 8. HRS / DAYS */}
                      <td className="px-3 py-3 text-right">
                        {sumHoursWorked > 0 && (
                          <div className="font-mono font-bold text-slate-900">
                            {sumHoursWorked.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">hrs</span>
                          </div>
                        )}
                        {sumDaysWorked > 0 && (
                          <div className="font-mono font-bold text-slate-700">
                            {sumDaysWorked.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">days</span>
                          </div>
                        )}
                        {sumHoursWorked === 0 && sumDaysWorked === 0 && (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* 9. Overtime */}
                      <td className="px-3 py-3 text-right">
                        {sumOvertimeHours > 0 ? (
                          <div className="font-mono font-bold text-amber-700">
                            {sumOvertimeHours.toLocaleString()} <span className="text-[10px] text-amber-600 font-normal">hrs</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* 10. Total worked (Sum of Total Worked hours for currently filtered view) */}
                      <td className="px-3 py-3 text-right">
                        <div className="font-mono text-sm font-bold text-indigo-700">
                          {sumHoursWorked.toLocaleString()} hrs
                        </div>
                        {sumOvertimeHours > 0 && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            +{sumOvertimeHours.toLocaleString()} OT hrs
                            <span className="text-slate-500 block font-normal">
                              ({totalWorkedCombinedHours.toLocaleString()} hrs incl. OT)
                            </span>
                          </div>
                        )}
                        {sumDaysWorked > 0 && (
                          <div className="text-[10px] text-slate-600 font-medium mt-0.5">
                            {sumDaysWorked.toLocaleString()} Staff days
                          </div>
                        )}
                      </td>

                      {/* 11. Action */}
                      {canWrite && <td className="px-3 py-3 text-right"></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <p className="text-xs text-slate-500 mt-1">Template Columns: Employee ID, Payroll Type, Employee Name, Project Code, Job, Days Worked, Hours Worked, Overtime Hours, Pay By</p>
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
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Job</th>
                          <th className="px-3 py-2">Project</th>
                          <th className="px-3 py-2">Pay By</th>
                          <th className="px-3 py-2">Days</th>
                          <th className="px-3 py-2">Hours</th>
                          <th className="px-3 py-2">OT</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : ''}>
                            <td className="px-3 py-2 text-slate-400 font-mono">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                            <td className="px-3 py-2 font-medium">{r.employeeName}</td>
                            <td className="px-3 py-2 text-slate-600">{r.job || '—'}</td>
                            <td className="px-3 py-2 font-mono text-indigo-700 font-semibold">{r.projectCode}</td>
                            <td className="px-3 py-2">{r.payBy}</td>
                            <td className="px-3 py-2">{r.daysWorked}</td>
                            <td className="px-3 py-2">{r.hoursWorked}</td>
                            <td className="px-3 py-2">{r.overtimeHours}</td>
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
