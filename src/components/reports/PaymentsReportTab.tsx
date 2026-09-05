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
} from 'lucide-react';

interface PaymentsReportTabProps {
  reportData: any;
  month: string;
}

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  employeeId: 130,
  employeeName: 200,
  employeeType: 100,
  designation: 140,
  company: 110,
  salaryPaidBy: 110,
  netSalary: 130,
  totalPaid: 130,
  outstanding: 130,
  status: 120,
  receiptStatus: 140,
};

const MIN_COLUMN_WIDTHS: Record<string, number> = {
  employeeId: 90,
  employeeName: 130,
  employeeType: 75,
  designation: 90,
  company: 80,
  salaryPaidBy: 80,
  netSalary: 95,
  totalPaid: 95,
  outstanding: 95,
  status: 90,
  receiptStatus: 90,
};

type SortColumn =
  | 'default'
  | 'employeeId'
  | 'employeeName'
  | 'employeeType'
  | 'designation'
  | 'company'
  | 'salaryPaidBy'
  | 'netSalary'
  | 'totalPaid'
  | 'outstanding'
  | 'status'
  | 'receiptStatus';

type SortDirection = 'asc' | 'desc';

export const PaymentsReportTab: React.FC<PaymentsReportTabProps> = ({ reportData, month }) => {
  // Column resizing state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('report_payments_col_widths_v1');
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
            localStorage.setItem('report_payments_col_widths_v1', JSON.stringify(current));
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
        localStorage.setItem('report_payments_col_widths_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetAllColumns = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('report_payments_col_widths_v1');
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
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterReceipt, setFilterReceipt] = useState('ALL');

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
        <ArrowUp className="w-3.5 h-3.5 text-emerald-600 inline ml-1" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-emerald-600 inline ml-1" />
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
          ? 'bg-emerald-600/30'
          : 'hover:bg-emerald-500/20 active:bg-emerald-600/40'
      }`}
      title={`Drag to resize ${label} column (double-click to reset)`}
    >
      <div
        className={`w-[2px] transition-all rounded-full ${
          resizingCol === colKey
            ? 'bg-emerald-600 h-full'
            : 'h-3.5 bg-slate-300 group-hover/resizer:bg-emerald-500 group-hover/resizer:h-full'
        }`}
      />
    </div>
  );

  const rawLedger: any[] = reportData?.ledger || [];

  // Dropdown options
  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    rawLedger.forEach(r => {
      if (r.company) set.add(r.company);
    });
    return Array.from(set).sort();
  }, [rawLedger]);

  const uniqueJobs = useMemo(() => {
    const set = new Set<string>();
    rawLedger.forEach(r => {
      if (r.designation) set.add(r.designation);
    });
    return Array.from(set).sort();
  }, [rawLedger]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterType !== 'ALL' ||
    filterCompany !== 'ALL' ||
    filterJob !== 'ALL' ||
    filterStatus !== 'ALL' ||
    filterReceipt !== 'ALL';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterType('ALL');
    setFilterCompany('ALL');
    setFilterJob('ALL');
    setFilterStatus('ALL');
    setFilterReceipt('ALL');
  };

  // Filter ledger
  const filteredLedger = useMemo(() => {
    return rawLedger.filter((r) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const empId = (r.employeeId || '').toLowerCase();
        const empName = (r.employeeName || '').toLowerCase();
        const comp = (r.company || '').toLowerCase();
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
      if (filterCompany !== 'ALL' && r.company !== filterCompany) return false;
      if (filterJob !== 'ALL' && r.designation !== filterJob) return false;
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (filterReceipt !== 'ALL' && r.receiptStatus !== filterReceipt) return false;
      return true;
    });
  }, [rawLedger, searchQuery, filterType, filterCompany, filterJob, filterStatus, filterReceipt]);

  // Sort ledger
  const sortedLedger = useMemo(() => {
    return [...filteredLedger].sort((a, b) => {
      const runDefaultSort = () => {
        // Hierarchical sort: Type (Staff first, Worker second) -> Company -> Employee ID numeric
        const typeRankA = a.employeeType === 'Staff' ? 0 : 1;
        const typeRankB = b.employeeType === 'Staff' ? 0 : 1;
        if (typeRankA !== typeRankB) return typeRankA - typeRankB;

        const compCmp = (a.company || '').localeCompare(b.company || '');
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
        case 'company':
          diff = (a.company || '').localeCompare(b.company || '');
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
        case 'status':
          diff = (a.status || '').localeCompare(b.status || '');
          break;
        case 'receiptStatus':
          diff = (a.receiptStatus || '').localeCompare(b.receiptStatus || '');
          break;
        default:
          return runDefaultSort();
      }

      if (diff !== 0) {
        return sortDirection === 'asc' ? diff : -diff;
      }
      return runDefaultSort();
    });
  }, [filteredLedger, sortColumn, sortDirection]);

  // Aggregate totals for the filtered set
  const filteredNetOwed = useMemo(() => sortedLedger.reduce((s, r) => s + (Number(r.netSalary) || 0), 0), [sortedLedger]);
  const filteredDisbursed = useMemo(() => sortedLedger.reduce((s, r) => s + (Number(r.totalPaid) || 0), 0), [sortedLedger]);
  const filteredOutstanding = useMemo(() => sortedLedger.reduce((s, r) => s + (Number(r.outstanding) || 0), 0), [sortedLedger]);

  return (
    <div className="space-y-4">
      {/* Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Total Net Salary Owed</span>
          <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
            OMR {formatOMR(filteredNetOwed)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <span className="text-xs text-emerald-700 font-semibold">Total Disbursed (Paid)</span>
          <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
            OMR {formatOMR(filteredDisbursed)}
          </strong>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <span className="text-xs text-rose-700 font-semibold">Outstanding Balance</span>
          <strong className="block text-xl font-bold text-rose-800 mt-1 font-mono">
            OMR {formatOMR(filteredOutstanding)}
          </strong>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Payments Filters</span>
            <span className="text-xs text-slate-500 font-medium">
              (Showing {sortedLedger.length} of {rawLedger.length} records)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              Sort:{' '}
              <span className="font-semibold text-emerald-600">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* 1. Search */}
          <div className="relative lg:col-span-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ID / Name / Job..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* 2. Type */}
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-emerald-500"
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
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Company: All</option>
              {uniqueCompanies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 4. Designation / Job */}
          <div>
            <select
              value={filterJob}
              onChange={(e) => setFilterJob(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Job: All</option>
              {uniqueJobs.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* 5. Payment Status */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Payment: All</option>
              <option value="Fully Paid">Fully Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Unpaid">Unpaid</option>
              <option value="No Payable">No Payable</option>
            </select>
          </div>

          {/* 6. Receipt Status */}
          <div>
            <select
              value={filterReceipt}
              onChange={(e) => setFilterReceipt(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">Receipt: All</option>
              <option value="Attached">Attached</option>
              <option value="Attachment Pending">Attachment Pending</option>
              <option value="No Payments">No Payments</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Toolbar & Column Resize Reset Control */}
      <div className="flex items-center justify-between px-1 pb-1 text-xs">
        <div className="flex items-center gap-2 text-slate-500 text-[11px]">
          <span className="font-semibold text-slate-700">Salary Disbursal Reconciliation — {month}</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-400">Drag column edges to resize • Double-click edge to reset width</span>
        </div>
        {isColumnsResized && (
          <button
            type="button"
            onClick={handleResetAllColumns}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 px-2.5 py-1 rounded-md shadow-2xs transition-colors cursor-pointer"
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
              <col style={{ width: `${columnWidths.company}px` }} />
              <col style={{ width: `${columnWidths.salaryPaidBy}px` }} />
              <col style={{ width: `${columnWidths.netSalary}px` }} />
              <col style={{ width: `${columnWidths.totalPaid}px` }} />
              <col style={{ width: `${columnWidths.outstanding}px` }} />
              <col style={{ width: `${columnWidths.status}px` }} />
              <col style={{ width: `${columnWidths.receiptStatus}px` }} />
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
                  onClick={() => handleSort('company')}
                  className="relative px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-between gap-1 overflow-hidden pr-2">
                    <span className="truncate">Company</span>
                    {renderSortIcon('company')}
                  </div>
                  {renderResizer('company', 'Company')}
                </th>

                {/* 6. Paid By */}
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

                {/* 7. Net Owed */}
                <th
                  onClick={() => handleSort('netSalary')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Net Owed (OMR)</span>
                    {renderSortIcon('netSalary')}
                  </div>
                  {renderResizer('netSalary', 'Net Owed')}
                </th>

                {/* 8. Disbursed */}
                <th
                  onClick={() => handleSort('totalPaid')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Disbursed (OMR)</span>
                    {renderSortIcon('totalPaid')}
                  </div>
                  {renderResizer('totalPaid', 'Disbursed')}
                </th>

                {/* 9. Balance */}
                <th
                  onClick={() => handleSort('outstanding')}
                  className="relative px-3 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-end gap-1 overflow-hidden pr-2">
                    <span className="truncate">Balance (OMR)</span>
                    {renderSortIcon('outstanding')}
                  </div>
                  {renderResizer('outstanding', 'Balance')}
                </th>

                {/* 10. Status */}
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

                {/* 11. Receipt Status */}
                <th
                  onClick={() => handleSort('receiptStatus')}
                  className="relative px-3 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                >
                  <div className="flex items-center justify-center gap-1 overflow-hidden pr-2">
                    <span className="truncate">Receipt</span>
                    {renderSortIcon('receiptStatus')}
                  </div>
                  {renderResizer('receiptStatus', 'Receipt Status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedLedger.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                    No payment records match the selected filters.
                  </td>
                </tr>
              ) : (
                sortedLedger.map((r: any) => (
                  <tr key={`${r.employeeId}-${r.payrollMonth || ''}`} className="hover:bg-slate-50/70 transition-colors">
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
                    <td className="px-3 py-2.5 text-slate-600 truncate">{r.company}</td>
                    <td className="px-3 py-2.5 text-slate-600 truncate">{r.salaryPaidBy || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold">OMR {formatOMR(r.netSalary)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">OMR {formatOMR(r.totalPaid)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-600">OMR {formatOMR(r.outstanding)}</td>
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
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.receiptStatus === 'Attached'
                          ? 'bg-blue-100 text-blue-800'
                          : r.receiptStatus === 'Attachment Pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {r.receiptStatus || 'No Payments'}
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
