import React from 'react';
import { formatOMR } from '../../api/client';

interface Props {
  analytics: any;
  onCompanyClick: (company: string) => void;
}

export const SalaryPayrollAnalytics: React.FC<Props> = ({ analytics, onCompanyClick }) => {
  return (
    <div className="space-y-6">
      {/* Company + Pay By */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Salary by Company</h3>
          <p className="text-xs text-slate-500 mb-3">Click a row to filter Details</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr><th className="py-2 pr-2">Company</th><th className="py-2 pr-2 text-right">Employees</th><th className="py-2 pr-2 text-right">Gross</th><th className="py-2 pr-2 text-right">Net</th><th className="py-2 pr-2 text-right">Paid</th><th className="py-2 text-right">Outstanding</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.companyBreakdown.map((c: any) => (
                  <tr key={c.company} onClick={() => onCompanyClick(c.company)} className="hover:bg-blue-50/50 cursor-pointer transition-colors">
                    <td className="py-2 pr-2 font-semibold text-slate-800">{c.company}</td>
                    <td className="py-2 pr-2 text-right">{c.employees}</td>
                    <td className="py-2 pr-2 text-right font-mono">{formatOMR(c.gross)}</td>
                    <td className="py-2 pr-2 text-right font-mono font-bold text-blue-700">{formatOMR(c.net)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-emerald-700">{formatOMR(c.paid)}</td>
                    <td className="py-2 text-right font-mono text-rose-600">{formatOMR(c.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-1">Salary by Pay By</h3>
          <p className="text-xs text-slate-500 mb-3">Who actually disburses each employee's salary</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr><th className="py-2 pr-2">Pay By</th><th className="py-2 pr-2 text-right">Employees</th><th className="py-2 pr-2 text-right">Gross</th><th className="py-2 pr-2 text-right">Additions</th><th className="py-2 pr-2 text-right">Deductions</th><th className="py-2 text-right">Net</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.payByBreakdown.map((c: any) => (
                  <tr key={c.payBy}>
                    <td className="py-2 pr-2 font-semibold text-slate-800">{c.payBy}</td>
                    <td className="py-2 pr-2 text-right">{c.employees}</td>
                    <td className="py-2 pr-2 text-right font-mono">{formatOMR(c.gross)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-emerald-700">{formatOMR(c.additions)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-rose-600">{formatOMR(c.deductions)}</td>
                    <td className="py-2 text-right font-mono font-bold text-blue-700">{formatOMR(c.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Employee Type + WPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">Staff vs Worker Salary Liability</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr><th className="py-2 pr-2">Employee Type</th><th className="py-2 pr-2 text-right">Employees</th><th className="py-2 pr-2 text-right">Gross</th><th className="py-2 pr-2 text-right">Net</th><th className="py-2 pr-2 text-right">Paid</th><th className="py-2 text-right">Outstanding</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.employeeTypeBreakdown.map((t: any) => (
                  <tr key={t.employeeType}>
                    <td className="py-2 pr-2 font-semibold text-slate-800">{t.employeeType}</td>
                    <td className="py-2 pr-2 text-right">{t.employees}</td>
                    <td className="py-2 pr-2 text-right font-mono">{formatOMR(t.gross)}</td>
                    <td className="py-2 pr-2 text-right font-mono font-bold text-blue-700">{formatOMR(t.net)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-emerald-700">{formatOMR(t.paid)}</td>
                    <td className="py-2 text-right font-mono text-rose-600">{formatOMR(t.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">WPS Salary Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
                <tr><th className="py-2 pr-2">WPS Status</th><th className="py-2 pr-2 text-right">Employees</th><th className="py-2 pr-2 text-right">Gross</th><th className="py-2 pr-2 text-right">Net</th><th className="py-2 pr-2 text-right">Paid</th><th className="py-2 text-right">Outstanding</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.wpsBreakdown.map((w: any) => (
                  <tr key={w.wpsStatus}>
                    <td className="py-2 pr-2 font-semibold text-slate-800">{w.wpsStatus}</td>
                    <td className="py-2 pr-2 text-right">{w.employees}</td>
                    <td className="py-2 pr-2 text-right font-mono">{formatOMR(w.gross)}</td>
                    <td className="py-2 pr-2 text-right font-mono font-bold text-blue-700">{formatOMR(w.net)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-emerald-700">{formatOMR(w.paid)}</td>
                    <td className="py-2 text-right font-mono text-rose-600">{formatOMR(w.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Additions + Deductions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">Salary Additions Analysis</h3>
          <div className="space-y-1.5">
            {analytics.additionsBreakdown.map((a: any) => (
              <div key={a.type} className="flex items-center justify-between p-2 bg-emerald-50/50 rounded-lg text-xs">
                <span className="text-slate-700">{a.type}</span>
                <span className="text-slate-400">{a.employees} emp</span>
                <span className="font-mono font-bold text-emerald-700">OMR {formatOMR(a.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="font-semibold text-slate-900 text-sm mb-3">Salary Deductions Analysis</h3>
          <div className="space-y-1.5">
            {analytics.deductionsBreakdown.map((d: any) => (
              <div key={d.type} className="flex items-center justify-between p-2 bg-rose-50/50 rounded-lg text-xs">
                <span className="text-slate-700">{d.type}</span>
                <span className="text-slate-400">{d.employees} emp</span>
                <span className="font-mono font-bold text-rose-700">OMR {formatOMR(d.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project Analysis */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
        <h3 className="font-semibold text-slate-900 text-sm mb-1">Salary by Project</h3>
        <p className="text-xs text-slate-500 mb-3">
          Allocation view — an employee on multiple projects appears under each; not a cost split, so these totals may exceed company/pay-by totals
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 font-semibold uppercase border-b border-slate-200">
              <tr><th className="py-2 pr-2">Project</th><th className="py-2 pr-2 text-right">Employees</th><th className="py-2 pr-2 text-right">Gross</th><th className="py-2 pr-2 text-right">Additions</th><th className="py-2 pr-2 text-right">Deductions</th><th className="py-2 text-right">Net</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.projectBreakdown.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">No project allocation in the current filters.</td></tr>
              ) : analytics.projectBreakdown.map((p: any) => (
                <tr key={p.project}>
                  <td className="py-2 pr-2 font-semibold text-slate-800">{p.project}</td>
                  <td className="py-2 pr-2 text-right">{p.employees}</td>
                  <td className="py-2 pr-2 text-right font-mono">{formatOMR(p.gross)}</td>
                  <td className="py-2 pr-2 text-right font-mono text-emerald-700">{formatOMR(p.additions)}</td>
                  <td className="py-2 pr-2 text-right font-mono text-rose-600">{formatOMR(p.deductions)}</td>
                  <td className="py-2 text-right font-mono font-bold text-blue-700">{formatOMR(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
