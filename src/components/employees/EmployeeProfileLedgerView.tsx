import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import {
  UserRound,
  Printer,
  FileDown,
  FileSpreadsheet,
  RotateCcw,
  IdCard,
} from 'lucide-react';

type LedgerRowType = 'Salary' | 'Salary Payment' | 'Loan Disbursement' | 'Loan Recovery';

interface LedgerRow {
  key: string;
  payrollMonth: string;
  date: string;
  type: LedgerRowType;
  description: string;
  gross?: number;
  additions?: number;
  deductions?: number;
  loanDrawn?: number;
  loanRecovery?: number;
  net?: number;
  amountPaid?: number;
  wpsRecoverable?: number;
  status?: string;
  loanStatus?: string;
  reversed?: boolean;
  runningLoanBalance: number;
}

// Loan Disbursement -> Salary -> Loan Recovery -> Salary Payment, per explicit product decision.
const TYPE_RANK: Record<LedgerRowType, number> = {
  'Loan Disbursement': 0,
  Salary: 1,
  'Loan Recovery': 2,
  'Salary Payment': 3,
};

const PAYMENT_STATUS_OPTIONS = ['Unpaid', 'Partially Paid', 'Fully Paid', 'In Revision'];
const LOAN_STATUS_OPTIONS = ['Active', 'Fully Repaid', 'Completed', 'Cancelled'];

// A payroll line has no day-precision date of its own -- only a payrollMonth. Dating its
// Salary ledger row to the last calendar day of that month matches how every worked
// example in this feature's spec dates a month's payroll event.
function lastDayOfMonth(payrollMonth: string): string {
  const [y, m] = (payrollMonth || '').split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const EmployeeProfileLedgerView: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const [employee, setEmployee] = useState<any>(null);
  const [payrollRows, setPayrollRows] = useState<any[]>([]);
  const [paymentTx, setPaymentTx] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [currentProject, setCurrentProject] = useState<string>('—');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [loanStatusFilter, setLoanStatusFilter] = useState('ALL');

  useEffect(() => {
    apiRequest('/api/employees')
      .then((data) => setEmployees(Array.isArray(data) ? data : data.employees || []))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployee(null);
      setPayrollRows([]);
      setPaymentTx([]);
      setLoans([]);
      setCurrentProject('—');
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEmployee(null);
    setPayrollRows([]);
    setPaymentTx([]);
    setLoans([]);
    setCurrentProject('—');

    (async () => {
      try {
        const emp = await apiRequest(`/api/employees/${encodeURIComponent(selectedEmployeeId)}`);
        if (!cancelled) setEmployee(emp);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load employee profile');
      }

      try {
        const reportRes = await apiRequest(
          `/api/reports/salary-payroll?search=${encodeURIComponent(selectedEmployeeId)}&pageSize=all&sortBy=payrollMonth&sortDir=asc`
        );
        if (!cancelled) setPayrollRows((reportRes.rows || []).filter((r: any) => r.employeeId === selectedEmployeeId));
      } catch {
        // Non-fatal -- ledger just shows no Salary rows.
      }

      try {
        const tx = await apiRequest(`/api/payments/transactions?employeeId=${encodeURIComponent(selectedEmployeeId)}`);
        if (!cancelled) setPaymentTx(Array.isArray(tx) ? tx : []);
      } catch {
        // Non-fatal -- ledger just shows no Salary Payment rows.
      }

      try {
        const loansRes = await apiRequest(`/api/loans?employeeId=${encodeURIComponent(selectedEmployeeId)}`);
        if (!cancelled) setLoans(loansRes.loans || []);
      } catch {
        // Non-fatal -- ledger just shows no Loan rows.
      }

      try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const attData = await apiRequest(`/api/attendance?month=${currentMonth}`);
        if (!cancelled) {
          const allProjects = attData.allProjects || [];
          const activeProjectCodes = new Set(
            allProjects.filter((p: any) => p.status === 'Active').map((p: any) => p.projectCode)
          );
          const empGroup = (attData.grouped || []).find((g: any) => g.employeeId === selectedEmployeeId);
          let project = 'Head Office';
          if (empGroup) {
            const active = (empGroup.records || []).filter(
              (r: any) =>
                activeProjectCodes.has(r.projectCode) &&
                ((Number(r.daysWorked) || 0) > 0 || (Number(r.hoursWorked) || 0) > 0)
            );
            if (active.length > 0) project = active.map((r: any) => r.projectCode).join(', ');
          }
          setCurrentProject(project);
        }
      } catch {
        // Non-fatal -- Current Project just shows the default placeholder.
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEmployeeId]);

  // Unified chronological ledger. A payroll-driven loan recovery (recoverySource==='Payroll')
  // is deliberately NOT re-emitted as its own Loan Recovery row -- it is the exact same
  // physical event already carried on that month's Salary row's own loanRecovery figure.
  // Only Direct Payment recoveries (entered in Loan Management, not tied to a payroll run)
  // get their own standalone Loan Recovery row.
  const allRows: LedgerRow[] = useMemo(() => {
    const rows: Omit<LedgerRow, 'runningLoanBalance'>[] = [];

    payrollRows.forEach((r) => {
      rows.push({
        key: `salary-${r.payrollMonth}`,
        payrollMonth: r.payrollMonth,
        date: lastDayOfMonth(r.payrollMonth),
        type: 'Salary',
        description: `${r.payrollMonth} Payroll (${r.payrollStatus})`,
        gross: r.grossSalary,
        additions: r.totalAdditions,
        deductions: r.totalDeductions,
        loanRecovery: r.loanRecovery || 0,
        net: r.netSalary,
        wpsRecoverable: r.wpsEmployee === 'Yes' ? r.recoverableSalary || 0 : undefined,
        status: r.paymentStatus,
      });
    });

    loans.forEach((loan) => {
      rows.push({
        key: `loan-disb-${loan.id}`,
        payrollMonth: (loan.loanDate || '').slice(0, 7),
        date: loan.loanDate,
        type: 'Loan Disbursement',
        description: loan.purpose || `Loan Disbursement (${loan.status})`,
        loanDrawn: loan.loanAmount,
        loanStatus: loan.status,
      });

      (loan.recoveries || []).forEach((rec: any) => {
        const source = rec.recoverySource ?? rec.source;
        if (source === 'Payroll') return;
        if (rec.isReversed) return;
        const date = rec.recoveryDate ?? rec.repaymentDate ?? '';
        rows.push({
          key: `loan-rec-${rec.id}`,
          payrollMonth: rec.payrollMonth || date.slice(0, 7),
          date,
          type: 'Loan Recovery',
          description: `Direct Loan Recovery${rec.remarks ? ' — ' + rec.remarks : ''}`,
          loanRecovery: rec.recoveryAmount ?? rec.amount ?? 0,
          loanStatus: loan.status,
        });
      });
    });

    paymentTx.forEach((tx) => {
      rows.push({
        key: `payment-${tx.id}`,
        payrollMonth: tx.payrollMonth,
        date: tx.paymentDate,
        type: 'Salary Payment',
        description: `Paid to ${tx.payTo || selectedEmployeeId}${tx.paymentMode ? ' via ' + tx.paymentMode : ''}${
          tx.referenceNumber ? ' • Ref: ' + tx.referenceNumber : ''
        }`,
        amountPaid: tx.payAmount,
        status: tx.receiptStatus,
        reversed: !!tx.isReversed,
      });
    });

    rows.sort((a, b) => {
      const monthCmp = (a.payrollMonth || '').localeCompare(b.payrollMonth || '');
      if (monthCmp !== 0) return monthCmp;
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return TYPE_RANK[a.type] - TYPE_RANK[b.type];
    });

    // Running loan balance: Loan Disbursement adds, Loan Recovery subtracts, and a
    // Salary row's own loanRecovery figure subtracts too (that's where a payroll-driven
    // recovery actually reduces the balance, since it has no standalone row of its own).
    let balance = 0;
    const withBalance: LedgerRow[] = rows.map((row) => {
      if (row.type === 'Loan Disbursement') balance += row.loanDrawn || 0;
      if (row.type === 'Loan Recovery') balance -= row.loanRecovery || 0;
      if (row.type === 'Salary' && row.loanRecovery) balance -= row.loanRecovery;
      return { ...row, runningLoanBalance: balance };
    });

    return withBalance;
  }, [payrollRows, loans, paymentTx, selectedEmployeeId]);

  const availableMonths = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.payrollMonth).filter(Boolean))).sort(),
    [allRows]
  );

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (fromDate && r.date && r.date < fromDate) return false;
      if (toDate && r.date && r.date > toDate) return false;
      if (monthFilter !== 'ALL' && r.payrollMonth !== monthFilter) return false;
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (paymentStatusFilter !== 'ALL' && r.status !== paymentStatusFilter) return false;
      if (
        loanStatusFilter !== 'ALL' &&
        (r.type === 'Loan Disbursement' || r.type === 'Loan Recovery') &&
        r.loanStatus !== loanStatusFilter
      )
        return false;
      return true;
    });
  }, [allRows, fromDate, toDate, monthFilter, typeFilter, paymentStatusFilter, loanStatusFilter]);

  const monthGroups = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    filteredRows.forEach((r) => {
      const key = r.payrollMonth || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows]);

  // Summary cards are computed from the raw fetched arrays (not the filtered ledger rows),
  // so they always match the authoritative Payroll/Payments/Loan modules exactly.
  const totals = useMemo(() => {
    const totalSalaryDrawn = paymentTx.filter((tx) => !tx.isReversed).reduce((s, tx) => s + (tx.payAmount || 0), 0);
    const totalGross = payrollRows.reduce((s, r) => s + (r.grossSalary || 0), 0);
    const totalDeductions = payrollRows.reduce((s, r) => s + (r.totalDeductions || 0), 0);
    const totalLoanTaken = loans.reduce((s, l) => s + (l.loanAmount || 0), 0);
    const totalLoanRecovered = loans.reduce((s, l) => s + (l.totalRecovered || 0), 0);
    const outstandingLoan = loans.reduce((s, l) => s + (l.outstandingBalance || 0), 0);
    const outstandingSalary = payrollRows.reduce((s, r) => s + (r.outstanding || 0), 0);
    return { totalSalaryDrawn, totalGross, totalDeductions, totalLoanTaken, totalLoanRecovered, outstandingLoan, outstandingSalary };
  }, [payrollRows, paymentTx, loans]);

  const latestPayroll = payrollRows.length > 0 ? payrollRows[payrollRows.length - 1] : null;

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setMonthFilter('ALL');
    setTypeFilter('ALL');
    setPaymentStatusFilter('ALL');
    setLoanStatusFilter('ALL');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Employee Profile & Ledger', 14, 16);
    doc.setFontSize(9);
    doc.text(`${employee?.employeeName || ''} (${selectedEmployeeId})`, 14, 22);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
    doc.text(
      `Total Drawn: OMR ${formatOMR(totals.totalSalaryDrawn)}  •  Outstanding Salary: OMR ${formatOMR(totals.outstandingSalary)}  •  Outstanding Loan: OMR ${formatOMR(totals.outstandingLoan)}`,
      14,
      32
    );

    autoTable(doc, {
      startY: 38,
      head: [['Month', 'Date', 'Type', 'Description', 'Gross', 'Additions', 'Deductions', 'Loan Drawn', 'Loan Recovery', 'Net', 'Paid', 'Balance']],
      body: filteredRows.map((r) => [
        r.payrollMonth,
        r.date ? formatDate(r.date) : '—',
        r.type,
        r.description,
        r.gross !== undefined ? formatOMR(r.gross) : '—',
        r.additions !== undefined ? formatOMR(r.additions) : '—',
        r.deductions !== undefined ? formatOMR(r.deductions) : '—',
        r.loanDrawn !== undefined ? formatOMR(r.loanDrawn) : '—',
        r.loanRecovery !== undefined ? formatOMR(r.loanRecovery) : '—',
        r.net !== undefined ? formatOMR(r.net) : '—',
        r.amountPaid !== undefined ? formatOMR(r.amountPaid) : '—',
        formatOMR(r.runningLoanBalance),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`Employee_Ledger_${selectedEmployeeId}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const profileSheet = XLSX.utils.json_to_sheet([
      {
        'Employee ID': employee?.employeeId,
        'Employee Name': employee?.employeeName,
        Nationality: employee?.nationalityType,
        'Employment Status': employee?.isActive ? 'Active' : 'Inactive',
        'Employee Type': employee?.employeeType,
        'Joining Date': employee?.dateOfJoining,
        Company: employee?.employeeCompany,
        Designation: employee?.designation,
        'Current Project': currentProject,
        'Pay By': employee?.salaryPaidBy,
        'Wage Type': employee?.wageType,
        'WPS Status': employee?.wpsEmployee,
      },
    ]);
    const ledgerSheet = XLSX.utils.json_to_sheet(
      filteredRows.map((r) => ({
        Month: r.payrollMonth,
        Date: r.date,
        Type: r.type,
        Description: r.description,
        Gross: r.gross ?? '',
        Additions: r.additions ?? '',
        Deductions: r.deductions ?? '',
        'Loan Drawn': r.loanDrawn ?? '',
        'Loan Recovery': r.loanRecovery ?? '',
        Net: r.net ?? '',
        'Amount Paid': r.amountPaid ?? '',
        'Loan Balance': r.runningLoanBalance,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, profileSheet, 'Profile');
    XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Ledger');
    XLSX.writeFile(wb, `Employee_Ledger_${selectedEmployeeId}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header + Employee Picker + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <IdCard className="w-5 h-5 text-blue-600" />
          Individual Employee Profile &amp; Ledger
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Employee...</option>
            {employees.map((e) => (
              <option key={e.id} value={e.employeeId}>
                {e.employeeId} - {e.employeeName}
              </option>
            ))}
          </select>
          {selectedEmployeeId && (
            <>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" /> Export PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>
      )}

      {!selectedEmployeeId ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <IdCard className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold">Select an employee above to view their Profile &amp; Ledger.</p>
        </div>
      ) : loading ? (
        <p className="text-xs text-slate-400">Loading employee profile...</p>
      ) : (
        <>
          {/* Profile header: details + photo */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Personal Information</h4>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><dt className="text-slate-500">Employee ID</dt><dd className="font-mono font-bold text-blue-600">{employee?.employeeId}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Full Name</dt><dd className="font-semibold text-slate-900">{employee?.employeeName}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Nationality</dt><dd className="text-slate-700">{employee?.nationalityType}</dd></div>
                </dl>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Employment Details</h4>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className={`font-semibold ${employee?.isActive ? 'text-emerald-600' : 'text-slate-500'}`}>{employee?.isActive ? 'Active' : 'Inactive'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Employee Type</dt><dd className="text-slate-700">{employee?.employeeType}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Joining Date</dt><dd className="text-slate-700">{employee?.dateOfJoining ? formatDate(employee.dateOfJoining) : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Company</dt><dd className="text-slate-700">{employee?.employeeCompany}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Designation</dt><dd className="text-slate-700">{employee?.designation}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Current Project</dt><dd className="text-slate-700">{currentProject}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Pay By</dt><dd className="text-slate-700">{employee?.salaryPaidBy}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Wage Type</dt><dd className="text-slate-700">{employee?.wageType}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">WPS Status</dt><dd className="text-slate-700">{employee?.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS'}</dd></div>
                </dl>
              </div>
            </div>
            <div className="w-full h-44 lg:h-full bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
              <UserRound className="w-16 h-16 text-slate-400" />
            </div>
          </div>

          {/* Payroll Information summary */}
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Payroll Information</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-slate-500 block">Salary / Rate</span><strong className="font-mono">OMR {formatOMR(employee?.monthlySalaryOrRate)}</strong></div>
              <div><span className="text-slate-500 block">Current Gross</span><strong className="font-mono">{latestPayroll ? `OMR ${formatOMR(latestPayroll.grossSalary)}` : '—'}</strong></div>
              <div><span className="text-slate-500 block">Current Net</span><strong className="font-mono text-blue-700">{latestPayroll ? `OMR ${formatOMR(latestPayroll.netSalary)}` : '—'}</strong></div>
              <div><span className="text-slate-500 block">WPS Status</span><strong>{employee?.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS'}</strong></div>
            </div>
          </div>

          {/* Ledger */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight mb-3">Employee Salary &amp; Loan Ledger</h3>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
              {[
                { label: 'Total Salary Drawn', value: totals.totalSalaryDrawn, color: 'text-emerald-700' },
                { label: 'Total Gross Salary', value: totals.totalGross, color: 'text-slate-900' },
                { label: 'Total Deductions', value: totals.totalDeductions, color: 'text-rose-600' },
                { label: 'Total Loan Taken', value: totals.totalLoanTaken, color: 'text-purple-700' },
                { label: 'Total Loan Recovered', value: totals.totalLoanRecovered, color: 'text-emerald-700' },
                { label: 'Outstanding Loan', value: totals.outstandingLoan, color: 'text-amber-700' },
                { label: 'Outstanding Salary', value: totals.outstandingSalary, color: 'text-rose-600' },
              ].map((c) => (
                <div key={c.label} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block leading-tight">{c.label}</span>
                  <strong className={`font-mono text-xs ${c.color}`}>OMR {formatOMR(c.value)}</strong>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 mb-3 print:hidden">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" title="From Date" />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" title="To Date" />
                <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="ALL">All Payroll Months</option>
                  {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="ALL">All Transaction Types</option>
                  <option value="Salary">Salary</option>
                  <option value="Salary Payment">Salary Payment</option>
                  <option value="Loan Disbursement">Loan Disbursement</option>
                  <option value="Loan Recovery">Loan Recovery</option>
                </select>
                <select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="ALL">All Payment Statuses</option>
                  {PAYMENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={loanStatusFilter} onChange={(e) => setLoanStatusFilter(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="ALL">All Loan Statuses</option>
                  {LOAN_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
              </button>
            </div>

            {/* Ledger table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">Additions</th>
                      <th className="px-3 py-2 text-right">Deductions</th>
                      <th className="px-3 py-2 text-right">Loan Drawn</th>
                      <th className="px-3 py-2 text-right">Loan Recovery</th>
                      <th className="px-3 py-2 text-right">Net</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Loan Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {monthGroups.length === 0 ? (
                      <tr><td colSpan={11} className="px-6 py-8 text-center text-slate-400">No ledger transactions match the current filters.</td></tr>
                    ) : (
                      monthGroups.map(([month, monthRows]) => {
                        const monthTotals = payrollRows.find((r) => r.payrollMonth === month);
                        return (
                          <React.Fragment key={month}>
                            <tr className="bg-slate-50 font-bold">
                              <td colSpan={11} className="px-3 py-2">
                                <div className="flex items-center justify-between">
                                  <span>{month}</span>
                                  {monthTotals && (
                                    <span className="font-normal text-[11px] text-slate-500">
                                      Gross OMR {formatOMR(monthTotals.grossSalary)} · Net OMR {formatOMR(monthTotals.netSalary)} · Paid OMR {monthTotals.totalPaid === null ? '—' : formatOMR(monthTotals.totalPaid)} · Outstanding {monthTotals.outstanding === null ? '—' : `OMR ${formatOMR(monthTotals.outstanding)}`}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {monthRows.map((r) => (
                              <tr key={r.key} className={r.reversed ? 'opacity-50' : ''}>
                                <td className="px-3 py-2">{r.date ? formatDate(r.date) : '—'}</td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    r.type === 'Salary' ? 'bg-blue-100 text-blue-700' :
                                    r.type === 'Salary Payment' ? 'bg-emerald-100 text-emerald-700' :
                                    r.type === 'Loan Disbursement' ? 'bg-purple-100 text-purple-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}>
                                    {r.type}{r.reversed ? ' (Reversed)' : ''}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-500">{r.description}{r.status && r.type !== 'Salary' ? ` • ${r.status}` : ''}</td>
                                <td className="px-3 py-2 text-right font-mono">{r.gross !== undefined ? formatOMR(r.gross) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono text-emerald-600">{r.additions !== undefined ? formatOMR(r.additions) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono text-rose-600">{r.deductions !== undefined ? formatOMR(r.deductions) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono text-purple-700">{r.loanDrawn !== undefined ? formatOMR(r.loanDrawn) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono text-amber-700">{r.loanRecovery !== undefined && r.loanRecovery > 0 ? formatOMR(r.loanRecovery) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{r.net !== undefined ? formatOMR(r.net) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{r.amountPaid !== undefined ? formatOMR(r.amountPaid) : '—'}</td>
                                <td className="px-3 py-2 text-right font-mono">{formatOMR(r.runningLoanBalance)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
