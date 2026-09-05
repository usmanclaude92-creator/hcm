import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MultiSelectDropdown, MultiSelectOption } from '../common/MultiSelectDropdown';
import {
  ClipboardList,
  Search,
  Save,
  FileDown,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
} from 'lucide-react';

const VARIANCE_TOLERANCE = 0.001;

const COMPANY_OPTIONS: MultiSelectOption[] = [
  { value: 'DGO', label: 'DGO' },
  { value: 'SMI', label: 'SMI' },
  { value: 'NC', label: 'NC' },
  { value: 'Supplier', label: 'Supplier' },
  { value: 'Azad', label: 'Azad' },
];
const PAID_BY_OPTIONS: MultiSelectOption[] = [
  { value: 'DGO', label: 'DGO' },
  { value: 'SMI', label: 'SMI' },
  { value: 'NC', label: 'NC' },
  { value: 'Supplier', label: 'Supplier' },
];
const WPS_OPTIONS: MultiSelectOption[] = [
  { value: 'Yes', label: 'WPS Employees' },
  { value: 'No', label: 'Non-WPS' },
];
const STATUS_OPTIONS: MultiSelectOption[] = [
  { value: 'Unpaid', label: 'Unpaid' },
  { value: 'Partially Paid', label: 'Partially Paid' },
  { value: 'Fully Paid', label: 'Fully Paid' },
];

// Omits the filter from the PDF summary line when every option is selected (equivalent
// to "no restriction" -- matches the table/tile filtering semantics below).
const filterSummaryText = (label: string, selected: string[], allOptions: MultiSelectOption[]): string | null => {
  if (selected.length === allOptions.length) return null;
  if (selected.length === 0) return `${label}: None`;
  return `${label}: ${selected.join(', ')}`;
};

interface PlanRow {
  payrollId: string;
  payrollMonth: string;
  employeeId: string;
  employeeName: string;
  employeeCompany: string;
  salaryPaidBy: string;
  wpsEmployee: string;
  wageType: string;
  employeeType?: string;
  designation?: string;
  netSalary: number;
  totalPaid: number;
  outstanding: number;
  status: string;
  lastPaidSalary: number;
  lastPaymentDate: string | null;
  shouldPayAmount: number;
  remarks: string;
  isOldestUnpaid: boolean;
}

export const PaymentPlanningView: React.FC = () => {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [invalidKeys, setInvalidKeys] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [jobFilter, setJobFilter] = useState('ALL');
  // Empty array = "Select All" for these -- each starts pre-populated with every fixed
  // option, matching the old default of no restriction. Month's options load
  // asynchronously with the data, so it starts empty and is filled in below once known.
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string[]>(COMPANY_OPTIONS.map(o => o.value));
  const [paidByFilter, setPaidByFilter] = useState<string[]>(PAID_BY_OPTIONS.map(o => o.value));
  const [wpsFilter, setWpsFilter] = useState<string[]>(WPS_OPTIONS.map(o => o.value));
  const [statusFilter, setStatusFilter] = useState<string[]>(STATUS_OPTIONS.map(o => o.value));

  const availableJobs = useMemo(() => {
    return Array.from(new Set(rows.map(r => (r.designation || '').trim()).filter(Boolean))).sort();
  }, [rows]);

  const canEdit = hasPermission('payment_planning.edit');
  const canExport = hasPermission('payment_planning.export');

  const rowKey = (r: { employeeId: string; payrollMonth: string }) => `${r.employeeId}_${r.payrollMonth}`;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest('/api/payment-planning');
      setRows(data.rows || []);
      setDirtyKeys(new Set());
      setInvalidKeys(new Map());
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payment planning data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const availableMonths = useMemo(() => {
    return Array.from(new Set(rows.map(r => r.payrollMonth))).sort();
  }, [rows]);
  const monthOptions: MultiSelectOption[] = useMemo(
    () => availableMonths.map(m => ({ value: m, label: m })),
    [availableMonths]
  );

  // Month's option list only becomes known once data has loaded -- default it to
  // "Select All" the first time (or after a Refresh) rather than leaving it empty
  // (which would otherwise read as "nothing selected" and hide every row).
  useEffect(() => {
    if (availableMonths.length > 0) {
      setMonthFilter(prev => (prev.length === 0 ? availableMonths : prev));
    }
  }, [availableMonths]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (typeFilter !== 'ALL' && r.employeeType !== typeFilter) return false;
      if (jobFilter !== 'ALL' && (r.designation || '').trim() !== jobFilter) return false;
      if (!monthFilter.includes(r.payrollMonth)) return false;
      if (!companyFilter.includes(r.employeeCompany)) return false;
      if (!paidByFilter.includes(r.salaryPaidBy)) return false;
      if (!wpsFilter.includes(r.wpsEmployee)) return false;
      if (!statusFilter.includes(r.status)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.employeeId.toLowerCase().includes(q) && !r.employeeName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, jobFilter, monthFilter, companyFilter, paidByFilter, wpsFilter, statusFilter, search]);

  // Live, client-side only -- all four tiles recompute on every edit and every filter
  // change, no round-trip. Total of Last Unpaid Months is a fixed, factual figure (does
  // NOT move as Should Pay is edited); Pending is the only derived delta.
  const totalOutstandingSalaries = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (Number(r.outstanding) || 0), 0),
    [filteredRows]
  );
  const totalLastUnpaidMonths = useMemo(
    () => filteredRows.filter(r => r.isOldestUnpaid).reduce((sum, r) => sum + (Number(r.outstanding) || 0), 0),
    [filteredRows]
  );
  const totalShouldPay = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (Number(r.shouldPayAmount) || 0), 0),
    [filteredRows]
  );
  const pendingOfLastMonths = totalLastUnpaidMonths - totalShouldPay;

  type PlanningSortColumn =
    | 'default'
    | 'employeeId'
    | 'employee'
    | 'type'
    | 'job'
    | 'month'
    | 'netSalary'
    | 'lastPaid'
    | 'lastPaymentDate'
    | 'status'
    | 'outstanding'
    | 'shouldPay'
    | 'remarks';

  const [sortColumn, setSortColumn] = useState<PlanningSortColumn>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const DEFAULT_PLANNING_COLUMN_WIDTHS: Record<string, number> = {
    employee: 220,
    month: 100,
    netSalary: 125,
    lastPaid: 120,
    lastPaymentDate: 135,
    status: 115,
    outstanding: 150,
    shouldPay: 160,
    remarks: 220,
  };

  const MIN_PLANNING_COLUMN_WIDTHS: Record<string, number> = {
    employee: 140,
    month: 80,
    netSalary: 90,
    lastPaid: 85,
    lastPaymentDate: 95,
    status: 80,
    outstanding: 100,
    shouldPay: 110,
    remarks: 130,
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('payment_planning_col_widths_v1');
      if (saved) {
        return { ...DEFAULT_PLANNING_COLUMN_WIDTHS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_PLANNING_COLUMN_WIDTHS;
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
    const startWidth = columnWidths[colKey] || DEFAULT_PLANNING_COLUMN_WIDTHS[colKey] || 100;
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
      const minW = MIN_PLANNING_COLUMN_WIDTHS[colKey] || 50;
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
            localStorage.setItem('payment_planning_col_widths_v1', JSON.stringify(current));
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
      const next = { ...prev, [colKey]: DEFAULT_PLANNING_COLUMN_WIDTHS[colKey] };
      try {
        localStorage.setItem('payment_planning_col_widths_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetAllColumns = () => {
    setColumnWidths(DEFAULT_PLANNING_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('payment_planning_col_widths_v1');
    } catch {
      // ignore
    }
  };

  const isColumnsResized = Object.keys(DEFAULT_PLANNING_COLUMN_WIDTHS).some(
    k => columnWidths[k] !== DEFAULT_PLANNING_COLUMN_WIDTHS[k]
  );

  const totalTableWidth = (Object.values(columnWidths) as number[]).reduce(
    (sum, w) => sum + (Number(w) || 0),
    0
  );

  const handleSort = (column: PlanningSortColumn) => {
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

  const renderSortIcon = (column: PlanningSortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 ml-1 shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 ml-1 shrink-0 font-bold" />
    );
  };

  const renderResizer = (colKey: string, colTitle: string) => (
    <div
      role="separator"
      aria-label={`Resize column ${colTitle}`}
      onMouseDown={(e) => handleStartResize(e, colKey)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        handleResetColumnWidth(colKey);
      }}
      className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize select-none touch-none flex items-center justify-center z-20 group/resizer ${
        resizingCol === colKey ? 'bg-indigo-400/20' : 'hover:bg-slate-300/40'
      }`}
      title="Drag to resize • Double-click to reset width"
    >
      <div
        className={`w-[2px] h-4 rounded-full transition-colors ${
          resizingCol === colKey ? 'bg-indigo-600' : 'bg-slate-300 group-hover/resizer:bg-indigo-500'
        }`}
      />
    </div>
  );

  const isFiltering = Boolean(
    search ||
    typeFilter !== 'ALL' ||
    jobFilter !== 'ALL' ||
    (availableMonths.length > 0 && monthFilter.length < availableMonths.length) ||
    companyFilter.length < COMPANY_OPTIONS.length ||
    paidByFilter.length < PAID_BY_OPTIONS.length ||
    wpsFilter.length < WPS_OPTIONS.length ||
    statusFilter.length < STATUS_OPTIONS.length
  );

  const handleResetFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setJobFilter('ALL');
    setMonthFilter(availableMonths);
    setCompanyFilter(COMPANY_OPTIONS.map(o => o.value));
    setPaidByFilter(PAID_BY_OPTIONS.map(o => o.value));
    setWpsFilter(WPS_OPTIONS.map(o => o.value));
    setStatusFilter(STATUS_OPTIONS.map(o => o.value));
  };

  const runDefaultSort = (a: PlanRow, b: PlanRow) => {
    // Standard Attendance Register Default Sort:
    // 1. Type (Staff first, then Worker)
    const tRankA = a.employeeType === 'Staff' ? 0 : 1;
    const tRankB = b.employeeType === 'Staff' ? 0 : 1;
    if (tRankA !== tRankB) return tRankA - tRankB;

    // 2. Company (sort ascending)
    const companyCmp = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
    if (companyCmp !== 0) return companyCmp;

    // 3. Employee Code (numeric ascending)
    const idCmp = (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
    if (idCmp !== 0) return idCmp;

    // 4. Month (descending)
    return (b.payrollMonth || '').localeCompare(a.payrollMonth || '');
  };

  const sortedRows = useMemo(() => {
    if (sortColumn === 'default') {
      return [...filteredRows].sort(runDefaultSort);
    }
    return [...filteredRows].sort((a, b) => {
      let diff = 0;
      switch (sortColumn) {
        case 'employeeId':
          diff = (a.employeeId || '').localeCompare(b.employeeId || '', undefined, { numeric: true });
          break;
        case 'employee':
          diff = (a.employeeName || '').localeCompare(b.employeeName || '');
          break;
        case 'type':
          diff = (a.employeeType || '').localeCompare(b.employeeType || '');
          break;
        case 'job':
          diff = (a.designation || '').localeCompare(b.designation || '');
          break;
        case 'month':
          diff = (a.payrollMonth || '').localeCompare(b.payrollMonth || '');
          break;
        case 'netSalary':
          diff = (Number(a.netSalary) || 0) - (Number(b.netSalary) || 0);
          break;
        case 'lastPaid':
          diff = (Number(a.lastPaidSalary) || 0) - (Number(b.lastPaidSalary) || 0);
          break;
        case 'lastPaymentDate':
          diff = (a.lastPaymentDate || '').localeCompare(b.lastPaymentDate || '');
          break;
        case 'status':
          diff = (a.status || '').localeCompare(b.status || '');
          break;
        case 'outstanding':
          diff = (Number(a.outstanding) || 0) - (Number(b.outstanding) || 0);
          break;
        case 'shouldPay':
          diff = (Number(a.shouldPayAmount) || 0) - (Number(b.shouldPayAmount) || 0);
          break;
        case 'remarks':
          diff = (a.remarks || '').localeCompare(b.remarks || '');
          break;
        default:
          diff = 0;
      }
      if (diff !== 0) {
        return sortDirection === 'asc' ? diff : -diff;
      }
      return runDefaultSort(a, b);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Dynamic consecutive runs for grouping employee column safely
  const displayRows = useMemo(() => {
    let lastEmpId: string | null = null;
    let currentGroup: PlanRow[] = [];
    const result: (PlanRow & { dynamicFirst: boolean; dynamicSpan: number; isLastInGroup: boolean })[] = [];

    const flush = () => {
      if (currentGroup.length > 0) {
        const span = currentGroup.length;
        currentGroup.forEach((r, idx) => {
          result.push({
            ...r,
            dynamicFirst: idx === 0,
            dynamicSpan: span,
            isLastInGroup: idx === span - 1,
          });
        });
        currentGroup = [];
      }
    };

    for (let i = 0; i < sortedRows.length; i++) {
      const row = sortedRows[i];
      if (row.employeeId === lastEmpId) {
        currentGroup.push(row);
      } else {
        flush();
        lastEmpId = row.employeeId;
        currentGroup = [row];
      }
    }
    flush();
    return result;
  }, [sortedRows]);

  const handleShouldPayChange = (row: PlanRow, value: string) => {
    if (row.status === 'Fully Paid') return; // guard: never editable for a fully paid row
    const key = rowKey(row);
    const numeric = Number(value);

    setRows(prev => prev.map(r => (rowKey(r) === key ? { ...r, shouldPayAmount: isNaN(numeric) ? 0 : numeric } : r)));
    setDirtyKeys(prev => new Set(prev).add(key));

    setInvalidKeys(prev => {
      const next = new Map(prev);
      if (isNaN(numeric) || numeric < 0) {
        next.set(key, 'Cannot be negative.');
      } else if (numeric > row.outstanding + VARIANCE_TOLERANCE) {
        next.set(key, `Cannot exceed outstanding of OMR ${formatOMR(row.outstanding)}.`);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleRemarksChange = (key: string, value: string) => {
    setRows(prev => prev.map(r => (rowKey(r) === key ? { ...r, remarks: value } : r)));
    setDirtyKeys(prev => new Set(prev).add(key));
  };

  const handleSavePlan = async () => {
    if (dirtyKeys.size === 0) {
      alert('No changes to save.');
      return;
    }
    if (invalidKeys.size > 0) {
      alert('Please fix the invalid Should Pay values before saving.');
      return;
    }

    // Full-replace semantics per month: for any month with a dirty row, resend ALL of that
    // month's rows (from the complete unfiltered set) so other employees' saved plan lines
    // for the same month aren't wiped out.
    const dirtyMonths = new Set(rows.filter(r => dirtyKeys.has(rowKey(r))).map(r => r.payrollMonth));

    const plans = Array.from(dirtyMonths).map(month => {
      const monthRows = rows.filter(r => r.payrollMonth === month);
      return {
        payrollMonth: month,
        payrollId: monthRows[0]?.payrollId,
        lines: monthRows.map(r => ({
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          shouldPayAmount: r.shouldPayAmount,
          remarks: r.remarks,
        })),
      };
    });

    try {
      setSaving(true);
      await apiRequest('/api/payment-planning/save', {
        method: 'POST',
        body: JSON.stringify({ plans }),
      });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save payment plan');
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Payment Planning Sheet', 14, 16);
    doc.setFontSize(9);
    const filterSummary = [
      filterSummaryText('Month', monthFilter, monthOptions),
      filterSummaryText('Company', companyFilter, COMPANY_OPTIONS),
      filterSummaryText('Paid By', paidByFilter, PAID_BY_OPTIONS),
      filterSummaryText('WPS', wpsFilter, WPS_OPTIONS),
      filterSummaryText('Status', statusFilter, STATUS_OPTIONS),
    ].filter(Boolean).join(' • ') || 'No filters applied';
    doc.text(filterSummary, 14, 22);
    doc.text(`Total Should Pay: OMR ${formatOMR(totalShouldPay)}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [['Employee ID', 'Employee Name', 'Month', 'Net Salary', 'Actual Paid (ref.)', 'Should Pay', 'Variance']],
      body: filteredRows.map(r => [
        r.employeeId,
        r.employeeName,
        r.payrollMonth,
        formatOMR(r.netSalary),
        formatOMR(r.totalPaid),
        formatOMR(r.shouldPayAmount),
        formatOMR(r.shouldPayAmount - r.outstanding),
      ]),
      foot: [['', '', '', '', '', 'Total Should Pay', formatOMR(totalShouldPay)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`Payment_Planning_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            Payment Planning Sheet
          </h2>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {canExport && (
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-600" />
              Export PDF
            </button>
          )}
          {canEdit && (
            <button
              onClick={handleSavePlan}
              disabled={saving || dirtyKeys.size === 0 || invalidKeys.size > 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : `Save Payment Plan${dirtyKeys.size > 0 ? ` (${dirtyKeys.size})` : ''}`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <span className="text-xs font-semibold text-rose-700">Total Outstanding Salaries</span>
          <strong className="block text-2xl font-bold text-rose-900 mt-1 font-mono">
            OMR {formatOMR(totalOutstandingSalaries)}
          </strong>
          <span className="text-[11px] text-rose-500 mt-1 block">
            Total unpaid liability across {filteredRows.length} filtered line(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
          <span className="text-xs font-semibold text-amber-700">Total of Last Unpaid Months</span>
          <strong className="block text-2xl font-bold text-amber-900 mt-1 font-mono">
            OMR {formatOMR(totalLastUnpaidMonths)}
          </strong>
          <span className="text-[11px] text-amber-600 mt-1 block">
            Sum of each employee's oldest outstanding month
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 shadow-xs">
          <span className="text-xs font-semibold text-indigo-700">Total of Should Pay</span>
          <strong className="block text-2xl font-bold text-indigo-900 mt-1 font-mono">
            OMR {formatOMR(totalShouldPay)}
          </strong>
          <span className="text-[11px] text-indigo-500 mt-1 block">
            Live sum of editable Should Pay values — updates instantly
          </span>
        </div>

        <div className={`bg-white p-4 rounded-xl border shadow-xs ${
          pendingOfLastMonths >= 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'
        }`}>
          <span className={`text-xs font-semibold ${pendingOfLastMonths >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            Pending of Last Months
          </span>
          <strong className={`block text-2xl font-bold mt-1 font-mono ${pendingOfLastMonths >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
            OMR {formatOMR(pendingOfLastMonths)}
          </strong>
          <span className={`text-[11px] mt-1 block ${pendingOfLastMonths >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            Last Unpaid Months − Should Pay
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search employee by ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Planning Filters</span>
            <span className="text-xs text-slate-500 font-medium">
              (Showing {displayRows.length} records)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
              Outstanding: OMR {formatOMR(totalOutstandingSalaries)}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700">
              Should Pay: OMR {formatOMR(totalShouldPay)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              Sort: <span className="font-semibold text-indigo-600">{sortColumn === 'default' ? 'Type (Staff/Worker) → Company (ASC) → Emp Code (ASC) → Month (DESC)' : `${sortColumn} (${sortDirection.toUpperCase()})`}</span>
            </span>
            {isFiltering && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Reset Filters
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 flex-1 min-w-0">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 font-medium"
            >
              <option value="ALL">All Types (Staff & Worker)</option>
              <option value="Staff">Staff</option>
              <option value="Worker">Worker</option>
            </select>
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 truncate font-medium"
            >
              <option value="ALL">All Designations</option>
              {availableJobs.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <MultiSelectDropdown
              allLabel="All Months"
              options={monthOptions}
              selected={monthFilter}
              onChange={setMonthFilter}
            />
            <MultiSelectDropdown
              allLabel="All Companies"
              options={COMPANY_OPTIONS}
              selected={companyFilter}
              onChange={setCompanyFilter}
            />
            <MultiSelectDropdown
              allLabel="All Paid By"
              options={PAID_BY_OPTIONS}
              selected={paidByFilter}
              onChange={setPaidByFilter}
            />
            <MultiSelectDropdown
              allLabel="WPS: All"
              options={WPS_OPTIONS}
              selected={wpsFilter}
              onChange={setWpsFilter}
            />
            <MultiSelectDropdown
              allLabel="All Statuses"
              options={STATUS_OPTIONS}
              selected={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            disabled={!isFiltering}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 gap-2">
          <span>
            Showing <strong className="text-slate-700 font-semibold">{displayRows.length}</strong> record{displayRows.length === 1 ? '' : 's'}
            {isFiltering && ' (filtered)'}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Sort: <span className="font-semibold text-slate-600 capitalize">{sortColumn === 'default' ? 'Type (Staff/Worker) → Company (ASC) → Emp Code (ASC) → Month (DESC)' : `${sortColumn} (${sortDirection.toUpperCase()})`}</span>
            </span>
            {sortColumn !== 'default' && (
              <button
                type="button"
                onClick={() => {
                  setSortColumn('default');
                  setSortDirection('asc');
                }}
                className="text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
              >
                Reset Sort
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Planning Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Resizing & Controls Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Payment Planning Sheet</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 text-[11px]">
              Drag column edges to resize • Double-click edge to reset width
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isColumnsResized && (
              <button
                type="button"
                onClick={handleResetAllColumns}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded shadow-2xs transition-colors cursor-pointer"
                title="Reset all column widths to default"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                Reset Columns
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-xs table-fixed border-collapse"
            style={{ minWidth: `${totalTableWidth}px` }}
          >
            <colgroup>
              <col style={{ width: `${columnWidths.employee || DEFAULT_PLANNING_COLUMN_WIDTHS.employee}px` }} />
              <col style={{ width: `${columnWidths.month || DEFAULT_PLANNING_COLUMN_WIDTHS.month}px` }} />
              <col style={{ width: `${columnWidths.netSalary || DEFAULT_PLANNING_COLUMN_WIDTHS.netSalary}px` }} />
              <col style={{ width: `${columnWidths.lastPaid || DEFAULT_PLANNING_COLUMN_WIDTHS.lastPaid}px` }} />
              <col style={{ width: `${columnWidths.lastPaymentDate || DEFAULT_PLANNING_COLUMN_WIDTHS.lastPaymentDate}px` }} />
              <col style={{ width: `${columnWidths.status || DEFAULT_PLANNING_COLUMN_WIDTHS.status}px` }} />
              <col style={{ width: `${columnWidths.outstanding || DEFAULT_PLANNING_COLUMN_WIDTHS.outstanding}px` }} />
              <col style={{ width: `${columnWidths.shouldPay || DEFAULT_PLANNING_COLUMN_WIDTHS.shouldPay}px` }} />
              <col style={{ width: `${columnWidths.remarks || DEFAULT_PLANNING_COLUMN_WIDTHS.remarks}px` }} />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider select-none">
              <tr>
                <th
                  onClick={() => handleSort('employee')}
                  className="px-4 py-3 relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">Employee</span>
                    {renderSortIcon('employee')}
                  </div>
                  {renderResizer('employee', 'Employee')}
                </th>
                <th
                  onClick={() => handleSort('month')}
                  className="px-3 py-3 relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">Month</span>
                    {renderSortIcon('month')}
                  </div>
                  {renderResizer('month', 'Month')}
                </th>
                <th
                  onClick={() => handleSort('netSalary')}
                  className="px-4 py-3 text-right relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end">
                    <span className="truncate">Net Salary</span>
                    {renderSortIcon('netSalary')}
                  </div>
                  {renderResizer('netSalary', 'Net Salary')}
                </th>
                <th
                  onClick={() => handleSort('lastPaid')}
                  className="px-4 py-3 text-right relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end">
                    <span className="truncate">Last Paid</span>
                    {renderSortIcon('lastPaid')}
                  </div>
                  {renderResizer('lastPaid', 'Last Paid')}
                </th>
                <th
                  onClick={() => handleSort('lastPaymentDate')}
                  className="px-3 py-3 relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">Last Payment Date</span>
                    {renderSortIcon('lastPaymentDate')}
                  </div>
                  {renderResizer('lastPaymentDate', 'Last Payment Date')}
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-3 py-3 text-center relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="truncate">Status</span>
                    {renderSortIcon('status')}
                  </div>
                  {renderResizer('status', 'Status')}
                </th>
                <th
                  onClick={() => handleSort('outstanding')}
                  className="px-4 py-3 text-right relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end">
                    <span className="truncate">Current Outstanding</span>
                    {renderSortIcon('outstanding')}
                  </div>
                  {renderResizer('outstanding', 'Current Outstanding')}
                </th>
                <th
                  onClick={() => handleSort('shouldPay')}
                  className="px-4 py-3 text-right relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end">
                    <span className="truncate">Should Pay</span>
                    {renderSortIcon('shouldPay')}
                  </div>
                  {renderResizer('shouldPay', 'Should Pay')}
                </th>
                <th
                  onClick={() => handleSort('remarks')}
                  className="px-4 py-3 relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">Remarks</span>
                    {renderSortIcon('remarks')}
                  </div>
                  {renderResizer('remarks', 'Remarks')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-400">Loading planning sheet...</td></tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    <p className="text-sm font-semibold">No planning rows match the selected filters.</p>
                    {isFiltering && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="text-xs mt-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => {
                  const key = rowKey(r);
                  const invalidMsg = invalidKeys.get(key);

                  return (
                    <tr
                      key={key}
                      className={`${dirtyKeys.has(key) ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'} ${
                        r.isLastInGroup ? 'border-b-2 border-slate-300' : ''
                      }`}
                    >
                      {r.dynamicFirst && (
                        <td className="px-4 py-3 align-top" rowSpan={r.dynamicSpan}>
                          <span className="font-mono font-bold text-blue-600 block">{r.employeeId}</span>
                          <span className="font-semibold text-slate-900">{r.employeeName}</span>
                        </td>
                      )}
                      <td className="px-3 py-3 font-mono text-slate-600">{r.payrollMonth}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">OMR {formatOMR(r.netSalary)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">OMR {formatOMR(r.lastPaidSalary)}</td>
                      <td className="px-3 py-3 text-slate-500">{r.lastPaymentDate ? formatDate(r.lastPaymentDate) : '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'Fully Paid' ? 'bg-emerald-100 text-emerald-800' :
                          r.status === 'Partially Paid' ? 'bg-amber-100 text-amber-800' :
                          'bg-rose-100 text-rose-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-rose-600">OMR {formatOMR(r.outstanding)}</td>
                      <td className="px-4 py-3 text-right">
                        {r.status !== 'Fully Paid' ? (
                          canEdit ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <input
                                type="number"
                                step="0.001"
                                value={r.shouldPayAmount}
                                onChange={(e) => handleShouldPayChange(r, e.target.value)}
                                className={`w-28 px-2 py-1 text-right font-mono font-bold text-indigo-800 border rounded-md focus:ring-2 ${
                                  invalidMsg ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-200 focus:ring-indigo-500'
                                }`}
                              />
                              {invalidMsg && (
                                <span className="text-[10px] text-rose-600 text-right max-w-[9rem]">{invalidMsg}</span>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono font-bold text-indigo-800">OMR {formatOMR(r.shouldPayAmount)}</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <input
                            type="text"
                            value={r.remarks}
                            onChange={(e) => handleRemarksChange(key, e.target.value)}
                            placeholder="Optional notes..."
                            className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="text-slate-500">{r.remarks || '—'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
