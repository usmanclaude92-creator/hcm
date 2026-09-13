import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MultiSelectDropdown, MultiSelectOption } from '../common/MultiSelectDropdown';
import { EmployeeDeploymentCard, type WorkforceShiftStatus } from './EmployeeDeploymentCard';
import { EmployeeAttendanceReportModal } from './EmployeeAttendanceReportModal';
import { Search, RotateCcw, Building, RefreshCw } from 'lucide-react';
import { isShiftDateToday, businessDateStr } from '../../utils/workforceShiftUtils';

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
  // Employee Master's "home site" assignment (Employee.assignedProjectCode) -- distinct
  // from `records`, which only reflects hours actually logged this month. Used so a
  // newly-assigned employee with zero attendance logged yet still shows under their real
  // project instead of falling back to Head Office.
  assignedProjectCode?: string | null;
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

// Exactly one row per employee -- one card per registered employee, full stop. An
// earlier version could add a second row for an employee who had hours logged against
// an active project other than their current Employee Master assignment, which showed
// the same person's card twice (once per project). See `allEntries` below for how the
// single section is chosen.
interface DeploymentEntry {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  employeeCompany: string;
  sectionKey: string; // projectCode (e.g. HO0001 or site code)
  overtimeHours: number;
  hasAttendanceThisMonth: boolean;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pushes active employees (by Civil ID) into the Artify Workforce app's eligibility
  // list so they can register there. Administrator only -- see server/routes/workforce.ts.
  // No confirmation banner is shown on success (by design) -- a genuine failure still
  // surfaces via the page's existing error banner so it isn't silently swallowed.
  const handleSyncEligibility = async () => {
    setSyncing(true);
    try {
      await apiRequest('/api/workforce/sync-eligibility', { method: 'POST' });
      handleManualRefresh();
    } catch (err: any) {
      setError(err.message || 'Sync with Workforce failed.');
    } finally {
      setSyncing(false);
    }
  };

  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string[]>(COMPANY_OPTIONS.map(o => o.value));
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string[]>(EMPLOYEE_TYPE_OPTIONS.map(o => o.value));
  const [geofenceFilter, setGeofenceFilter] = useState<string[]>(GEOFENCE_OPTIONS.map(o => o.value));
  const [mobilityFilter, setMobilityFilter] = useState<string[]>(MOBILITY_OPTIONS.map(o => o.value));
  // Seeded once real project data first arrives (empty = "Select All" not yet resolved).
  // Guarded by a ref, not projectOptions.length -- the "Head Office" pseudo-option makes
  // that length non-zero even before allProjects has loaded, which would otherwise lock
  // the seed in with only Head Office selected and no real projects.
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const hasSeededProjectFilter = useRef(false);
  const [reportEmployeeId, setReportEmployeeId] = useState<string | null>(null);

  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const fetchData = async () => {
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
      // Business-local (Oman) date, not raw UTC -- consistent with how shift_date/
      // isShiftDateToday determine "today" elsewhere on this dashboard, so a leave day's
      // boundary doesn't disagree with the shift/selfie boundary by the same few hours.
      const todayStr = businessDateStr();
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

  // Build one DeploymentEntry per (employee, section) appearance. An employee's real
  // Employee Master assignment (assignedProjectCode) always gets a card under that
  // project -- even with zero hours logged yet this month -- so a newly-synced or
  // newly-assigned employee shows up where they actually work, not under Head Office
  // just because nothing has been logged against them yet. Hours logged against a
  // second active project this month (or against a project that has since gone
  // Inactive) still surface as additional/fallback sections as before.
  const allEntries: DeploymentEntry[] = useMemo(() => {
    const entries: DeploymentEntry[] = [];
    for (const emp of grouped) {
      const hasAttendanceThisMonth = (Number(emp.totalDays) || 0) > 0 || (Number(emp.totalHours) || 0) > 0;

      // Exactly one section per employee -- their current Employee Master assignment
      // (assignedProjectCode) if it's an active project; otherwise the active project
      // they logged the most hours against this month; otherwise Head Office. A prior
      // version emitted one entry for the assigned project AND a separate entry for any
      // active project with logged hours, which showed the same employee's card twice
      // whenever those two projects differed (e.g. reassigned mid-month, or hours logged
      // before the reassignment took effect).
      let sectionKey: string = HO0001_CODE;
      if (emp.assignedProjectCode && activeProjectCodes.has(emp.assignedProjectCode)) {
        sectionKey = emp.assignedProjectCode;
      } else {
        const activeRecords = emp.records.filter(
          r => activeProjectCodes.has(r.projectCode) && ((Number(r.daysWorked) || 0) > 0 || (Number(r.hoursWorked) || 0) > 0)
        );
        if (activeRecords.length > 0) {
          const hoursByProject = new Map<string, number>();
          activeRecords.forEach(r => {
            hoursByProject.set(r.projectCode, (hoursByProject.get(r.projectCode) || 0) + (Number(r.hoursWorked) || 0));
          });
          let bestCode = activeRecords[0].projectCode;
          let bestHours = -1;
          hoursByProject.forEach((hrs, code) => {
            if (hrs > bestHours) {
              bestHours = hrs;
              bestCode = code;
            }
          });
          sectionKey = bestCode;
        }
      }

      entries.push({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        employeeType: emp.employeeType,
        employeeCompany: emp.employeeCompany,
        sectionKey,
        overtimeHours: emp.totalOvertimeHours || 0,
        hasAttendanceThisMonth,
      });
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
      // A geofence result only counts for today's filter classification when it's
      // actually today's shift -- otherwise a stale/prior-day value (or polling lag)
      // would bucket the employee as Inside/Outside while their card itself correctly
      // shows the "not captured" grey state. Keeps the filter and the card in sync.
      const shift = shiftStatusByEmployee[e.employeeId.toUpperCase()];
      const shiftIsToday = isShiftDateToday(shift?.shiftDate);
      const geofenceVal =
        shiftIsToday && shift?.isInsideGeofence === true
          ? 'Inside Site Radius'
          : shiftIsToday && shift?.isInsideGeofence === false
          ? 'Outside Site Radius'
          : 'Not Available';
      if (!geofenceFilter.includes(geofenceVal)) return false;
      if (!mobilityFilter.includes('Not Configured')) return false;
      if (!projectFilter.includes(e.sectionKey)) return false;
      return true;
    });
  }, [allEntries, search, companyFilter, employeeTypeFilter, geofenceFilter, mobilityFilter, projectFilter]);

  // True as soon as any toolbar filter narrows the roster below its "All ..." default --
  // used to hide empty project sections only while filtering, not on the default view.
  const hasActiveFilters = useMemo(
    () =>
      search.trim() !== '' ||
      companyFilter.length !== COMPANY_OPTIONS.length ||
      employeeTypeFilter.length !== EMPLOYEE_TYPE_OPTIONS.length ||
      geofenceFilter.length !== GEOFENCE_OPTIONS.length ||
      mobilityFilter.length !== MOBILITY_OPTIONS.length ||
      projectFilter.length !== projectOptions.length,
    [search, companyFilter, employeeTypeFilter, geofenceFilter, mobilityFilter, projectFilter, projectOptions]
  );

  // Projects rendered strictly from Project Master (e.g. HO0001 — Head Office).
  const sections = useMemo(() => {
    const byKey = new Map<string, DeploymentEntry[]>();
    filteredEntries.forEach(e => {
      if (!byKey.has(e.sectionKey)) byKey.set(e.sectionKey, []);
      byKey.get(e.sectionKey)!.push(e);
    });
    const sortByName = (list: DeploymentEntry[]) => [...list].sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    // Head Office is always pinned first; every other project keeps its existing
    // (stable) order after it.
    const orderedProjects = [...activeProjects].sort((a, b) => {
      const aIsHO = a.projectCode === HO0001_CODE;
      const bIsHO = b.projectCode === HO0001_CODE;
      if (aIsHO === bIsHO) return 0;
      return aIsHO ? -1 : 1;
    });

    const result: { key: string; title: string; employees: DeploymentEntry[] }[] = [];
    orderedProjects.forEach(p => {
      result.push({
        key: p.projectCode,
        title: `PROJECT: ${p.projectCode} — ${p.projectName}`,
        employees: sortByName(byKey.get(p.projectCode) || []),
      });
    });
    // Once any filter is actively narrowing the roster, a project with nothing left in
    // it is filter noise, not useful context -- drop it. With no filters applied, every
    // project still shows (including empty ones) as before.
    return hasActiveFilters ? result.filter(s => s.employees.length > 0) : result;
  }, [filteredEntries, activeProjects, hasActiveFilters]);

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
    // Absent = Total - Present - Leave, per type -- classifyPresence's three states are
    // mutually exclusive and exhaustive, so this is exact, not an estimate.
    const absentStaff = totalStaff - presentStaff - leaveStaff;
    const absentWorkers = totalWorkers - presentWorkers - leaveWorkers;
    return {
      totalStaff, totalWorkers, total: totalStaff + totalWorkers,
      presentStaff, presentWorkers, present: presentStaff + presentWorkers,
      leaveStaff, leaveWorkers, leave: leaveStaff + leaveWorkers,
      absentStaff, absentWorkers, absent: absentStaff + absentWorkers,
    };
  }, [grouped, shiftStatusByEmployee, onLeaveIds]);

  const handleResetFilters = () => {
    setSearch('');
    setCompanyFilter(COMPANY_OPTIONS.map(o => o.value));
    setEmployeeTypeFilter(EMPLOYEE_TYPE_OPTIONS.map(o => o.value));
    setGeofenceFilter(GEOFENCE_OPTIONS.map(o => o.value));
    setMobilityFilter(MOBILITY_OPTIONS.map(o => o.value));
    setProjectFilter(projectOptions.map(o => o.value));
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading workforce deployment data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-700 dark:text-rose-300 text-xs">{error}</div>
      )}

      {/* Human Resource Summary Widget -- each tile is 2 lines: label + total, then the
          Staff/Workers breakdown. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs p-4">
        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3">Human Resource Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Active Employees: <span className="text-base font-bold text-slate-900 dark:text-slate-100 normal-case">{overview.total}</span>
            </p>
            <p className="text-[11px] mt-1">
              <span className="text-blue-700 dark:text-blue-300 font-semibold">Staff: {overview.totalStaff}</span>
              <span className="mx-1.5 text-slate-300">•</span>
              <span className="text-indigo-700 dark:text-indigo-300 font-semibold">Workers: {overview.totalWorkers}</span>
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/60">
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
              Total Present Employees: <span className="text-base font-bold text-emerald-700 dark:text-emerald-300 normal-case">{overview.present}</span>
            </p>
            <p className="text-[11px] mt-1">
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Staff: {overview.presentStaff}</span>
              <span className="mx-1.5 text-emerald-300">•</span>
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Workers: {overview.presentWorkers}</span>
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/60">
            <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 uppercase tracking-wider">
              Total Absent Employees: <span className="text-base font-bold text-rose-700 dark:text-rose-300 normal-case">{overview.absent}</span>
            </p>
            <p className="text-[11px] mt-1">
              <span className="text-rose-700 dark:text-rose-300 font-semibold">Staff: {overview.absentStaff}</span>
              <span className="mx-1.5 text-rose-300">•</span>
              <span className="text-rose-700 dark:text-rose-300 font-semibold">Workers: {overview.absentWorkers}</span>
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/60">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              Employees on Leave: <span className="text-base font-bold text-amber-700 dark:text-amber-300 normal-case">{overview.leave}</span>
            </p>
            <p className="text-[11px] mt-1">
              <span className="text-amber-700 dark:text-amber-300 font-semibold">Staff: {overview.leaveStaff}</span>
              <span className="mx-1.5 text-amber-300">•</span>
              <span className="text-amber-700 dark:text-amber-300 font-semibold">Workers: {overview.leaveWorkers}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar -- search + all filters + actions in a single wrapping row. */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-52 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee by ID or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <MultiSelectDropdown allLabel="All Companies" options={COMPANY_OPTIONS} selected={companyFilter} onChange={setCompanyFilter} />
          <MultiSelectDropdown allLabel="All Projects" options={projectOptions} selected={projectFilter} onChange={setProjectFilter} />
          <MultiSelectDropdown allLabel="All Employee Types" options={EMPLOYEE_TYPE_OPTIONS} selected={employeeTypeFilter} onChange={setEmployeeTypeFilter} />
          <MultiSelectDropdown allLabel="All Geofence Statuses" options={GEOFENCE_OPTIONS} selected={geofenceFilter} onChange={setGeofenceFilter} />
          <MultiSelectDropdown allLabel="All Mobility" options={MOBILITY_OPTIONS} selected={mobilityFilter} onChange={setMobilityFilter} />
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors cursor-pointer shrink-0"
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer shrink-0"
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
          <div key={section.key} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs p-4">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2 tracking-wide">
                <Building className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                {section.title}
              </h3>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>Total: <span className="text-slate-900 dark:text-slate-100 font-bold">{section.employees.length}</span></span>
                <span className="text-emerald-600 dark:text-emerald-400">Present: <span className="font-bold">{presentCount}</span></span>
                <span className="text-rose-600 dark:text-rose-400">Absent: <span className="font-bold">{absentCount}</span></span>
              </div>
            </div>

            {section.employees.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                <p className="text-sm font-semibold">0 Active Employees</p>
                <p className="text-xs mt-1">No employees currently deployed to this project.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {staffList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Staff ({staffList.length})</span>
                      <span className="text-[11px] font-semibold">
                        <span className="text-emerald-600 dark:text-emerald-400">Present Staff: {staffPresent}</span>
                        <span className="mx-1.5 text-slate-300">•</span>
                        <span className="text-rose-600 dark:text-rose-400">Absent Staff: {staffList.length - staffPresent}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {staffList.map(renderCard)}
                    </div>
                  </div>
                )}

                {staffList.length > 0 && workerList.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800" />
                )}

                {workerList.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                      <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Workers ({workerList.length})</span>
                      <span className="text-[11px] font-semibold">
                        <span className="text-emerald-600 dark:text-emerald-400">Present Workers: {workerPresent}</span>
                        <span className="mx-1.5 text-slate-300">•</span>
                        <span className="text-rose-600 dark:text-rose-400">Absent Workers: {workerList.length - workerPresent}</span>
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
