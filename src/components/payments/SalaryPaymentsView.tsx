import React, { useState, useEffect, useMemo, useRef } from 'react';
import { apiRequest, formatOMR, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ReceiptViewerModal } from '../common/ReceiptViewerModal';
import {
  CreditCard,
  Download,
  Upload,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Paperclip,
  Trash2,
  Pencil,
  Calendar,
  X,
  Save,
  FileSpreadsheet,
  Eye,
  RotateCcw,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { SalaryPayment, PaymentMode } from '../../types/index';

interface FlatPaymentRow {
  employeeId: string;
  employeeName: string;
  employeeCompany: string;
  salaryPaidBy: string;
  wpsEmployee: string;
  payrollMonth: string;
  payrollLineId: string;
  employeeType: string;
  designation: string;
  paymentMethod: string;
  netSalary: number;
  totalPaid: number;
  outstanding: number;
  paymentStatus: string;
  receiptStatus: string;
  transactions: SalaryPayment[];
  isFirstOfGroup: boolean;
  groupSize: number;
}

const emptyPayForm = () => ({
  amountPaid: '0.000',
  paymentDate: new Date().toISOString().split('T')[0],
  payTo: '',
  paymentMode: 'Bank Transfer' as PaymentMode,
  referenceNumber: '',
  bankName: 'Bank Muscat',
  receiptFileData: null as string | null,
  receiptFileName: null as string | null,
  remarks: '',
});

export const SalaryPaymentsView: React.FC = () => {
  const { hasPermission } = useAuth();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [showAllMonths, setShowAllMonths] = useState(true);
  const [rows, setRows] = useState<FlatPaymentRow[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [paidByFilter, setPaidByFilter] = useState('ALL');
  const [wpsFilter, setWpsFilter] = useState('ALL');
  const [wageTypeFilter, setWageTypeFilter] = useState('ALL');
  const [receiptStatusFilter, setReceiptStatusFilter] = useState('ALL');

  // Sorting state
  type SalaryPaymentSortColumn =
    | 'default'
    | 'company'
    | 'payBy'
    | 'wps'
    | 'employee'
    | 'month'
    | 'netSalary'
    | 'disbursed'
    | 'remaining'
    | 'status'
    | 'receipts'
    | 'remarks';

  const [sortColumn, setSortColumn] = useState<SalaryPaymentSortColumn>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Resizable columns configuration & state
  const DEFAULT_PAYMENT_COLUMN_WIDTHS: Record<string, number> = {
    company: 110,
    payBy: 110,
    wps: 95,
    employee: 210,
    month: 95,
    netSalary: 125,
    disbursed: 125,
    remaining: 135,
    status: 110,
    receipts: 90,
    history: 80,
    action: 110,
    remarks: 160,
  };

  const MIN_PAYMENT_COLUMN_WIDTHS: Record<string, number> = {
    company: 75,
    payBy: 75,
    wps: 70,
    employee: 140,
    month: 75,
    netSalary: 90,
    disbursed: 90,
    remaining: 95,
    status: 80,
    receipts: 70,
    history: 65,
    action: 85,
    remarks: 100,
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('salary_payments_col_widths_v1');
      if (saved) {
        return { ...DEFAULT_PAYMENT_COLUMN_WIDTHS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_PAYMENT_COLUMN_WIDTHS;
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
    const startWidth = columnWidths[colKey] || DEFAULT_PAYMENT_COLUMN_WIDTHS[colKey] || 100;
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
      const minW = MIN_PAYMENT_COLUMN_WIDTHS[colKey] || 50;
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
            localStorage.setItem('salary_payments_col_widths_v1', JSON.stringify(current));
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
      const next = { ...prev, [colKey]: DEFAULT_PAYMENT_COLUMN_WIDTHS[colKey] };
      try {
        localStorage.setItem('salary_payments_col_widths_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetAllColumns = () => {
    setColumnWidths(DEFAULT_PAYMENT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem('salary_payments_col_widths_v1');
    } catch {
      // ignore
    }
  };

  const isColumnsResized = Object.keys(DEFAULT_PAYMENT_COLUMN_WIDTHS).some(
    k => columnWidths[k] !== DEFAULT_PAYMENT_COLUMN_WIDTHS[k]
  );

  const totalTableWidth = (Object.values(columnWidths) as number[]).reduce(
    (sum, w) => sum + (Number(w) || 0),
    0
  );

  const handleSort = (column: SalaryPaymentSortColumn) => {
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

  const renderSortIcon = (column: SalaryPaymentSortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-600 ml-1 shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-600 ml-1 shrink-0 font-bold" />
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
        resizingCol === colKey ? 'bg-emerald-400/20' : 'hover:bg-slate-300/40'
      }`}
      title="Drag to resize • Double-click to reset width"
    >
      <div
        className={`w-[2px] h-4 rounded-full transition-colors ${
          resizingCol === colKey ? 'bg-emerald-600' : 'bg-slate-300 group-hover/resizer:bg-emerald-500'
        }`}
      />
    </div>
  );

  const isFiltering = Boolean(
    search || statusFilter !== 'ALL' || companyFilter !== 'ALL' || paidByFilter !== 'ALL' ||
    wpsFilter !== 'ALL' || wageTypeFilter !== 'ALL' || receiptStatusFilter !== 'ALL'
  );

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setCompanyFilter('ALL');
    setPaidByFilter('ALL');
    setWpsFilter('ALL');
    setWageTypeFilter('ALL');
    setReceiptStatusFilter('ALL');
  };

  const sortedRows = useMemo(() => {
    if (sortColumn === 'default') {
      return rows;
    }
    return [...rows].sort((a, b) => {
      let diff = 0;
      switch (sortColumn) {
        case 'company':
          diff = (a.employeeCompany || '').localeCompare(b.employeeCompany || '');
          break;
        case 'payBy':
          diff = (a.salaryPaidBy || '').localeCompare(b.salaryPaidBy || '');
          break;
        case 'wps':
          diff = (a.wpsEmployee || '').localeCompare(b.wpsEmployee || '');
          break;
        case 'employee':
          diff = (a.employeeName || '').localeCompare(b.employeeName || '');
          break;
        case 'month':
          diff = (a.payrollMonth || '').localeCompare(b.payrollMonth || '');
          break;
        case 'netSalary':
          diff = (Number(a.netSalary) || 0) - (Number(b.netSalary) || 0);
          break;
        case 'disbursed':
          diff = (Number(a.totalPaid) || 0) - (Number(b.totalPaid) || 0);
          break;
        case 'remaining':
          diff = (Number(a.outstanding) || 0) - (Number(b.outstanding) || 0);
          break;
        case 'status':
          diff = (a.paymentStatus || '').localeCompare(b.paymentStatus || '');
          break;
        case 'receipts': {
          const aCount = a.transactions.filter(t => t.receiptStoragePath).length;
          const bCount = b.transactions.filter(t => t.receiptStoragePath).length;
          diff = aCount - bCount;
          break;
        }
        case 'remarks': {
          const aRem = a.transactions.map(t => t.remarks).filter(Boolean).join(' ');
          const bRem = b.transactions.map(t => t.remarks).filter(Boolean).join(' ');
          diff = aRem.localeCompare(bRem);
          break;
        }
        default:
          diff = 0;
      }
      if (diff !== 0) {
        return sortDirection === 'asc' ? diff : -diff;
      }
      const empCmp = (a.employeeName || '').localeCompare(b.employeeName || '');
      if (empCmp !== 0) return empCmp;
      return (b.payrollMonth || '').localeCompare(a.payrollMonth || '');
    });
  }, [rows, sortColumn, sortDirection]);

  // Compute consecutive runs with same employeeId so rowSpan never breaks when sorted
  const displayRows = useMemo(() => {
    let lastEmpId: string | null = null;
    let currentGroup: FlatPaymentRow[] = [];
    const result: (FlatPaymentRow & { dynamicFirst: boolean; dynamicSpan: number })[] = [];

    const flush = () => {
      if (currentGroup.length > 0) {
        const span = currentGroup.length;
        currentGroup.forEach((r, idx) => {
          result.push({
            ...r,
            dynamicFirst: idx === 0,
            dynamicSpan: span,
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

  // Pay Now modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<FlatPaymentRow | null>(null);
  const [payForm, setPayForm] = useState(emptyPayForm());
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // History modal
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedEmployeeHistory, setSelectedEmployeeHistory] = useState<SalaryPayment[]>([]);

  // Edit Payment modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SalaryPayment | null>(null);
  const [editForm, setEditForm] = useState(emptyPayForm());

  // Reverse confirmation modal
  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');

  // Receipt Viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerData, setViewerData] = useState<{ url: string; name?: string; empName?: string; amount?: number } | null>(null);

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set('month', showAllMonths ? 'ALL' : month);
    if (search) params.set('search', search);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (companyFilter !== 'ALL') params.set('company', companyFilter);
    if (paidByFilter !== 'ALL') params.set('paidBy', paidByFilter);
    if (wpsFilter !== 'ALL') params.set('wps', wpsFilter);
    if (wageTypeFilter !== 'ALL') params.set('wageType', wageTypeFilter);
    if (receiptStatusFilter !== 'ALL') params.set('receiptStatus', receiptStatusFilter);
    return params.toString();
  };

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = buildQuery();
      const [grouped, summaryData] = await Promise.all([
        apiRequest(`/api/payments/grouped?${qs}`),
        apiRequest(`/api/payments/summary?${qs}`),
      ]);

      const flat: FlatPaymentRow[] = [];
      for (const emp of grouped) {
        const months = emp.months || [];
        months.forEach((m: any, idx: number) => {
          flat.push({
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            employeeCompany: emp.employeeCompany,
            salaryPaidBy: emp.salaryPaidBy,
            wpsEmployee: emp.wpsEmployee,
            payrollMonth: m.payrollMonth,
            payrollLineId: m.payrollLineId,
            employeeType: m.employeeType,
            designation: m.designation,
            paymentMethod: m.paymentMethod,
            netSalary: m.netSalary,
            totalPaid: m.totalPaid,
            outstanding: m.outstanding,
            paymentStatus: m.status,
            receiptStatus: m.receiptStatus,
            transactions: m.transactions || [],
            isFirstOfGroup: idx === 0,
            groupSize: months.length,
          });
        });
      }

      setRows(flat);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payment ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, showAllMonths, search, statusFilter, companyFilter, paidByFilter, wpsFilter, wageTypeFilter, receiptStatusFilter]);

  const handleOpenPay = (row: FlatPaymentRow) => {
    setSelectedRow(row);
    setDuplicateWarning(null);
    setDuplicateConfirmed(false);
    setPayForm({
      ...emptyPayForm(),
      amountPaid: formatOMR(row.outstanding > 0 ? row.outstanding : row.netSalary),
      paymentMode: row.paymentMethod === 'WPS' ? 'WPS Transfer' : 'Bank Transfer',
      remarks: `Salary payment for ${row.payrollMonth}`,
    });
    setIsPayModalOpen(true);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'pay' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const update = { receiptFileData: evt.target?.result as string, receiptFileName: file.name };
      if (target === 'pay') setPayForm((prev) => ({ ...prev, ...update }));
      else setEditForm((prev) => ({ ...prev, ...update }));
    };
    reader.readAsDataURL(file);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRow) return;

    const amt = Number(payForm.amountPaid);
    if (isNaN(amt) || amt <= 0) {
      alert('Payment amount must be greater than zero.');
      return;
    }
    if (!payForm.payTo.trim()) {
      alert('Pay To is required.');
      return;
    }

    if (!duplicateConfirmed) {
      try {
        setCheckingDuplicate(true);
        const dup = await apiRequest('/api/payments/check-duplicate', {
          method: 'POST',
          body: JSON.stringify({
            employeeId: selectedRow.employeeId,
            payrollMonth: selectedRow.payrollMonth,
            paymentDate: payForm.paymentDate,
            payAmount: amt,
            payTo: payForm.payTo,
          }),
        });
        if (dup.isDuplicate) {
          setDuplicateWarning(dup.warning);
          return;
        }
      } catch {
        // Advisory check only — if it fails, proceed to the authoritative backend validation.
      } finally {
        setCheckingDuplicate(false);
      }
    }

    try {
      await apiRequest('/api/payments/transactions', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: selectedRow.employeeId,
          payrollMonth: selectedRow.payrollMonth,
          payrollLineId: selectedRow.payrollLineId,
          payAmount: amt,
          paymentDate: payForm.paymentDate,
          payTo: payForm.payTo,
          paymentMode: payForm.paymentMode,
          bankName: payForm.bankName,
          referenceNumber: payForm.referenceNumber,
          receiptFileData: payForm.receiptFileData,
          receiptFileName: payForm.receiptFileName,
          remarks: payForm.remarks,
          // The server enforces the duplicate check too, so an explicit confirmation has
          // to travel with the request -- the advisory pre-check alone is no longer enough.
          allowDuplicate: duplicateConfirmed,
        }),
      });

      setIsPayModalOpen(false);
      setDuplicateWarning(null);
      setDuplicateConfirmed(false);
      fetchPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to disburse payment');
    }
  };

  const handleOpenHistory = async (row: FlatPaymentRow) => {
    setSelectedRow(row);
    try {
      const data = await apiRequest(`/api/payments/transactions?employeeId=${row.employeeId}&month=${row.payrollMonth}`);
      setSelectedEmployeeHistory(data);
      setIsHistoryModalOpen(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenEdit = (p: SalaryPayment) => {
    setEditingPayment(p);
    setEditForm({
      amountPaid: formatOMR(p.payAmount),
      paymentDate: p.paymentDate,
      payTo: p.payTo || '',
      paymentMode: (p.paymentMode as PaymentMode) || 'Bank Transfer',
      referenceNumber: p.referenceNumber || '',
      bankName: p.bankName || '',
      receiptFileData: null,
      receiptFileName: null,
      remarks: p.remarks || '',
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;

    const amt = Number(editForm.amountPaid);
    if (isNaN(amt) || amt <= 0) {
      alert('Payment amount must be greater than zero.');
      return;
    }

    try {
      await apiRequest(`/api/payments/transactions/${editingPayment.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          payAmount: amt,
          paymentDate: editForm.paymentDate,
          payTo: editForm.payTo,
          paymentMode: editForm.paymentMode,
          bankName: editForm.bankName,
          referenceNumber: editForm.referenceNumber,
          receiptFileData: editForm.receiptFileData,
          receiptFileName: editForm.receiptFileName,
          remarks: editForm.remarks,
        }),
      });
      setIsEditModalOpen(false);
      setEditingPayment(null);
      if (selectedRow) {
        const data = await apiRequest(`/api/payments/transactions?employeeId=${selectedRow.employeeId}&month=${selectedRow.payrollMonth}`);
        setSelectedEmployeeHistory(data);
      }
      fetchPayments();
    } catch (err: any) {
      alert(err.message || 'Failed to update payment');
    }
  };

  const handleOpenReverse = (paymentId: string) => {
    setReverseTargetId(paymentId);
    setReverseReason('');
    setIsReverseModalOpen(true);
  };

  const handleConfirmReverse = async () => {
    if (!reverseTargetId || !reverseReason.trim()) return;
    try {
      await apiRequest(`/api/payments/transactions/${reverseTargetId}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reverseReason.trim() }),
      });
      setIsReverseModalOpen(false);
      setReverseTargetId(null);
      setIsHistoryModalOpen(false);
      fetchPayments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openReceiptViewer = async (transactionId: string, fileName: string | null | undefined, empName: string, amount: number) => {
    try {
      const { url } = await apiRequest(`/api/payments/receipts/${transactionId}/signed-url`);
      setViewerData({ url, name: fileName || undefined, empName, amount });
      setViewerOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to open receipt.');
    }
  };

  const handleExportPayments = async () => {
    try {
      await downloadAuthenticatedFile(`/api/payments/export/data?${buildQuery()}`, 'Salary_Payments_Export.xlsx');
    } catch (err: any) {
      alert(err.message || 'Failed to export payments.');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadAuthenticatedFile(`/api/payments/export/template?month=${month}`, `Salary_Payment_Template_${month}.xlsx`);
    } catch (err: any) {
      alert(err.message || 'Failed to download template.');
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/payments/import/validate', {
          method: 'POST',
          body: JSON.stringify({ fileData: base64 }),
        });
        setImportPreview(res);
      } catch (err: any) {
        alert(err.message || 'Failed to parse payment file');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const res = await apiRequest('/api/payments/import/confirm', {
        method: 'POST',
        body: JSON.stringify({ rows: importPreview.rows }),
      });
      alert(res.message);
      setIsImportModalOpen(false);
      setImportPreview(null);
      fetchPayments();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const canCreate = hasPermission('salary_payment.create');
  const canEdit = hasPermission('salary_payment.edit');
  const canReverse = hasPermission('salary_payment.reverse');
  const canImport = hasPermission('salary_payment.import');
  const canExport = hasPermission('salary_payment.export');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Salary Payment & Disbursal Ledger
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={showAllMonths}
              className="text-xs font-semibold text-slate-800 focus:outline-hidden disabled:opacity-40"
            />
            <label className="flex items-center gap-1 text-[11px] text-slate-500 font-medium pl-1 border-l border-slate-200 cursor-pointer">
              <input type="checkbox" checked={showAllMonths} onChange={(e) => setShowAllMonths(e.target.checked)} />
              All Months
            </label>
          </div>

          {canExport && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Payment Template
              </button>

              <button
                onClick={handleExportPayments}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Export Disbursals
              </button>
            </>
          )}

          {canImport && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk Import Payments
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

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
            <span className="text-xs font-semibold text-rose-700">Outstanding Salary</span>
            <strong className="block text-xl font-bold text-rose-800 mt-1 font-mono">
              OMR {formatOMR(summary.totalOutstanding)}
            </strong>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-medium text-slate-500">Unpaid Lines</span>
            <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">{summary.unpaidCount}</strong>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
            <span className="text-xs font-semibold text-amber-700">Partially Paid</span>
            <strong className="block text-xl font-bold text-amber-800 mt-1 font-mono">{summary.partiallyPaidCount}</strong>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
            <span className="text-xs font-semibold text-emerald-700">Total Paid</span>
            <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
              OMR {formatOMR(summary.totalPaid)}
            </strong>
          </div>

          <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/30 shadow-xs">
            <span className="text-xs font-semibold text-blue-700 flex items-center gap-1"><Clock className="w-3 h-3" /> Receipts Pending</span>
            <strong className="block text-xl font-bold text-blue-800 mt-1 font-mono">{summary.pendingReceiptsCount}</strong>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search employee by ID or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Fully Paid">Fully Paid</option>
          </select>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">All Companies</option>
            <option value="DGO">DGO</option>
            <option value="SMI">SMI</option>
            <option value="NC">NC</option>
            <option value="Supplier">Supplier</option>
            <option value="Azad">Azad</option>
          </select>
          <select value={paidByFilter} onChange={(e) => setPaidByFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">All Paid By</option>
            <option value="DGO">DGO</option>
            <option value="SMI">SMI</option>
            <option value="NC">NC</option>
            <option value="Supplier">Supplier</option>
          </select>
          <select value={wpsFilter} onChange={(e) => setWpsFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">WPS: All</option>
            <option value="Yes">WPS Employees</option>
            <option value="No">Non-WPS</option>
          </select>
          <select value={wageTypeFilter} onChange={(e) => setWageTypeFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">All Wage Types</option>
            <option value="Per Hour">Per Hour</option>
            <option value="Fixed Monthly">Fixed Monthly</option>
          </select>
          <select value={receiptStatusFilter} onChange={(e) => setReceiptStatusFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500">
            <option value="ALL">All Receipts</option>
            <option value="Attached">Attached</option>
            <option value="Attachment Pending">Attachment Pending</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 gap-2">
          <span>
            Showing <strong className="text-slate-700 font-semibold">{displayRows.length}</strong> record{displayRows.length === 1 ? '' : 's'}
            {isFiltering && ' (filtered)'}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Sort: <span className="font-semibold text-slate-600 capitalize">{sortColumn === 'default' ? 'Default Grouping' : `${sortColumn} (${sortDirection.toUpperCase()})`}</span>
            </span>
            {sortColumn !== 'default' && (
              <button
                type="button"
                onClick={() => {
                  setSortColumn('default');
                  setSortDirection('asc');
                }}
                className="text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer"
              >
                Reset Sort
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Payment Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Resizing & Controls Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Salary Payment Ledger</span>
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
              <col style={{ width: `${columnWidths.company || DEFAULT_PAYMENT_COLUMN_WIDTHS.company}px` }} />
              <col style={{ width: `${columnWidths.payBy || DEFAULT_PAYMENT_COLUMN_WIDTHS.payBy}px` }} />
              <col style={{ width: `${columnWidths.wps || DEFAULT_PAYMENT_COLUMN_WIDTHS.wps}px` }} />
              <col style={{ width: `${columnWidths.employee || DEFAULT_PAYMENT_COLUMN_WIDTHS.employee}px` }} />
              <col style={{ width: `${columnWidths.month || DEFAULT_PAYMENT_COLUMN_WIDTHS.month}px` }} />
              <col style={{ width: `${columnWidths.netSalary || DEFAULT_PAYMENT_COLUMN_WIDTHS.netSalary}px` }} />
              <col style={{ width: `${columnWidths.disbursed || DEFAULT_PAYMENT_COLUMN_WIDTHS.disbursed}px` }} />
              <col style={{ width: `${columnWidths.remaining || DEFAULT_PAYMENT_COLUMN_WIDTHS.remaining}px` }} />
              <col style={{ width: `${columnWidths.status || DEFAULT_PAYMENT_COLUMN_WIDTHS.status}px` }} />
              <col style={{ width: `${columnWidths.receipts || DEFAULT_PAYMENT_COLUMN_WIDTHS.receipts}px` }} />
              <col style={{ width: `${columnWidths.history || DEFAULT_PAYMENT_COLUMN_WIDTHS.history}px` }} />
              <col style={{ width: `${columnWidths.action || DEFAULT_PAYMENT_COLUMN_WIDTHS.action}px` }} />
              <col style={{ width: `${columnWidths.remarks || DEFAULT_PAYMENT_COLUMN_WIDTHS.remarks}px` }} />
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider select-none">
              <tr>
                <th
                  onClick={() => handleSort('company')}
                  className="px-3 py-3 relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">Company</span>
                    {renderSortIcon('company')}
                  </div>
                  {renderResizer('company', 'Company')}
                </th>
                <th
                  onClick={() => handleSort('payBy')}
                  className="px-3 py-3 relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">Pay By</span>
                    {renderSortIcon('payBy')}
                  </div>
                  {renderResizer('payBy', 'Pay By')}
                </th>
                <th
                  onClick={() => handleSort('wps')}
                  className="px-3 py-3 text-center relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="truncate">WPS Status</span>
                    {renderSortIcon('wps')}
                  </div>
                  {renderResizer('wps', 'WPS Status')}
                </th>
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
                    <span className="truncate">Net Salary (OMR)</span>
                    {renderSortIcon('netSalary')}
                  </div>
                  {renderResizer('netSalary', 'Net Salary')}
                </th>
                <th
                  onClick={() => handleSort('disbursed')}
                  className="px-4 py-3 text-right relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end">
                    <span className="truncate">Disbursed (OMR)</span>
                    {renderSortIcon('disbursed')}
                  </div>
                  {renderResizer('disbursed', 'Disbursed')}
                </th>
                <th
                  onClick={() => handleSort('remaining')}
                  className="px-4 py-3 text-right relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-end">
                    <span className="truncate">Remaining Balance</span>
                    {renderSortIcon('remaining')}
                  </div>
                  {renderResizer('remaining', 'Remaining Balance')}
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
                  onClick={() => handleSort('receipts')}
                  className="px-3 py-3 text-center relative cursor-pointer group hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center justify-center">
                    <span className="truncate">Receipts</span>
                    {renderSortIcon('receipts')}
                  </div>
                  {renderResizer('receipts', 'Receipts')}
                </th>
                <th className="px-3 py-3 text-center relative">
                  <span className="truncate">History</span>
                  {renderResizer('history', 'History')}
                </th>
                <th className="px-3 py-3 text-center relative">
                  <span className="truncate">Action</span>
                  {renderResizer('action', 'Action')}
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
                <tr><td colSpan={13} className="px-6 py-10 text-center text-slate-400">Loading payment ledger...</td></tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-10 text-center text-slate-400">
                    <p className="text-sm font-semibold">No salary records match the selected filters.</p>
                    {isFiltering && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="text-xs mt-1 text-emerald-600 hover:text-emerald-800 font-semibold cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                displayRows.map((row, idx) => {
                  const receiptedTx = row.transactions.filter((tx: any) => tx.receiptStoragePath);
                  const activeTx = row.transactions.filter((tx: any) => !tx.isReversed);
                  const latestTx = activeTx.reduce(
                    (latest: any, tx: any) => (!latest || tx.paymentDate > latest.paymentDate ? tx : latest),
                    null as any
                  );
                  return (
                    <tr key={`${row.employeeId}_${row.payrollMonth}_${idx}`} className="hover:bg-slate-50/70 transition-colors">
                      {row.dynamicFirst && (
                        <>
                          <td className="px-3 py-3 text-slate-600 align-top" rowSpan={row.dynamicSpan}>{row.employeeCompany}</td>
                          <td className="px-3 py-3 text-slate-600 align-top" rowSpan={row.dynamicSpan}>{row.salaryPaidBy}</td>
                          <td className="px-3 py-3 text-center align-top" rowSpan={row.dynamicSpan}>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.wpsEmployee === 'Yes' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {row.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS'}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top" rowSpan={row.dynamicSpan}>
                            <span className="font-mono font-bold text-blue-600 block">{row.employeeId}</span>
                            <span className="font-semibold text-slate-900">{row.employeeName}</span>
                          </td>
                        </>
                      )}
                      <td className="px-3 py-3 font-mono text-slate-600">{row.payrollMonth}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        OMR {formatOMR(row.netSalary)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        OMR {formatOMR(row.totalPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span className={row.outstanding > 0 ? 'text-rose-600' : 'text-slate-400'}>
                          OMR {formatOMR(row.outstanding)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.paymentStatus === 'Fully Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.paymentStatus === 'Partially Paid'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {row.paymentStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {receiptedTx.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            {receiptedTx.map((tx: any) => (
                              <button
                                key={tx.id}
                                onClick={() => openReceiptViewer(tx.id, tx.receiptFileName, row.employeeName, tx.payAmount)}
                                title={`View receipt: ${tx.receiptFileName || 'Attachment'}`}
                                className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleOpenHistory(row)}
                          title="View Payment Transactions"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {canCreate && row.outstanding > 0 ? (
                          <button
                            onClick={() => handleOpenPay(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors shadow-2xs cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Pay Now
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{latestTx?.remarks || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disburse Salary Modal */}
      {isPayModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Salary Payment: {selectedRow.employeeId} - {selectedRow.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Month: {selectedRow.payrollMonth} • Net Owed: OMR {formatOMR(selectedRow.netSalary)} • Balance: OMR {formatOMR(selectedRow.outstanding)}
                </p>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              {duplicateWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{duplicateWarning} Click "Confirm Anyway" to proceed if this is intentional.</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount to Disburse (OMR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={payForm.amountPaid}
                    onChange={(e) => { setPayForm({ ...payForm, amountPaid: e.target.value }); setDuplicateWarning(null); setDuplicateConfirmed(false); }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">Can be full or partial amount</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Disbursal Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={payForm.paymentDate}
                    onChange={(e) => { setPayForm({ ...payForm, paymentDate: e.target.value }); setDuplicateWarning(null); setDuplicateConfirmed(false); }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pay To <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={payForm.payTo}
                  onChange={(e) => { setPayForm({ ...payForm, payTo: e.target.value }); setDuplicateWarning(null); setDuplicateConfirmed(false); }}
                  placeholder="e.g. Ahmed, Cash, Bank Transfer, Authorized Representative"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={payForm.paymentMode}
                    onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value as PaymentMode })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="WPS Transfer">WPS Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={payForm.bankName}
                    onChange={(e) => setPayForm({ ...payForm, bankName: e.target.value })}
                    placeholder="e.g. Bank Muscat"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Reference / Cheque No.</label>
                <input
                  type="text"
                  value={payForm.referenceNumber}
                  onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })}
                  placeholder="e.g. TXN987654321 / CHQ0045"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                  Attach Digital Payment Receipt / Transfer Slip (JPG, PNG, PDF)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => handleReceiptFileChange(e, 'pay')}
                  className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 cursor-pointer"
                />
                {payForm.receiptFileName && (
                  <p className="text-[11px] text-emerald-700 font-medium">Attached: {payForm.receiptFileName}</p>
                )}
                <p className="text-[10px] text-slate-400">Optional. You can attach it later from Payment History.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Notes</label>
                <textarea
                  rows={2}
                  value={payForm.remarks}
                  onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={checkingDuplicate}
                  onClick={() => { if (duplicateWarning) setDuplicateConfirmed(true); }}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {duplicateWarning ? 'Confirm Anyway' : 'Confirm & Disburse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction History & Reversal Modal */}
      {isHistoryModalOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Payment Ledger History: {selectedRow.employeeId} - {selectedRow.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Month: {selectedRow.payrollMonth} • Net Owed: OMR {formatOMR(selectedRow.netSalary)} • Disbursed: OMR {formatOMR(selectedRow.totalPaid)}
                </p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {selectedEmployeeHistory.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No disbursals recorded for this month yet.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Pay To</th>
                        <th className="px-3 py-2">Mode / Bank / Ref</th>
                        <th className="px-3 py-2">Remarks</th>
                        <th className="px-3 py-2 text-right">Amount (OMR)</th>
                        <th className="px-3 py-2 text-center">Receipt</th>
                        <th className="px-3 py-2">Disbursed By</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {selectedEmployeeHistory.map((p) => (
                        <tr key={p.id} className={p.isReversed ? 'opacity-50' : ''}>
                          <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
                          <td className="px-3 py-2">{p.payTo}</td>
                          <td className="px-3 py-2 text-slate-500 text-[11px]">
                            {[p.paymentMode, p.bankName, p.referenceNumber].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {p.remarks || '—'}
                            {p.isReversed && <span className="ml-1.5 text-rose-600 font-semibold">(Reversed: {p.reversalReason})</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                            OMR {formatOMR(p.payAmount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.receiptStoragePath ? (
                              <button
                                onClick={() => openReceiptViewer(p.id, p.receiptFileName, selectedRow.employeeName, p.payAmount)}
                                className="text-emerald-600 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-3 h-3" /> View
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{p.createdBy}</td>
                          <td className="px-3 py-2 text-right">
                            {!p.isReversed && (
                              <div className="flex items-center justify-end gap-1">
                                {canEdit && (
                                  <button
                                    onClick={() => handleOpenEdit(p)}
                                    className="text-blue-600 hover:text-blue-800 font-semibold p-1 hover:bg-blue-50 rounded"
                                    title="Edit Payment"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {canReverse && (
                                  <button
                                    onClick={() => handleOpenReverse(p.id)}
                                    className="text-rose-600 hover:text-rose-800 font-semibold p-1 hover:bg-rose-50 rounded"
                                    title="Void / Reverse Transaction"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {isEditModalOpen && editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">Edit Payment Transaction</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (OMR) <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={editForm.amountPaid}
                    onChange={(e) => setEditForm({ ...editForm, amountPaid: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={editForm.paymentDate}
                    onChange={(e) => setEditForm({ ...editForm, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pay To <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editForm.payTo}
                  onChange={(e) => setEditForm({ ...editForm, payTo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={editForm.paymentMode}
                    onChange={(e) => setEditForm({ ...editForm, paymentMode: e.target.value as PaymentMode })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="WPS Transfer">WPS Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={editForm.bankName}
                    onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Reference / Cheque No.</label>
                <input
                  type="text"
                  value={editForm.referenceNumber}
                  onChange={(e) => setEditForm({ ...editForm, referenceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                  Replace / Attach Receipt (JPG, PNG, PDF)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => handleReceiptFileChange(e, 'edit')}
                  className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-100 file:text-blue-800 hover:file:bg-blue-200 cursor-pointer"
                />
                {editForm.receiptFileName && (
                  <p className="text-[11px] text-blue-700 font-medium">New file selected: {editForm.receiptFileName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Notes</label>
                <textarea
                  rows={2}
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Confirmation Modal */}
      {isReverseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50">
              <h3 className="font-bold text-rose-900 text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Reverse Payment Transaction
              </h3>
              <button
                onClick={() => setIsReverseModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600">
                This voids the payment transaction. It will no longer count toward Total Paid, and this action is
                recorded permanently in the audit trail. A reason is required.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reversal Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Duplicate entry, incorrect amount, wrong employee..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                onClick={() => setIsReverseModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReverse}
                disabled={!reverseReason.trim()}
                className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm disabled:opacity-50"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Excel Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Bulk Import Salary Payments</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!importPreview ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-500 transition-colors">
                  <FileSpreadsheet className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Upload a Filled Payment Disbursal File</p>
                  <p className="text-xs text-slate-500 mt-1">Columns: Employee ID, Salary Month, Payment Date, Pay Amount, Pay To, Receipt Reference, Remarks</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImportFileChange}
                    className="mt-4 text-xs file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <span>Total Rows: <strong>{importPreview.summary.totalRows}</strong></span> •{' '}
                    <span className="text-emerald-700">Valid: <strong>{importPreview.summary.validCount}</strong></span> •{' '}
                    <span className="text-purple-700">Duplicate: <strong>{importPreview.summary.duplicateCount}</strong></span> •{' '}
                    <span className="text-rose-700">Invalid: <strong>{importPreview.summary.invalidCount}</strong></span>
                  </div>

                  <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">EMP ID</th>
                          <th className="px-3 py-2">Month</th>
                          <th className="px-3 py-2">Amount (OMR)</th>
                          <th className="px-3 py-2">Pay To</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : r.status === 'Duplicate' ? 'bg-purple-50/50' : ''}>
                            <td className="px-3 py-2 font-mono text-slate-400">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                            <td className="px-3 py-2 font-mono">{r.payrollMonth}</td>
                            <td className="px-3 py-2 font-mono">OMR {formatOMR(r.payAmount)}</td>
                            <td className="px-3 py-2">{r.payTo}</td>
                            <td className="px-3 py-2 font-bold">{r.status}</td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              {importPreview && (
                <button
                  type="button"
                  disabled={importing || importPreview.summary.validCount === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importing Payments...' : 'Commit Payment Disbursals'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reusable Receipt Viewer */}
      <ReceiptViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        receiptUrl={viewerData?.url}
        fileName={viewerData?.name}
        employeeName={viewerData?.empName}
        amount={viewerData?.amount}
      />
    </div>
  );
};
