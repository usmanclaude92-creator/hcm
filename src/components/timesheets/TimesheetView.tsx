import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Clock,
  Download,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Search,
} from 'lucide-react';
import type { Project, Employee, TimesheetEntry } from '../../types/index';

export const TimesheetView: React.FC = () => {
  const { hasPermission } = useAuth();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ employeeId: '', date: new Date().toISOString().split('T')[0], project: '', taskActivity: '', normalHours: '8', overtimeHours: '0', remarks: '' });

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const canCreate = hasPermission('timesheet.create');
  const canEdit = hasPermission('timesheet.edit');
  const canApprove = hasPermission('timesheet.approve');
  const canImport = hasPermission('timesheet.import');
  const canExport = hasPermission('timesheet.export');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [entryData, empData, projData] = await Promise.all([
        apiRequest(`/api/timesheets?month=${month}`),
        apiRequest('/api/employees'),
        apiRequest('/api/projects'),
      ]);
      setEntries(entryData || []);
      setEmployees((empData.employees || empData) || []);
      setAllProjects((projData || []).filter((p: Project) => p.status === 'Active'));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch timesheets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleOpenAdd = () => {
    setAddForm({ employeeId: '', date: new Date().toISOString().split('T')[0], project: allProjects[0]?.id || '', taskActivity: '', normalHours: '8', overtimeHours: '0', remarks: '' });
    setIsAddModalOpen(true);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/timesheets', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: addForm.employeeId,
          date: addForm.date,
          project: addForm.project,
          taskActivity: addForm.taskActivity,
          normalHours: Number(addForm.normalHours),
          overtimeHours: Number(addForm.overtimeHours),
          remarks: addForm.remarks,
        }),
      });
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save timesheet entry');
    }
  };

  const handleVoid = async (id: string) => {
    const reason = window.prompt('Reason for voiding this timesheet entry (required):');
    if (!reason || !reason.trim()) return;
    try {
      await apiRequest(`/api/timesheets/${id}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApprove = async (id: string, approve: boolean) => {
    try {
      await apiRequest(`/api/timesheets/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportTemplate = () => {
    window.location.href = '/api/timesheets/export/template';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/timesheets/import/validate', { method: 'POST', body: JSON.stringify({ fileData: base64 }) });
        setImportPreview(res);
      } catch (err: any) {
        alert(err.message || 'Failed to parse timesheet file');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadErrorReport = () => {
    if (!importPreview?.rows) return;
    const invalidRows = importPreview.rows.filter((r: any) => r.status === 'Invalid');
    if (invalidRows.length === 0) {
      alert('No invalid rows to report.');
      return;
    }
    const data = invalidRows.map((r: any) => ({ 'Row #': r.rowNumber, 'Employee ID': r.employeeId, 'Employee Name': r.employeeName, 'Date': r.date, 'Project Code': r.projectCode, 'Reason': r.reason }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
    XLSX.writeFile(wb, `Timesheet_Import_Errors_${month}.xlsx`);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const res = await apiRequest('/api/timesheets/import/confirm', { method: 'POST', body: JSON.stringify({ rows: importPreview.rows }) });
      alert(res.message);
      setIsImportModalOpen(false);
      setImportPreview(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Timesheet entries only carry `company` themselves -- Pay By/WPS/Type/Nationality
  // live on the Employee Master record, so sorting by those needs a lookup by employeeId.
  const employeesById = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach(e => map.set(e.employeeId, e));
    return map;
  }, [employees]);

  const filteredEntries = useMemo(() => {
    const filtered = entries.filter(entry => {
      if (search) {
        const q = search.trim().toLowerCase();
        const matches =
          entry.employeeId.toLowerCase().includes(q) ||
          (entry.employeeName || '').toLowerCase().includes(q) ||
          (entry.taskActivity || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (projectFilter !== 'ALL' && entry.projectCode !== projectFilter) return false;
      if (companyFilter !== 'ALL' && entry.company !== companyFilter) return false;
      if (statusFilter !== 'ALL' && entry.approvalStatus !== statusFilter) return false;
      return true;
    });

    // Row order: Company -> Pay By -> WPS -> Project -> Type -> Nationality (Omani
    // ranked first, per explicit product decision -- everything else in this cascade
    // is plain ascending).
    const nationalityRank = (n?: string) => (n === 'Omani' ? 0 : 1);
    return filtered.sort((a, b) => {
      const empA = employeesById.get(a.employeeId);
      const empB = employeesById.get(b.employeeId);
      return (
        (a.company || '').localeCompare(b.company || '') ||
        (empA?.salaryPaidBy || '').localeCompare(empB?.salaryPaidBy || '') ||
        (empA?.wpsEmployee || '').localeCompare(empB?.wpsEmployee || '') ||
        a.projectCode.localeCompare(b.projectCode) ||
        (empA?.employeeType || '').localeCompare(empB?.employeeType || '') ||
        (nationalityRank(empA?.nationalityType) - nationalityRank(empB?.nationalityType))
      );
    });
  }, [entries, search, projectFilter, companyFilter, statusFilter, employeesById]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            Timesheet Management
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="text-xs font-semibold text-slate-800 focus:outline-hidden" />
          </div>
          {canExport && (
            <button onClick={handleExportTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer">
              <Download className="w-3.5 h-3.5" /> Timesheet Template
            </button>
          )}
          {canImport && (
            <button onClick={() => setIsImportModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Import Timesheets
            </button>
          )}
          {canCreate && (
            <button onClick={handleOpenAdd} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Log Entry
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by employee or task..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            />
          </div>
          <div>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Projects</option>
              {allProjects.map(p => <option key={p.id} value={p.projectCode}>{p.projectCode} - {p.projectName}</option>)}
            </select>
          </div>
          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Companies</option>
              <option value="DGO">DGO</option>
              <option value="SMI">SMI</option>
              <option value="NC">NC</option>
              <option value="Supplier">Supplier</option>
              <option value="Azad">Azad</option>
            </select>
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Date</th>
                <th className="px-3 py-3">Company</th>
                <th className="px-3 py-3">Pay By</th>
                <th className="px-3 py-3">Project</th>
                <th className="px-3 py-3">Task/Activity</th>
                <th className="px-3 py-3 text-right">Normal</th>
                <th className="px-3 py-3 text-right">Overtime</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-400">Loading timesheet entries...</td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-400">
                  {entries.length === 0 ? `No timesheet entries for ${month} yet.` : 'No timesheet entries matching the current filters.'}
                </td></tr>
              ) : (
                filteredEntries.map(entry => {
                  const emp = employeesById.get(entry.employeeId);
                  return (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-blue-600 block">{entry.employeeId}</span>
                      <span className="font-semibold text-slate-900">{entry.employeeName}</span>
                    </td>
                    <td className="px-3 py-3">{formatDate(entry.date)}</td>
                    <td className="px-3 py-3 font-medium text-slate-600">{entry.company}</td>
                    <td className="px-3 py-3 text-slate-600">{emp?.salaryPaidBy || '—'}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono font-semibold text-indigo-700">{entry.projectCode}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{entry.taskActivity || '—'}</td>
                    <td className="px-3 py-3 text-right font-mono">{entry.normalHours}</td>
                    <td className="px-3 py-3 text-right font-mono text-amber-600">{entry.overtimeHours}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        entry.approvalStatus === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                        entry.approvalStatus === 'Rejected' ? 'bg-rose-100 text-rose-800' :
                        entry.approvalStatus === 'Submitted' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {entry.approvalStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canApprove && entry.approvalStatus !== 'Approved' && (
                          <button onClick={() => handleApprove(entry.id, true)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md" title="Approve">
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canApprove && entry.approvalStatus !== 'Rejected' && (
                          <button onClick={() => handleApprove(entry.id, false)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md" title="Reject">
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => handleVoid(entry.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md" title="Void">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Entry Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base">Log Timesheet Entry</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveEntry} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee <span className="text-rose-500">*</span></label>
                  <select required value={addForm.employeeId} onChange={(e) => setAddForm({ ...addForm, employeeId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs">
                    <option value="">Select employee...</option>
                    {employees.filter(e => e.isActive).map(e => <option key={e.id} value={e.employeeId}>{e.employeeId} - {e.employeeName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date <span className="text-rose-500">*</span></label>
                  <input type="date" required value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project <span className="text-rose-500">*</span></label>
                <select required value={addForm.project} onChange={(e) => setAddForm({ ...addForm, project: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs">
                  {allProjects.map(p => <option key={p.id} value={p.id}>{p.projectCode} - {p.projectName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Task / Activity</label>
                <input type="text" value={addForm.taskActivity} onChange={(e) => setAddForm({ ...addForm, taskActivity: e.target.value })} placeholder="e.g. Concrete pour, Site inspection..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Normal Hours</label>
                  <input type="number" min="0" step="0.5" value={addForm.normalHours} onChange={(e) => setAddForm({ ...addForm, normalHours: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Overtime Hours</label>
                  <input type="number" min="0" step="0.5" value={addForm.overtimeHours} onChange={(e) => setAddForm({ ...addForm, overtimeHours: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <textarea rows={2} value={addForm.remarks} onChange={(e) => setAddForm({ ...addForm, remarks: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" />
              </div>
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Import Timesheet Spreadsheet</h3>
              </div>
              <button onClick={() => { setIsImportModalOpen(false); setImportPreview(null); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {!importPreview ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                  <FileSpreadsheet className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Upload Filled Timesheet Template</p>
                  <p className="text-xs text-slate-500 mt-1">Multiple rows per employee expected -- one per date/project.</p>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="mt-4 text-xs file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <span>Total Rows: <strong>{importPreview.summary.totalRows}</strong></span> •{' '}
                    <span className="text-emerald-700">Valid: <strong>{importPreview.summary.validCount}</strong></span> •{' '}
                    <span className="text-rose-700">Invalid: <strong>{importPreview.summary.invalidCount}</strong></span>
                  </div>
                  <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Project</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2">OT</th>
                          <th className="px-3 py-2">Status</th><th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : ''}>
                            <td className="px-3 py-2 font-mono text-slate-400">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                            <td className="px-3 py-2">{r.date}</td>
                            <td className="px-3 py-2">{r.projectCode}</td>
                            <td className="px-3 py-2">{r.normalHours}</td>
                            <td className="px-3 py-2">{r.overtimeHours}</td>
                            <td className="px-3 py-2 font-bold">{r.status}</td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button type="button" onClick={() => { setIsImportModalOpen(false); setImportPreview(null); }} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">Cancel</button>
              {importPreview && importPreview.summary.invalidCount > 0 && (
                <button type="button" onClick={handleDownloadErrorReport} className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100">Download Error Report</button>
              )}
              {importPreview && (
                <button type="button" disabled={importing || importPreview.summary.validCount === 0} onClick={handleConfirmImport} className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50">
                  {importing ? 'Importing...' : 'Commit Timesheets'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
