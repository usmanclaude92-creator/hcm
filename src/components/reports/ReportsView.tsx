import React, { useState, useEffect } from 'react';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import {
  FileBarChart,
  Download,
  Calendar,
  Filter,
  Building2,
  Users,
  CreditCard,
  RefreshCw,
  FolderKanban,
  Printer,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';

type ReportTab = 'payroll' | 'payments' | 'wps' | 'projects' | 'loans';

export const ReportsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('payroll');
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      let url = '';
      if (activeTab === 'payroll') url = `/api/reports/payroll-summary?month=${month}`;
      else if (activeTab === 'payments') url = `/api/reports/salary-payments?month=${month}`;
      else if (activeTab === 'wps') url = `/api/reports/wps-recovery?month=${month}`;
      else if (activeTab === 'projects') url = `/api/reports/project-labor-costing?month=${month}`;
      else if (activeTab === 'loans') url = `/api/reports/loans-summary`;

      const data = await apiRequest(url);
      setReportData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [activeTab, month]);

  const handleExportExcel = () => {
    let url = '';
    if (activeTab === 'payroll') url = `/api/reports/payroll-summary/export?month=${month}`;
    else if (activeTab === 'payments') url = `/api/reports/salary-payments/export?month=${month}`;
    else if (activeTab === 'wps') url = `/api/reports/wps-recovery/export?month=${month}`;
    else if (activeTab === 'projects') url = `/api/reports/project-labor-costing/export?month=${month}`;
    else if (activeTab === 'loans') url = `/api/reports/loans-summary/export`;

    window.location.href = url;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-blue-600" />
            Financial & Operational Reports Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time multi-dimensional reports with 3-decimal OMR precision & Excel export
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab !== 'loans' && (
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="text-xs font-semibold text-slate-800 focus:outline-hidden"
              />
            </div>
          )}

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>

          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export to Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto print:hidden">
        <button
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'payroll'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          1. Monthly Payroll Summary
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'payments'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          2. Salary Disbursal Reconciliation
        </button>
        <button
          onClick={() => setActiveTab('wps')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'wps'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          3. WPS Recovery Ledger
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'projects'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          4. Project Labor & Costing
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'loans'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          5. Employee Loan Balances
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tab 1: Payroll Summary */}
      {activeTab === 'payroll' && reportData && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Gross Salary</span>
              <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
                OMR {formatOMR(reportData.totalGrossSalary)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Additions</span>
              <strong className="block text-xl font-bold text-emerald-600 mt-1 font-mono">
                +OMR {formatOMR(reportData.totalAdditions)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Deductions</span>
              <strong className="block text-xl font-bold text-rose-600 mt-1 font-mono">
                -OMR {formatOMR(reportData.totalDeductions)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/40 shadow-xs">
              <span className="text-xs text-blue-700 font-semibold">Net Salary (Owed)</span>
              <strong className="block text-xl font-bold text-blue-900 mt-1 font-mono">
                OMR {formatOMR(reportData.totalNetSalary)}
              </strong>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Monthly Payroll Summary Sheet — {month}</h3>
              <span className="text-xs text-slate-500">Status: <strong>{reportData.status || 'Draft'}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3 text-right">Worked</th>
                    <th className="px-3 py-3 text-right">Gross (OMR)</th>
                    <th className="px-3 py-3 text-right">Additions</th>
                    <th className="px-3 py-3 text-right">Deductions</th>
                    <th className="px-4 py-3 text-right font-bold text-blue-900">Net Salary</th>
                    <th className="px-3 py-3 text-center">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {reportData.lines?.map((l: any) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5 font-mono font-bold text-blue-600">{l.employeeId}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{l.employeeName}</td>
                      <td className="px-3 py-2.5">{l.employeeType}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{l.employeeType === 'Staff' ? `${l.daysWorked}d` : `${l.hoursWorked}h`}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatOMR(l.grossSalary)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-600">+{formatOMR(l.totalAdditions)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-rose-600">-{formatOMR(l.totalDeductions)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-700">OMR {formatOMR(l.netSalary)}</td>
                      <td className="px-3 py-2.5 text-center">{l.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Salary Disbursal Reconciliation */}
      {activeTab === 'payments' && reportData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Net Salary Owed</span>
              <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalNetSalaryOwed)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
              <span className="text-xs text-emerald-700 font-semibold">Total Disbursed (Paid)</span>
              <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalActuallyPaid)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
              <span className="text-xs text-rose-700 font-semibold">Outstanding Balance</span>
              <strong className="block text-xl font-bold text-rose-800 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalRemainingBalance)}
              </strong>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-3 py-3">Company</th>
                    <th className="px-4 py-3 text-right">Net Owed (OMR)</th>
                    <th className="px-4 py-3 text-right">Disbursed (OMR)</th>
                    <th className="px-4 py-3 text-right">Balance (OMR)</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {reportData.ledger?.map((r: any) => (
                    <tr key={r.employeeId}>
                      <td className="px-4 py-2.5 font-mono font-bold text-blue-600">{r.employeeId}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{r.employeeName}</td>
                      <td className="px-3 py-2.5">{r.employeeCompany}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">OMR {formatOMR(r.netSalaryOwed)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">OMR {formatOMR(r.totalPaid)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">OMR {formatOMR(r.remainingBalance)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.paymentStatus === 'Fully Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {r.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: WPS Recovery Ledger */}
      {activeTab === 'wps' && reportData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total WPS Recoverable</span>
              <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalRecoverable)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
              <span className="text-xs text-emerald-700 font-semibold">Total Recovered</span>
              <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalRecovered)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
              <span className="text-xs text-amber-700 font-semibold">Pending Recovery</span>
              <strong className="block text-xl font-bold text-amber-800 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalRemaining)}
              </strong>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-3 py-3 text-right">WPS Salary (OMR)</th>
                    <th className="px-3 py-3 text-right">Net Owed (OMR)</th>
                    <th className="px-4 py-3 text-right font-bold text-amber-900">Recoverable (OMR)</th>
                    <th className="px-3 py-3 text-right">Recovered</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {reportData.records?.map((r: any) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-semibold">{r.month}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-bold text-blue-600 block">{r.employeeId}</span>
                        <span>{r.employeeName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">OMR {formatOMR(r.wpsSalary)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">OMR {formatOMR(r.actualNetSalary)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">OMR {formatOMR(r.recoverableAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700">OMR {formatOMR(r.recoveredAmount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-600">OMR {formatOMR(r.remainingAmount)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'Recovered' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Project Labor Costing */}
      {activeTab === 'projects' && reportData && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Site & Project Labor Cost Allocation — {month}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Project Code</th>
                    <th className="px-4 py-3">Project Name</th>
                    <th className="px-3 py-3 text-right">Staff Days</th>
                    <th className="px-3 py-3 text-right">Worker Hours</th>
                    <th className="px-4 py-3 text-right font-bold text-indigo-900">Total Allocated Labor Cost (OMR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {reportData.projects?.map((p: any) => (
                    <tr key={p.projectCode}>
                      <td className="px-4 py-2.5 font-mono font-bold text-indigo-700">{p.projectCode}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">{p.projectName}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{p.totalStaffDays} days</td>
                      <td className="px-3 py-2.5 text-right font-mono">{p.totalWorkerHours} hrs</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-800 text-sm">
                        OMR {formatOMR(p.allocatedCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Loan Balances */}
      {activeTab === 'loans' && reportData && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium">Total Granted Principal</span>
              <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalPrincipal)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
              <span className="text-xs text-emerald-700 font-semibold">Total Principal Repaid</span>
              <strong className="block text-xl font-bold text-emerald-800 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalRepaid)}
              </strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/30 shadow-xs">
              <span className="text-xs text-purple-700 font-semibold">Active Outstanding Balance</span>
              <strong className="block text-xl font-bold text-purple-800 mt-1 font-mono">
                OMR {formatOMR(reportData.summary?.totalOutstanding)}
              </strong>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-3 py-3">Agreement Date</th>
                    <th className="px-4 py-3 text-right">Principal (OMR)</th>
                    <th className="px-3 py-3 text-right">Repaid (OMR)</th>
                    <th className="px-4 py-3 text-right font-bold text-purple-900">Remaining Balance</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {reportData.loans?.map((l: any) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-bold text-blue-600 block">{l.employeeId}</span>
                        <span>{l.employeeName}</span>
                      </td>
                      <td className="px-3 py-2.5">{formatDate(l.loanDate)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">OMR {formatOMR(l.loanAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-semibold">OMR {formatOMR(l.repaidAmount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-purple-800">OMR {formatOMR(l.remainingBalance)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          l.status === 'Fully Repaid' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
