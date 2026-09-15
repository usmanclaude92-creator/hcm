import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Printer,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  Maximize2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { formatBusinessTime, formatBusinessDate, formatBusinessDateTime } from '../../utils/workforceShiftUtils';

interface AttendanceRecordItem {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeType?: 'Staff' | 'Worker';
  designation?: string;
  employeeCompany?: string;
  projectId?: string;
  projectCode: string;
  projectName?: string;
  daysWorked: number;
  hoursWorked: number;
  overtimeHours?: number;
  bonus?: number;
  deduction?: number;
  payrollMonth?: string;
}

interface AttendancePunchItem {
  id: string;
  employeeId: string;
  punchDate: string;
  checkInTime: string;
  checkOutTime?: string | null;
  hoursWorked?: number;
  overtimeHours?: number;
  selfieUrl?: string | null;
  startSelfieUrl?: string | null;
  endSelfieUrl?: string | null;
  isGeofenceException?: boolean;
  distanceFromSiteMeters?: number;
  siteName?: string;
  projectCode?: string;
  projectName?: string;
  supervisorApproved?: boolean;
  // Auto-generated to match a manually-entered monthly summary -- no real GPS/selfie
  // check-in/out was ever captured for this row.
  isSynthesized?: boolean;
}

interface EmployeeReportData {
  employee: {
    employeeId: string;
    employeeName: string;
    employeeType: 'Staff' | 'Worker';
    designation: string;
    employeeCompany: string;
    salaryPaidBy?: string;
    wageType?: string;
    monthlySalaryOrRate?: number;
    assignedProjectCode?: string;
    assignedProjectName?: string;
  };
  month: string;
  hasReport: boolean;
  records: AttendanceRecordItem[];
  punches: AttendancePunchItem[];
  summary: {
    totalDays: number;
    totalHours: number;
    totalOvertimeHours: number;
    totalBonus: number;
    totalDeduction: number;
  };
  monthStatus: string;
}

interface Props {
  employeeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  initialMonth?: string;
  onAttendanceCreated?: () => void;
  onNavigateToFullAttendance?: (employeeId: string, month: string) => void;
}

// Pinned to Asia/Muscat (see workforceShiftUtils) instead of the viewer's own browser
// timezone, matching the Employee Card / shift-status feed elsewhere in this dashboard --
// previously this modal alone showed times shifted by the viewer's own offset.
function formatTime(iso: string | null | undefined): string {
  return formatBusinessTime(iso) ?? (iso || '-');
}

function formatDate(dateStr: string | null | undefined): string {
  return formatBusinessDate(dateStr) ?? (dateStr || '-');
}

// "Hrs : Mns" display, e.g. 8.5 -> "8:30". Rounds to the nearest minute so a value like
// 1.999999 (float summing) never renders as ":60".
function formatHrsMins(hoursDecimal: number): string {
  const totalMinutes = Math.round((hoursDecimal || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export const EmployeeAttendanceReportModal: React.FC<Props> = ({
  employeeId,
  isOpen,
  onClose,
  initialMonth,
  onAttendanceCreated,
  onNavigateToFullAttendance,
}) => {
  const { canWrite } = useAuth();

  const now = new Date();
  const currentMonthDefault = initialMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthDefault);
  const [data, setData] = useState<EmployeeReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; dateTime: string | null } | null>(null);

  // The "Daily Shifts & Selfie Logs" table below is specifically the real GPS/selfie
  // capture log -- synthesized rows (generated only to match a manually-entered monthly
  // summary, see server/routes/attendance.ts) have no real selfie or location behind
  // them and don't belong there. The summary table above still shows every row,
  // synthesized ones included, but visibly labeled.
  const realPunches = data ? data.punches.filter(p => !p.isSynthesized) : [];

  // Attendance & Approval Register is a per-day summary, not a per-shift log (that's what
  // Daily Shifts & Selfie Logs below is for) -- a day with more than one real shift (e.g. a
  // split day, or a shift that crossed midnight) previously repeated as multiple rows for
  // the same date. Grouped here into one row per punchDate: earliest clock-in, latest
  // clock-out (or "On Shift" if any of that day's shifts is still open), overtime and
  // geofence-selfie counts summed across the day's shifts, and the day counted Approved
  // only once every shift in it has been.
  const dailyRegisterRows = React.useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, AttendancePunchItem[]>();
    for (const p of data.punches) {
      const list = byDate.get(p.punchDate);
      if (list) list.push(p);
      else byDate.set(p.punchDate, [p]);
    }
    const rows = Array.from(byDate.entries()).map(([punchDate, group]) => {
      const sorted = [...group].sort((a, b) => a.checkInTime.localeCompare(b.checkInTime));
      const openPunch = sorted.find(p => !p.checkOutTime);
      let totalSelfies = 0;
      let insideSelfies = 0;
      let overtimeHours = 0;
      let totalHours = 0;
      for (const p of group) {
        const t = p.isSynthesized ? 0 : (p.checkInTime ? 1 : 0) + (p.checkOutTime ? 1 : 0);
        totalSelfies += t;
        insideSelfies += p.isGeofenceException ? Math.max(t - 1, 0) : t;
        overtimeHours += p.overtimeHours || 0;
        totalHours += p.hoursWorked || 0;
      }
      // Regular shift time is whatever wasn't already counted as overtime -- same split the
      // backend already applies per punch (see server/routes/attendance.ts), just summed
      // across the day's shifts here.
      const regularHours = Math.max(0, totalHours - overtimeHours);
      return {
        punchDate,
        projectName: sorted[0]?.projectName,
        projectCode: sorted[0]?.projectCode,
        startTime: sorted[0]?.checkInTime ?? null,
        endTime: openPunch ? null : sorted[sorted.length - 1]?.checkOutTime ?? null,
        isOpen: !!openPunch,
        regularHours,
        overtimeHours,
        totalHours,
        approved: group.every(p => p.supervisorApproved === true),
        geofencePercent: totalSelfies > 0 ? Math.round((insideSelfies / totalSelfies) * 100) : null,
        // A day counts as estimated only once every shift recorded for it is a placeholder;
        // a day with any real captured shift is a real day, even if another placeholder
        // punch briefly existed there too.
        isSynthesized: group.every(p => p.isSynthesized),
      };
    });
    return rows.sort((a, b) => b.punchDate.localeCompare(a.punchDate));
  }, [data]);

  // The Metric Summary Cards previously read data.summary, which is computed server-side
  // from the manually-entered monthly record (e.g. a flat "25 days / 200 hrs") -- static
  // figures that drifted from what the register below actually shows once real Workforce
  // shifts and honestly-labeled placeholders are blended in. Derived from the same
  // dailyRegisterRows the table renders instead, so the cards and the table can never
  // disagree.
  const monthlyTotals = React.useMemo(
    () =>
      dailyRegisterRows.reduce(
        (acc, row) => ({
          days: acc.days + 1,
          hours: acc.hours + row.totalHours,
          overtimeHours: acc.overtimeHours + row.overtimeHours,
        }),
        { days: 0, hours: 0, overtimeHours: 0 }
      ),
    [dailyRegisterRows]
  );

  useEffect(() => {
    if (initialMonth) setSelectedMonth(initialMonth);
  }, [initialMonth]);

  const fetchReport = useCallback(async () => {
    if (!employeeId || !isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiRequest<EmployeeReportData>(`/api/attendance/employee/${encodeURIComponent(employeeId)}?month=${encodeURIComponent(selectedMonth)}`);
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [employeeId, isOpen, selectedMonth]);

  useEffect(() => {
    if (isOpen && employeeId) {
      fetchReport();
    } else {
      setData(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, employeeId, selectedMonth, fetchReport]);

  const handleMakeReport = async () => {
    if (!employeeId) return;
    setCreating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const resData = await apiRequest<any>(`/api/attendance/employee/${encodeURIComponent(employeeId)}/make-report`, {
        method: 'POST',
        body: JSON.stringify({ month: selectedMonth }),
      });
      setSuccessMsg(resData?.message || 'Attendance report created successfully.');
      await fetchReport();
      onAttendanceCreated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create attendance report.');
    } finally {
      setCreating(false);
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    setSelectedMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    setSelectedMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
  };

  if (!isOpen || !employeeId) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900 animate-in fade-in duration-150">
      <div className="w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Employee Attendance Report</p>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 block">
                  {data?.employee?.employeeName || employeeId}
                </h2>
                {data?.employee?.employeeType && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      data.employee.employeeType === 'Staff'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                        : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                    }`}
                  >
                    {data.employee.employeeType}
                  </span>
                )}
                {data?.monthStatus && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Status: {data.monthStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {data?.employee?.designation || '—'}
                <span className="mx-1.5 text-slate-300">•</span>
                ID: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{employeeId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Month Navigator */}
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                {selectedMonth}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p>Loading attendance report for {selectedMonth}...</p>
            </div>
          ) : !data?.hasReport ? (
            /* Empty State: Prompt to Make Attendance Report */
            <div className="py-12 px-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/60 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 shadow-2xs">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                No Attendance Report for {selectedMonth}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                There is currently no attendance register record for{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{data?.employee?.employeeName || employeeId}</span> for the month of{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedMonth}</span>.
              </p>

              {data && data.punches.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50/70 border border-blue-200 dark:border-blue-800/60 rounded-xl text-xs text-blue-800 dark:text-blue-300 text-left w-full flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Detected Shift Punches:</span> Found{' '}
                    <span className="font-bold">{data.punches.length} shift punch(es)</span> logged this month. Creating the report will
                    automatically calculate days and hours worked!
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {canWrite ? (
                  <button
                    type="button"
                    onClick={handleMakeReport}
                    disabled={creating}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold shadow-xs hover:shadow transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {creating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Report...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Make Attendance Report for this Month
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">You need write permissions to create attendance reports.</p>
                )}
              </div>
            </div>
          ) : (
            /* Active Report Overview */
            <>
              {/* Metric Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Days Worked</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {monthlyTotals.days}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Days</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Staff / Worker monthly count</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hours Worked</p>
                  <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {formatHrsMins(monthlyTotals.hours)}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Hrs</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Total shift hours (Reg. + Overtime)</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overtime</p>
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {formatHrsMins(monthlyTotals.overtimeHours)}{' '}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">Hrs</span>
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Overtime hours this month</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project Allocation</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 truncate" title={data.records[0]?.projectName || data.records[0]?.projectCode}>
                    {data.records[0]?.projectCode || 'HO0001'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {data.records[0]?.projectName || 'Head Office'}
                  </p>
                </div>
              </div>

              {/* Attendance & Approval Register: one row per worked DATE (see
                  dailyRegisterRows), with clock-in/out times, overtime and geofence
                  compliance summed across that day's shifts, and supervisor approval
                  status. Mobility has no real data source yet anywhere in this app
                  (see EmployeeDeploymentCard/WorkforceDeploymentView) -- shown as
                  "Coming Soon" here too rather than fabricated. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Attendance &amp; Approval Register</h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{dailyRegisterRows.length} Day(s)</span>
                </div>
                {dailyRegisterRows.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/40">
                    No daily attendance entries recorded for this month yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Project</th>
                            <th className="py-2.5 px-3 text-center">Start Time</th>
                            <th className="py-2.5 px-3 text-center">End Time</th>
                            <th className="py-2.5 px-3 text-center">Reg. Shift Time (Hrs : Mns)</th>
                            <th className="py-2.5 px-3 text-center">Overtime (Hrs : Mns)</th>
                            <th className="py-2.5 px-3 text-center">Total Time (Hrs : Mns)</th>
                            <th className="py-2.5 px-3 text-center">Approval</th>
                            <th className="py-2.5 px-3 text-center">Geofence</th>
                            <th className="py-2.5 px-3 text-center">Mobility</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                          {dailyRegisterRows.map((row) => (
                            <tr key={row.punchDate} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                {formatDate(row.punchDate)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {row.projectName || row.projectCode || data.employee.assignedProjectName || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                {row.startTime ? formatTime(row.startTime) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold whitespace-nowrap">
                                {row.isOpen ? (
                                  <span className="text-blue-600 dark:text-blue-400 italic">On Shift</span>
                                ) : row.endTime ? (
                                  <span className="text-blue-700 dark:text-blue-300">{formatTime(row.endTime)}</span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500 italic">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                                {formatHrsMins(row.regularHours)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-semibold text-amber-600 dark:text-amber-400">
                                {formatHrsMins(row.overtimeHours)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                                {formatHrsMins(row.totalHours)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {row.approved ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                                    <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                    Not-approved
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {row.geofencePercent === null ? (
                                  <span className="text-slate-400 dark:text-slate-500 italic">-</span>
                                ) : (
                                  <span className={`font-bold ${row.geofencePercent >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {row.geofencePercent}%
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-400 dark:text-slate-500 italic text-[10px]">
                                Coming Soon
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Shift Punches & Selfies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Daily Shifts &amp; Selfie Logs ({selectedMonth})
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{realPunches.length} Shift Punch(es)</span>
                </div>

                {realPunches.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/40">
                    No real GPS/selfie check-in or check-out was captured for this employee this month yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Start Time &amp; Selfie</th>
                            <th className="py-2.5 px-3">End Time &amp; Selfie</th>
                            <th className="py-2.5 px-3 text-center">Duration</th>
                            <th className="py-2.5 px-3 text-center">Geofence Status</th>
                            <th className="py-2.5 px-3">Site Location</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                          {realPunches.map((punch) => {
                            const startImg = punch.startSelfieUrl || punch.selfieUrl;
                            const endImg = punch.endSelfieUrl;
                            const isInside = punch.isGeofenceException === false;

                            return (
                              <tr key={punch.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                  {formatDate(punch.punchDate)}
                                </td>

                                {/* Start Time & Selfie */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {startImg ? (
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage({ url: startImg, title: `Start Shift Selfie - ${punch.punchDate}`, dateTime: formatBusinessDateTime(punch.checkInTime) })}
                                        className="relative group w-8 h-8 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-500 shadow-2xs shrink-0"
                                        title="Click to zoom selfie"
                                      >
                                        <img src={startImg} alt="Start selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                          <Maximize2 className="w-3 h-3 text-white" />
                                        </div>
                                      </button>
                                    ) : (
                                      <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0">
                                        <UserRound className="w-4 h-4" />
                                      </div>
                                    )}
                                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                                      {formatTime(punch.checkInTime)}
                                    </span>
                                  </div>
                                </td>

                                {/* End Time & Selfie */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {endImg ? (
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage({ url: endImg, title: `End Shift Selfie - ${punch.punchDate}`, dateTime: formatBusinessDateTime(punch.checkOutTime) })}
                                        className="relative group w-8 h-8 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-500 shadow-2xs shrink-0"
                                        title="Click to zoom selfie"
                                      >
                                        <img src={endImg} alt="End selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                          <Maximize2 className="w-3 h-3 text-white" />
                                        </div>
                                      </button>
                                    ) : punch.checkOutTime ? (
                                      <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-500 shrink-0">
                                        <UserRound className="w-4 h-4" />
                                      </div>
                                    ) : null}
                                    {punch.checkOutTime ? (
                                      <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                                        {formatTime(punch.checkOutTime)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 dark:text-slate-500 italic">On Shift</span>
                                    )}
                                  </div>
                                </td>

                                {/* Duration */}
                                <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {punch.hoursWorked !== undefined ? `${punch.hoursWorked.toFixed(1)} Hrs` : '-'}
                                </td>

                                {/* Geofence Status */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {punch.isGeofenceException !== undefined ? (
                                    isInside ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                        <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                        Inside Site Radius
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                                        <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                        Outside Site Radius
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400 dark:text-slate-500 text-[10px] italic">Within Geofence</span>
                                  )}
                                </td>

                                {/* Site */}
                                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-xs whitespace-nowrap">
                                  <div className="flex items-center gap-1" title={punch.siteName || 'Assigned Site'}>
                                    <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                                    <span className="truncate">{punch.siteName || 'Assigned Site'}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {onNavigateToFullAttendance && (
              <button
                type="button"
                onClick={() => onNavigateToFullAttendance(employeeId, selectedMonth)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Open in Full Monthly Attendance Register
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Print Report
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Print-only rendering of the report: hidden on screen (this modal's interactive
          view is a poor print source -- dark backgrounds, buttons, month navigator, large
          selfie photos), shown only inside @media print via the #attendance-report-printable
          rule in index.css (same visibility-swap technique as EmployeeSummaryPrintModal's
          #employee-summary-printable, extended to also recognise this id). Print Report
          covers exactly what was asked for: employee details, the dashboard summary, and
          the attendance register -- not the Daily Shifts & Selfie Logs photos below it. */}
      {data && (
        <div id="attendance-report-printable" className="hidden print:block bg-white text-slate-900 p-2">
          <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-lg font-extrabold uppercase tracking-tight">Employee Attendance Report</h1>
              <p className="text-xs text-slate-600 mt-0.5">Month: {selectedMonth} &bull; Status: {data.monthStatus}</p>
            </div>
            <div className="text-right text-xs">
              <div className="font-bold">{data.employee.employeeName}</div>
              <div>ID: {data.employee.employeeId} &bull; {data.employee.employeeType}</div>
              <div>{data.employee.designation || '-'} &bull; {data.employee.employeeCompany}</div>
            </div>
          </div>

          {/* Dashboard summary */}
          <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
            <div className="border border-slate-300 rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">Days Worked</div>
              <div className="text-base font-extrabold">{monthlyTotals.days} Days</div>
            </div>
            <div className="border border-slate-300 rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">Hours Worked</div>
              <div className="text-base font-extrabold">{formatHrsMins(monthlyTotals.hours)} Hrs</div>
            </div>
            <div className="border border-slate-300 rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">Overtime</div>
              <div className="text-base font-extrabold">{formatHrsMins(monthlyTotals.overtimeHours)} Hrs</div>
            </div>
            <div className="border border-slate-300 rounded-lg p-2.5">
              <div className="text-[10px] font-bold uppercase text-slate-500">Project Allocation</div>
              <div className="text-sm font-extrabold">{data.employee.assignedProjectCode || 'HO0001'}</div>
              <div className="text-[10px] text-slate-500">{data.employee.assignedProjectName || 'Head Office'}</div>
            </div>
          </div>

          {/* Attendance & Approval Register */}
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1.5">Attendance &amp; Approval Register</h2>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left">
                <th className="py-1.5 pr-2">Date</th>
                <th className="py-1.5 pr-2">Project</th>
                <th className="py-1.5 pr-2 text-center">Start</th>
                <th className="py-1.5 pr-2 text-center">End</th>
                <th className="py-1.5 pr-2 text-center">Reg. (H:M)</th>
                <th className="py-1.5 pr-2 text-center">OT (H:M)</th>
                <th className="py-1.5 pr-2 text-center">Total (H:M)</th>
                <th className="py-1.5 pr-2 text-center">Approval</th>
                <th className="py-1.5 pr-2 text-center">Geofence</th>
                <th className="py-1.5 text-center">Mobility</th>
              </tr>
            </thead>
            <tbody>
              {dailyRegisterRows.map((row) => (
                <tr key={row.punchDate} className="border-b border-slate-200">
                  <td className="py-1 pr-2 font-semibold whitespace-nowrap">{formatDate(row.punchDate)}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{row.projectName || row.projectCode || data.employee.assignedProjectName || '-'}</td>
                  <td className="py-1 pr-2 text-center whitespace-nowrap">{row.startTime ? formatTime(row.startTime) : '-'}</td>
                  <td className="py-1 pr-2 text-center whitespace-nowrap">{row.isOpen ? 'On Shift' : row.endTime ? formatTime(row.endTime) : '-'}</td>
                  <td className="py-1 pr-2 text-center whitespace-nowrap">{formatHrsMins(row.regularHours)}</td>
                  <td className="py-1 pr-2 text-center whitespace-nowrap">{formatHrsMins(row.overtimeHours)}</td>
                  <td className="py-1 pr-2 text-center font-semibold whitespace-nowrap">{formatHrsMins(row.totalHours)}</td>
                  <td className="py-1 pr-2 text-center whitespace-nowrap">{row.approved ? 'Approved' : 'Not-approved'}</td>
                  <td className="py-1 pr-2 text-center whitespace-nowrap">{row.geofencePercent === null ? '-' : `${row.geofencePercent}%`}</td>
                  <td className="py-1 text-center whitespace-nowrap">Coming Soon</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Resolution Selfie Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-lg w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl p-2">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-200">{lightboxImage.title}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 text-slate-400 dark:text-slate-500 hover:text-white rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative p-2 flex items-center justify-center bg-black/50">
              <img
                src={lightboxImage.url}
                alt="Selfie Zoom"
                className="max-h-[75vh] w-auto rounded-lg object-contain shadow-lg"
              />
              {/* Permanent date/time stamp burned onto the top-left corner of the image
                  itself, for both Start and End selfies -- not just the header title. */}
              {lightboxImage.dateTime && (
                <div
                  className="absolute top-4 left-4 max-w-[calc(100%-2rem)] px-2 py-1 rounded-md bg-gradient-to-br from-slate-900/90 to-slate-800/80 ring-1 ring-white/10 text-[11px] font-semibold text-white shadow-md flex items-center gap-1.5 tracking-tight pointer-events-none"
                  title={`${lightboxImage.title}: ${lightboxImage.dateTime}`}
                >
                  <Clock className="w-3 h-3 text-sky-300 shrink-0" />
                  <span className="truncate font-mono">{lightboxImage.dateTime}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
