import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Layers,
  Briefcase,
  Wrench,
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  FolderGit2,
  Loader2,
  BadgePercent,
  Calendar,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Check,
  X
} from 'lucide-react';
import {
  CompanyMaster,
  Department,
  Designation,
  TradeMaster,
  ProjectGeofenceLocation,
  Project,
  PayGrade,
  LeaveType
} from '../../types';
import { getStoredToken } from '../../api/client';
import { MasterDataEntryModal } from './MasterDataEntryModal';
import { ProjectMasterView } from '../projects/ProjectMasterView';

export type MasterTab =
  | 'companies'
  | 'departments'
  | 'designations'
  | 'locations'
  | 'projects'
  | 'pay-grades'
  | 'leave-types'
  | 'trades';

export interface MasterDataContainerProps {
  initialTab?: MasterTab;
  openCreateModal?: boolean;
}

export const MasterDataContainer: React.FC<MasterDataContainerProps> = ({
  initialTab,
  openCreateModal: initialOpenCreateModal,
}) => {
  const [activeTab, setActiveTab] = useState<MasterTab>(initialTab || 'companies');

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Per-tab granular loading states
  const [loadingStates, setLoadingStates] = useState<Record<MasterTab, boolean>>({
    companies: false,
    departments: false,
    designations: false,
    locations: false,
    projects: false,
    'pay-grades': false,
    'leave-types': false,
    trades: false,
  });

  // Per-tab error notifications
  const [errorStates, setErrorStates] = useState<Record<MasterTab, string | null>>({
    companies: null,
    departments: null,
    designations: null,
    locations: null,
    projects: null,
    'pay-grades': null,
    'leave-types': null,
    trades: null,
  });

  // Centralized Master Data Collections
  const [companies, setCompanies] = useState<CompanyMaster[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [trades, setTrades] = useState<TradeMaster[]>([]);
  const [locations, setLocations] = useState<ProjectGeofenceLocation[]>([]);
  const [payGrades, setPayGrades] = useState<PayGrade[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Project filter for geofence locations
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // The merged "Projects" master tab has two nested sections: the project
  // directory itself, and the geofence zones that belong to those projects.
  const [projectsSubView, setProjectsSubView] = useState<'directory' | 'geofences'>('directory');

  // Geofence CRUD (create/edit/delete/toggle/save) still runs on the 'locations'
  // tab identity internally -- only the outer nav groups it under "Projects".
  const effectiveTab: MasterTab =
    activeTab === 'projects' && projectsSubView === 'geofences' ? 'locations' : activeTab;

  // The Project Directory sub-view renders its own self-contained toolbar/modal
  // (ProjectMasterView), so this container's generic Add Record/search bar hide there.
  const isProjectDirectory = activeTab === 'projects' && projectsSubView === 'directory';

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<any>({});

  // Confirmation state for deleting items
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    tab: MasterTab;
    id: string;
    name: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const clearTabError = (tab: MasterTab) => {
    setErrorStates(prev => ({ ...prev, [tab]: null }));
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = getStoredToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  // Fetch a single tab's data with dedicated loading and error states
  const fetchTabData = async (tab: MasterTab) => {
    setLoadingStates(prev => ({ ...prev, [tab]: true }));
    setErrorStates(prev => ({ ...prev, [tab]: null }));
    const headers = getAuthHeaders();

    try {
      if (tab === 'companies') {
        const res = await fetch('/api/master/companies', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load companies`);
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } else if (tab === 'departments') {
        const res = await fetch('/api/master/departments', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load departments`);
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      } else if (tab === 'designations') {
        const res = await fetch('/api/master/designations', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load designations`);
        const data = await res.json();
        setDesignations(Array.isArray(data) ? data : []);
      } else if (tab === 'trades') {
        const res = await fetch('/api/master/trades', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load trades`);
        const data = await res.json();
        setTrades(Array.isArray(data) ? data : []);
      } else if (tab === 'locations') {
        const [resLoc, resProj] = await Promise.all([
          fetch('/api/master/geofences', { headers }),
          fetch('/api/projects', { headers })
        ]);
        if (!resLoc.ok) throw new Error(`HTTP ${resLoc.status}: Failed to load geofence locations`);
        const dataLoc = await resLoc.json();
        setLocations(Array.isArray(dataLoc) ? dataLoc : []);

        if (resProj.ok) {
          const dataProj = await resProj.json();
          setProjects(Array.isArray(dataProj) ? dataProj : []);
        }
      } else if (tab === 'pay-grades') {
        const res = await fetch('/api/master/pay-grades?includeInactive=true', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load pay grades`);
        const data = await res.json();
        setPayGrades(Array.isArray(data) ? data : []);
      } else if (tab === 'leave-types') {
        const res = await fetch('/api/master/leave-types', { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load leave types`);
        const data = await res.json();
        setLeaveTypes(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      const msg = err.message || `Failed to fetch ${tab} data`;
      setErrorStates(prev => ({ ...prev, [tab]: msg }));
    } finally {
      setLoadingStates(prev => ({ ...prev, [tab]: false }));
    }
  };

  // Central fetch across all endpoints with individual progress and error capture
  const fetchCentralData = async () => {
    setIsLoading(true);
    setLoadingStates({
      companies: true,
      departments: true,
      designations: true,
      locations: true,
      projects: false,
      'pay-grades': true,
      'leave-types': true,
      trades: true,
    });
    setErrorStates({
      companies: null,
      departments: null,
      designations: null,
      locations: null,
      projects: null,
      'pay-grades': null,
      'leave-types': null,
      trades: null,
    });

    const headers = getAuthHeaders();

    const tasks = [
      (async () => {
        try {
          const res = await fetch('/api/master/companies', { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setCompanies(Array.isArray(data) ? data : []);
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, companies: err.message || 'Error fetching companies' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, companies: false }));
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/master/departments', { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setDepartments(Array.isArray(data) ? data : []);
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, departments: err.message || 'Error fetching departments' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, departments: false }));
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/master/designations', { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setDesignations(Array.isArray(data) ? data : []);
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, designations: err.message || 'Error fetching designations' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, designations: false }));
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/master/trades', { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setTrades(Array.isArray(data) ? data : []);
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, trades: err.message || 'Error fetching trades' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, trades: false }));
        }
      })(),
      (async () => {
        try {
          const [resLoc, resProj] = await Promise.all([
            fetch('/api/master/geofences', { headers }),
            fetch('/api/projects', { headers })
          ]);
          if (!resLoc.ok) throw new Error(`HTTP ${resLoc.status}`);
          const dataLoc = await resLoc.json();
          setLocations(Array.isArray(dataLoc) ? dataLoc : []);
          if (resProj.ok) {
            const dataProj = await resProj.json();
            setProjects(Array.isArray(dataProj) ? dataProj : []);
          }
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, locations: err.message || 'Error fetching geofence locations' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, locations: false }));
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/master/pay-grades?includeInactive=true', { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setPayGrades(Array.isArray(data) ? data : []);
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, 'pay-grades': err.message || 'Error fetching pay grades' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, 'pay-grades': false }));
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/master/leave-types', { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setLeaveTypes(Array.isArray(data) ? data : []);
        } catch (err: any) {
          setErrorStates(prev => ({ ...prev, 'leave-types': err.message || 'Error fetching leave types' }));
        } finally {
          setLoadingStates(prev => ({ ...prev, 'leave-types': false }));
        }
      })()
    ];

    await Promise.allSettled(tasks);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCentralData();
  }, []);

  const openCreateModal = () => {
    setModalMode('create');
    let init: any = { isActive: true };
    if (activeTab === 'companies') {
      init = { companyCode: '', companyName: '', legalName: '', crNumber: '', country: 'Oman', currency: 'OMR', isActive: true };
    } else if (activeTab === 'departments') {
      init = { name: '', code: '', remarks: '', isActive: true };
    } else if (activeTab === 'designations') {
      init = { title: '', departmentId: departments[0]?.id || '', remarks: '', isActive: true };
    } else if (activeTab === 'trades') {
      init = { tradeCode: '', tradeName: '', category: 'Civil', isActive: true };
    } else if (effectiveTab === 'locations') {
      init = {
        projectId: selectedProjectId || projects[0]?.id || '',
        locationCode: 'GATE-01',
        locationName: '',
        locationType: 'Main Gate',
        latitude: 23.5880,
        longitude: 58.3829,
        radiusMeters: 300,
        isPrimary: false,
        isActive: true,
        effectiveFrom: new Date().toISOString().split('T')[0]
      };
    } else if (activeTab === 'pay-grades') {
      init = {
        gradeCode: '',
        gradeName: '',
        minimumSalary: 250,
        maximumSalary: 500,
        currency: 'OMR',
        standardAllowance: 50,
        description: '',
        isActive: true
      };
    } else if (activeTab === 'leave-types') {
      init = {
        code: '',
        name: '',
        isPaid: true,
        annualEntitlementDays: 30,
        remarks: '',
        isActive: true
      };
    }
    setFormData(init);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (initialOpenCreateModal) {
      openCreateModal();
    }
  }, [initialOpenCreateModal, activeTab]);

  const openEditModal = (item: any) => {
    setModalMode('edit');
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  // Status toggle handler with optimistic update
  const handleToggleStatus = async (tab: MasterTab, id: string, currentStatus: boolean, label?: string) => {
    const newStatus = !currentStatus;
    const headers = getAuthHeaders();

    // Map tab to endpoint
    const endpointMap: Record<MasterTab, string> = {
      companies: 'companies',
      departments: 'departments',
      designations: 'designations',
      locations: 'geofences',
      projects: 'projects',
      'pay-grades': 'pay-grades',
      'leave-types': 'leave-types',
      trades: 'trades'
    };

    const endpoint = endpointMap[tab];

    // Optimistic UI update
    if (tab === 'companies') setCompanies(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));
    if (tab === 'departments') setDepartments(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));
    if (tab === 'designations') setDesignations(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));
    if (tab === 'locations') setLocations(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));
    if (tab === 'pay-grades') setPayGrades(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));
    if (tab === 'leave-types') setLeaveTypes(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));
    if (tab === 'trades') setTrades(prev => prev.map(x => x.id === id ? { ...x, isActive: newStatus } : x));

    try {
      const res = await fetch(`/api/master/${endpoint}/${id}/toggle-status`, {
        method: 'PATCH',
        headers
      });
      if (!res.ok) throw new Error('Status update failed');
      showNotification('success', `${label || 'Record'} status updated to ${newStatus ? 'Active' : 'Inactive'}`);
    } catch (err: any) {
      // Revert optimistic update
      fetchTabData(tab);
      showNotification('error', err.message || 'Failed to update status');
    }
  };

  // Delete confirmation handler
  const promptDelete = (tab: MasterTab, id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, tab, id, name });
  };

  const confirmDeleteRecord = async () => {
    if (!deleteConfirm) return;
    const { tab, id, name } = deleteConfirm;
    setDeleteConfirm(null);

    const endpointMap: Record<MasterTab, string> = {
      companies: 'companies',
      departments: 'departments',
      designations: 'designations',
      locations: 'geofences',
      projects: 'projects',
      'pay-grades': 'pay-grades',
      'leave-types': 'leave-types',
      trades: 'trades'
    };

    const endpoint = endpointMap[tab];
    const headers = getAuthHeaders();

    try {
      const res = await fetch(`/api/master/${endpoint}/${id}`, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to delete record`);
      }

      // Remove from local state
      if (tab === 'companies') setCompanies(prev => prev.filter(x => x.id !== id));
      if (tab === 'departments') setDepartments(prev => prev.filter(x => x.id !== id));
      if (tab === 'designations') setDesignations(prev => prev.filter(x => x.id !== id));
      if (tab === 'locations') setLocations(prev => prev.filter(x => x.id !== id));
      if (tab === 'pay-grades') setPayGrades(prev => prev.filter(x => x.id !== id));
      if (tab === 'leave-types') setLeaveTypes(prev => prev.filter(x => x.id !== id));
      if (tab === 'trades') setTrades(prev => prev.filter(x => x.id !== id));

      showNotification('success', `Master record "${name}" deleted successfully`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to delete record');
    }
  };

  const handleSaveMaster = async (submittedData: any) => {
    setIsLoading(true);

    let url = '';
    const method = modalMode === 'create' ? 'POST' : 'PUT';

    switch (effectiveTab) {
      case 'companies':
        url = modalMode === 'create' ? '/api/master/companies' : `/api/master/companies/${submittedData.id}`;
        break;
      case 'departments':
        url = modalMode === 'create' ? '/api/master/departments' : `/api/master/departments/${submittedData.id}`;
        break;
      case 'designations':
        url = modalMode === 'create' ? '/api/master/designations' : `/api/master/designations/${submittedData.id}`;
        break;
      case 'trades':
        url = modalMode === 'create' ? '/api/master/trades' : `/api/master/trades/${submittedData.id}`;
        break;
      case 'locations':
        url = modalMode === 'create' ? '/api/master/geofences' : `/api/master/geofences/${submittedData.id}`;
        break;
      case 'pay-grades':
        url = modalMode === 'create' ? '/api/master/pay-grades' : `/api/master/pay-grades/${submittedData.id}`;
        break;
      case 'leave-types':
        url = modalMode === 'create' ? '/api/master/leave-types' : `/api/master/leave-types/${submittedData.id}`;
        break;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(submittedData)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save master record');
      }

      showNotification('success', 'Central master record saved successfully');
      setIsModalOpen(false);
      fetchTabData(effectiveTab);
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Tab definitions
  const tabs = [
    { id: 'companies' as MasterTab, label: 'Companies', icon: Building2, count: companies.length },
    { id: 'departments' as MasterTab, label: 'Departments', icon: Layers, count: departments.length },
    { id: 'designations' as MasterTab, label: 'Designations', icon: Briefcase, count: designations.length },
    { id: 'projects' as MasterTab, label: 'Projects', icon: FolderGit2, count: projects.length },
    { id: 'pay-grades' as MasterTab, label: 'Pay-Grades', icon: BadgePercent, count: payGrades.length },
    { id: 'leave-types' as MasterTab, label: 'Leave Types', icon: Calendar, count: leaveTypes.length },
    { id: 'trades' as MasterTab, label: 'Trades & Skills', icon: Wrench, count: trades.length }
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Container */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Central Master Data Registry
              </span>
              <span className="text-xs font-mono text-slate-500">HCMS Central System of Record</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Master Data Management</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Authoritative management for Departments, Designations, Projects &amp; Geofences, Pay-Grades, Leave-Types, Companies, and Trades.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchCentralData}
              disabled={isLoading}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {!isProjectDirectory && (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Record
              </button>
            )}
          </div>
        </div>

        {/* Global Notification */}
        {notification && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-sm font-medium animate-in fade-in duration-150 ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.message}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-6 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isTabLoading = loadingStates[tab.id];
            const hasTabError = !!errorStates[tab.id];

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchTerm('');
                  if (tab.id === 'projects') setProjectsSubView('directory');
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer relative ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t-lg'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {isTabLoading ? (
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                ) : (
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                )}
                <span>{tab.label}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-mono transition-colors ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-800 font-bold'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isTabLoading ? '...' : tab.count}
                </span>
                {hasTabError && (
                  <span
                    title={`Error loading ${tab.label}`}
                    className="flex h-2 w-2 relative"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Projects sub-navigation: Geofence Zones live under Project master data.
          Kept deliberately lighter than the main tab bar above (which uses a
          filled/bordered indigo style) so this nested level reads as secondary. */}
      {activeTab === 'projects' && (
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-fit">
          <button
            onClick={() => setProjectsSubView('directory')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              projectsSubView === 'directory'
                ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                : 'text-slate-500 border border-transparent hover:bg-slate-50'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            Project Directory
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${projectsSubView === 'directory' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100'}`}>
              {projects.length}
            </span>
          </button>
          <button
            onClick={() => setProjectsSubView('geofences')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              projectsSubView === 'geofences'
                ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                : 'text-slate-500 border border-transparent hover:bg-slate-50'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Geofence Zones
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${projectsSubView === 'geofences' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100'}`}>
              {locations.length}
            </span>
          </button>
        </div>
      )}

      {/* Per-Tab Error Notification Banner */}
      {errorStates[activeTab] && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start justify-between gap-3 text-rose-900 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-sm text-rose-800 flex items-center gap-2">
                Failed to load {activeTab} master data
              </div>
              <p className="text-xs text-rose-700 mt-0.5">
                {errorStates[activeTab]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => fetchTabData(activeTab)}
              disabled={loadingStates[activeTab]}
              className="px-3 py-1.5 text-xs font-semibold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStates[activeTab] ? 'animate-spin' : ''}`} />
              Retry
            </button>
            <button
              onClick={() => clearTabError(activeTab)}
              className="text-rose-400 hover:text-rose-600 p-1 cursor-pointer"
              title="Dismiss error"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Tab Loading Status Overlay/Banner if active tab is refreshing */}
      {loadingStates[activeTab] && (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl px-4 py-3 flex items-center justify-between text-indigo-900 shadow-sm animate-pulse">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
            <span>Fetching updated {activeTab} master records from central API...</span>
          </div>
          <span className="text-xs text-indigo-600 font-mono">Syncing...</span>
        </div>
      )}

      {/* Filter / Search Bar */}
      {!isProjectDirectory && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${effectiveTab.replace('-', ' ')} by code, name, or keywords...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {activeTab === 'projects' && projectsSubView === 'geofences' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-600">Filter Project:</span>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Projects ({projects.length})</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} - {p.projectName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-xs text-slate-500 font-medium">
            Full CRUD, search, and instant status toggle active
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. DEPARTMENTS VIEW */}
      {/* ========================================================= */}
      {activeTab === 'departments' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Department Code</th>
                  <th className="px-6 py-3.5">Department Name</th>
                  <th className="px-6 py-3.5">Associated Designations</th>
                  <th className="px-6 py-3.5">Remarks / Details</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {departments
                  .filter(d =>
                    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (d.code && d.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (d.remarks && d.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No departments found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'No results matching search keywords' : 'Click "Add Record" to create your first organizational department'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  departments
                    .filter(d =>
                      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (d.code && d.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
                      (d.remarks && d.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map(dept => {
                      const linkedDesignations = designations.filter(des => des.departmentId === dept.id);
                      return (
                        <tr key={dept.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-blue-600" />
                            {dept.code || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{dept.name}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                              {linkedDesignations.length} Role{linkedDesignations.length !== 1 ? 's' : ''}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                            {dept.remarks || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleToggleStatus('departments', dept.id, dept.isActive, dept.name)}
                              title="Click to toggle status"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                                dept.isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${dept.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                              {dept.isActive ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(dept)}
                                title="Edit Department"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => promptDelete('departments', dept.id, dept.name)}
                                title="Delete Department"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
      )}

      {/* ========================================================= */}
      {/* 2. DESIGNATIONS VIEW */}
      {/* ========================================================= */}
      {activeTab === 'designations' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Job Title / Designation</th>
                  <th className="px-6 py-3.5">Assigned Department</th>
                  <th className="px-6 py-3.5">Remarks / Scope</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {designations
                  .filter(d =>
                    d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (d.remarks && d.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No designations found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'No results matching search' : 'Click "Add Record" to define standard job titles'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  designations
                    .filter(d =>
                      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (d.remarks && d.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map(des => {
                      const dept = departments.find(dep => dep.id === des.departmentId);
                      return (
                        <tr key={des.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-purple-600" />
                            {des.title}
                          </td>
                          <td className="px-6 py-4">
                            {dept ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                                {dept.name}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">All Departments / General Site</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                            {des.remarks || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleToggleStatus('designations', des.id, des.isActive, des.title)}
                              title="Click to toggle status"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                                des.isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${des.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                              {des.isActive ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(des)}
                                title="Edit Designation"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => promptDelete('designations', des.id, des.title)}
                                title="Delete Designation"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
      )}

      {/* ========================================================= */}
      {/* 3a. PROJECT DIRECTORY VIEW (nested under Projects) */}
      {/* ========================================================= */}
      {activeTab === 'projects' && projectsSubView === 'directory' && (
        <ProjectMasterView />
      )}

      {/* ========================================================= */}
      {/* 3b. GEOFENCE ZONES VIEW (nested under Projects) */}
      {/* ========================================================= */}
      {activeTab === 'projects' && projectsSubView === 'geofences' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Project</th>
                  <th className="px-6 py-3.5">Location Code & Name</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Coordinates (Lat, Lng)</th>
                  <th className="px-6 py-3.5">Radius</th>
                  <th className="px-6 py-3.5">Primary Gate</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {locations
                  .filter(loc => (!selectedProjectId || loc.projectId === selectedProjectId))
                  .filter(loc =>
                    loc.locationCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    loc.locationName.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No project geofences found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm || selectedProjectId
                          ? 'Try adjusting your filters or search keywords'
                          : 'Click "Add Record" to configure your first project geofence boundary'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  locations
                    .filter(loc => (!selectedProjectId || loc.projectId === selectedProjectId))
                    .filter(loc =>
                      loc.locationCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      loc.locationName.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(loc => {
                      const proj = projects.find(p => p.id === loc.projectId);
                      return (
                        <tr key={loc.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                              <FolderGit2 className="w-4 h-4 text-blue-600" />
                              {proj?.projectCode || loc.projectId}
                            </div>
                            <div className="text-xs text-slate-500">{proj?.projectName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{loc.locationName}</div>
                            <div className="font-mono text-xs text-slate-500">{loc.locationCode}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                              {loc.locationType}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-800">
                            {Number(loc.latitude).toFixed(6)}, {Number(loc.longitude).toFixed(6)}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900">
                            {loc.radiusMeters} m
                          </td>
                          <td className="px-6 py-4">
                            {loc.isPrimary ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                                Primary Gate
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Sub-Zone</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleToggleStatus('locations', loc.id, loc.isActive, loc.locationName)}
                              title="Click to toggle status"
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                                loc.isActive
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${loc.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                              {loc.isActive ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(loc)}
                                title="Edit Location Geofence"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => promptDelete('locations', loc.id, loc.locationName)}
                                title="Delete Location Geofence"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
      )}

      {/* ========================================================= */}
      {/* 4. PAY-GRADES VIEW */}
      {/* ========================================================= */}
      {activeTab === 'pay-grades' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Grade Code</th>
                  <th className="px-6 py-3.5">Grade Title / Hierarchy</th>
                  <th className="px-6 py-3.5">Salary Range (OMR)</th>
                  <th className="px-6 py-3.5">Std Allowance</th>
                  <th className="px-6 py-3.5">Target Roles & Scope</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payGrades
                  .filter(g =>
                    g.gradeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    g.gradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      <BadgePercent className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No pay grades found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'No results matching search' : 'Click "Add Record" to define standard pay-grade scales'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  payGrades
                    .filter(g =>
                      g.gradeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      g.gradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map(grade => (
                      <tr key={grade.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <BadgePercent className="w-4 h-4 text-violet-600" />
                          {grade.gradeCode}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {grade.gradeName}
                        </td>
                        <td className="px-6 py-4 font-mono">
                          <span className="font-bold text-slate-900">{grade.minimumSalary.toLocaleString()}</span>
                          <span className="text-slate-400 mx-1.5">—</span>
                          <span className="font-bold text-slate-900">{grade.maximumSalary.toLocaleString()} {grade.currency || 'OMR'}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">
                          {grade.standardAllowance !== undefined ? `${grade.standardAllowance} OMR` : '0 OMR'}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                          {grade.description || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleStatus('pay-grades', grade.id, grade.isActive, grade.gradeName)}
                            title="Click to toggle status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                              grade.isActive
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${grade.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                            {grade.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(grade)}
                              title="Edit Pay Grade"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => promptDelete('pay-grades', grade.id, grade.gradeName)}
                              title="Delete Pay Grade"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. LEAVE-TYPES VIEW */}
      {/* ========================================================= */}
      {activeTab === 'leave-types' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Leave Code</th>
                  <th className="px-6 py-3.5">Leave Type Name</th>
                  <th className="px-6 py-3.5">Annual Entitlement</th>
                  <th className="px-6 py-3.5">Remuneration Type</th>
                  <th className="px-6 py-3.5">Statutory / Company Notes</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {leaveTypes
                  .filter(l =>
                    l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (l.remarks && l.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                      <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No leave types found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'No results matching search' : 'Click "Add Record" to configure statutory and company leave types'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  leaveTypes
                    .filter(l =>
                      l.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (l.remarks && l.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map(leave => (
                      <tr key={leave.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-teal-600" />
                          {leave.code}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          {leave.name}
                        </td>
                        <td className="px-6 py-4 font-mono font-semibold text-slate-900">
                          {leave.annualEntitlementDays > 0 ? `${leave.annualEntitlementDays} Days/Year` : 'Ad-hoc / Uncapped'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            leave.isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {leave.isPaid ? 'Paid Leave' : 'Unpaid Leave'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                          {leave.remarks || '—'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleStatus('leave-types', leave.id, leave.isActive, leave.name)}
                            title="Click to toggle status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                              leave.isActive
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${leave.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                            {leave.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(leave)}
                              title="Edit Leave Type"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => promptDelete('leave-types', leave.id, leave.name)}
                              title="Delete Leave Type"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. COMPANIES VIEW */}
      {/* ========================================================= */}
      {activeTab === 'companies' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Company Code</th>
                  <th className="px-6 py-3.5">Commercial Name</th>
                  <th className="px-6 py-3.5">CR Number</th>
                  <th className="px-6 py-3.5">Country / Currency</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {companies
                  .filter(c =>
                    c.companyCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    c.companyName.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No companies found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'Try adjusting your search criteria' : 'Click "Add Record" to create your first central company'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  companies
                    .filter(c =>
                      c.companyCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      c.companyName.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(comp => (
                      <tr key={comp.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-600" />
                          {comp.companyCode}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{comp.companyName}</div>
                          {comp.legalName && <div className="text-xs text-slate-500">{comp.legalName}</div>}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">{comp.crNumber || '—'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                            {comp.country} ({comp.currency})
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleStatus('companies', comp.id, comp.isActive, comp.companyName)}
                            title="Click to toggle status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                              comp.isActive
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${comp.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                            {comp.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(comp)}
                              title="Edit Company"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => promptDelete('companies', comp.id, comp.companyName)}
                              title="Delete Company"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. TRADES VIEW */}
      {/* ========================================================= */}
      {activeTab === 'trades' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Trade Code</th>
                  <th className="px-6 py-3.5">Trade Name</th>
                  <th className="px-6 py-3.5">Discipline Category</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {trades
                  .filter(t =>
                    t.tradeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.category.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No trades found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'No results matching search' : 'Click "Add Record" to define skills taxonomy'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  trades
                    .filter(t =>
                      t.tradeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      t.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      t.category.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(trade => (
                      <tr key={trade.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-amber-600" />
                          {trade.tradeCode}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{trade.tradeName}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800">
                            {trade.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleStatus('trades', trade.id, trade.isActive, trade.tradeName)}
                            title="Click to toggle status"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                              trade.isActive
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${trade.isActive ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                            {trade.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(trade)}
                              title="Edit Trade"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => promptDelete('trades', trade.id, trade.tradeName)}
                              title="Delete Trade"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm Master Deletion</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Are you sure you want to delete <span className="font-semibold text-slate-900">"{deleteConfirm.name}"</span> from {deleteConfirm.tab}?
                </p>
                <p className="text-xs text-rose-600 mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100">
                  Warning: Existing worker or site records referencing this master item may be impacted. Consider toggling to "Inactive" instead if this record has historical transactions.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteRecord}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition cursor-pointer"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REUSABLE FORM MODAL */}
      {/* ========================================================= */}
      <MasterDataEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modalMode={modalMode}
        activeTab={effectiveTab}
        initialData={formData}
        departments={departments}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSave={handleSaveMaster}
        isSaving={isLoading}
      />
    </div>
  );
};
