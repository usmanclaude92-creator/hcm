import React, { useState, useMemo } from 'react';
import { Building2, Search, Users } from 'lucide-react';
import { EmployeeDeploymentCard } from './EmployeeDeploymentCard';

const HEAD_OFFICE_KEY = 'HEAD_OFFICE';

export interface AttendanceRecord {
  projectCode: string;
  daysWorked?: number | string;
  hoursWorked?: number | string;
  overtimeHours?: number | string;
  [key: string]: any;
}

export interface GroupedEmployee {
  employeeId: string;
  employeeName: string;
  employeeType?: string;
  employeeCompany?: string;
  totalDays?: number | string;
  totalHours?: number | string;
  totalOvertimeHours?: number;
  records: AttendanceRecord[];
  [key: string]: any;
}

export interface Project {
  projectCode: string;
  projectName: string;
  status?: string;
  [key: string]: any;
}

export interface DeploymentEntry {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  employeeCompany: string;
  sectionKey: string;
  overtimeHours: number;
  hasAttendanceThisMonth: boolean;
  [key: string]: any;
}

export interface WorkforceDeploymentViewProps {
  grouped?: GroupedEmployee[];
  activeProjects?: Project[];
  activeProjectCodes?: Set<string>;
  [key: string]: any;
}

export const WorkforceDeploymentView: React.FC<WorkforceDeploymentViewProps> = ({
  grouped = [],
  activeProjects = [],
  activeProjectCodes = new Set<string>(),
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Dynamically resolve Head Office project code (defaults to HO0001 if present)
  const headOfficeProject = useMemo(() => {
    return activeProjects.find(
      p => p.projectCode === 'HO0001' || p.projectName?.toUpperCase().includes('HEAD OFFICE')
    );
  }, [activeProjects]);

  const defaultProjectCode = headOfficeProject ? headOfficeProject.projectCode : 'HO0001';

  // Build one DeploymentEntry per (employee, section) appearance
  const allEntries: DeploymentEntry[] = useMemo(() => {
    const entries: DeploymentEntry[] = [];

    for (const emp of grouped) {
      const hasAttendanceThisMonth =
        (Number(emp.totalDays) || 0) > 0 || (Number(emp.totalHours) || 0) > 0;

      const activeRecords = (emp.records || []).filter(
        r =>
          activeProjectCodes.has(r.projectCode) &&
          ((Number(r.daysWorked) || 0) > 0 || (Number(r.hoursWorked) || 0) > 0)
      );

      // Map unassigned or newly started shifts to the actual Head Office project (HO0001)
      if (activeRecords.length === 0) {
        entries.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          employeeType: emp.employeeType || 'Staff',
          employeeCompany: emp.employeeCompany || '',
          sectionKey: defaultProjectCode,
          overtimeHours: emp.totalOvertimeHours || 0,
          hasAttendanceThisMonth,
        });
      } else {
        for (const r of activeRecords) {
          entries.push({
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            employeeType: emp.employeeType || 'Staff',
            employeeCompany: emp.employeeCompany || '',
            sectionKey: r.projectCode,
            overtimeHours: Number(r.overtimeHours) || 0,
            hasAttendanceThisMonth,
          });
        }
      }
    }
    return entries;
  }, [grouped, activeProjectCodes, defaultProjectCode]);

  // Filter entries based on search input
  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return allEntries;
    const term = searchTerm.toLowerCase();
    return allEntries.filter(
      e =>
        e.employeeName?.toLowerCase().includes(term) ||
        e.employeeId?.toLowerCase().includes(term) ||
        e.employeeCompany?.toLowerCase().includes(term)
    );
  }, [allEntries, searchTerm]);

  // Build sections: Only create sections for real projects from Project Master
  const sections = useMemo(() => {
    const byKey = new Map<string, DeploymentEntry[]>();
    filteredEntries.forEach(e => {
      if (!byKey.has(e.sectionKey)) byKey.set(e.sectionKey, []);
      byKey.get(e.sectionKey)!.push(e);
    });

    const sortByName = (list: DeploymentEntry[]) =>
      [...list].sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    const result: { key: string; title: string; employees: DeploymentEntry[] }[] = [];

    // Render active projects defined in Project Master (e.g. PROJECT: HO0001 — HEAD OFFICE)
    activeProjects.forEach(p => {
      result.push({
        key: p.projectCode,
        title: `PROJECT: ${p.projectCode} — ${p.projectName}`,
        employees: sortByName(byKey.get(p.projectCode) || []),
      });
    });

    // Only render an Unassigned section if there are orphaned employees that do not match any active project
    const unassigned = byKey.get('UNASSIGNED') || [];
    if (unassigned.length > 0) {
      result.push({
        key: 'UNASSIGNED',
        title: 'UNASSIGNED / GENERAL',
        employees: sortByName(unassigned),
      });
    }

    return result;
  }, [filteredEntries, activeProjects]);

  return (
    <div className="w-full space-y-6">
      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees by name, worker ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-sm text-slate-500 font-medium">
          Total Employees: <span className="font-bold text-slate-800">{filteredEntries.length}</span>
        </div>
      </div>

      {/* Project Sections */}
      <div className="space-y-6">
        {sections.map(section => (
          <div
            key={section.key}
            className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
          >
            {/* Project Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-base uppercase tracking-wide">
                <Building2 className="w-5 h-5 text-slate-500" />
                <span>{section.title}</span>
              </div>
              <div className="text-sm font-medium text-slate-600">
                Active Employees:{' '}
                <span className="font-bold text-slate-900">{section.employees.length}</span>
              </div>
            </div>

            {/* Employee Cards Grid */}
            <div className="p-6">
              {section.employees.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {section.employees.map(emp => (
                    <EmployeeDeploymentCard
                      key={`${emp.employeeId}-${section.key}`}
                      employee={emp}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <div className="font-semibold text-slate-500 mb-1">0 Active Employees</div>
                  <div className="text-sm">No employees currently deployed to this project.</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkforceDeploymentView;
