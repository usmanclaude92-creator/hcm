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
  ShieldCheck,
  ArrowLeft,
  Edit3,
  Phone,
  Mail,
  MapPin,
  Calendar,
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  Landmark,
  TrendingUp,
  Briefcase,
  Plus,
  Zap,
  CreditCard,
  Building,
} from 'lucide-react';
import { EmployeeIdentificationModal } from './EmployeeIdentificationModal';
import { EmployeeSummaryPrintModal } from './EmployeeSummaryPrintModal';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';
import { AddLoanQuickModal } from './quick-actions/AddLoanQuickModal';
import { UpdateSalaryQuickModal } from './quick-actions/UpdateSalaryQuickModal';
import { AssignProjectQuickModal } from './quick-actions/AssignProjectQuickModal';

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

function calculateAge(dobString?: string): number | null {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
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

export interface EmployeeProfileLedgerViewProps {
  initialEmployeeId?: string;
  onBack?: () => void;
}

export const EmployeeProfileLedgerView: React.FC<EmployeeProfileLedgerViewProps> = ({
  initialEmployeeId,
  onBack,
}) => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId || '');

  useEffect(() => {
    if (initialEmployeeId) {
      setSelectedEmployeeId(initialEmployeeId);
    }
  }, [initialEmployeeId]);

  const [employee, setEmployee] = useState<any>(null);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [personalDetails, setPersonalDetails] = useState<any>(null);
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
  const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [isUpdateSalaryModalOpen, setIsUpdateSalaryModalOpen] = useState(false);
  const [isAssignProjectModalOpen, setIsAssignProjectModalOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (actionFeedback) {
      const timer = setTimeout(() => setActionFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionFeedback]);

  useEffect(() => {
    apiRequest('/api/employees')
      .then((data) => setEmployees(Array.isArray(data) ? data : data.employees || []))
      .catch(() => setEmployees([]));
  }, []);

  const loadEmployeeData = async () => {
    if (!selectedEmployeeId) {
      setEmployee(null);
      setComplianceData(null);
      setPersonalDetails(null);
      setPayrollRows([]);
      setPaymentTx([]);
      setLoans([]);
      setCurrentProject('—');
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const emp = await apiRequest(`/api/employees/${encodeURIComponent(selectedEmployeeId)}`);
      setEmployee(emp);
    } catch (err: any) {
      setError(err.message || 'Failed to load employee profile');
    }

    try {
      const comp = await apiRequest(`/api/employees/${encodeURIComponent(selectedEmployeeId)}/compliance`);
      setComplianceData(comp);
      setPersonalDetails(comp?.personalDetails || null);
    } catch {
      // Non-fatal -- personal details just fallback to employee basics
    }

    try {
      const reportRes = await apiRequest(
        `/api/reports/salary-payroll?search=${encodeURIComponent(selectedEmployeeId)}&pageSize=all&sortBy=payrollMonth&sortDir=asc`
      );
      setPayrollRows((reportRes.rows || []).filter((r: any) => r.employeeId === selectedEmployeeId));
    } catch {
      // Non-fatal -- ledger just shows no Salary rows.
    }

    try {
      const tx = await apiRequest(`/api/payments/transactions?employeeId=${encodeURIComponent(selectedEmployeeId)}`);
      setPaymentTx(Array.isArray(tx) ? tx : []);
    } catch {
      // Non-fatal -- ledger just shows no Salary Payment rows.
    }

    try {
      const loansRes = await apiRequest(`/api/loans?employeeId=${encodeURIComponent(selectedEmployeeId)}`);
      setLoans(loansRes.loans || []);
    } catch {
      // Non-fatal -- ledger just shows no Loan rows.
    }

    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const attData = await apiRequest(`/api/attendance?month=${currentMonth}`);
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
    } catch {
      // Non-fatal -- Current Project just shows the default placeholder.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeData();
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
    const personal = complianceData?.personalDetails || personalDetails || {};
    const civilIdNumber = complianceData?.currentCivilId?.civilIdNumber || personal?.civilIdNumber;
    const passportDoc = (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Passport');
    const passportNumber = passportDoc?.documentNumber || personal?.passportNumber;
    const dob = personal?.dateOfBirth || personal?.dob;
    const mobile = personal?.mobileNumber || personal?.whatsappNumber || personal?.mobile;
    const email = personal?.personalEmail || personal?.email;
    const primaryEmergency = Array.isArray(personal?.emergencyContacts) && personal.emergencyContacts.length > 0
      ? personal.emergencyContacts.find((c: any) => c.isPrimary) || personal.emergencyContacts[0]
      : null;
    const emergencyStr = primaryEmergency?.name
      ? `${primaryEmergency.name} (${primaryEmergency.relationship || 'Contact'}) - ${primaryEmergency.contactNumber || ''}`
      : personal?.emergencyContactName
      ? `${personal.emergencyContactName} - ${personal.emergencyContactPhone || ''}`
      : '';

    const profileSheet = XLSX.utils.json_to_sheet([
      {
        'Employee ID': employee?.employeeId,
        'Employee Name': employee?.employeeName,
        Nationality: employee?.nationalityType,
        'Civil ID Number': civilIdNumber || '',
        'Passport Number': passportNumber || '',
        'Date of Birth': dob || '',
        Gender: personal?.gender || '',
        'Marital Status': personal?.maritalStatus || '',
        'Blood Group': personal?.bloodGroup || '',
        Mobile: mobile || '',
        Email: email || '',
        'Residential Address': personal?.residentialAddress || personal?.currentAddress || '',
        'Emergency Contact': emergencyStr,
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

  // If viewing employee compliance details, render inline full page form
  if (isComplianceModalOpen && employee) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            onClick={() => setIsComplianceModalOpen(false)}
            className="hover:text-blue-600 font-semibold flex items-center gap-1 cursor-pointer transition-colors text-slate-600"
          >
            <ArrowLeft size={13} />
            <span>Employee Profile &amp; Ledger</span>
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-800">
            {employee.employeeName} ({employee.employeeId})
          </span>
        </div>

        <EmployeeIdentificationModal
          employee={employee}
          isOpen={true}
          mode="inline"
          backLabel="Back to Employee Ledger"
          onClose={() => setIsComplianceModalOpen(false)}
          onUpdated={loadEmployeeData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Employee Picker + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <IdCard className="w-5 h-5 text-blue-600" />
            Individual Employee Profile &amp; Ledger
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchableEmployeeSelect
            employees={employees}
            value={selectedEmployeeId}
            onChange={(empId) => setSelectedEmployeeId(empId)}
            placeholder="Search & Select Employee..."
            width="w-64 sm:w-72"
          />
          {selectedEmployeeId && (
            <>
              {/* Quick Actions Group */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase px-1.5 flex items-center gap-1">
                  <Zap size={11} className="text-amber-500 fill-amber-500" />
                  <span>Actions:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddLoanModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Issue new loan or salary advance"
                >
                  <Landmark className="w-3.5 h-3.5 text-purple-600" />
                  <span>+ Add Loan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsUpdateSalaryModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Update salary rate and compensation"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Update Salary</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAssignProjectModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Assign workforce project deployment"
                >
                  <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  <span>Assign Project</span>
                </button>
              </div>

              <button
                onClick={() => setIsComplianceModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors shadow-2xs cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Documents &amp; Compliance 360°
              </button>
              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-800 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors shadow-2xs cursor-pointer"
                title="Print clean single-page profile summary PDF"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" /> Print Summary PDF
              </button>
              <button
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" /> Export Ledger PDF
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

      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

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
          {/* Profile header: photo on left + details */}
          {(() => {
            const personal = complianceData?.personalDetails || personalDetails || {};
            const civilIdNumber = complianceData?.currentCivilId?.civilIdNumber || personal?.civilIdNumber;
            const civilIdStatus = complianceData?.currentCivilId?.status;

            const passportDoc = (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Passport');
            const passportNumber = passportDoc?.documentNumber || personal?.passportNumber;

            const dob = personal?.dateOfBirth || personal?.dob;
            const age = calculateAge(dob);
            const gender = personal?.gender;
            const maritalStatus = personal?.maritalStatus;
            const bloodGroup = personal?.bloodGroup;
            const mobile = personal?.mobileNumber || personal?.whatsappNumber || personal?.mobile;
            const email = personal?.personalEmail || personal?.email;
            const address = personal?.residentialAddress || personal?.currentAddress;

            const primaryEmergency = Array.isArray(personal?.emergencyContacts) && personal.emergencyContacts.length > 0
              ? personal.emergencyContacts.find((c: any) => c.isPrimary) || personal.emergencyContacts[0]
              : null;
            const emergencyName = primaryEmergency?.name || personal?.emergencyContactName;
            const emergencyRelation = primaryEmergency?.relationship || personal?.emergencyContactRelation;
            const emergencyPhone = primaryEmergency?.contactNumber || personal?.emergencyContactPhone;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-[190px_1fr] gap-5">
                {/* Photo & Identity Widget */}
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-between text-center shrink-0">
                  <div className="flex flex-col items-center w-full">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xl shadow-xs mb-3">
                      {employee?.employeeName ? (
                        employee.employeeName
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((n: string) => n[0])
                          .join('')
                          .toUpperCase()
                      ) : (
                        <UserRound className="w-10 h-10 text-white/80" />
                      )}
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 leading-snug px-1 line-clamp-2">
                      {employee?.employeeName}
                    </h3>
                    <span className="font-mono text-[11px] font-bold text-blue-600 mt-0.5">
                      {employee?.employeeId}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 mt-2.5 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        employee?.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          employee?.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      {employee?.isActive ? 'Active Employee' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-4 w-full flex flex-col gap-1.5">
                    {/* Quick Action Buttons on Photo card */}
                    <div className="pt-2 border-t border-slate-200/80 w-full flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left pl-1">
                        Quick Actions
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddLoanModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                      >
                        <Landmark size={13} className="text-purple-600" />
                        <span>+ Add Loan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsUpdateSalaryModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                      >
                        <TrendingUp size={13} className="text-emerald-600" />
                        <span>Update Salary</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAssignProjectModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                      >
                        <Briefcase size={13} className="text-blue-600" />
                        <span>Assign Project</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 w-full flex flex-col gap-1.5">
                      <button
                        onClick={() => setIsPrintModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 border border-blue-700 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-2xs"
                        title="Print single-page summary PDF"
                      >
                        <Printer size={13} />
                        <span>Print Summary</span>
                      </button>
                      <button
                        onClick={() => setIsComplianceModalOpen(true)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer shadow-2xs"
                      >
                        <ShieldCheck size={13} className="text-blue-600" />
                        <span>Documents &amp; 360°</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Details Cards: Personal Info + Employment Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Personal Information Card */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 mb-3">
                        <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                          <UserRound size={13} className="text-blue-600" />
                          <span>Personal Information</span>
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsPrintModalOpen(true)}
                            className="text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                            title="Print Personal Information Summary PDF"
                          >
                            <Printer size={11} className="text-blue-600" />
                            <span>Print</span>
                          </button>
                          <button
                            onClick={() => setIsComplianceModalOpen(true)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
                            title="Edit Personal Information"
                          >
                            <Edit3 size={11} />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>

                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Employee ID</dt>
                          <dd className="font-mono font-bold text-blue-600">{employee?.employeeId}</dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Full Name</dt>
                          <dd className="font-semibold text-slate-900">{employee?.employeeName}</dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Nationality</dt>
                          <dd className="font-medium text-slate-700">{employee?.nationalityType}</dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Civil ID / National ID</dt>
                          <dd className="font-mono font-semibold text-slate-800 flex items-center gap-1.5">
                            <span>{civilIdNumber || '—'}</span>
                            {civilIdStatus && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  civilIdStatus === 'Valid'
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                    : civilIdStatus === 'Expired'
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {civilIdStatus}
                              </span>
                            )}
                          </dd>
                        </div>
                        {(passportNumber || employee?.nationalityType === 'Expat') && (
                          <div className="flex justify-between items-center">
                            <dt className="text-slate-500">Passport Number</dt>
                            <dd className="font-mono text-slate-800">{passportNumber || '—'}</dd>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Date of Birth</dt>
                          <dd className="text-slate-800">
                            {dob ? (
                              <span>
                                {formatDate(dob)} {age !== null && <span className="text-slate-500 font-normal">({age} yrs)</span>}
                              </span>
                            ) : (
                              '—'
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Gender / Marital</dt>
                          <dd className="text-slate-800">
                            {gender || '—'} {maritalStatus ? `• ${maritalStatus}` : ''}
                          </dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Blood Group</dt>
                          <dd className="text-slate-800">
                            {bloodGroup ? (
                              <span className="font-bold px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px]">
                                {bloodGroup}
                              </span>
                            ) : (
                              '—'
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Mobile Phone</dt>
                          <dd className="text-slate-800">
                            {mobile ? (
                              <a href={`tel:${mobile}`} className="text-blue-600 hover:underline font-mono">
                                {mobile}
                              </a>
                            ) : (
                              '—'
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Personal Email</dt>
                          <dd className="text-slate-800 max-w-[190px] truncate text-right">
                            {email ? (
                              <a href={`mailto:${email}`} className="text-blue-600 hover:underline">
                                {email}
                              </a>
                            ) : (
                              '—'
                            )}
                          </dd>
                        </div>
                        <div className="flex justify-between items-start gap-2 pt-1 border-t border-slate-200/60">
                          <dt className="text-slate-500 shrink-0">Residential Address</dt>
                          <dd className="text-slate-700 text-right leading-snug text-[11px] max-w-[200px]">
                            {address || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between items-start gap-2 pt-1 border-t border-slate-200/60">
                          <dt className="text-slate-500 shrink-0">Emergency Contact</dt>
                          <dd className="text-slate-700 text-right leading-snug text-[11px] max-w-[200px]">
                            {emergencyName ? (
                              <div>
                                <span className="font-semibold text-slate-900">{emergencyName}</span>
                                {emergencyRelation && <span className="text-slate-500"> ({emergencyRelation})</span>}
                                {emergencyPhone && (
                                  <div className="text-slate-600 font-mono mt-0.5">
                                    <a href={`tel:${emergencyPhone}`} className="hover:text-blue-600">
                                      {emergencyPhone}
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {/* Employment Details Card */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 mb-3">
                        <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                          <IdCard size={13} className="text-slate-500" />
                          <span>Employment Details</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => setIsAssignProjectModalOpen(true)}
                          className="text-[11px] font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Briefcase size={11} className="text-blue-600" />
                          <span>Assign Project</span>
                        </button>
                      </div>

                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className={`font-semibold ${employee?.isActive ? 'text-emerald-600' : 'text-slate-500'}`}>{employee?.isActive ? 'Active' : 'Inactive'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Employee Type</dt><dd className="text-slate-700">{employee?.employeeType}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Joining Date</dt><dd className="text-slate-700">{employee?.dateOfJoining ? formatDate(employee.dateOfJoining) : '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Company</dt><dd className="text-slate-700">{employee?.employeeCompany}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Designation</dt><dd className="text-slate-700">{employee?.designation}</dd></div>
                        <div className="flex justify-between items-center">
                          <dt className="text-slate-500">Current Project</dt>
                          <dd className="text-slate-700 flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{currentProject}</span>
                            <button
                              type="button"
                              onClick={() => setIsAssignProjectModalOpen(true)}
                              className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200 cursor-pointer"
                              title="Reassign or change project"
                            >
                              Change
                            </button>
                          </dd>
                        </div>
                        <div className="flex justify-between"><dt className="text-slate-500">Pay By</dt><dd className="text-slate-700">{employee?.salaryPaidBy}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">Wage Type</dt><dd className="text-slate-700">{employee?.wageType}</dd></div>
                        <div className="flex justify-between"><dt className="text-slate-500">WPS Status</dt><dd className="text-slate-700">{employee?.wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS'}</dd></div>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Payroll Information summary */}
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payroll Information</h4>
              <button
                type="button"
                onClick={() => setIsUpdateSalaryModalOpen(true)}
                className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <TrendingUp size={12} className="text-emerald-600" />
                <span>Update Salary / Rate</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Salary / Rate</span>
                <div className="flex items-center gap-1.5">
                  <strong className="font-mono text-slate-900">OMR {formatOMR(employee?.monthlySalaryOrRate)}</strong>
                  <span className="text-[10px] text-slate-400">({employee?.wageType})</span>
                </div>
              </div>
              <div><span className="text-slate-500 block">Current Gross</span><strong className="font-mono">{latestPayroll ? `OMR ${formatOMR(latestPayroll.grossSalary)}` : '—'}</strong></div>
              <div><span className="text-slate-500 block">Current Net</span><strong className="font-mono text-blue-700">{latestPayroll ? `OMR ${formatOMR(latestPayroll.netSalary)}` : '—'}</strong></div>
              <div><span className="text-slate-500 block">WPS Status</span><strong>{employee?.wpsEmployee === 'Yes' ? 'WPS Enrolled' : 'Non-WPS'}</strong></div>
            </div>
          </div>

          {/* Ledger */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Employee Salary &amp; Loan Ledger</h3>
              <button
                type="button"
                onClick={() => setIsAddLoanModalOpen(true)}
                className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Landmark size={13} className="text-purple-600" />
                <span>+ Issue Loan</span>
              </button>
            </div>

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

      {/* Dedicated Employee Summary Print & Single-Page PDF Modal */}
      {employee && (
        <>
          <EmployeeSummaryPrintModal
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            employee={employee}
            personalDetails={personalDetails}
            complianceData={complianceData}
            summaryStats={totals}
            currentProject={currentProject}
          />

          <AddLoanQuickModal
            isOpen={isAddLoanModalOpen}
            onClose={() => setIsAddLoanModalOpen(false)}
            employee={employee}
            onSuccess={() => {
              loadEmployeeData();
              setActionFeedback({
                type: 'success',
                message: `New loan successfully issued for ${employee.employeeName} (${employee.employeeId}). Ledger and loan balance updated.`,
              });
            }}
          />

          <UpdateSalaryQuickModal
            isOpen={isUpdateSalaryModalOpen}
            onClose={() => setIsUpdateSalaryModalOpen(false)}
            employee={employee}
            onSuccess={() => {
              loadEmployeeData();
              setActionFeedback({
                type: 'success',
                message: `Salary & compensation parameters updated successfully for ${employee.employeeName}.`,
              });
            }}
          />

          <AssignProjectQuickModal
            isOpen={isAssignProjectModalOpen}
            onClose={() => setIsAssignProjectModalOpen(false)}
            employee={employee}
            currentProject={currentProject}
            onSuccess={() => {
              loadEmployeeData();
              setActionFeedback({
                type: 'success',
                message: `Workforce project allocation updated successfully for ${employee.employeeName}.`,
              });
            }}
          />
        </>
      )}
    </div>
  );
};
