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

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Employee Attendance Report</h2>
                {data?.employee?.employeeType && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      data.employee.employeeType === 'Staff'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }`}
                  >
                    {data.employee.employeeType}
                  </span>
                )}
                {data?.monthStatus && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                    Status: {data.monthStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {data?.employee?.employeeName || employeeId} • ID:{' '}
                <span className="font-mono font-bold text-slate-700">{employeeId}</span>
                {data?.employee?.designation ? ` • ${data.employee.designation}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Month Navigator */}
            <div className="flex items-center bg-white border border-slate-300 rounded-lg shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-2.5 py-1 text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                {selectedMonth}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p>Loading attendance report for {selectedMonth}...</p>
            </div>
          ) : !data?.hasReport ? (
            /* Empty State: Prompt to Make Attendance Report */
            <div className="py-12 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/60 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-3 shadow-2xs">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                No Attendance Report for {selectedMonth}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                There is currently no attendance register record for{' '}
                <span className="font-semibold text-slate-700">{data?.employee?.employeeName || employeeId}</span> for the month of{' '}
                <span className="font-semibold text-slate-700">{selectedMonth}</span>.
              </p>

              {data && data.punches.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-800 text-left w-full flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
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
                  <p className="text-xs text-slate-400 italic">You need write permissions to create attendance reports.</p>
                )}
              </div>
            </div>
          ) : (
            /* Active Report Overview */
            <>
              {/* Metric Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Days Worked</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">
                    {data.summary.totalDays}{' '}
                    <span className="text-xs font-normal text-slate-500">Days</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Staff / Worker monthly count</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hours Worked</p>
                  <p className="text-xl font-bold text-indigo-700 mt-0.5">
                    {data.summary.totalHours}{' '}
                    <span className="text-xs font-normal text-slate-500">Hrs</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Regular shift hours</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Overtime</p>
                  <p className="text-xl font-bold text-amber-600 mt-0.5">
                    {data.summary.totalOvertimeHours}{' '}
                    <span className="text-xs font-normal text-slate-500">Hrs</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Approved overtime hours</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Project Allocation</p>
                  <p className="text-sm font-bold text-slate-900 mt-1 truncate" title={data.records[0]?.projectName || data.records[0]?.projectCode}>
                    {data.records[0]?.projectCode || 'HO0001'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {data.records[0]?.projectName || 'Head Office'}
                  </p>
                </div>
              </div>

              {/* Monthly Attendance Records Breakdown */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Monthly Register Entries</h3>
                  <span className="text-[11px] text-slate-500">{data.records.length} Project Entry(s)</span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Project Code</th>
                        <th className="py-2.5 px-3">Project Name</th>
                        <th className="py-2.5 px-3 text-center">Days Worked</th>
                        <th className="py-2.5 px-3 text-center">Hours Worked</th>
                        <th className="py-2.5 px-3 text-center">Overtime</th>
                        <th className="py-2.5 px-3 text-right">Month</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {data.records.map((rec) => (
                        <tr key={rec.id || rec.projectCode} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{rec.projectCode}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{rec.projectName || '-'}</td>
                          <td className="py-2.5 px-3 text-center font-semibold">{rec.daysWorked}</td>
                          <td className="py-2.5 px-3 text-center font-semibold">{rec.hoursWorked}</td>
                          <td className="py-2.5 px-3 text-center font-semibold text-amber-600">{rec.overtimeHours || 0}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-500">{rec.payrollMonth}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Daily Shift Punches & Selfies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Daily Shifts &amp; Selfie Logs ({selectedMonth})
                  </h3>
                  <span className="text-[11px] text-slate-500">{data.punches.length} Shift Punch(es)</span>
                </div>

                {data.punches.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/40">
                    No camera shift punches recorded in Supabase Workforce or local mobile punch log for this month yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-semibold">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Start Time &amp; Selfie</th>
                            <th className="py-2.5 px-3">End Time &amp; Selfie</th>
                            <th className="py-2.5 px-3 text-center">Duration</th>
                            <th className="py-2.5 px-3 text-center">Geofence Status</th>
                            <th className="py-2.5 px-3">Site Location</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {data.punches.map((punch) => {
                            const startImg = punch.startSelfieUrl || punch.selfieUrl;
                            const endImg = punch.endSelfieUrl;
                            const isInside = punch.isGeofenceException === false;

                            return (
                              <tr key={punch.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                                  {formatDate(punch.punchDate)}
                                </td>

                                {/* Start Time & Selfie */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {startImg ? (
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage({ url: startImg, title: `Start Shift Selfie - ${punch.punchDate}` })}
                                        className="relative group w-8 h-8 rounded-md overflow-hidden border border-slate-200 hover:border-blue-500 shadow-2xs shrink-0"
                                        title="Click to zoom selfie"
                                      >
                                        <img src={startImg} alt="Start selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                          <Maximize2 className="w-3 h-3 text-white" />
                                        </div>
                                      </button>
                                    ) : (
                                      <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                        <UserRound className="w-4 h-4" />
                                      </div>
                                    )}
                                    <span className="font-mono font-bold text-emerald-700">
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
                                        onClick={() => setLightboxImage({ url: endImg, title: `End Shift Selfie - ${punch.punchDate}` })}
                                        className="relative group w-8 h-8 rounded-md overflow-hidden border border-slate-200 hover:border-blue-500 shadow-2xs shrink-0"
                                        title="Click to zoom selfie"
                                      >
                                        <img src={endImg} alt="End selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                          <Maximize2 className="w-3 h-3 text-white" />
                                        </div>
                                      </button>
                                    ) : punch.checkOutTime ? (
                                      <div className="w-8 h-8 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                        <UserRound className="w-4 h-4" />
                                      </div>
                                    ) : null}
                                    {punch.checkOutTime ? (
                                      <span className="font-mono font-bold text-blue-700">
                                        {formatTime(punch.checkOutTime)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic">On Shift</span>
                                    )}
                                  </div>
                                </td>

                                {/* Duration */}
                                <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                                  {punch.hoursWorked !== undefined ? `${punch.hoursWorked.toFixed(1)} Hrs` : '-'}
                                </td>

                                {/* Geofence Status */}
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {punch.isGeofenceException !== undefined ? (
                                    isInside ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                        Inside Site Radius
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                        <ShieldAlert className="w-3 h-3 text-rose-600" />
                                        Outside Site Radius
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400 text-[10px] italic">Within Geofence</span>
                                  )}
                                </td>

                                {/* Site */}
                                <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs whitespace-nowrap">
                                  <div className="flex items-center gap-1" title={punch.siteName || 'Assigned Site'}>
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
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
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {onNavigateToFullAttendance && (
              <button
                type="button"
                onClick={() => onNavigateToFullAttendance(employeeId, selectedMonth)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                Open in Full Monthly Attendance Register
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
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
                className="p-1 text-slate-400 hover:text-white rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black/50">
              <img
                src={lightboxImage.url}
                alt="Selfie Zoom"
                className="max-h-[75vh] w-auto rounded-lg object-contain shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
