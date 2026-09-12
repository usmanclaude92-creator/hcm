import React, { useState, useEffect } from 'react';
import {
  Building2,
  Layers,
  Briefcase,
  Wrench,
  MapPin,
  Plus,
  Edit2,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  FolderGit2,
  Loader2
} from 'lucide-react';
import {
  CompanyMaster,
  Department,
  Designation,
  TradeMaster,
  ProjectGeofenceLocation,
  Project
} from '../../types';

export type MasterTab = 'companies' | 'departments' | 'designations' | 'trades' | 'locations';

export const MasterDataContainer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MasterTab>('companies');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Per-tab granular loading states
  const [loadingStates, setLoadingStates] = useState<Record<MasterTab, boolean>>({
    companies: false,
    departments: false,
    designations: false,
    trades: false,
    locations: false
  });

  // Per-tab error notifications
  const [errorStates, setErrorStates] = useState<Record<MasterTab, string | null>>({
    companies: null,
    departments: null,
    designations: null,
    trades: null,
    locations: null
  });

  // Centralized Master Data Collections
  const [companies, setCompanies] = useState<CompanyMaster[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [trades, setTrades] = useState<TradeMaster[]>([]);
  const [locations, setLocations] = useState<ProjectGeofenceLocation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Project filter for geofence locations
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<any>({});

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const clearTabError = (tab: MasterTab) => {
    setErrorStates(prev => ({ ...prev, [tab]: null }));
  };

  // Fetch a single tab's data with dedicated loading and error states
  const fetchTabData = async (tab: MasterTab) => {
    setLoadingStates(prev => ({ ...prev, [tab]: true }));
    setErrorStates(prev => ({ ...prev, [tab]: null }));

    try {
      if (tab === 'companies') {
        const res = await fetch('/api/master/companies');
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load companies`);
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } else if (tab === 'departments') {
        const res = await fetch('/api/departments');
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load departments`);
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      } else if (tab === 'designations') {
        const res = await fetch('/api/designations');
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load designations`);
        const data = await res.json();
        setDesignations(Array.isArray(data) ? data : []);
      } else if (tab === 'trades') {
        const res = await fetch('/api/master/trades');
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load trades`);
        const data = await res.json();
        setTrades(Array.isArray(data) ? data : []);
      } else if (tab === 'locations') {
        const [resLoc, resProj] = await Promise.all([
          fetch('/api/master/geofences'),
          fetch('/api/projects')
        ]);
        if (!resLoc.ok) throw new Error(`HTTP ${resLoc.status}: Failed to load geofence locations`);
        const dataLoc = await resLoc.json();
        setLocations(Array.isArray(dataLoc) ? dataLoc : []);

        if (resProj.ok) {
          const dataProj = await resProj.json();
          setProjects(Array.isArray(dataProj) ? dataProj : []);
        }
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
      trades: true,
      locations: true
    });
    setErrorStates({
      companies: null,
      departments: null,
      designations: null,
      trades: null,
      locations: null
    });

    const tasks = [
      (async () => {
        try {
          const res = await fetch('/api/master/companies');
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
          const res = await fetch('/api/departments');
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
          const res = await fetch('/api/designations');
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
          const res = await fetch('/api/master/trades');
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
            fetch('/api/master/geofences'),
            fetch('/api/projects')
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
      init = { name: '', code: '' };
    } else if (activeTab === 'designations') {
      init = { title: '', departmentId: departments[0]?.id || '' };
    } else if (activeTab === 'trades') {
      init = { tradeCode: '', tradeName: '', category: 'Civil', isActive: true };
    } else if (activeTab === 'locations') {
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
    }
    setFormData(init);
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setModalMode('edit');
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    let url = '';
    let method = modalMode === 'create' ? 'POST' : 'PUT';

    switch (activeTab) {
      case 'companies':
        url = modalMode === 'create' ? '/api/master/companies' : `/api/master/companies/${formData.id}`;
        break;
      case 'departments':
        url = '/api/departments';
        break;
      case 'designations':
        url = '/api/designations';
        break;
      case 'trades':
        url = modalMode === 'create' ? '/api/master/trades' : `/api/master/trades/${formData.id}`;
        break;
      case 'locations':
        url = modalMode === 'create' ? '/api/master/geofences' : `/api/master/geofences/${formData.id}`;
        break;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save master record');
      }

      showNotification('success', 'Central master record saved successfully');
      setIsModalOpen(false);
      fetchCentralData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Container */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Central Master Data API
              </span>
              <span className="text-xs font-mono text-slate-500">HCMS Central System of Record</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Master Data Container</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Authoritative management for Companies, Departments, Designations, Trades, and Project Locations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchCentralData}
              disabled={isLoading}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-2 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2 shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Add Record
            </button>
          </div>
        </div>

        {/* Global Notification */}
        {notification && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-sm font-medium ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            {notification.message}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-6 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {[
            { id: 'companies' as MasterTab, label: 'Companies', icon: Building2, count: companies.length },
            { id: 'departments' as MasterTab, label: 'Departments', icon: Layers, count: departments.length },
            { id: 'designations' as MasterTab, label: 'Designations', icon: Briefcase, count: designations.length },
            { id: 'trades' as MasterTab, label: 'Trades', icon: Wrench, count: trades.length },
            { id: 'locations' as MasterTab, label: 'Project Locations', icon: MapPin, count: locations.length }
          ].map(tab => {
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
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors relative ${
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

      {/* Per-Tab Error Notification Banner */}
      {errorStates[activeTab] && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start justify-between gap-3 text-rose-900 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-sm text-rose-800 flex items-center gap-2">
                Failed to load {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} master data
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
              className="px-3 py-1.5 text-xs font-semibold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStates[activeTab] ? 'animate-spin' : ''}`} />
              Retry
            </button>
            <button
              onClick={() => clearTabError(activeTab)}
              className="text-rose-400 hover:text-rose-600 p-1"
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {activeTab === 'locations' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-600">Filter by Project:</span>
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
          Directly synced via HCMS master REST APIs
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. COMPANIES VIEW */}
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
                {loadingStates.companies ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm font-semibold text-slate-700">Loading companies from central master API...</span>
                        <span className="text-xs text-slate-500">Fetching corporate legal entities & registration data</span>
                      </div>
                    </td>
                  </tr>
                ) : errorStates.companies ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <AlertCircle className="w-8 h-8 text-rose-500" />
                        <span className="text-sm font-bold text-rose-800">Unable to load Companies</span>
                        <p className="text-xs text-slate-600">{errorStates.companies}</p>
                        <button
                          onClick={() => fetchTabData('companies')}
                          className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Fetch
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : companies
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            comp.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {comp.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openEditModal(comp)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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
      {/* 2. DEPARTMENTS VIEW */}
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
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingStates.departments ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm font-semibold text-slate-700">Loading departments from central master API...</span>
                        <span className="text-xs text-slate-500">Fetching organizational structures & hierarchies</span>
                      </div>
                    </td>
                  </tr>
                ) : errorStates.departments ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <AlertCircle className="w-8 h-8 text-rose-500" />
                        <span className="text-sm font-bold text-rose-800">Unable to load Departments</span>
                        <p className="text-xs text-slate-600">{errorStates.departments}</p>
                        <button
                          onClick={() => fetchTabData('departments')}
                          className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Fetch
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : departments
                  .filter(d =>
                    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (d.code && d.code.toLowerCase().includes(searchTerm.toLowerCase()))
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No departments found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'Try adjusting your search criteria' : 'Click "Add Record" to create your first central department'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  departments
                    .filter(d =>
                      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (d.code && d.code.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map(dept => {
                      const deptDesigs = designations.filter(des => des.departmentId === dept.id);
                      return (
                        <tr key={dept.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-slate-900">{dept.code || '—'}</td>
                          <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-600" />
                            {dept.name}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                              {deptDesigs.length} Designations
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                              Active
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openEditModal(dept)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
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
      {/* 3. DESIGNATIONS VIEW */}
      {/* ========================================================= */}
      {activeTab === 'designations' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Job Title</th>
                  <th className="px-6 py-3.5">Department</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingStates.designations ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm font-semibold text-slate-700">Loading designations from central master API...</span>
                        <span className="text-xs text-slate-500">Standardizing job titles and roles across workforce</span>
                      </div>
                    </td>
                  </tr>
                ) : errorStates.designations ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <AlertCircle className="w-8 h-8 text-rose-500" />
                        <span className="text-sm font-bold text-rose-800">Unable to load Designations</span>
                        <p className="text-xs text-slate-600">{errorStates.designations}</p>
                        <button
                          onClick={() => fetchTabData('designations')}
                          className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Fetch
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : designations
                  .filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No designations found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'Try adjusting your search criteria' : 'Click "Add Record" to create your first central job title'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  designations
                    .filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(desig => {
                      const dept = departments.find(dep => dep.id === desig.departmentId);
                      return (
                        <tr key={desig.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-indigo-600" />
                            {desig.title}
                          </td>
                          <td className="px-6 py-4 text-slate-700">{dept?.name || 'General Department'}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                              Staff
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                              Active
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openEditModal(desig)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
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
      {/* 4. TRADES VIEW */}
      {/* ========================================================= */}
      {activeTab === 'trades' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Trade Code</th>
                  <th className="px-6 py-3.5">Craft / Trade Title</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingStates.trades ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm font-semibold text-slate-700">Loading trades from central master API...</span>
                        <span className="text-xs text-slate-500">Fetching specialized craft skills & labor master classifications</span>
                      </div>
                    </td>
                  </tr>
                ) : errorStates.trades ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <AlertCircle className="w-8 h-8 text-rose-500" />
                        <span className="text-sm font-bold text-rose-800">Unable to load Trades</span>
                        <p className="text-xs text-slate-600">{errorStates.trades}</p>
                        <button
                          onClick={() => fetchTabData('trades')}
                          className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Fetch
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : trades
                  .filter(t =>
                    t.tradeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    t.tradeName.toLowerCase().includes(searchTerm.toLowerCase())
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Wrench className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <div className="font-semibold text-slate-700">No trades found</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {searchTerm ? 'Try adjusting your search criteria' : 'Click "Add Record" to create your first central trade classification'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  trades
                    .filter(t =>
                      t.tradeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      t.tradeName.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(trade => (
                      <tr key={trade.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900 flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-amber-600" />
                          {trade.tradeCode}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{trade.tradeName}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                            {trade.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            trade.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {trade.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openEditModal(trade)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
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
      {/* 5. PROJECT LOCATIONS VIEW (GEOFENCES) */}
      {/* ========================================================= */}
      {activeTab === 'locations' && (
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
                {loadingStates.locations ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        <span className="text-sm font-semibold text-slate-700">Loading project geofences from central master API...</span>
                        <span className="text-xs text-slate-500">Retrieving GPS coordinates, polygons & perimeter verification rules</span>
                      </div>
                    </td>
                  </tr>
                ) : errorStates.locations ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <AlertCircle className="w-8 h-8 text-rose-500" />
                        <span className="text-sm font-bold text-rose-800">Unable to load Project Locations</span>
                        <p className="text-xs text-slate-600">{errorStates.locations}</p>
                        <button
                          onClick={() => fetchTabData('locations')}
                          className="mt-2 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Retry Fetch
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : locations
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
                            {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
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
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              loc.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {loc.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openEditModal(loc)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
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
      {/* REUSABLE FORM MODAL */}
      {/* ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {modalMode === 'create' ? 'Add New' : 'Edit'}{' '}
                {activeTab === 'companies'
                  ? 'Company'
                  : activeTab === 'departments'
                  ? 'Department'
                  : activeTab === 'designations'
                  ? 'Designation'
                  : activeTab === 'trades'
                  ? 'Trade'
                  : 'Project Location'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* COMPANIES FORM */}
              {activeTab === 'companies' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Company Code</label>
                    <input
                      type="text"
                      required
                      value={formData.companyCode || ''}
                      onChange={e => setFormData({ ...formData, companyCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. DGO, SMI, NC"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Commercial Name</label>
                    <input
                      type="text"
                      required
                      value={formData.companyName || ''}
                      onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Duqm Global Oilfield Services LLC"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">CR Number</label>
                    <input
                      type="text"
                      value={formData.crNumber || ''}
                      onChange={e => setFormData({ ...formData, crNumber: e.target.value })}
                      placeholder="Commercial Registration Number"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Country</label>
                      <input
                        type="text"
                        value={formData.country || 'Oman'}
                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Currency</label>
                      <input
                        type="text"
                        value={formData.currency || 'OMR'}
                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* DEPARTMENTS FORM */}
              {activeTab === 'departments' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Department Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Engineering & Maintenance"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Department Code</label>
                    <input
                      type="text"
                      value={formData.code || ''}
                      onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="ENG"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                    />
                  </div>
                </>
              )}

              {/* DESIGNATIONS FORM */}
              {activeTab === 'designations' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Job Title</label>
                    <input
                      type="text"
                      required
                      value={formData.title || ''}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Site Supervisor"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Department</label>
                    <select
                      value={formData.departmentId || ''}
                      onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">Select Department</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* TRADES FORM */}
              {activeTab === 'trades' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Trade Code</label>
                    <input
                      type="text"
                      required
                      value={formData.tradeCode || ''}
                      onChange={e => setFormData({ ...formData, tradeCode: e.target.value.toUpperCase() })}
                      placeholder="ELEC, MASON, WELD"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Trade Title</label>
                    <input
                      type="text"
                      required
                      value={formData.tradeName || ''}
                      onChange={e => setFormData({ ...formData, tradeName: e.target.value })}
                      placeholder="Industrial Electrician"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Category</label>
                    <select
                      value={formData.category || 'Civil'}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    >
                      <option value="Civil">Civil</option>
                      <option value="Electrical">Electrical</option>
                      <option value="Mechanical">Mechanical</option>
                      <option value="Logistics">Logistics</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                </>
              )}

              {/* LOCATIONS FORM */}
              {activeTab === 'locations' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Associated Project</label>
                    <select
                      value={formData.projectId || ''}
                      onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-medium"
                      required
                    >
                      <option value="">Select Project</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.projectCode} - {p.projectName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Location Code</label>
                      <input
                        type="text"
                        required
                        value={formData.locationCode || ''}
                        onChange={e => setFormData({ ...formData, locationCode: e.target.value.toUpperCase() })}
                        placeholder="GATE-01"
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Type</label>
                      <select
                        value={formData.locationType || 'Main Gate'}
                        onChange={e => setFormData({ ...formData, locationType: e.target.value })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                      >
                        <option value="Main Gate">Main Gate</option>
                        <option value="Work Zone">Work Zone</option>
                        <option value="Office">Office</option>
                        <option value="Camp">Camp</option>
                        <option value="Checkpoint">Checkpoint</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Location Name</label>
                    <input
                      type="text"
                      required
                      value={formData.locationName || ''}
                      onChange={e => setFormData({ ...formData, locationName: e.target.value })}
                      placeholder="Head Office Main Security Gate"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={formData.latitude || ''}
                        onChange={e => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={formData.longitude || ''}
                        onChange={e => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Geofence Radius (Meters)</label>
                    <input
                      type="number"
                      required
                      min="25"
                      max="10000"
                      value={formData.radiusMeters || 300}
                      onChange={e => setFormData({ ...formData, radiusMeters: parseInt(e.target.value, 10) })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="isPrimaryLocCheck"
                      checked={!!formData.isPrimary}
                      onChange={e => setFormData({ ...formData, isPrimary: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <label htmlFor="isPrimaryLocCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Primary Gate for Project (Default Checkpoint)
                    </label>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
                >
                  {isLoading ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
