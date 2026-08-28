import React, { useEffect, useState } from 'react';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
import { X, User, Paperclip } from 'lucide-react';

interface Props {
  employeeId: string;
  onClose: () => void;
}

// Full cross-month history is deliberately NOT scoped to any one report row's month --
// this modal's job is complete historical truth (including any month currently
// In Revision in the main report), unlike the report table's current-state classification.
export const EmployeeCostProfileModal: React.FC<Props> = ({ employeeId, onClose }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [transactions, setTransactions] = useState<any[] | null>(null);
  const [transactionsFailed, setTransactionsFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reportRes = await apiRequest(`/api/reports/salary-payroll?search=${encodeURIComponent(employeeId)}&pageSize=all&sortBy=payrollMonth&sortDir=asc`);
        if (!cancelled) setRows((reportRes.rows || []).filter((r: any) => r.employeeId === employeeId));
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load employee payroll history');
      }
      try {
        const tx = await apiRequest(`/api/payments/transactions?employeeId=${encodeURIComponent(employeeId)}`);
        if (!cancelled) setTransactions(tx);
      } catch {
        if (!cancelled) setTransactionsFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const latest = rows && rows.length > 0 ? rows[rows.length - 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {latest ? `${latest.employeeName} (${employeeId})` : employeeId}
              </h3>
              <p className="text-xs text-slate-500">Employee Salary & Cost Profile</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{error}</div>}

          {!rows ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No payroll records found for this employee.</p>
          ) : (
            <>
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Payroll History (Gross → Additions → Deductions → Net → Outstanding → WPS)</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2 text-right">Gross</th>
                        <th className="px-3 py-2 text-right">Additions</th>
                        <th className="px-3 py-2 text-right">Deductions</th>
                        <th className="px-3 py-2 text-right">Net</th>
                        <th className="px-3 py-2 text-right">Outstanding</th>
                        <th className="px-3 py-2 text-right">WPS Amount</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {rows.map((r) => (
                        <tr key={r.payrollMonth}>
                          <td className="px-3 py-2 font-mono">{r.payrollMonth}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatOMR(r.grossSalary)}</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700">{formatOMR(r.totalAdditions)}</td>
                          <td className="px-3 py-2 text-right font-mono text-rose-600">{formatOMR(r.totalDeductions)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{formatOMR(r.netSalary)}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.outstanding === null ? '—' : formatOMR(r.outstanding)}</td>
                          <td className="px-3 py-2 text-right font-mono">{r.wpsEmployee === 'Yes' ? formatOMR(r.wpsSalary) : '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{r.paymentStatus}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">Actual Payment History (All Months)</h4>
                {transactionsFailed ? (
                  <p className="text-xs text-slate-400 italic">Payment history unavailable (insufficient permission).</p>
                ) : !transactions ? (
                  <p className="text-xs text-slate-400">Loading...</p>
                ) : transactions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No payment transactions recorded.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Month</th>
                          <th className="px-3 py-2">Pay To</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-center">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {transactions.map((tx: any) => (
                          <tr key={tx.id} className={tx.isReversed ? 'opacity-50' : ''}>
                            <td className="px-3 py-2">{formatDate(tx.paymentDate)}</td>
                            <td className="px-3 py-2 font-mono">{tx.payrollMonth}</td>
                            <td className="px-3 py-2">{tx.payTo}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">OMR {formatOMR(tx.payAmount)}</td>
                            <td className="px-3 py-2 text-center">
                              {tx.receiptStoragePath ? <Paperclip className="w-3.5 h-3.5 text-emerald-600 inline" /> : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
