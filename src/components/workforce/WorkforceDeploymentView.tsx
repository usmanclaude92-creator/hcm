import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MultiSelectDropdown, MultiSelectOption } from '../common/MultiSelectDropdown';
import { EmployeeDeploymentCard, type WorkforceShiftStatus } from './EmployeeDeploymentCard';
import { EmployeeAttendanceReportModal } from './EmployeeAttendanceReportModal';
import { Search, RotateCcw, Building, RefreshCw } from 'lucide-react';

const HO0001_CODE = 'HO0001';
const POLL_INTERVAL_MS = 60000;

interface AttendanceRecordRow {
  projectId: string;
  projectCode: string;
  projectName?: string;
  daysWorked: number;
  hoursWorked: number;
  overtimeHours: number;
}

interface AttendanceGroupRow {
  employeeId: string;
  employeeName: string;
  employeeType: 'Staff' | 'Worker';
  employeeCompany: string;
  totalOvertimeHours: number;
  totalDays: number;
  totalHours: number;
  records: AttendanceRecordRow[];
}

interface ProjectRow {
  id: string;
  projectCode: string;
  projectName: string;
  status: 'Active' | 'Inactive';
}

// One row per (employee, section) appearance -- an employee deployed to two
// active projects this month appears once per project.
interface DeploymentEntry {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  employeeCompany: string;
  sectionKey: string; // projectCode (e.g. HO0001 or site code)
  overtimeHours: number; // for this section only (summed if somehow >1 record for the same project)
  hasAttendanceThisMonth: boolean; // across ALL of the employee's records, regardless of project
}

// Present/Absent/Leave classification shared by the HR summary widget, each project
// section's header counts, and the Staff/Worker sub-header counts, so all three always
// agree with each other and with the badge shown on the employee's own card.
// Priority: an approved leave request covering today wins over any shift/attendance
// signal; otherwise a live "today" shift (open, or closed with a clock-out) counts as
// Present; otherwise we fall back to whether the employee has any attendance logged
// this month at all (the only signal available for employees not on the mobile app).
function classifyPresence(
  employeeId: string,
  hasAttendanceThisMonth: boolean,
  shiftStatusByEmployee: Record<string, WorkforceShiftStatus>,
  onLeaveIds: Set<string>
): 'Present' | 'Absent' | 'Leave' {
  const key = employeeId.toUpperCase();
  if (onLeaveIds.has(key)) return 'Leave';
  const shift = shiftStatusByEmployee[key];
  if (shift?.status === 'OPEN') return 'Present';
  if (shift?.status === 'CLOSED' && shift.clockOutAt) return 'Present';
  if (hasAttendanceThisMonth) return 'Present';
  return 'Absent';
}

const COMPANY_OPTIONS: MultiSelectOption[] = [
  { value: 'DGO', label: 'DGO' },
  { value: 'SMI', label: 'SMI' },
  { value: 'NC', label: 'NC' },
  { value: 'Supplier', label: 'Supplier' },
  { value: 'Azad', label: 'Azad' },
];
const EMPLOYEE_TYPE_OPTIONS: MultiSelectOption[] = [
  { value: 'Staff', label: 'Staff' },
  { value: 'Worker', label: 'Worker' },
];
// Only real status this system can currently report -- no GPS/geofence infrastructure
// exists yet. Kept as a proper multi-select (not hardcoded text) so adding real
// statuses later is just a longer option list, no logic change.
const GEOFENCE_OPTIONS: MultiSelectOption[] = [
  { value: 'Inside Site Radius', label: 'Inside Site Radius' },
  { value: 'Outside Site Radius', label: 'Outside Site Radius' },
  { value: 'Not Available', label: 'Not Available' },
];
const MOBILITY_OPTIONS: MultiSelectOption[] = [
  { value: 'Not Configured', label: 'Not Configured' },
];
const ATTENDANCE_STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'Deployed', label: 'Deployed' },
  { value: 'Head Office', label: 'Head Office' },
];

export interface WorkforceDeploymentViewHandle {
  refresh: () => void;
}

interface WorkforceDeploymentViewProps {
  // Lifts the live-poll status up to the Dashboard's own header row, which now owns the
  // LIVE badge + Refresh button UI (this view still owns all fetching/polling itself).
  onStatusChange?: (status: { lastUpdated: Date | null }) => void;
  onSelectEmployee?: (employeeId: string) => void;
}

export const WorkforceDeploymentView = forwardRef<WorkforceDeploymentViewHandle, WorkforceDeploymentViewProps>(({ onStatusChange, onSelectEmployee }, ref) => {
  const { isAdmin } = useAuth();
  const [grouped, setGrouped] = useState<AttendanceGroupRow[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [shiftStatusByEmployee, setShiftStatusByEmployee] = useState<Record<string, WorkforceShiftStatus>>({});
  const [onLeaveIds, setOnLeaveIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-dismiss the sync result banner instead of leaving it on screen indefinitely --
  // it also gets cleared the next time data is refreshed (fetchData below), whichever
  // comes first.
  useEffect(() => {
    if (!syncMessage) return;
    const timer = setTimeout(() => setSyncMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  // Pushes active employees (by Civil ID) into the Artify Workforce app's eligibility
  // list so they can register there. Administrator only -- see server/routes/workforce.ts.
  const handleSyncEligibility = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const data = await apiRequest('/api/workforce/sync-eligibility', { method: 'POST' });
      const s = data?.summary;
      setSyncMessage(
        s
          ? `Synced ${data.synced} employee(s): ${s.lookupUpserted} eligibility record(s) upserted, ${s.employeesRefreshed} already-registered profile(s) refreshed${s.projectsCreated ? `, ${s.projectsCreated} new site(s) created (set their real coordinates in Workforce)` : ''}.`
          : 'Sync completed.'
      );
    } catch (err: any) {
      setSyncMessage(err.message || 'Sync with Workforce failed.');
    } finally {
      setSyncing(false);
    }
  };

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string[]>(COMPANY_OPTIONS.map(o => o.value));
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string[]>(EMPLOYEE_TYPE_OPTIONS.map(o => o.value));
  const [geofenceFilter, setGeofenceFilter] = useState<string[]>(GEOFENCE_OPTIONS.map(o => o.value));
  const [mobilityFilter, setMobilityFilter] = useState<string[]>(MOBILITY_OPTIONS.map(o => o.value));
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<string[]>(ATTENDANCE_STATUS_OPTIONS.map(o => o.value));
  // Seeded once real project data first arrives (empty = "Select All" not yet resolved).
  // Guarded by a ref, not projectOptions.length -- the "Head Office" pseudo-option makes
  // that length non-zero even before allProjects has loaded, which would otherwise lock
  // the seed in with only Head Office selected and no real projects.
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const hasSeededProjectFilter = useRef(false);
  const [reportEmployeeId, setReportEmployeeId] = useState<string | null>(null);

  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const fetchData = async () => {
    // A stale sync banner should not survive a data refresh (manual "Refresh" click or
    // the 60s auto-poll below), on top of the 8s auto-dismiss timer above.
    setSyncMessage(null);

    try {
      setError(null);
      const data = await apiRequest(`/api/attendance?month=${currentMonth}`);
      setGrouped(data.grouped || []);
      setAllProjects(data.allProjects || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch workforce deployment data');
    } finally {
      setLoading(false);
    }

    try {
      const shiftData = await apiRequest(`/api/workforce/shift-status`);
      setShiftStatusByEmployee(shiftData?.statuses || {});
    } catch {
      setShiftStatusByEmployee({});
    }

    // Best-effort: employees on an approved leave request covering today, so the HR
    // summary widget and per-project counts can show them separately from "Absent".
    // Non-fatal if this endpoint isn't reachable for the current role -- everyone just
    // falls back to the Present/Absent classification.
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const leaveData = await apiRequest(`/api/leave/requests?year=${todayStr.slice(0, 4)}&status=Approved`);
      const ids = new Set<string>();
      (leaveData?.requests || []).forEach((r: any) => {
        if (r?.employeeId && r.startDate <= todayStr && todayStr <= r.endDate) {
          ids.add(String(r.employeeId).toUpperCase());
        }
      });
      setOnLeaveIds(ids);
    } catch {
      setOnLeaveIds(new Set());
    }
  };

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  const handleManualRefresh = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
  };

  useImperativeHandle(ref, () => ({ refresh: handleManualRefresh }), []);

  useEffect(() => {
    onStatusChange?.({ lastUpdated });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdated]);

  const activeProjects = useMemo(
    () => allProjects.filter(p => p.status === 'Active'),
    [allProjects]
  );
  const activeProjectCodes = useMemo(() => new Set(activeProjects.map(p => p.projectCode)), [activeProjects]);

  const projectOptions: MultiSelectOption[] = useMemo(
    () => activeProjects.map(p => ({ value: p.projectCode, label: `${p.projectCode} — ${p.projectName}` })),
    [activeProjects]
  );

  // Seed "Select All" exactly once, when real project data first arrives.
  useEffect(() => {
    if (allProjects.length > 0 && !hasSeededProjectFilter.current) {
      hasSeededProjectFilter.current = true;
      setProjectFilter(projectOptions.map(o => o.value));
    }
  }, [allProjects, projectOptions]);

  // Build one DeploymentEntry per (employee, section) appearance. Hours logged
  // against a project that has since gone Inactive don't count toward that
  // (now-hidden) section -- such an employee falls back to HO0001 (Head Office).
  const allEntries: DeploymentEntry[] = useMemo(() => {
    const entries: DeploymentEntry[] = [];
    for (const emp of grouped) {
      const hasAttendanceThisMonth = (Number(emp.totalDays) || 0) > 0 || (Number(emp.totalHours) || 0) > 0;
      const activeRecords = emp.records.filter(
        r => activeProjectCodes.has(r.projectCode) && ((Number(r.daysWorked) || 0) > 0 || (Number(r.hoursWorked) || 0) > 0)
      );
      if (activeRecords.length === 0) {
        entries.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          employeeType: emp.employeeType,
          employeeCompany: emp.employeeCompany,
          sectionKey: HO0001_CODE,
          overtimeHours: emp.totalOvertimeHours || 0,
          hasAttendanceThisMonth,
        });
      } else {
        const byProject = new Map<string, number>();
        activeRecords.forEach(r => {
          byProject.set(r.projectCode, (byProject.get(r.projectCode) || 0) + (Number(r.overtimeHours) || 0));
        });
        byProject.forEach((ot, projectCode) => {
          entries.push({
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            employeeType: emp.employeeType,
            employeeCompany: emp.employeeCompany,
            sectionKey: projectCode,
            overtimeHours: ot,
            hasAttendanceThisMonth,
          });
        });
      }
    }
    return entries;
  }, [grouped, activeProjectCodes]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter(e => {
      if (search) {
        const q = search.trim().toLowerCase();
        if (!e.employeeId.toLowerCase().includes(q) && !e.employeeName.toLowerCase().includes(q)) return false;
      }
      if (!companyFilter.includes(e.employeeCompany)) return false;
      if (!employeeTypeFilter.includes(e.employeeType)) return false;
      const shift = shiftStatusByEmployee[e.employeeId.toUpperCase()];
      const geofenceVal =
        shift?.isInsideGeofence === true
          ? 'Inside Site Radius'
          : shift?.isInsideGeofence === false
          ? 'Outside Site Radius'
          : 'Not Available';
      if (!geofenceFilter.includes(geofenceVal)) return false;
      if (!mobilityFilter.includes('Not Configured')) return false;
      const status = e.sectionKey === HO0001_CODE ? 'Head Office' : 'Deployed';
      if (!attendanceStatusFilter.includes(status)) return false;
      if (!projectFilter.includes(e.sectionKey)) return false;
      return true;
    });
  }, [allEntries, search, companyFilter, employeeTypeFilter, geofenceFilter, mobilityFilter, attendanceStatusFilter, projectFilter]);

  // Projects rendered strictly from Project Master (e.g. HO0001 — Head Office).
  const sections = useMemo(() => {
    const byKey = new Map<string, DeploymentEntry[]>();
    filteredEntries.forEach(e => {
      if (!byKey.has(e.sectionKey)) byKey.set(e.sectionKey, []);
      byKey.get(e.sectionKey)!.push(e);
    });
    const sortByName = (list: DeploymentEntry[]) => [...list].sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    const result: { key: string; title: string; employees: DeploymentEntry[] }[] = [];
    activeProjects.forEach(p => {
      result.push({
        key: p.projectCode,
        title: `PROJECT: ${p.projectCode} — ${p.projectName}`,
        employees: sortByName(byKey.get(p.projectCode) || []),
      });
    });
    return result;
  }, [filteredEntries, activeProjects]);

  // Human Resource summary widget: total active roster, present today, and on leave --
  // each split by Staff/Worker. Built from `grouped` (the deduplicated per-employee
  // roster for the month) rather than the per-project `allEntries`, so an employee
  // deployed to more than one project isn't counted twice.
  const overview = useMemo(() => {
    let totalStaff = 0, totalWorkers = 0;
    let presentStaff = 0, presentWorkers = 0;
    let leaveStaff = 0, leaveWorkers = 0;
    grouped.forEach((emp) => {
      const isStaff = emp.employeeType === 'Staff';
      if (isStaff) totalStaff += 1; else totalWorkers += 1;
      const hasAttendance = (Number(emp.totalDays) || 0) > 0 || (Number(emp.totalHours) || 0) > 0;
      const state = classifyPresence(emp.employeeId, hasAttendance, shiftStatusByEmployee, onLeaveIds);
      if (state === 'Leave') {
        if (isStaff) leaveStaff += 1; else leaveWorkers += 1;
      } else if (state === 'Present') {
        if (isStaff) presentStaff += 1; else presentWorkers += 1;
      }
    });
    return {
      totalStaff, totalWorkers, total: totalStaff + totalWorkers,
      presentStaff, presentWorkers, present: presentStaff + presentWorkers,
      leaveStaff, leaveWorkers, leave: leaveStaff + leaveWorkers,
    };
  }, [grouped, shiftStatusByEmployee, onLeaveIds]);

  const handleResetFilters = () => {
    setSearch('');
    setCompanyFilter(COMPANY_OPTIONS.map(o => o.value));
    setEmployeeTypeFilter(EMPLOYEE_TYPE_OPTIONS.map(o => o.value));
    setGeofenceFilter(GEOFENCE_OPTIONS.map(o => o.value));
    setMobilityFilter(MOBILITY_OPTIONS.map(o => o.value));
    setAttendanceStatusFilter(ATTENDANCE_STATUS_OPTIONS.map(o => o.value));
    setProjectFilter(projectOptions.map(o => o.value));
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading workforce deployment data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>
      )}
      {syncMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 text-xs">{syncMessage}</div>
      )}

      {/* Human Resource Summary Widget */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Human Resource Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Active Employees</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{overview.total}</p>
            <p className="text-[11px] mt-1">
              <span className="text-blue-700 font-semibold">Staff: {overview.totalStaff}</span>
              <span className="mx-1.5 text-slate-300">•</span>
              <span className="text-indigo-700 font-semibold">Workers: {overview.totalWorkers}</span>
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Total Present Employees</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{overview.present}</p>
            <p className="text-[11px] mt-1">
              <span className="text-emerald-700 font-semibold">Staff: {overview.presentStaff}</span>
              <span className="mx-1.5 text-emerald-300">•</span>
              <span className="text-emerald-700 font-semibold">Workers: {overview.presentWorkers}</span>
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Employees on Leave</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{overview.leave}</p>
            <p className="text-[11px] mt-1">
              <span className="text-amber-700 font-semibold">Staff: {overview.leaveStaff}</span>
              <span className="mx-1.5 text-amber-300">•</span>
              <span className="text-amber-700 font-semibold">Workers: {overview.leaveWorkers}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee by ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 flex-1 min-w-0">
            <MultiSelectDropdown allLabel="All Companies" options={COMPANY_OPTIONS} selected={companyFilter} onChange={setCompanyFilter} />
            <MultiSelectDropdown allLabel="All Projects" options={projectOptions} selected={projectFilter} onChange={setProjectFilter} />
            <MultiSelectDropdown allLabel="All Employee Types" options={EMPLOYEE_TYPE_OPTIONS} selected={employeeTypeFilter} onChange={setEmployeeTypeFilter} />
            <MultiSelectDropdown allLabel="All Geofence Statuses" options={GEOFENCE_OPTIONS} selected={geofenceFilter} onChange={setGeofenceFilter} />
            <MultiSelectDropdown allLabel="All Mobility" options={MOBILITY_OPTIONS} selected={mobilityFilter} onChange={setMobilityFilter} />
            <MultiSelectDropdown allLabel="All Attendance Statuses" options={ATTENDANCE_STATUS_OPTIONS} selected={attendanceStatusFilter} onChange={setAttendanceStatusFilter} />
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={handleSyncEligibility}
              disabled={syncing}
              title="Push active employees' Civil ID, name, phone, company and site to the Artify Workforce app so they can register there."
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync with Workforce App'}
            </button>
          )}
        </div>
      </div>

      {/* Sections */}
      {sections.map(section => {
        const classify = (e: DeploymentEntry) => classifyPresence(e.employeeId, e.hasAttendanceThisMonth, shiftStatusByEmployee, onLeaveIds);
        const presentCount = section.employees.filter(e => classify(e) === 'Present').length;
        const absentCount = section.employees.length - presentCount;

        // Staff first, then Workers, separated by a light divider (sorted lists already
        // preserve the alphabetical-by-name order from the `sections` memo above).
        const staffList = section.employees.filter(e => e.employeeType === 'Staff');
        const workerList = section.employees.filter(e => e.employeeType !== 'Staff');
        const staffPresent = staffList.filter(e => classify(e) === 'Present').length;
        const workerPresent = workerList.filter(e => classify(e) === 'Present').length;

        const renderCard = (emp: DeploymentEntry) => {
          const state = classify(emp);
          return (
            <EmployeeDeploymentCard
              key={`${section.key}-${emp.employeeId}`}
              employeeId={emp.employeeId}
              employeeName={emp.employeeName}
              employeeType={emp.employeeType}
              overtimeHours={emp.overtimeHours}
              attendanceStatus={state}
              shiftStatus={shiftStatusByEmployee[emp.employeeId.toUpperCase()]}
              onClick={() => setReportEmployeeId(emp.employeeId)}
            />
          );
        };

        return (
          <div key={section.key} className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 tracking-wide">
                <Building className="w-4 h-4 text-slate-400" />
                {section.title}
              </h3>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span>Total: <span className="text-slate-900 font-bold">{section.employees.length}</span></span>
                <span className="text-emerald-600">Active: <span className="font-bold">{presentCount}</span></span>
                <span className="text-rose-600">Absent: <span className="font-bold">{absentCount}</span></span>
              </div>
            </div>

            {section.employees.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-sm font-semibold">0 Active Employees</p>
                <p className="text-xs mt-1">No employees currently deployed to this project.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {staffList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Staff ({staffList.length})</span>
                      <span className="text-[11px] font-semibold">
                        <span className="text-emerald-600">Present Staff: {staffPresent}</span>
                        <span className="mx-1.5 text-slate-300">•</span>
                        <span className="text-rose-600">Absent Staff: {staffList.length - staffPresent}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {staffList.map(renderCard)}
                    </div>
                  </div>
                )}

                {staffList.length > 0 && workerList.length > 0 && (
                  <div className="border-t border-slate-100" />
                )}

                {workerList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Workers ({workerList.length})</span>
                      <span className="text-[11px] font-semibold">
                        <span className="text-emerald-600">Present Workers: {workerPresent}</span>
                        <span className="mx-1.5 text-slate-300">•</span>
                        <span className="text-rose-600">Absent Workers: {workerList.length - workerPresent}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {workerList.map(renderCard)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Employee Attendance Report Modal */}
      <EmployeeAttendanceReportModal
        employeeId={reportEmployeeId}
        isOpen={Boolean(reportEmployeeId)}
        onClose={() => setReportEmployeeId(null)}
        initialMonth={currentMonth}
        onAttendanceCreated={handleManualRefresh}
        onNavigateToFullAttendance={(empId) => {
          setReportEmployeeId(null);
          onSelectEmployee?.(empId);
        }}
      />
    </div>
  );
});

WorkforceDeploymentView.displayName = 'WorkforceDeploymentView';
