import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR } from '../../api/client';
import {
  Search,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface PlanningReportTabProps {
  initialMonth?: string;
}

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  payrollMonth: 110,
  employeeId: 130,
  employeeName: 200,
  employeeType: 100,
  designation: 140,
  employeeCompany: 110,
  salaryPaidBy: 110,
  netSalary: 120,
  totalPaid: 120,
  outstanding: 120,
  shouldPayAmount: 130,
  status: 120,
};

const MIN_COLUMN_WIDTHS: Record<string, number> = {
  payrollMonth: 85,
  employeeId: 90,
  employeeName: 130,
  employeeType: 75,
  designation: 90,
  employeeCompany: 80,
  salaryPaidBy: 80,
  netSalary: 90,
  totalPaid: 90,
  outstanding: 90,
  shouldPayAmount: 95,
  status: 85,
};

type SortColumn =
  | 'default'
  | 'payrollMonth'
  | 'employeeId'
  | 'employeeName'
  | 'employeeType'
  | 'designation'
  | 'employeeCompany'
  | 'salaryPaidBy'
  | 'netSalary'
  | 'totalPaid'
  | 'outstanding'
  | 'shouldPayAmount'
  | 'status';

type SortDirection = 'asc' | 'desc';

export const PlanningReportTab: React.FC<PlanningReportTabProps> = ({ initialMonth }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlanningData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest('/api/payment-planning');
      setData(res.rows || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment planning data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanningData();
  }, []);

  // Column resizing state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('report_planning_col_widths_v1');
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
            localStorage.setItem('report_planning_col_widths_v1', JSON.stringify(current));
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
        localStorage.setItem('report_planning_col_widths_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetAllColumns = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('report_planning_col_widths_v1');
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
  const [filterMonth, setFilterMonth] = useState(initialMonth || 'ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCompany, setFilterCompany] = useState('ALL');
  const [filterJob, setFilterJob] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

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
        <ArrowUp className="w-3.5 h-3.5 text-indigo-600 inline ml-1" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-indigo-600 inline ml-1" />
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
          ? 'bg-indigo-600/30'
          : 'hover:bg-indigo-500/20 active:bg-indigo-600/40'
      }`}
      title={`Drag to resize ${label} column (double-click to reset)`}
    >
      <div
        className={`w-[2px] transition-all rounded-full ${
          resizingCol === colKey
            ? 'bg-indigo-600 h-full'
            : 'h-3.5 bg-slate-300 group-hover/resizer:bg-indigo-500 group-hover/resizer:h-full'
        }`}
      />
    </div>
  );

  // Dropdown options
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => {
      if (r.payrollMonth) set.add(r.payrollMonth);
    });
    return Array.from(set).sort().reverse();
  }, [data]);

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => {
      if (r.employeeCompany) set.add(r.employeeCompany);
    });
    return Array.from(set).sort();
  }, [data]);

  const uniqueJobs = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => {
      if (r.designation) set.add(r.designation);
    });
    return Array.from(set).sort();
  }, [data]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterMonth !== 'ALL' ||
    filterType !== 'ALL' ||
    filterCompany !== 'ALL' ||
    filterJob !== 'ALL' ||
    filterStatus !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterMonth('ALL');
    setFilterType('ALL');
    setFilterCompany('ALL');
    setFilterJob('ALL');
    setFilterStatus('ALL');
  };

  // Filter rows
  const filteredRows = useMemo(() => {
    return data.filter((r) => {
      if (filterMonth !== 'ALL' && r.payrollMonth !== filterMonth) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const empId = (r.employeeId || '').toLowerCase();
        const empName = (r.employeeName || '').toLowerCase();
        const comp = (r.employeeCompany || '').toLowerCase();
        const desig = (r.designation || '').toLowerCase();
        const paidBy = (r.salaryPaidBy || '').toLowerCase();
        if (
          !empId.includes(query) &&
          !empName.includes(query) &&
          !comp.includes(query) &&
          !desig.includes(query) &&
          !paidBy.includes(query)
        ) {
          return false;
        }
      }
      if (filterType !== 'ALL' && r.employeeType !== filterType) return false;
      if (filterCompany !== 'ALL' && r.employeeCompany !== filterCompany) return false;
      if (filterJob !== 'ALL' && r.designation !== filterJob) return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      return true;
    });
  }, [data, filterMonth, searchQuery, filterType, filterCompany, filterJob, filterStatus]);

  // Sort rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const runDefaultSort = () => {
        // Hierarchical sort: Type (Staff first, Worker second) -> Company -> Employee ID numeric -> Month
        const typeRankA = a.employeeType === 'Staff' ? 0 : 1;
        const typeRankB = b.employeeType === 'Staff' ? 0 : 1;
        if (typeRankA !== typeRankB) return typeRankA - typeRankB;

        const compCmp = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
        if (compCmp !== 0) return compCmp;

        const idCmp = (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
        if (idCmp !== 0) return idCmp;

        return (b.payrollMonth || '').localeCompare(a.payrollMonth || '');
      };

      if (sortColumn === 'default') {
        return runDefaultSort();
      }

      let diff = 0;
      switch (sortColumn) {
        case 'payrollMonth':
          diff = (a.payrollMonth || '').localeCompare(b.payrollMonth || '');
          break;
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
        case 'salaryPaidBy':
          diff = (a.salaryPaidBy || '').localeCompare(b.salaryPaidBy || '');
          break;
        case 'netSalary':
          diff = (a.netSalary || 0) - (b.netSalary || 0);
          break;
        case 'totalPaid':
          diff = (a.totalPaid || 0) - (b.totalPaid || 0);
          break;
        case 'outstanding':
          diff = (a.outstanding || 0) - (b.outstanding || 0);
          break;
        case 'shouldPayAmount':
          diff = (a.shouldPayAmount || 0) - (b.shouldPayAmount || 0);
          break;
        case 'status':
          diff = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          return runDefaultSort();
      }

      if (diff !== 0) {
        return sortDirection === 'asc' ? diff : -diff;
      }
      return runDefaultSort();
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Totals for the filtered set
  const totalNetSalary = useMemo(() => sortedRows.reduce((s, r) => s + (Number(r.netSalary) || 0), 0), [sortedRows]);
  const totalActuallyPaid = useMemo(() => sortedRows.reduce((s, r) => s + (Number(r.totalPaid) || 0), 0), [sortedRows]);
  const totalOutstanding = useMemo(() => sortedRows.reduce((s, r) => s + (Number(r.outstanding) || 0), 0), [sortedRows]);
  const totalShouldPay = useMemo(() => sortedRows.reduce((s, r) => s + (Number(r.shouldPayAmount) || 0), 0), [sortedRows]);

  const handleExportExcel = () => {
    const exportData = sortedRows.map((r, idx) => ({
      'Sr#': idx + 1,
      'Month': r.payrollMonth,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Type': r.employeeType || 'Worker',
      'Designation': r.designation || '',
      'Company': r.employeeCompany,
      'Paid By': r.salaryPaidBy || '',
      'Net Salary (OMR)': formatOMR(r.netSalary),
      'Total Paid (OMR)': formatOMR(r.totalPaid),
      'Outstanding (OMR)': formatOMR(r.outstanding),
      'Planned Disbursal (OMR)': formatOMR(r.shouldPayAmount),
      'Status': r.status,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payment_Planning');
    XLSX.writeFile(wb, `Payment_Planning_Report_${filterMonth !== 'ALL' ? filterMonth : 'All'}.xlsx`);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
        <span className="text-sm font-medium text-slate-600">Loading payment planning records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Total Net Salary Owed</span>
          <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
            OMR {formatOMR(totalNetSalary)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <span className="text-xs text-emerald-700 font-semibold">Total Disbursed (Paid)</span>
          <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
            OMR {formatOMR(totalActuallyPaid)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <span className="text-xs text-rose-700 font-semibold">Outstanding Balance</span>
          <strong className="block text-xl font-bold text-rose-800 mt-1 font-mono">
            OMR {formatOMR(totalOutstanding)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 shadow-xs">
          <span className="text-xs text-indigo-700 font-semibold">Planned Disbursal</span>
          <strong className="block text-xl font-bold text-indigo-900 mt-1 font-mono">
            OMR {formatOMR(totalShouldPay)}
          </strong>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Payment Planning Filters</span>
            <span className="text-xs text-slate-500 font-medium">
              (Showing {sortedRows.length} of {data.length} records)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              Sort:{' '}
              <span className="font-semibold text-indigo-600">
                {sortColumn === 'default'
                  ? 'Type (Staff/Worker) → Company (ASC) → Emp Code (ASC) → Month'
                  : `${sortColumn} (${sortDirection.toUpperCase()})`}
              </span>
            </span>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md shadow-2xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
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
          {/* 1. Month */}
          <div>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">Month: All</option>
              {uniqueMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 2. Search */}
          <div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ID / Name / Job..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 3. Type */}
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">Type: All</option>
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

          {/* 6. Status */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">Status: All</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Fully Paid">Fully Paid</option>
              <option value="No Payable">No Payable</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Toolbar & Column Resize Reset Control */}
      <div className="flex items-center justify-between px-1 pb-1 text-xs">
        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
          <span className="font-semibold text-slate-700">Payment Planning Ledger</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-400">Drag column edges to resize • Double-click edge to reset width</span>
        </div>
        {isColumnsResized && (
          <button
            type="button"
            onClick={handleResetAllColumns}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 px-2.5 py-1 rounded-md shadow-2xs transition-colors cursor-pointer"
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
              <col style={{ width: `${columnWidths.payrollMonth}px` }} />
              <col style={{ width: `${columnWidths.employeeId}px` }} />
              <col style={{ width: `${columnWidths.employeeName}px` }} />
              <col style={{ width: `${columnWidths.employeeType}px` }} />
              <col style={{ width: `${columnWidths.designation}px` }} />
              <col style={{ width: `${columnWidths.employeeCompany}px` }} />
              <col style={{ width: `${columnWidths.salaryPaidBy}px` }} />
              <col style={{ width: `${columnWidths.netSalary}px` }} />
              <col style={{ width: `${columnWidths.totalPaid}px` }} />
              <col style={{ width: `${columnWidths.outstanding}px` }} />
              <col style={{ width: `${columnWidths.shouldPayAmount}px` }} />
              <col style={{ width: `${columnWidths.status}px` }} />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase select-none">
              <tr>
                {/* 1. Month */}
                <th
                  onClick={() => handleSort('payrollMonth')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Month</span>
                    {renderSortIcon('payrollMonth')}
                  </div>
                  {renderResizer('payrollMonth', 'Month')}
                </th>

                {/* 2. Employee ID */}
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

                {/* 3. Name */}
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

                {/* 4. Type */}
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

                {/* 5. Designation */}
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

                {/* 6. Company */}
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

                {/* 7. Paid By */}
                <th
                  onClick={() => handleSort('salaryPaidBy')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Paid By</span>
                    {renderSortIcon('salaryPaidBy')}
                  </div>
                  {renderResizer('salaryPaidBy', 'Paid By')}
                </th>

                {/* 8. Net Salary */}
                <th
                  onClick={() => handleSort('netSalary')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Net Salary</span>
                    {renderSortIcon('netSalary')}
                  </div>
                  {renderResizer('netSalary', 'Net Salary')}
                </th>

                {/* 9. Disbursed */}
                <th
                  onClick={() => handleSort('totalPaid')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Disbursed</span>
                    {renderSortIcon('totalPaid')}
                  </div>
                  {renderResizer('totalPaid', 'Disbursed')}
                </th>

                {/* 10. Balance */}
                <th
                  onClick={() => handleSort('outstanding')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Balance</span>
                    {renderSortIcon('outstanding')}
                  </div>
                  {renderResizer('outstanding', 'Balance')}
                </th>

                {/* 11. Planned (Should Pay) */}
                <th
                  onClick={() => handleSort('shouldPayAmount')}
                  className="relative px-3 py-3 text-right font-bold text-indigo-900 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Planned (OMR)</span>
                    {renderSortIcon('shouldPayAmount')}
                  </div>
                  {renderResizer('shouldPayAmount', 'Planned')}
                </th>

                {/* 12. Status */}
                <th
                  onClick={() => handleSort('status')}
                  className="relative px-3 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-center gap-1 overflow-hidden pr-2">
                    <span className="truncate">Status</span>
                    {renderSortIcon('status')}
                  </div>
                  {renderResizer('status', 'Status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-400">
                    No planning records match the selected filters.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r: any, idx: number) => (
                  <tr key={`${r.employeeId}-${r.payrollMonth}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-slate-700 truncate">{r.payrollMonth}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600 truncate">{r.employeeId}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 truncate">{r.employeeName}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.employeeType === 'Staff' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {r.employeeType || 'Worker'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 truncate">{r.designation || 'General'}</td>
                    <td className="px-3 py-2.5 text-slate-600 truncate">{r.employeeCompany}</td>
                    <td className="px-3 py-2.5 text-slate-600 truncate">{r.salaryPaidBy || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">OMR {formatOMR(r.netSalary)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700">OMR {formatOMR(r.totalPaid)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-600">OMR {formatOMR(r.outstanding)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-700">
                      OMR {formatOMR(r.shouldPayAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.status === 'Fully Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'Partially Paid'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {r.status}
                      </span>
                    </td>
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
