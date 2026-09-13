import React, { useState, useEffect } from 'react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  FolderKanban,
  FolderGit2,
  Plus,
  Search,
  Edit2,
  Calendar,
  Save,
  X,
} from 'lucide-react';
import type { Project, EmployeeCompany } from '../../types/index';

const ALL_COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];

export interface ProjectMasterViewProps {
  initialOpenAddModal?: boolean;
}

export const ProjectMasterView: React.FC<ProjectMasterViewProps> = ({ initialOpenAddModal }) => {
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

  useEffect(() => {
    if (initialOpenAddModal) {
      handleOpenAdd();
    }
  }, [initialOpenAddModal]);

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

      {/* Project Directory Table -- mirrors the Geofence Zones list styling
          (same card/table shell, header row, row hover, and status/actions
          column pattern) so the two Projects sub-views read as one system. */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Project Code &amp; Name</th>
                <th className="px-6 py-3.5">Remarks</th>
                <th className="px-6 py-3.5">Allowed Companies</th>
                <th className="px-6 py-3.5">Duration</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <FolderKanban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700">No projects found</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {search || statusFilter !== 'ALL'
                        ? 'Try adjusting your filters or search keywords'
                        : 'Click "Create Project" to add your first project'}
                    </div>
                  </td>
                </tr>
              ) : (
                projects.map((proj) => (
                  <tr key={proj.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <FolderGit2 className="w-4 h-4 text-blue-600" />
                        {proj.projectName}
                      </div>
                      <div className="font-mono text-xs text-slate-500">{proj.projectCode}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 max-w-xs">
                      <span className="line-clamp-2">{proj.remarks || 'No remarks provided.'}</span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {proj.allowedCompanies?.length ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                          {proj.allowedCompanies.join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">Unrestricted</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatDate(proj.startDate)} {proj.endDate ? `→ ${formatDate(proj.endDate)}` : ''}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => canWrite && handleToggleStatus(proj)}
                        title={canWrite ? 'Click to toggle status' : undefined}
                        disabled={!canWrite}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition ${canWrite ? 'cursor-pointer' : 'cursor-default'} ${
                          proj.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${proj.status === 'Active' ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                        {proj.status}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canWrite && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(proj)}
                            title="Edit Project"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
