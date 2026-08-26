import React, { useState, useEffect } from 'react';
import { apiRequest, formatOMR } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CalendarCheck,
  Download,
  Upload,
  Save,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Briefcase,
  Users,
  Clock,
  Calendar,
} from 'lucide-react';
import type { Project } from '../../types/index';

interface AttendanceGroup {
  employeeId: string;
  employeeName: string;
  employeeType: 'Worker' | 'Staff';
  designation: string;
  employeeCompany: string;
  salaryPaidBy: string;
  monthlySalaryOrRate: number;
  wageType: string;
  totalDays: number;
  totalHours: number;
  records: {
    id?: string;
    projectId: string;
    projectCode: string;
    projectName: string;
    daysWorked: number;
    hoursWorked: number;
  }[];
}

export const AttendanceView: React.FC = () => {
  const { canWrite } = useAuth();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [grouped, setGrouped] = useState<AttendanceGroup[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest(`/api/attendance?month=${month}`);
      setGrouped(data.grouped || []);
      setAllProjects(data.allProjects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [month]);

  const handleAddProjectRow = (empIndex: number) => {
    if (allProjects.length === 0) {
      alert('No projects available. Please create active projects in Project Master first.');
      return;
    }
    const updated = [...grouped];
    const defaultProj = allProjects[0];
    updated[empIndex].records.push({
      projectId: defaultProj.id,
      projectCode: defaultProj.projectCode,
      projectName: defaultProj.projectName,
      daysWorked: updated[empIndex].employeeType === 'Staff' ? 0 : 0,
      hoursWorked: updated[empIndex].employeeType === 'Worker' ? 0 : 0,
    });
    setGrouped(updated);
  };

  const handleRemoveProjectRow = (empIndex: number, recIndex: number) => {
    const updated = [...grouped];
    updated[empIndex].records.splice(recIndex, 1);
    setGrouped(updated);
  };

  const handleRecordChange = (
    empIndex: number,
    recIndex: number,
    field: 'projectId' | 'daysWorked' | 'hoursWorked',
    value: any
  ) => {
    const updated = [...grouped];
    const rec = updated[empIndex].records[recIndex];

    if (field === 'projectId') {
      const proj = allProjects.find(p => p.id === value);
      if (proj) {
        rec.projectId = proj.id;
        rec.projectCode = proj.projectCode;
        rec.projectName = proj.projectName;
      }
    } else if (field === 'daysWorked') {
      rec.daysWorked = Math.max(0, Number(value) || 0);
    } else if (field === 'hoursWorked') {
      rec.hoursWorked = Math.max(0, Number(value) || 0);
    }

    setGrouped(updated);
  };

  const handleSaveAttendance = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      // Flatten records with validation
      const flatRecords: any[] = [];
      for (const g of grouped) {
        const totalDays = g.records.reduce((s, r) => s + (Number(r.daysWorked) || 0), 0);
        if (g.employeeType === 'Staff' && totalDays > 30) {
          throw new Error(`Total days worked for Staff ${g.employeeId} (${g.employeeName}) cannot exceed 30 days. Currently entered: ${totalDays} days.`);
        }

        for (const r of g.records) {
          flatRecords.push({
            employeeId: g.employeeId,
            projectId: r.projectId,
            daysWorked: r.daysWorked,
            hoursWorked: r.hoursWorked,
          });
        }
      }

      await apiRequest('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          month,
          records: flatRecords,
        }),
      });

      setSuccessMsg(`Attendance records for ${month} saved successfully.`);
      fetchAttendance();
    } catch (err: any) {
      setError(err.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleExportTemplate = () => {
    window.location.href = `/api/attendance/export/template?month=${month}`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/attendance/import/validate', {
          method: 'POST',
          body: JSON.stringify({ fileData: base64, month }),
        });
        setImportPreview(res);
      } catch (err: any) {
        alert(err.message || 'Failed to parse attendance file');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const res = await apiRequest('/api/attendance/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          month,
          rows: importPreview.rows,
        }),
      });
      alert(res.message);
      setIsImportModalOpen(false);
      setImportPreview(null);
      fetchAttendance();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-indigo-600" />
            Monthly Attendance Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Staff: Days Worked (max 30) • Workers: Hours Worked • Multi-Project Allocation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Picker */}
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>

          <button
            onClick={handleExportTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Attendance Template
          </button>

          {canWrite && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Attendance
              </button>

              <button
                onClick={handleSaveAttendance}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Attendance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-3 py-3">Company / Paid By</th>
                <th className="px-4 py-3 min-w-[320px]">Project Allocations & Worked Volume</th>
                <th className="px-4 py-3 text-right">Total Worked</th>
                {canWrite && <th className="px-3 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {grouped.map((emp, empIdx) => {
                const totalDays = emp.records.reduce((s, r) => s + (Number(r.daysWorked) || 0), 0);
                const totalHours = emp.records.reduce((s, r) => s + (Number(r.hoursWorked) || 0), 0);

                return (
                  <tr key={emp.employeeId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-blue-600 block">{emp.employeeId}</span>
                      <span className="font-semibold text-slate-900">{emp.employeeName}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        emp.employeeType === 'Staff' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {emp.employeeType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {emp.designation}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <span>{emp.employeeCompany}</span>
                      <span className="block text-[10px] text-slate-400">Paid by: {emp.salaryPaidBy}</span>
                    </td>

                    {/* Project Allocations Input Rows */}
                    <td className="px-4 py-2">
                      <div className="space-y-1.5">
                        {emp.records.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic py-1">
                            No project allocated yet. Click '+ Add Project' to assign.
                          </div>
                        ) : (
                          emp.records.map((rec, recIdx) => (
                            <div key={recIdx} className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                              <select
                                disabled={!canWrite}
                                value={rec.projectId}
                                onChange={(e) => handleRecordChange(empIdx, recIdx, 'projectId', e.target.value)}
                                className="px-2 py-1 bg-white border border-slate-200 rounded text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-indigo-500"
                              >
                                {allProjects.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.projectCode} - {p.projectName}
                                  </option>
                                ))}
                              </select>

                              {emp.employeeType === 'Staff' ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    step="0.5"
                                    disabled={!canWrite}
                                    value={rec.daysWorked}
                                    onChange={(e) => handleRecordChange(empIdx, recIdx, 'daysWorked', e.target.value)}
                                    placeholder="Days"
                                    className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <span className="text-[10px] text-slate-500">days</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={!canWrite}
                                    value={rec.hoursWorked}
                                    onChange={(e) => handleRecordChange(empIdx, recIdx, 'hoursWorked', e.target.value)}
                                    placeholder="Hours"
                                    className="w-20 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-center font-bold focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <span className="text-[10px] text-slate-500">hrs</span>
                                </div>
                              )}

                              {canWrite && (
                                <button
                                  onClick={() => handleRemoveProjectRow(empIdx, recIdx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Total Worked */}
                    <td className="px-4 py-3 text-right">
                      {emp.employeeType === 'Staff' ? (
                        <div>
                          <strong className={`font-mono text-sm ${totalDays > 30 ? 'text-rose-600 font-bold' : 'text-slate-900'}`}>
                            {totalDays} / 30
                          </strong>
                          <span className="block text-[10px] text-slate-500">Days Total</span>
                        </div>
                      ) : (
                        <div>
                          <strong className="font-mono text-sm text-indigo-700">
                            {totalHours} hrs
                          </strong>
                          <span className="block text-[10px] text-slate-500">Hours Total</span>
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    {canWrite && (
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => handleAddProjectRow(empIdx)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          Project
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Import Monthly Attendance Spreadsheet</h3>
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
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                  <FileSpreadsheet className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">Upload Filled Attendance Template for {month}</p>
                  <p className="text-xs text-slate-500 mt-1">Columns: Employee ID, Project Code, Days Worked, Hours Worked</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="mt-4 text-xs file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div>
                      <span>Total Rows: <strong>{importPreview.summary.totalRows}</strong></span> •{' '}
                      <span className="text-emerald-700">Valid: <strong>{importPreview.summary.validCount}</strong></span> •{' '}
                      <span className="text-rose-700">Invalid: <strong>{importPreview.summary.invalidCount}</strong></span>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Employee ID</th>
                          <th className="px-3 py-2">Project</th>
                          <th className="px-3 py-2">Days</th>
                          <th className="px-3 py-2">Hours</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : ''}>
                            <td className="px-3 py-2 text-slate-400 font-mono">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                            <td className="px-3 py-2">{r.projectCode}</td>
                            <td className="px-3 py-2">{r.daysWorked}</td>
                            <td className="px-3 py-2">{r.hoursWorked}</td>
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
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Commit Attendance'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
