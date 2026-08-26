import React, { useState, useEffect } from 'react';
import { apiRequest, formatDate } from '../../api/client';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  User,
  Activity,
  AlertCircle,
} from 'lucide-react';
import type { AuditLog } from '../../types/index';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (moduleFilter !== 'ALL') params.append('module', moduleFilter);
      if (search) params.append('search', search);

      const data = await apiRequest(`/api/audit?${params.toString()}`);
      setLogs(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter, search]);

  const getActionBadge = (action: string) => {
    if (action.includes('CREATE') || action.includes('INSERT') || action.includes('DISBURSE')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (action.includes('UPDATE') || action.includes('MODIFY') || action.includes('EDIT')) {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (action.includes('FINALIZE') || action.includes('LOCK')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (action.includes('DELETE') || action.includes('VOID') || action.includes('REVERSE')) {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <History className="w-5 h-5 text-purple-600" />
          Audit Trail & Governance Logs
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Immutable audit record of all employee modifications, payroll recalculations, and financial disbursals
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search audit descriptions, users, record keys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="w-full sm:w-56">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">All System Modules</option>
            <option value="EMPLOYEES">Employee Master</option>
            <option value="PROJECTS">Project Master</option>
            <option value="ATTENDANCE">Attendance Ledger</option>
            <option value="PAYROLL">Payroll Engine</option>
            <option value="PAYMENTS">Salary Payments</option>
            <option value="WPS">WPS Recovery</option>
            <option value="LOANS">Loan Management</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-3 py-3">User & Role</th>
                <th className="px-3 py-3">Module</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-4 py-3">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    No audit records matching query.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                          {log.userName ? log.userName.slice(0, 2).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block">{log.userName}</span>
                          <span className="text-[10px] text-slate-400">{log.userRole}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-700">
                      {log.module}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p className="text-xs">{log.description}</p>
                      {log.recordId && (
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                          Record ID: {log.recordId}
                        </span>
                      )}
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
