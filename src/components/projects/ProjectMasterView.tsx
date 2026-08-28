import React, { useState, useEffect } from 'react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  FolderKanban,
  Plus,
  Search,
  Edit2,
  CheckCircle2,
  XCircle,
  Calendar,
  Save,
  X,
} from 'lucide-react';
import type { Project, EmployeeCompany } from '../../types/index';

const ALL_COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];

export const ProjectMasterView: React.FC = () => {
  const { canWrite } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    projectCode: '',
    projectName: '',
    status: 'Active' as 'Active' | 'Inactive',
    startDate: '',
    endDate: '',
    remarks: '',
    allowedCompanies: [] as EmployeeCompany[],
  });

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const data = await apiRequest(`/api/projects?${params.toString()}`);
      setProjects(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [search, statusFilter]);

  const handleOpenAdd = () => {
    setEditingProject(null);
    setFormData({
      projectCode: '',
      projectName: '',
      status: 'Active',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      remarks: '',
      allowedCompanies: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (proj: Project) => {
    setEditingProject(proj);
    setFormData({
      projectCode: proj.projectCode,
      projectName: proj.projectName,
      status: proj.status,
      startDate: proj.startDate || '',
      endDate: proj.endDate || '',
      remarks: proj.remarks || '',
      allowedCompanies: proj.allowedCompanies || [],
    });
    setIsModalOpen(true);
  };

  const toggleAllowedCompany = (company: EmployeeCompany) => {
    setFormData(prev => ({
      ...prev,
      allowedCompanies: prev.allowedCompanies.includes(company)
        ? prev.allowedCompanies.filter(c => c !== company)
        : [...prev.allowedCompanies, company],
    }));
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await apiRequest(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        });
      } else {
        await apiRequest('/api/projects', {
          method: 'POST',
          body: JSON.stringify(formData),
        });
      }
      setIsModalOpen(false);
      fetchProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to save project');
    }
  };

  const handleToggleStatus = async (proj: Project) => {
    try {
      await apiRequest(`/api/projects/${proj.id}/toggle-status`, {
        method: 'PATCH',
      });
      fetchProjects();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-indigo-600" />
            Project Master Directory
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure site project codes for multi-project employee attendance allocation
          </p>
        </div>

        {canWrite && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search projects by code, name, remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="w-full sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Project Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((proj) => (
          <div
            key={proj.id}
            className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                  {proj.projectCode}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  proj.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {proj.status === 'Active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {proj.status}
                </span>
              </div>

              <h3 className="font-bold text-slate-900 text-base mt-3">{proj.projectName}</h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {proj.remarks || 'No remarks provided.'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {proj.allowedCompanies?.length ? `Restricted to: ${proj.allowedCompanies.join(', ')}` : 'Unrestricted -- any company'}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatDate(proj.startDate)} {proj.endDate ? `→ ${formatDate(proj.endDate)}` : ''}</span>
              </div>

              {canWrite && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(proj)}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(proj)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 px-2 py-1 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    {proj.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-indigo-600" />
                {editingProject ? `Edit Project ${editingProject.projectCode}` : 'Create New Project'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.projectCode}
                  onChange={(e) => setFormData({ ...formData, projectCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. PRJ-A"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  placeholder="e.g. Muscat Bay Villas Phase 2"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allowed Companies (leave all unchecked = unrestricted)
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_COMPANIES.map(company => (
                    <label
                      key={company}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        formData.allowedCompanies.includes(company)
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.allowedCompanies.includes(company)}
                        onChange={() => toggleAllowedCompany(company)}
                        className="w-3.5 h-3.5"
                      />
                      {company}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Only employees from a checked company may be allocated attendance/timesheet hours on this project.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Location
                </label>
                <textarea
                  rows={2}
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Additional project notes..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
