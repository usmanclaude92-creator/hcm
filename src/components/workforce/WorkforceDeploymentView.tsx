import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { apiRequest } from '../../api/client';
import { MultiSelectDropdown, MultiSelectOption } from '../common/MultiSelectDropdown';
import { EmployeeDeploymentCard, type WorkforceShiftStatus } from './EmployeeDeploymentCard';
import { Search, RotateCcw, Building } from 'lucide-react';

const HEAD_OFFICE_KEY = 'HEAD_OFFICE';
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
// active projects this month appears once per project, never under Head Office.
interface DeploymentEntry {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  employeeCompany: string;
  sectionKey: string; // HEAD_OFFICE_KEY or a projectCode
  overtimeHours: number; // for this section only (summed if somehow >1 record for the same project)
  hasAttendanceThisMonth: boolean; // across ALL of the employee's records, regardless of project
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
  const [grouped, setGrouped] = useState<AttendanceGroupRow[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [shiftStatusByEmployee, setShiftStatusByEmployee] = useState<Record<string, WorkforceShiftStatus>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    () => [
      { value: HEAD_OFFICE_KEY, label: 'Head Office' },
      ...activeProjects.map(p => ({ value: p.projectCode, label: `${p.projectCode} — ${p.projectName}` })),
    ],
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
  // (now-hidden) section -- such an employee falls back to Head Office.
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
          sectionKey: HEAD_OFFICE_KEY,
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
      if (!geofenceFilter.includes('Not Available')) return false;
      if (!mobilityFilter.includes('Not Configured')) return false;
      const status = e.sectionKey === HEAD_OFFICE_KEY ? 'Head Office' : 'Deployed';
      if (!attendanceStatusFilter.includes(status)) return false;
      if (!projectFilter.includes(e.sectionKey)) return false;
      return true;
    });
  }, [allEntries, search, companyFilter, employeeTypeFilter, geofenceFilter, mobilityFilter, attendanceStatusFilter, projectFilter]);

  // Head Office first, then each active project in Project Master's own order.
  const sections = useMemo(() => {
    const byKey = new Map<string, DeploymentEntry[]>();
    filteredEntries.forEach(e => {
      if (!byKey.has(e.sectionKey)) byKey.set(e.sectionKey, []);
      byKey.get(e.sectionKey)!.push(e);
    });
    const sortByName = (list: DeploymentEntry[]) => [...list].sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    const result: { key: string; title: string; employees: DeploymentEntry[] }[] = [
      { key: HEAD_OFFICE_KEY, title: 'HEAD OFFICE', employees: sortByName(byKey.get(HEAD_OFFICE_KEY) || []) },
    ];
    activeProjects.forEach(p => {
      result.push({
        key: p.projectCode,
        title: `PROJECT: ${p.projectCode} — ${p.projectName}`,
        employees: sortByName(byKey.get(p.projectCode) || []),
      });
    });
    return result;
  }, [filteredEntries, activeProjects]);

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
        </div>
      </div>

      {/* Sections */}
      {sections.map(section => (
        <div key={section.key} className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 tracking-wide">
              <Building className="w-4 h-4 text-slate-400" />
              {section.title}
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              Active Employees: <span className="text-slate-900 font-bold">{section.employees.length}</span>
            </span>
          </div>

          {section.employees.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <p className="text-sm font-semibold">0 Active Employees</p>
              <p className="text-xs mt-1">No employees currently deployed to this {section.key === HEAD_OFFICE_KEY ? 'section' : 'project'}.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {section.employees.map(emp => (
                <EmployeeDeploymentCard
                  key={`${section.key}-${emp.employeeId}`}
                  employeeId={emp.employeeId}
                  employeeName={emp.employeeName}
                  employeeType={emp.employeeType}
                  overtimeHours={emp.overtimeHours}
                  attendanceStatus={emp.hasAttendanceThisMonth ? 'Present' : 'Absent'}
                  shiftStatus={shiftStatusByEmployee[emp.employeeId.toUpperCase()]}
                  onClick={() => onSelectEmployee?.(emp.employeeId)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

WorkforceDeploymentView.displayName = 'WorkforceDeploymentView';
