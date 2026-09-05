import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatOMR } from '../../api/client';
import {
  Search,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  FileSpreadsheet,
} from 'lucide-react';

interface PayrollReportTabProps {
  reportData: any;
  month: string;
}

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  employeeId: 130,
  employeeName: 200,
  employeeType: 100,
  designation: 140,
  employeeCompany: 110,
  worked: 100,
  grossSalary: 120,
  totalAdditions: 110,
  totalDeductions: 110,
  netSalary: 130,
  paymentMethod: 110,
};

const MIN_COLUMN_WIDTHS: Record<string, number> = {
  employeeId: 90,
  employeeName: 130,
  employeeType: 75,
  designation: 90,
  employeeCompany: 80,
  worked: 80,
  grossSalary: 90,
  totalAdditions: 85,
  totalDeductions: 85,
  netSalary: 95,
  paymentMethod: 80,
};

type SortColumn =
  | 'default'
  | 'employeeId'
  | 'employeeName'
  | 'employeeType'
  | 'designation'
  | 'employeeCompany'
  | 'worked'
  | 'grossSalary'
  | 'totalAdditions'
  | 'totalDeductions'
  | 'netSalary'
  | 'paymentMethod';

type SortDirection = 'asc' | 'desc';

export const PayrollReportTab: React.FC<PayrollReportTabProps> = ({ reportData, month }) => {
  // Column resizing state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('report_payroll_col_widths_v1');
      if (saved) {
        return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMN_WIDTHS;
  });

  const resizingRef = useRef<{
    colKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const [resizingCol, setResizingCol] = useState<string | null>(null);

  const handleStartResize = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 120;
    resizingRef.current = {
      colKey,
      startX: e.clientX,
      startWidth,
    };
    setResizingCol(colKey);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { colKey, startX, startWidth } = resizingRef.current;
      const deltaX = e.clientX - startX;
      const minW = MIN_COLUMN_WIDTHS[colKey] || 60;
      const newWidth = Math.max(minW, startWidth + deltaX);
      setColumnWidths(prev => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        setResizingCol(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setColumnWidths(current => {
          try {
            localStorage.setItem('report_payroll_col_widths_v1', JSON.stringify(current));
          } catch {
            // ignore
          }
          return current;
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResetColumnWidth = (colKey: string) => {
    setColumnWidths(prev => {
      const next = { ...prev, [colKey]: DEFAULT_COLUMN_WIDTHS[colKey] };
      try {
        localStorage.setItem('report_payroll_col_widths_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetAllColumns = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('report_payroll_col_widths_v1');
    } catch {
      // ignore
    }
  };

  const isColumnsResized = Object.keys(DEFAULT_COLUMN_WIDTHS).some(
    k => columnWidths[k] !== DEFAULT_COLUMN_WIDTHS[k]
  );

  const totalTableWidth = (Object.values(columnWidths) as number[]).reduce((sum: number, w: number) => sum + (Number(w) || 0), 0);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCompany, setFilterCompany] = useState('ALL');
  const [filterJob, setFilterJob] = useState('ALL');
  const [filterMethod, setFilterMethod] = useState('ALL');

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn('default');
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (col: SortColumn) => {
    if (sortColumn === col) {
      return sortDirection === 'asc' ? (
        <ArrowUp className="w-3.5 h-3.5 text-blue-600 inline ml-1" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-blue-600 inline ml-1" />
      );
    }
    return <ArrowUpDown className="w-3 h-3 text-slate-400 inline ml-1 opacity-40 group-hover:opacity-100 transition-opacity" />;
  };

  const renderResizer = (colKey: string, label: string) => (
    <div
      onMouseDown={(e) => handleStartResize(e, colKey)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        handleResetColumnWidth(colKey);
      }}
      className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize select-none touch-none flex items-center justify-center z-20 group/resizer ${
        resizingCol === colKey
          ? 'bg-blue-600/30'
          : 'hover:bg-blue-500/20 active:bg-blue-600/40'
      }`}
      title={`Drag to resize ${label} column (double-click to reset)`}
    >
      <div
        className={`w-[2px] transition-all rounded-full ${
          resizingCol === colKey
            ? 'bg-blue-600 h-full'
            : 'h-3.5 bg-slate-300 group-hover/resizer:bg-blue-500 group-hover/resizer:h-full'
        }`}
      />
    </div>
  );

  const rawLines: any[] = reportData?.lines || [];

  // Dropdown options
  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    rawLines.forEach(l => {
      if (l.employeeCompany) set.add(l.employeeCompany);
    });
    return Array.from(set).sort();
  }, [rawLines]);

  const uniqueJobs = useMemo(() => {
    const set = new Set<string>();
    rawLines.forEach(l => {
      if (l.designation) set.add(l.designation);
    });
    return Array.from(set).sort();
  }, [rawLines]);

  const uniqueMethods = useMemo(() => {
    const set = new Set<string>();
    rawLines.forEach(l => {
      if (l.paymentMethod) set.add(l.paymentMethod);
    });
    return Array.from(set).sort();
  }, [rawLines]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterType !== 'ALL' ||
    filterCompany !== 'ALL' ||
    filterJob !== 'ALL' ||
    filterMethod !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterType('ALL');
    setFilterCompany('ALL');
    setFilterJob('ALL');
    setFilterMethod('ALL');
  };

  // Filter lines
  const filteredLines = useMemo(() => {
    return rawLines.filter((l) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const empId = (l.employeeId || '').toLowerCase();
        const empName = (l.employeeName || '').toLowerCase();
        const desig = (l.designation || '').toLowerCase();
        const comp = (l.employeeCompany || '').toLowerCase();
        const proj = (l.projectsSummary || '').toLowerCase();
        if (
          !empId.includes(query) &&
          !empName.includes(query) &&
          !desig.includes(query) &&
          !comp.includes(query) &&
          !proj.includes(query)
        ) {
          return false;
        }
      }
      if (filterType !== 'ALL' && l.employeeType !== filterType) return false;
      if (filterCompany !== 'ALL' && l.employeeCompany !== filterCompany) return false;
      if (filterJob !== 'ALL' && l.designation !== filterJob) return false;
      if (filterMethod !== 'ALL' && l.paymentMethod !== filterMethod) return false;
      return true;
    });
  }, [rawLines, searchQuery, filterType, filterCompany, filterJob, filterMethod]);

  // Sort lines
  const sortedLines = useMemo(() => {
    return [...filteredLines].sort((a, b) => {
      const runDefaultSort = () => {
        // Hierarchical sort: Type (Staff first, Worker second) -> Company -> Employee ID numeric
        const typeRankA = a.employeeType === 'Staff' ? 0 : 1;
        const typeRankB = b.employeeType === 'Staff' ? 0 : 1;
        if (typeRankA !== typeRankB) return typeRankA - typeRankB;

        const compCmp = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
        if (compCmp !== 0) return compCmp;

        return (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
      };

      if (sortColumn === 'default') {
        return runDefaultSort();
      }

      let diff = 0;
      switch (sortColumn) {
        case 'employeeId':
          diff = (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
          break;
        case 'employeeName':
          diff = (a.employeeName || '').localeCompare(b.employeeName || '');
          break;
        case 'employeeType': {
          const tA = a.employeeType === 'Staff' ? 0 : 1;
          const tB = b.employeeType === 'Staff' ? 0 : 1;
          diff = tA - tB;
          break;
        }
        case 'designation':
          diff = (a.designation || '').localeCompare(b.designation || '');
          break;
        case 'employeeCompany':
          diff = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
          break;
        case 'worked': {
          const valA = a.employeeType === 'Staff' ? a.daysWorked : a.hoursWorked;
          const valB = b.employeeType === 'Staff' ? b.daysWorked : b.hoursWorked;
          diff = (valA || 0) - (valB || 0);
          break;
        }
        case 'grossSalary':
          diff = (a.grossSalary || 0) - (b.grossSalary || 0);
          break;
        case 'totalAdditions':
          diff = (a.totalAdditions || 0) - (b.totalAdditions || 0);
          break;
        case 'totalDeductions':
          diff = (a.totalDeductions || 0) - (b.totalDeductions || 0);
          break;
        case 'netSalary':
          diff = (a.netSalary || 0) - (b.netSalary || 0);
          break;
        case 'paymentMethod':
          diff = (a.paymentMethod || '').localeCompare(b.paymentMethod || '');
          break;
        default:
          return runDefaultSort();
      }

      if (diff !== 0) {
        return sortDirection === 'asc' ? diff : -diff;
      }
      return runDefaultSort();
    });
  }, [filteredLines, sortColumn, sortDirection]);

  // Aggregate totals for the filtered set
  const filteredGross = useMemo(() => sortedLines.reduce((s, l) => s + (Number(l.grossSalary) || 0), 0), [sortedLines]);
  const filteredAdditions = useMemo(() => sortedLines.reduce((s, l) => s + (Number(l.totalAdditions) || 0), 0), [sortedLines]);
  const filteredDeductions = useMemo(() => sortedLines.reduce((s, l) => s + (Number(l.totalDeductions) || 0), 0), [sortedLines]);
  const filteredNet = useMemo(() => sortedLines.reduce((s, l) => s + (Number(l.netSalary) || 0), 0), [sortedLines]);

  return (
    <div className="space-y-4">
      {/* Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Gross Salary</span>
          <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
            OMR {formatOMR(filteredGross)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Total Additions</span>
          <strong className="block text-xl font-bold text-emerald-600 mt-1 font-mono">
            +OMR {formatOMR(filteredAdditions)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Total Deductions</span>
          <strong className="block text-xl font-bold text-rose-600 mt-1 font-mono">
            -OMR {formatOMR(filteredDeductions)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/40 shadow-xs">
          <span className="text-xs text-blue-700 font-semibold">Net Salary (Owed)</span>
          <strong className="block text-xl font-bold text-blue-900 mt-1 font-mono">
            OMR {formatOMR(filteredNet)}
          </strong>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Payroll Filters</span>
            <span className="text-xs text-slate-500 font-medium">
              (Showing {sortedLines.length} of {rawLines.length} records)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              Sort:{' '}
              <span className="font-semibold text-blue-600">
                {sortColumn === 'default'
                  ? 'Type (Staff/Worker) → Company (ASC) → Emp Code (ASC)'
                  : `${sortColumn} (${sortDirection.toUpperCase()})`}
              </span>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* 1. Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Emp ID / Name / Job..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 2. Type */}
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">Type: All</option>
              <option value="Staff">Type: Staff</option>
              <option value="Worker">Type: Worker</option>
            </select>
          </div>

          {/* 3. Company */}
          <div>
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">Company: All</option>
              {uniqueCompanies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 4. Job / Designation */}
          <div>
            <select
              value={filterJob}
              onChange={(e) => setFilterJob(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">Job: All</option>
              {uniqueJobs.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* 5. Payment Method */}
          <div>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">Method: All</option>
              {uniqueMethods.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Toolbar & Column Resize Reset Control */}
      <div className="flex items-center justify-between px-1 pb-1 text-xs">
        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
          <span className="font-semibold text-slate-700">Monthly Payroll Summary Sheet — {month}</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-400">Drag column edges to resize • Double-click edge to reset width</span>
        </div>
        {isColumnsResized && (
          <button
            type="button"
            onClick={handleResetAllColumns}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 px-2.5 py-1 rounded-md shadow-2xs transition-colors cursor-pointer"
            title="Reset all column widths to default"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Columns
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs table-fixed border-collapse" style={{ minWidth: `${totalTableWidth}px` }}>
            <colgroup>
              <col style={{ width: `${columnWidths.employeeId}px` }} />
              <col style={{ width: `${columnWidths.employeeName}px` }} />
              <col style={{ width: `${columnWidths.employeeType}px` }} />
              <col style={{ width: `${columnWidths.designation}px` }} />
              <col style={{ width: `${columnWidths.employeeCompany}px` }} />
              <col style={{ width: `${columnWidths.worked}px` }} />
              <col style={{ width: `${columnWidths.grossSalary}px` }} />
              <col style={{ width: `${columnWidths.totalAdditions}px` }} />
              <col style={{ width: `${columnWidths.totalDeductions}px` }} />
              <col style={{ width: `${columnWidths.netSalary}px` }} />
              <col style={{ width: `${columnWidths.paymentMethod}px` }} />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase select-none">
              <tr>
                {/* 1. Employee ID */}
                <th
                  onClick={() => handleSort('employeeId')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Employee ID</span>
                    {renderSortIcon('employeeId')}
                  </div>
                  {renderResizer('employeeId', 'Employee ID')}
                </th>

                {/* 2. Employee Name */}
                <th
                  onClick={() => handleSort('employeeName')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Name</span>
                    {renderSortIcon('employeeName')}
                  </div>
                  {renderResizer('employeeName', 'Name')}
                </th>

                {/* 3. Type */}
                <th
                  onClick={() => handleSort('employeeType')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Type</span>
                    {renderSortIcon('employeeType')}
                  </div>
                  {renderResizer('employeeType', 'Type')}
                </th>

                {/* 4. Designation / Job */}
                <th
                  onClick={() => handleSort('designation')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Designation</span>
                    {renderSortIcon('designation')}
                  </div>
                  {renderResizer('designation', 'Designation')}
                </th>

                {/* 5. Company */}
                <th
                  onClick={() => handleSort('employeeCompany')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Company</span>
                    {renderSortIcon('employeeCompany')}
                  </div>
                  {renderResizer('employeeCompany', 'Company')}
                </th>

                {/* 6. Worked */}
                <th
                  onClick={() => handleSort('worked')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Worked</span>
                    {renderSortIcon('worked')}
                  </div>
                  {renderResizer('worked', 'Worked')}
                </th>

                {/* 7. Gross */}
                <th
                  onClick={() => handleSort('grossSalary')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Gross (OMR)</span>
                    {renderSortIcon('grossSalary')}
                  </div>
                  {renderResizer('grossSalary', 'Gross')}
                </th>

                {/* 8. Additions */}
                <th
                  onClick={() => handleSort('totalAdditions')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Additions</span>
                    {renderSortIcon('totalAdditions')}
                  </div>
                  {renderResizer('totalAdditions', 'Additions')}
                </th>

                {/* 9. Deductions */}
                <th
                  onClick={() => handleSort('totalDeductions')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Deductions</span>
                    {renderSortIcon('totalDeductions')}
                  </div>
                  {renderResizer('totalDeductions', 'Deductions')}
                </th>

                {/* 10. Net Salary */}
                <th
                  onClick={() => handleSort('netSalary')}
                  className="relative px-3 py-3 text-right font-bold text-blue-900 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Net Salary</span>
                    {renderSortIcon('netSalary')}
                  </div>
                  {renderResizer('netSalary', 'Net Salary')}
                </th>

                {/* 11. Payment Method */}
                <th
                  onClick={() => handleSort('paymentMethod')}
                  className="relative px-3 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-center gap-1 overflow-hidden pr-2">
                    <span className="truncate">Method</span>
                    {renderSortIcon('paymentMethod')}
                  </div>
                  {renderResizer('paymentMethod', 'Method')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedLines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    No payroll records match the selected filters.
                  </td>
                </tr>
              ) : (
                sortedLines.map((l: any) => (
                  <tr key={l.id || l.employeeId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600 truncate">{l.employeeId}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 truncate">{l.employeeName}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        l.employeeType === 'Staff' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {l.employeeType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 truncate">{l.designation || 'General'}</td>
                    <td className="px-3 py-2.5 text-slate-600 truncate">{l.employeeCompany}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {l.employeeType === 'Staff' ? `${l.daysWorked ?? 0}d` : `${l.hoursWorked ?? 0}h`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatOMR(l.grossSalary)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600">+{formatOMR(l.totalAdditions)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-600">-{formatOMR(l.totalDeductions)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-700">
                      OMR {formatOMR(l.netSalary)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600 truncate">{l.paymentMethod || 'Cash'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
