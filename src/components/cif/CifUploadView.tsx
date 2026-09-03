import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  UploadCloud,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  History,
  Calendar,
} from 'lucide-react';
import type { EmployeeCompany } from '../../types/index';

const COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];
const CIF_FILE_TYPES = ['Standard CIF', 'Bank Transfer File', 'WPS File'];

export const CifUploadView: React.FC = () => {
  const { hasPermission } = useAuth();
  const [company, setCompany] = useState<EmployeeCompany>('DGO');
  const [payrollMonth, setPayrollMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [cifFileType, setCifFileType] = useState(CIF_FILE_TYPES[0]);
  const [validation, setValidation] = useState<any>(null);
  const [activeBatch, setActiveBatch] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const canUpload = hasPermission('cif.upload');
  const canProcess = hasPermission('cif.process');
  const canExport = hasPermission('cif.export');

  const fetchHistory = async () => {
    try {
      const data = await apiRequest(`/api/cif/history?company=${company}&payrollMonth=${payrollMonth}`);
      setHistory(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch CIF history');
    }
  };

  useEffect(() => {
    fetchHistory();
    setValidation(null);
    setActiveBatch(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, payrollMonth]);

  const handleDownloadTemplate = async () => {
    try {
      await downloadAuthenticatedFile(
        `/api/cif/export/template?company=${encodeURIComponent(company)}&month=${encodeURIComponent(payrollMonth)}`,
        `CIF_Template_${company}_${payrollMonth}.xlsx`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to download CIF template.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setLoading(true);
        setError(null);
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/cif/import/validate', {
          method: 'POST',
          body: JSON.stringify({ fileData: base64, payrollMonth, company }),
        });
        setValidation(res);
      } catch (err: any) {
        setError(err.message || 'Failed to parse CIF file');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadBatch = async () => {
    if (!validation?.rows) return;
    try {
      setLoading(true);
      const batch = await apiRequest('/api/cif', {
        method: 'POST',
        body: JSON.stringify({ company, payrollMonth, payrollType: 'Monthly', cifFileType, rows: validation.rows }),
      });
      setActiveBatch(batch);
      setValidation(null);
      fetchHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to upload CIF batch');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (batchId: string) => {
    try {
      const updated = await apiRequest(`/api/cif/${batchId}/preview`, { method: 'POST' });
      setActiveBatch(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleProcess = async (batchId: string, override?: string) => {
    try {
      setLoading(true);
      const updated = await apiRequest(`/api/cif/${batchId}/process`, {
        method: 'POST',
        body: JSON.stringify(override ? { overrideReason: override } : {}),
      });
      setActiveBatch(updated);
      setIsOverrideModalOpen(false);
      setOverrideReason('');
      fetchHistory();
    } catch (err: any) {
      const hasCriticalErrors = (err.message || '').toLowerCase().includes('override');
      if (hasCriticalErrors && !override) {
        setIsOverrideModalOpen(true);
      } else {
        alert(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!validation?.rows) return;
    const badRows = validation.rows.filter((r: any) => r.status !== 'Valid');
    if (badRows.length === 0) {
      alert('No errors to report.');
      return;
    }
    const data = badRows.map((r: any) => ({ 'Row #': r.rowNumber, 'Employee ID': r.employeeId, 'Employee Name': r.employeeName, 'Amount': r.amount, 'Status': r.status, 'Reason': r.reason }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CIF Errors');
    XLSX.writeFile(wb, `CIF_Errors_${payrollMonth}.xlsx`);
  };

  const reconciliation = activeBatch || validation?.reconciliation;
  const displayBatch = activeBatch;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-indigo-600" />
            CIF Upload & Processing
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload → Validate → Preview → Process → Reconcile → Complete — modeled on the Attendance import pattern
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Selectors */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Company</label>
          <select value={company} onChange={(e) => setCompany(e.target.value as EmployeeCompany)} className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Payroll Period</label>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-hidden" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Payroll Type</label>
          <input type="text" value="Monthly" disabled className="w-full px-2.5 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-500" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 mb-1">CIF / File Type</label>
          <select value={cifFileType} onChange={(e) => setCifFileType(e.target.value)} className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            {CIF_FILE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Upload / Validate */}
      {canUpload && !validation && !activeBatch && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Download Template
            </button>
            <div className="border-2 border-dashed border-slate-300 rounded-xl px-4 py-2 hover:border-indigo-500 transition-colors">
              <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700" />
            </div>
          </div>
          {loading && <span className="text-xs text-slate-400">Validating...</span>}
        </div>
      )}

      {/* Validation Preview */}
      {validation && !activeBatch && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Import Preview</h3>
            <button onClick={() => setValidation(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-500">Total Rows</span><div className="text-base font-bold">{validation.summary.totalRows}</div></div>
            <div className="p-3 bg-emerald-50 rounded-lg"><span className="text-emerald-700">Valid</span><div className="text-base font-bold text-emerald-800">{validation.summary.validCount}</div></div>
            <div className="p-3 bg-rose-50 rounded-lg"><span className="text-rose-700">Invalid / Duplicate</span><div className="text-base font-bold text-rose-800">{validation.summary.invalidCount + validation.summary.duplicateCount}</div></div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs p-3 bg-indigo-50 rounded-lg">
            <div><span className="text-indigo-600">Payroll Total</span><div className="text-base font-bold font-mono text-indigo-900">OMR {formatOMR(validation.reconciliation.payrollTotal)}</div></div>
            <div><span className="text-indigo-600">CIF Total</span><div className="text-base font-bold font-mono text-indigo-900">OMR {formatOMR(validation.reconciliation.cifTotal)}</div></div>
            <div><span className="text-indigo-600">Variance</span><div className={`text-base font-bold font-mono ${Math.abs(validation.reconciliation.variance) > 0.001 ? 'text-rose-700' : 'text-emerald-700'}`}>OMR {formatOMR(validation.reconciliation.variance)}</div></div>
          </div>

          <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Account Ref</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {validation.rows.map((r: any, idx: number) => (
                  <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : r.status === 'Duplicate' ? 'bg-amber-50/50' : ''}>
                    <td className="px-3 py-2 font-mono text-slate-400">{r.rowNumber}</td>
                    <td className="px-3 py-2 font-mono font-bold">{r.employeeId}</td>
                    <td className="px-3 py-2">{r.accountReference}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatOMR(r.amount)}</td>
                    <td className="px-3 py-2 font-bold">{r.status}</td>
                    <td className="px-3 py-2 text-slate-500 text-[11px]">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
            {validation.summary.invalidCount + validation.summary.duplicateCount > 0 && (
              <button onClick={handleDownloadErrorReport} className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100">Download Error Report</button>
            )}
            <button onClick={handleUploadBatch} disabled={loading || validation.summary.validCount === 0} className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50">
              {loading ? 'Uploading...' : 'Upload Batch'}
            </button>
          </div>
        </div>
      )}

      {/* Active Batch: Reconciliation + Process */}
      {displayBatch && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Batch Status:
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                displayBatch.status === 'Processed' ? 'bg-emerald-100 text-emerald-800' :
                displayBatch.status === 'Reconciled' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
              }`}>{displayBatch.status}</span>
            </h3>
            <button onClick={() => setActiveBatch(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs p-3 bg-indigo-50 rounded-lg">
            <div><span className="text-indigo-600">Payroll Total</span><div className="text-base font-bold font-mono text-indigo-900">OMR {formatOMR(displayBatch.payrollTotal)}</div></div>
            <div><span className="text-indigo-600">CIF Total</span><div className="text-base font-bold font-mono text-indigo-900">OMR {formatOMR(displayBatch.cifTotal)}</div></div>
            <div><span className="text-indigo-600">Variance</span><div className={`text-base font-bold font-mono ${Math.abs(displayBatch.variance || 0) > 0.001 ? 'text-rose-700' : 'text-emerald-700'}`}>OMR {formatOMR(displayBatch.variance)}</div></div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-2 bg-emerald-50 rounded-lg text-center"><span className="text-emerald-700">Valid</span><div className="font-bold">{displayBatch.validCount}</div></div>
            <div className="p-2 bg-rose-50 rounded-lg text-center"><span className="text-rose-700">Invalid</span><div className="font-bold">{displayBatch.invalidCount}</div></div>
            <div className="p-2 bg-amber-50 rounded-lg text-center"><span className="text-amber-700">Duplicate</span><div className="font-bold">{displayBatch.duplicateCount}</div></div>
          </div>

          {displayBatch.overrideUsed && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Processed with override. Reason: {displayBatch.overrideReason}
            </div>
          )}

          {displayBatch.status !== 'Processed' && canProcess && (
            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button onClick={() => handlePreview(displayBatch.id)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Refresh Preview</button>
              <button onClick={() => handleProcess(displayBatch.id)} disabled={loading} className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50">
                {loading ? 'Processing...' : 'Process Batch'}
              </button>
            </div>
          )}
          {displayBatch.status === 'Processed' && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> This batch has been processed.
            </div>
          )}
        </div>
      )}

      {/* Processing History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
        <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Processing History</h3>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No CIF batches for this company/period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Uploaded</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Payroll Total</th>
                  <th className="px-3 py-2 text-right">CIF Total</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setActiveBatch(b)}>
                    <td className="px-3 py-2">{formatDate(b.uploadedAt)}</td>
                    <td className="px-3 py-2 font-bold">{b.status}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatOMR(b.payrollTotal)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatOMR(b.cifTotal)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatOMR(b.variance)}</td>
                    <td className="px-3 py-2 text-slate-500">{b.uploadedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Override Modal */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-amber-50 flex items-center justify-between">
              <h3 className="font-bold text-amber-900 text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Critical Reconciliation Errors</h3>
              <button onClick={() => setIsOverrideModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600">
                This batch has invalid/duplicate records or a payroll/CIF variance. Provide an override reason to process it anyway -- this is recorded permanently in the audit trail.
              </p>
              <textarea rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason for overriding the reconciliation error..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500" />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2.5">
              <button onClick={() => setIsOverrideModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">Cancel</button>
              <button onClick={() => handleProcess(displayBatch.id, overrideReason)} disabled={!overrideReason.trim()} className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg disabled:opacity-50">Process With Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
