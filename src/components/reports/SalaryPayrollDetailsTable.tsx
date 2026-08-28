import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatOMR } from '../../api/client';
import { ChevronUp, ChevronDown, Settings2, ChevronRight } from 'lucide-react';

interface ColumnDef {
  id: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render: (r: any, idx: number) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'sr', label: 'Sr#', render: (_r, idx) => idx + 1 },
  { id: 'employeeCompany', label: 'Company', sortable: true, render: r => r.employeeCompany },
  { id: 'salaryPaidBy', label: 'Pay By', sortable: true, render: r => r.salaryPaidBy },
  { id: 'payrollMonth', label: 'Month', sortable: true, render: r => r.payrollMonth },
  { id: 'wpsEmployee', label: 'WPS Status', align: 'center', render: r => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.wpsEmployee === 'Yes' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
      {r.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS'}
    </span>
  ) },
  { id: 'employeeId', label: 'Employee ID', render: r => r.employeeId },
  { id: 'employeeName', label: 'Employee Name', sortable: true, render: r => r.employeeName },
  { id: 'employeeType', label: 'Employee Type', render: r => r.employeeType },
  { id: 'nationalityType', label: 'Nationality', render: r => r.nationalityType },
  { id: 'designation', label: 'Designation', render: r => r.designation },
  { id: 'projectsSummary', label: 'Project', render: r => r.projectsSummary },
  { id: 'basicSalaryOrRate', label: 'Salary / Rate', align: 'right', render: r => formatOMR(r.basicSalaryOrRate) },
  { id: 'hrsOrDays', label: 'Hrs / Days', align: 'right', render: r => (r.employeeType === 'Staff' ? `${r.daysWorked}d` : `${r.hoursWorked}h`) },
  { id: 'houseAllowance', label: 'House Allowance', align: 'right', render: r => formatOMR(r.houseAllowance) },
  { id: 'transportAllowance', label: 'Transport Allowance', align: 'right', render: r => formatOMR(r.transportAllowance) },
  { id: 'bonus', label: 'Bonus', align: 'right', render: r => formatOMR(r.bonus) },
  { id: 'otherAllowance', label: 'Other Allowance', align: 'right', render: r => formatOMR(r.otherAllowance) },
  { id: 'grossSalary', label: 'Gross Salary', sortable: true, align: 'right', render: r => <span className="font-bold text-slate-900">{formatOMR(r.grossSalary)}</span> },
  { id: 'totalAdditions', label: 'Addition', sortable: true, align: 'right', render: r => <span className="text-emerald-700">{formatOMR(r.totalAdditions)}</span> },
  { id: 'loanRecovery', label: 'Loan Deduction', align: 'right', render: r => formatOMR(r.loanRecovery) },
  { id: 'otherDeductions', label: 'Other Deduction', align: 'right', render: r => formatOMR(r.otherDeductions) },
  { id: 'totalDeductions', label: 'Deduction', sortable: true, align: 'right', render: r => <span className="text-rose-600">{formatOMR(r.totalDeductions)}</span> },
  { id: 'netSalary', label: 'Net Salary', sortable: true, align: 'right', render: r => <span className="font-bold text-blue-700">{formatOMR(r.netSalary)}</span> },
  { id: 'totalPaid', label: 'Last Paid Amount', align: 'right', render: r => (r.totalPaid === null ? '—' : formatOMR(r.totalPaid)) },
  { id: 'outstanding', label: 'Outstanding', sortable: true, align: 'right', render: r => (r.outstanding === null ? '—' : <span className="text-rose-600">{formatOMR(r.outstanding)}</span>) },
  { id: 'wpsSalary', label: 'WPS Amount', align: 'right', render: r => formatOMR(r.wpsSalary) },
  { id: 'payrollStatus', label: 'Payroll Status', render: r => r.payrollStatus },
  { id: 'paymentStatus', label: 'Payment Status', sortable: true, align: 'center', render: r => {
    const colors: Record<string, string> = { 'Fully Paid': 'bg-emerald-100 text-emerald-800', 'Partially Paid': 'bg-amber-100 text-amber-800', Unpaid: 'bg-rose-100 text-rose-800', 'In Revision': 'bg-slate-100 text-slate-600' };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[r.paymentStatus] || 'bg-slate-100 text-slate-600'}`}>{r.paymentStatus}</span>;
  } },
];

const DEFAULT_VISIBLE = ['employeeCompany', 'salaryPaidBy', 'payrollMonth', 'wpsEmployee', 'employeeId', 'employeeName', 'basicSalaryOrRate', 'hrsOrDays', 'grossSalary', 'totalAdditions', 'totalDeductions', 'netSalary', 'paymentStatus'];
const STORAGE_KEY = 'salaryPayrollReport.visibleColumns';
const GROUP_OPTIONS = [
  { value: '', label: 'No Grouping' },
  { value: 'employeeCompany', label: 'Company' },
  { value: 'payrollMonth', label: 'Month' },
  { value: 'salaryPaidBy', label: 'Pay By' },
  { value: 'employeeType', label: 'Employee Type' },
  { value: 'paymentStatus', label: 'Payment Status' },
];
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

interface Props {
  data: any;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  groupBy: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSortChange: (col: string, dir: 'asc' | 'desc') => void;
  onGroupByChange: (col: string) => void;
  onRowClick: (employeeId: string) => void;
}

export const SalaryPayrollDetailsTable: React.FC<Props> = ({
  data, page, pageSize, sortBy, sortDir, groupBy,
  onPageChange, onPageSizeChange, onSortChange, onGroupByChange, onRowClick,
}) => {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE;
    } catch {
      return DEFAULT_VISIBLE;
    }
  });
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      // localStorage unavailable -- column choice just won't persist, non-fatal.
    }
  }, [visibleColumns]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) setColumnMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const columns = useMemo(() => ALL_COLUMNS.filter(c => c.id === 'sr' || visibleColumns.includes(c.id)), [visibleColumns]);

  const toggleColumn = (id: string) => {
    setVisibleColumns(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
  };

  const handleSort = (col: ColumnDef) => {
    if (!col.sortable) return;
    if (sortBy === col.id) onSortChange(col.id, sortDir === 'asc' ? 'desc' : 'asc');
    else onSortChange(col.id, 'asc');
  };

  const rows: any[] = data.rows || [];
  const totalCount = data.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / (groupBy ? totalCount || 1 : pageSize)));

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, any[]>();
    rows.forEach(r => {
      const key = r[groupBy] ?? '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [rows, groupBy]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderRow = (r: any, idx: number) => (
    <tr key={`${r.employeeId}_${r.payrollMonth}_${idx}`} onClick={() => onRowClick(r.employeeId)} className="hover:bg-blue-50/40 cursor-pointer transition-colors">
      {columns.map(col => (
        <td key={col.id} className={`px-3 py-2 ${col.align === 'right' ? 'text-right font-mono' : col.align === 'center' ? 'text-center' : ''}`}>
          {col.render(r, idx)}
        </td>
      ))}
    </tr>
  );

  const grandTotals = data.summary;

  return (
    <div className="space-y-3">
      {/* Toolbar: Grouping + Column Settings + Page Size */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Group by:</span>
          <select value={groupBy} onChange={(e) => onGroupByChange(e.target.value)} className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs">
            {GROUP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div className="relative" ref={columnMenuRef}>
          <button onClick={() => setColumnMenuOpen(o => !o)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
            <Settings2 className="w-3.5 h-3.5" /> Column Settings
          </button>
          {columnMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg max-h-80 overflow-y-auto py-2">
              <div className="px-3 pb-2 flex justify-between items-center border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-700">Visible Columns</span>
                <button onClick={() => setVisibleColumns(DEFAULT_VISIBLE)} className="text-[10px] text-blue-600 hover:underline cursor-pointer">Reset</button>
              </div>
              {ALL_COLUMNS.filter(c => c.id !== 'sr').map(col => (
                <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={visibleColumns.includes(col.id)} onChange={() => toggleColumn(col.id)} className="rounded border-slate-300 text-blue-600" />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                {columns.map(col => (
                  <th
                    key={col.id}
                    onClick={() => handleSort(col)}
                    className={`px-3 py-3 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.sortable ? 'cursor-pointer select-none hover:text-slate-800' : ''}`}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {col.label}
                      {col.sortable && sortBy === col.id && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="px-6 py-10 text-center text-slate-400">No records match the current filters.</td></tr>
              ) : groups ? (
                groups.map(([key, groupRows]) => {
                  const isCollapsed = collapsedGroups.has(key);
                  const groupNet = groupRows.reduce((s, r) => s + r.netSalary, 0);
                  const groupGross = groupRows.reduce((s, r) => s + r.grossSalary, 0);
                  return (
                    <React.Fragment key={key}>
                      <tr onClick={() => toggleGroup(key)} className="bg-slate-50 hover:bg-slate-100 cursor-pointer font-bold">
                        <td colSpan={columns.length} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                            <span>{key}</span>
                            <span className="text-slate-400 font-normal">({groupRows.length} records)</span>
                            <span className="ml-auto font-mono">Gross OMR {formatOMR(groupGross)} · Net OMR {formatOMR(groupNet)}</span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed && groupRows.map((r, idx) => renderRow(r, idx))}
                    </React.Fragment>
                  );
                })
              ) : (
                rows.map((r, idx) => renderRow(r, idx))
              )}
            </tbody>
            {grandTotals && rows.length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                <tr>
                  {columns.map((col, i) => {
                    if (i === 0) return <td key={col.id} className="px-3 py-2">GRAND TOTAL</td>;
                    if (col.id === 'grossSalary') return <td key={col.id} className="px-3 py-2 text-right font-mono">{formatOMR(grandTotals.grossSalary)}</td>;
                    if (col.id === 'totalAdditions') return <td key={col.id} className="px-3 py-2 text-right font-mono text-emerald-700">{formatOMR(grandTotals.totalAdditions)}</td>;
                    if (col.id === 'totalDeductions') return <td key={col.id} className="px-3 py-2 text-right font-mono text-rose-600">{formatOMR(grandTotals.totalDeductions)}</td>;
                    if (col.id === 'netSalary') return <td key={col.id} className="px-3 py-2 text-right font-mono text-blue-700">{formatOMR(grandTotals.netSalary)}</td>;
                    if (col.id === 'totalPaid') return <td key={col.id} className="px-3 py-2 text-right font-mono">{formatOMR(grandTotals.totalPaid)}</td>;
                    if (col.id === 'outstanding') return <td key={col.id} className="px-3 py-2 text-right font-mono text-rose-600">{formatOMR(grandTotals.totalOutstanding)}</td>;
                    return <td key={col.id} className="px-3 py-2" />;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Pagination */}
      {!groupBy && (
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Rows per page:</span>
            {PAGE_SIZE_OPTIONS.map(n => (
              <button key={n} onClick={() => onPageSizeChange(n)} className={`px-2 py-1 rounded-md cursor-pointer ${pageSize === n ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 hover:bg-slate-200'}`}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="px-2.5 py-1 bg-white border border-slate-300 rounded-md disabled:opacity-40 cursor-pointer">Prev</button>
            <span>Page {page} of {totalPages} ({totalCount} records)</span>
            <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="px-2.5 py-1 bg-white border border-slate-300 rounded-md disabled:opacity-40 cursor-pointer">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};
