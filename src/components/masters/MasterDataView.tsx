import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Building2, Plus, AlertCircle, CheckCircle2, X, Save, Info } from 'lucide-react';
import type { Department, Designation } from '../../types/index';

type DesignationRow = Designation & { departmentName: string | null; employeeCount: number };
type TabKey = 'designations' | 'departments';

export const MasterDataView: React.FC = () => {
  const { isManager } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('designations');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<DesignationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modal, setModal] = useState<null | 'department' | 'designation'>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', title: '', departmentId: '', remarks: '' });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [dep, des] = await Promise.all([
        apiRequest<Department[]>('/api/masters/departments?includeInactive=true'),
        apiRequest<DesignationRow[]>('/api/masters/designations?includeInactive=true'),
      ]);
      setDepartments(dep || []);
      setDesignations(des || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load master data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openModal = (kind: 'department' | 'designation') => {
    setForm({ name: '', code: '', title: '', departmentId: '', remarks: '' });
    setModal(kind);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      if (modal === 'department') {
        await apiRequest('/api/masters/departments', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, code: form.code, remarks: form.remarks }),
        });
        setNotice(`Department '${form.name}' added.`);
      } else {
        await apiRequest('/api/masters/designations', {
          method: 'POST',
          body: JSON.stringify({
            title: form.title,
            departmentId: form.departmentId || null,
            remarks: form.remarks,
          }),
        });
        setNotice(`Designation '${form.title}' added.`);
      }
      setModal(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (kind: 'department' | 'designation', id: string, next: boolean) => {
    try {
      setError(null);
      setNotice(null);
      const path = kind === 'department' ? 'departments' : 'designations';
      await apiRequest(`/api/masters/${path}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: next }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to change the status.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
        Loading master data…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-600" />
            Organisation Master Data
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            The governed list of departments and job designations used across the employee master.
          </p>
        </div>
        {isManager && (
          <button
            type="button"
            onClick={() => openModal(activeTab === 'departments' ? 'department' : 'designation')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'departments' ? 'Add Department' : 'Add Designation'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
        <span>
          Existing employee designations were back-filled into this list, so nothing had to be retyped.
          A designation still held by an employee cannot be retired until those employees are moved.
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-200">
          {([['designations', `Designations (${designations.length})`], ['departments', `Departments (${departments.length})`]] as [TabKey, string][]).map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-current={activeTab === key ? 'page' : undefined}
                className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
                  activeTab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        {activeTab === 'designations' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Designation</th>
                  <th className="text-left font-semibold px-4 py-2.5">Department</th>
                  <th className="text-right font-semibold px-4 py-2.5">Employees</th>
                  <th className="text-left font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left font-semibold px-4 py-2.5">Notes</th>
                  <th className="text-right font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {designations.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No designations defined yet.</td></tr>
                )}
                {designations.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{d.title}</td>
                    <td className="px-4 py-2.5 text-slate-600">{d.departmentName || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">{d.employeeCount}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        d.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {d.isActive ? 'Active' : 'Retired'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-[10px]">{d.remarks || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => toggleActive('designation', d.id, !d.isActive)}
                          className="px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          {d.isActive ? 'Retire' : 'Reinstate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'departments' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Department</th>
                  <th className="text-left font-semibold px-4 py-2.5">Code</th>
                  <th className="text-right font-semibold px-4 py-2.5">Designations</th>
                  <th className="text-left font-semibold px-4 py-2.5">Status</th>
                  <th className="text-left font-semibold px-4 py-2.5">Notes</th>
                  <th className="text-right font-semibold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No departments defined yet.</td></tr>
                )}
                {departments.map(dep => (
                  <tr key={dep.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{dep.name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{dep.code || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {designations.filter(d => d.departmentId === dep.id).length}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                        dep.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {dep.isActive ? 'Active' : 'Retired'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-[10px]">{dep.remarks || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => toggleActive('department', dep.id, !dep.isActive)}
                          className="px-2 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          {dep.isActive ? 'Retire' : 'Reinstate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                {modal === 'department' ? 'Add Department' : 'Add Designation'}
              </h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {modal === 'department' ? (
                <>
                  <div>
                    <label htmlFor="dep-name" className="block text-xs font-semibold text-slate-700 mb-1.5">Department Name</label>
                    <input
                      id="dep-name"
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="dep-code" className="block text-xs font-semibold text-slate-700 mb-1.5">Short Code (optional)</label>
                    <input
                      id="dep-code"
                      type="text"
                      value={form.code}
                      onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="des-title" className="block text-xs font-semibold text-slate-700 mb-1.5">Designation Title</label>
                    <input
                      id="des-title"
                      type="text"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Site Engineer"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="des-dep" className="block text-xs font-semibold text-slate-700 mb-1.5">Department (optional)</label>
                    <select
                      id="des-dep"
                      value={form.departmentId}
                      onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">Not tied to a department</option>
                      {departments.filter(d => d.isActive).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="md-remarks" className="block text-xs font-semibold text-slate-700 mb-1.5">Notes (optional)</label>
                <textarea
                  id="md-remarks"
                  rows={2}
                  value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50/60 rounded-b-xl">
              <button type="button" onClick={() => setModal(null)} className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
