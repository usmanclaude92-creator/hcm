import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest, formatOMR, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { Scale, FileSpreadsheet, AlertCircle, Search, Info } from 'lucide-react';
import type { GratuityLine } from '../../types/index';

interface GratuitySummary {
  asOf: string;
  employeeCount: number;
  entitledCount: number;
  totalLiability: number;
  activeLiability: number;
  payableOnExit: number;
  notYetEntitledCount: number;
  omaniExcludedCount: number;
  basis: string;
}

const todayISO = () => new Date().toISOString().split('T')[0];

export const EndOfServiceView: React.FC = () => {
  const [rows, setRows] = useState<GratuityLine[]>([]);
  const [summary, setSummary] = useState<GratuitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [asOf, setAsOf] = useState(todayISO());
  const [company, setCompany] = useState('ALL');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.append('asOf', asOf);
    if (company !== 'ALL') params.append('company', company);
    if (status !== 'ALL') params.append('status', status);
    return params.toString();
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<{ summary: GratuitySummary; rows: GratuityLine[] }>(
        `/api/gratuity?${buildQuery()}`
      );
      setRows(data.rows || []);
      setSummary(data.summary || null);
    } catch (err: any) {
      setError(err.message || 'Failed to compute end-of-service gratuity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf, company, status]);

  const handleExport = async () => {
    try {
      await downloadAuthenticatedFile(`/api/gratuity/export?${buildQuery()}`, `End_Of_Service_Gratuity_${asOf}.xlsx`);
    } catch (err: any) {
      setError(err.message || 'Failed to export the gratuity report.');
    }
  };

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r => r.employeeId.toLowerCase().includes(q) || r.employeeName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-600" />
            End-of-Service Gratuity
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Accrued liability calculated from the employee master. Nothing here is posted to payroll —
            gratuity becomes payable only when service ends.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
          Export Gratuity Schedule
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 shadow-xs">
              <span className="text-xs font-semibold text-indigo-700">Total Accrued Liability</span>
              <strong className="block text-xl font-bold text-indigo-800 mt-1 font-mono">
                OMR {formatOMR(summary.totalLiability)}
              </strong>
              <span className="text-[11px] text-indigo-600 mt-0.5 block">
                {summary.entitledCount} entitled of {summary.employeeCount} employees
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Still in Service</span>
              <strong className="block text-xl font-bold text-slate-900 mt-1 font-mono">
                OMR {formatOMR(summary.activeLiability)}
              </strong>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Provision, not yet payable</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
              <span className="text-xs font-semibold text-amber-700">Payable on Exit</span>
              <strong className="block text-xl font-bold text-amber-800 mt-1 font-mono">
                OMR {formatOMR(summary.payableOnExit)}
              </strong>
              <span className="text-[11px] text-amber-600 mt-0.5 block">Employees whose service has ended</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>
              {summary.basis} {summary.omaniExcludedCount} Omani national(s) and{' '}
              {summary.notYetEntitledCount} employee(s) below the minimum service period are shown but
              excluded from the totals. Confirm the entitlement rates against the employment contracts
              before these figures are used for financial reporting.
            </span>
          </div>
        </>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-200">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee…"
              aria-label="Search employees"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <label htmlFor="gr-asof" className="text-xs font-semibold text-slate-600 ml-2">Calculate as at</label>
          <input
            id="gr-asof"
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            aria-label="Filter by employment status"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="active">In service</option>
            <option value="former">Service ended</option>
            <option value="ALL">All employees</option>
          </select>
          <select
            value={company}
            onChange={e => setCompany(e.target.value)}
            aria-label="Filter by company"
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All companies</option>
            {['DGO', 'SMI', 'NC', 'Supplier', 'Azad'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2.5">Employee</th>
                <th className="text-left font-semibold px-4 py-2.5">Company</th>
                <th className="text-left font-semibold px-4 py-2.5">Nationality</th>
                <th className="text-left font-semibold px-4 py-2.5">Joined</th>
                <th className="text-left font-semibold px-4 py-2.5">Counted To</th>
                <th className="text-right font-semibold px-4 py-2.5">Service (yrs)</th>
                <th className="text-right font-semibold px-4 py-2.5">Basic Wage</th>
                <th className="text-right font-semibold px-4 py-2.5">Gratuity (OMR)</th>
                <th className="text-left font-semibold px-4 py-2.5">Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Calculating…</td></tr>
              )}
              {!loading && visibleRows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No employees match the current filters.</td></tr>
              )}
              {!loading && visibleRows.map(r => (
                <tr key={r.employeeId} className={`hover:bg-slate-50/70 ${r.isEntitled ? '' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-slate-800">{r.employeeId}</span>
                    <span className="block text-slate-500">{r.employeeName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.employeeCompany}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.nationalityType}</td>
                  <td className="px-4 py-2.5 text-slate-600">{formatDate(r.dateOfJoining)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{formatDate(r.serviceEndDate)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">{r.serviceYears.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-700">{formatOMR(r.monthlyBasicWage)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.isEntitled ? 'text-indigo-800' : 'text-slate-400'}`}>
                    {formatOMR(r.gratuityAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs">
                    <span className="block text-[10px]">{r.wageBasis}</span>
                    <span className="block text-[10px] italic text-slate-400">{r.note}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
