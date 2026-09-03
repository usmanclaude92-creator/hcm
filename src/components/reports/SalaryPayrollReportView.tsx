import React, { useState, useEffect, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiRequest, formatOMR, downloadAuthenticatedFile } from '../../api/client';
import { MultiSelectDropdown, MultiSelectOption } from '../common/MultiSelectDropdown';
import { SalaryPayrollAnalytics } from './SalaryPayrollAnalytics';
import { SalaryPayrollDetailsTable } from './SalaryPayrollDetailsTable';
import { EmployeeCostProfileModal } from './EmployeeCostProfileModal';
import {
  FileBarChart,
  RefreshCw,
  FileSpreadsheet,
  FileDown,
  Printer,
  Search,
} from 'lucide-react';

const COMPANY_OPTIONS: MultiSelectOption[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'].map(v => ({ value: v, label: v }));
const PAY_BY_OPTIONS: MultiSelectOption[] = ['DGO', 'SMI', 'NC', 'Supplier'].map(v => ({ value: v, label: v }));
const EMPLOYEE_TYPE_OPTIONS: MultiSelectOption[] = [{ value: 'Staff', label: 'Staff' }, { value: 'Worker', label: 'Worker' }];
const WPS_STATUS_OPTIONS: MultiSelectOption[] = [{ value: 'WPS', label: 'WPS' }, { value: 'Non-WPS', label: 'Non-WPS' }];
const PAYMENT_STATUS_OPTIONS: MultiSelectOption[] = ['Unpaid', 'Partially Paid', 'Fully Paid', 'In Revision'].map(v => ({ value: v, label: v }));
const NATIONALITY_OPTIONS: MultiSelectOption[] = [{ value: 'Omani', label: 'Omani' }, { value: 'Expat', label: 'Expat' }];
const PAYROLL_STATUS_OPTIONS: MultiSelectOption[] = [{ value: 'Finalized', label: 'Finalized' }, { value: 'In Revision', label: 'In Revision' }];

// A value that never matches a real record -- used to encode "nothing selected" (as opposed
// to "no filter applied", encoded by omitting the param) to the server-side filter.
const NONE_SENTINEL = '__NONE__';

export interface ReportFilters {
  search: string;
  month: string[];
  company: string[];
  payBy: string[];
  employeeType: string[];
  wpsStatus: string[];
  paymentStatus: string[];
  nationality: string[];
  payrollStatus: string[];
  designation: string[];
  project: string[];
  grossMin?: string;
  grossMax?: string;
  netMin?: string;
  netMax?: string;
  outstandingMin?: string;
  outstandingMax?: string;
}

export const SalaryPayrollReportView: React.FC = () => {
  const [mode, setMode] = useState<'summary' | 'details'>('summary');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const [monthOptions, setMonthOptions] = useState<MultiSelectOption[]>([]);
  const [designationOptions, setDesignationOptions] = useState<MultiSelectOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<MultiSelectOption[]>([]);
  const optionsSeeded = useRef(false);

  const [filters, setFilters] = useState<ReportFilters>({
    search: '',
    month: [],
    company: COMPANY_OPTIONS.map(o => o.value),
    payBy: PAY_BY_OPTIONS.map(o => o.value),
    employeeType: EMPLOYEE_TYPE_OPTIONS.map(o => o.value),
    wpsStatus: WPS_STATUS_OPTIONS.map(o => o.value),
    paymentStatus: PAYMENT_STATUS_OPTIONS.map(o => o.value),
    nationality: NATIONALITY_OPTIONS.map(o => o.value),
    payrollStatus: PAYROLL_STATUS_OPTIONS.map(o => o.value),
    designation: [],
    project: [],
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState('payrollMonth');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupBy, setGroupBy] = useState<string>('');

  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);

  const buildParams = useCallback((forExport = false) => {
    const params = new URLSearchParams();
    const setMulti = (key: string, arr: string[], allOptions: MultiSelectOption[]) => {
      if (arr.length === 0) params.set(key, NONE_SENTINEL);
      else if (arr.length < allOptions.length) params.set(key, arr.join(','));
      // arr.length === allOptions.length -> omit entirely (no restriction)
    };
    if (monthOptions.length > 0) setMulti('month', filters.month, monthOptions);
    setMulti('company', filters.company, COMPANY_OPTIONS);
    setMulti('payBy', filters.payBy, PAY_BY_OPTIONS);
    setMulti('employeeType', filters.employeeType, EMPLOYEE_TYPE_OPTIONS);
    setMulti('wpsStatus', filters.wpsStatus, WPS_STATUS_OPTIONS);
    setMulti('paymentStatus', filters.paymentStatus, PAYMENT_STATUS_OPTIONS);
    setMulti('nationality', filters.nationality, NATIONALITY_OPTIONS);
    setMulti('payrollStatus', filters.payrollStatus, PAYROLL_STATUS_OPTIONS);
    if (designationOptions.length > 0) setMulti('designation', filters.designation, designationOptions);
    if (projectOptions.length > 0) setMulti('project', filters.project, projectOptions);
    if (filters.search) params.set('search', filters.search);
    if (filters.grossMin) params.set('grossMin', filters.grossMin);
    if (filters.grossMax) params.set('grossMax', filters.grossMax);
    if (filters.netMin) params.set('netMin', filters.netMin);
    if (filters.netMax) params.set('netMax', filters.netMax);
    if (filters.outstandingMin) params.set('outstandingMin', filters.outstandingMin);
    if (filters.outstandingMax) params.set('outstandingMax', filters.outstandingMax);

    if (forExport) {
      params.set('pageSize', 'all');
      return params;
    }
    params.set('sortBy', sortBy);
    params.set('sortDir', sortDir);
    if (groupBy) {
      params.set('groupBy', groupBy);
    } else {
      params.set('page', String(page));
      // Summary mode doesn't need row-level data, only summary/analytics/exceptions --
      // keep the payload small rather than transferring the full detail rows twice.
      params.set('pageSize', mode === 'summary' ? '1' : String(pageSize));
    }
    return params;
  }, [filters, monthOptions, designationOptions, projectOptions, page, pageSize, sortBy, sortDir, groupBy, mode]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = buildParams(false);
      const res = await apiRequest(`/api/reports/salary-payroll?${params.toString()}`);
      setData(res);

      if (!optionsSeeded.current) {
        // Seed dynamic filter option universes from an UNFILTERED full fetch so the
        // dropdowns' own option lists never shrink as a side-effect of other filters.
        optionsSeeded.current = true;
        const seedRes = await apiRequest('/api/reports/salary-payroll?pageSize=all');
        const months = Array.from(new Set<string>(seedRes.rows.map((r: any) => r.payrollMonth))).sort();
        const designations = Array.from(new Set<string>(seedRes.rows.map((r: any) => r.designation).filter(Boolean))).sort();
        const projects = Array.from(new Set<string>(
          seedRes.rows.flatMap((r: any) => (r.projectsSummary && r.projectsSummary !== 'No Attendance'
            // "<projectCode> (<value><unit>)" -- the code may itself contain spaces, so strip
            // only the trailing "(...)" suffix rather than naively splitting on the first space.
            ? r.projectsSummary.split(',').map((s: string) => s.trim().replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean)
            : []))
        )).sort();
        setMonthOptions(months.map(m => ({ value: m, label: m })));
        setDesignationOptions(designations.map(d => ({ value: d, label: d })));
        setProjectOptions(projects.map(p => ({ value: p, label: p })));
        // Default all three dynamic multi-selects to "everything selected" once their real
        // option universes are known -- otherwise an empty array reads as "nothing selected"
        // (match-nothing) rather than "no restriction" and silently zeroes the whole report.
        setFilters(prev => ({
          ...prev,
          month: prev.month.length === 0 ? months : prev.month,
          designation: prev.designation.length === 0 ? designations : prev.designation,
          project: prev.project.length === 0 ? projects : prev.project,
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load the salary & payroll report');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, pageSize, sortBy, sortDir, groupBy, mode]);

  const setFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const drillToDetails = (patch: Partial<ReportFilters>) => {
    setMode('details');
    setPage(1);
    setFilters(prev => ({ ...prev, ...patch }));
  };

  const fetchFullFilteredSet = async () => {
    const params = buildParams(true);
    return apiRequest(`/api/reports/salary-payroll?${params.toString()}`);
  };

  const handleExportExcel = async () => {
    try {
      const params = buildParams(true);
      params.set('exportFormat', 'excel');
      await downloadAuthenticatedFile(`/api/reports/salary-payroll?${params.toString()}`, 'Salary_Payroll_Report.xlsx');
    } catch (err: any) {
      alert(err.message || 'Failed to export report.');
    }
  };

  const handleExportPdf = async () => {
    try {
      setExporting(true);
      const full = await fetchFullFilteredSet();
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('Salary & Payroll Report', 14, 16);
      doc.setFontSize(9);
      doc.text(`Reporting Period: ${full.reportingPeriod?.from || '—'} to ${full.reportingPeriod?.to || '—'}`, 14, 22);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
      doc.text(
        `Gross: OMR ${formatOMR(full.summary.grossSalary)}  •  Net: OMR ${formatOMR(full.summary.netSalary)}  •  Paid: OMR ${formatOMR(full.summary.totalPaid)}  •  Outstanding: OMR ${formatOMR(full.summary.totalOutstanding)}`,
        14, 32
      );

      autoTable(doc, {
        startY: 38,
        head: [['Company', 'Pay By', 'Month', 'Employee', 'Gross', 'Additions', 'Deductions', 'Net', 'Paid', 'Outstanding', 'Status']],
        body: full.rows.map((r: any) => [
          r.employeeCompany, r.salaryPaidBy, r.payrollMonth, `${r.employeeId} - ${r.employeeName}`,
          formatOMR(r.grossSalary), formatOMR(r.totalAdditions), formatOMR(r.totalDeductions), formatOMR(r.netSalary),
          r.totalPaid === null ? '—' : formatOMR(r.totalPaid), r.outstanding === null ? '—' : formatOMR(r.outstanding), r.paymentStatus,
        ]),
        foot: [['', '', '', 'TOTAL', formatOMR(full.summary.grossSalary), formatOMR(full.summary.totalAdditions), formatOMR(full.summary.totalDeductions), formatOMR(full.summary.netSalary), formatOMR(full.summary.totalPaid), formatOMR(full.summary.totalOutstanding), '']],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save(`Salary_Payroll_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
      alert(err.message || 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const full = await fetchFullFilteredSet();
      const headers = ['Company', 'Pay By', 'Month', 'Employee ID', 'Employee Name', 'Gross', 'Additions', 'Deductions', 'Net', 'Paid', 'Outstanding', 'Payment Status'];
      const lines = [headers.join(',')];
      full.rows.forEach((r: any) => {
        lines.push([
          r.employeeCompany, r.salaryPaidBy, r.payrollMonth, r.employeeId, `"${r.employeeName}"`,
          r.grossSalary, r.totalAdditions, r.totalDeductions, r.netSalary,
          r.totalPaid ?? '', r.outstanding ?? '', r.paymentStatus,
        ].join(','));
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Salary_Payroll_Report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-blue-600" />
            Salary & Payroll Report
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={fetchReport} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleExportExcel} disabled={exporting} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Export Excel
          </button>
          <button onClick={handleExportPdf} disabled={exporting} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50">
            <FileDown className="w-3.5 h-3.5 text-rose-600" /> Export PDF
          </button>
          <button onClick={handleExportCsv} disabled={exporting} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50">
            <FileDown className="w-3.5 h-3.5 text-blue-600" /> Export CSV
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          {error}
        </div>
      )}

      {/* Mode Switch */}
      <div className="inline-flex bg-slate-100 rounded-lg p-1 print:hidden">
        {(['summary', 'details'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer uppercase tracking-wide ${
              mode === m ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3 print:hidden">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee by ID, name, designation, company, or project..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <MultiSelectDropdown allLabel="All Months" options={monthOptions} selected={filters.month} onChange={(v) => setFilter('month', v)} />
          <MultiSelectDropdown allLabel="All Companies" options={COMPANY_OPTIONS} selected={filters.company} onChange={(v) => setFilter('company', v)} />
          <MultiSelectDropdown allLabel="All Paid By" options={PAY_BY_OPTIONS} selected={filters.payBy} onChange={(v) => setFilter('payBy', v)} />
          <MultiSelectDropdown allLabel="All Employee Types" options={EMPLOYEE_TYPE_OPTIONS} selected={filters.employeeType} onChange={(v) => setFilter('employeeType', v)} />
          <MultiSelectDropdown allLabel="All WPS Statuses" options={WPS_STATUS_OPTIONS} selected={filters.wpsStatus} onChange={(v) => setFilter('wpsStatus', v)} />
          <MultiSelectDropdown allLabel="All Payment Statuses" options={PAYMENT_STATUS_OPTIONS} selected={filters.paymentStatus} onChange={(v) => setFilter('paymentStatus', v)} />
          <MultiSelectDropdown allLabel="All Nationalities" options={NATIONALITY_OPTIONS} selected={filters.nationality} onChange={(v) => setFilter('nationality', v)} />
          <MultiSelectDropdown allLabel="All Payroll Statuses" options={PAYROLL_STATUS_OPTIONS} selected={filters.payrollStatus} onChange={(v) => setFilter('payrollStatus', v)} />
          <MultiSelectDropdown allLabel="All Designations" options={designationOptions} selected={filters.designation} onChange={(v) => setFilter('designation', v)} />
          <MultiSelectDropdown allLabel="All Projects" options={projectOptions} selected={filters.project} onChange={(v) => setFilter('project', v)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          {([
            ['Gross', 'grossMin', 'grossMax'],
            ['Net', 'netMin', 'netMax'],
            ['Outstanding', 'outstandingMin', 'outstandingMax'],
          ] as const).map(([label, minKey, maxKey]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium w-16 shrink-0">{label}</span>
              <input type="number" placeholder="Min" value={(filters as any)[minKey] || ''} onChange={(e) => setFilter(minKey, e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-[11px]" />
              <input type="number" placeholder="Max" value={(filters as any)[maxKey] || ''} onChange={(e) => setFilter(maxKey, e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-[11px]" />
            </div>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="p-10 text-center text-xs text-slate-400">Loading salary & payroll report...</div>
      )}

      {data && mode === 'summary' && (
        <SalaryPayrollAnalytics
          analytics={data.analytics}
          onCompanyClick={(company) => drillToDetails({ company: [company] })}
        />
      )}

      {data && mode === 'details' && (
        <SalaryPayrollDetailsTable
          data={data}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          sortDir={sortDir}
          groupBy={groupBy}
          onPageChange={setPage}
          onPageSizeChange={(n) => { setPage(1); setPageSize(n); }}
          onSortChange={(col, dir) => { setSortBy(col); setSortDir(dir); }}
          onGroupByChange={setGroupBy}
          onRowClick={(employeeId) => setProfileEmployeeId(employeeId)}
        />
      )}

      {profileEmployeeId && (
        <EmployeeCostProfileModal employeeId={profileEmployeeId} onClose={() => setProfileEmployeeId(null)} />
      )}
    </div>
  );
};
