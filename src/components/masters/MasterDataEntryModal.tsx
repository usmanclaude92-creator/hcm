import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Layers,
  Briefcase,
  Wrench,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Globe,
  Navigation,
  HelpCircle,
  Compass,
  ArrowRight,
  Info
} from 'lucide-react';
import type { MasterTab } from './MasterDataContainer';
import type { Department, Project } from '../../types';

interface MasterDataEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: MasterTab;
  modalMode: 'create' | 'edit';
  initialData?: any;
  departments: Department[];
  projects: Project[];
  onSave: (savedData: any) => Promise<void>;
  isSaving: boolean;
}

export const MasterDataEntryModal: React.FC<MasterDataEntryModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  modalMode,
  initialData,
  departments,
  projects,
  onSave,
  isSaving
}) => {
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [geoLocating, setGeoLocating] = useState(false);
  const [geoSuccessMsg, setGeoSuccessMsg] = useState<string | null>(null);

  // Initialize or reset form state whenever modal opens or tab/item changes
  useEffect(() => {
    if (!isOpen) {
      setFormData({});
      setErrors({});
      setGeoSuccessMsg(null);
      return;
    }

    if (modalMode === 'edit' && initialData) {
      setFormData({ ...initialData });
    } else {
      // Meaningful industrial defaults for create mode
      if (activeTab === 'companies') {
        setFormData({
          companyCode: '',
          companyName: '',
          legalName: '',
          crNumber: '',
          country: 'Oman',
          currency: 'OMR',
          taxId: '',
          address: '',
          contactEmail: '',
          contactPhone: '',
          isActive: true
        });
      } else if (activeTab === 'departments') {
        setFormData({
          name: '',
          code: '',
          remarks: '',
          isActive: true
        });
      } else if (activeTab === 'designations') {
        setFormData({
          title: '',
          departmentId: departments[0]?.id || '',
          remarks: '',
          isActive: true
        });
      } else if (activeTab === 'trades') {
        setFormData({
          tradeCode: '',
          tradeName: '',
          category: 'Civil',
          isActive: true
        });
      } else if (activeTab === 'locations') {
        setFormData({
          projectId: projects[0]?.id || '',
          locationCode: 'GATE-01',
          locationName: '',
          locationType: 'Main Gate',
          latitude: 23.5880,
          longitude: 58.3829,
          radiusMeters: 300,
          isPrimary: false,
          isActive: true,
          effectiveFrom: new Date().toISOString().split('T')[0]
        });
      }
    }
    setErrors({});
    setGeoSuccessMsg(null);
  }, [isOpen, modalMode, initialData, activeTab, departments, projects]);

  if (!isOpen) return null;

  // Validation engine
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (activeTab === 'companies') {
      if (!formData.companyCode?.trim()) newErrors.companyCode = 'Company Code is required (e.g., HO-OMAN, SMI)';
      if (!formData.companyName?.trim()) newErrors.companyName = 'Company Commercial Name is required';
      if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
        newErrors.contactEmail = 'Please provide a valid email format';
      }
    } else if (activeTab === 'departments') {
      if (!formData.name?.trim()) newErrors.name = 'Department Name is required';
      if (!formData.code?.trim()) newErrors.code = 'Department Code is recommended (e.g., ENG, HR, FIN)';
    } else if (activeTab === 'designations') {
      if (!formData.title?.trim()) newErrors.title = 'Job Title / Designation is required';
    } else if (activeTab === 'trades') {
      if (!formData.tradeCode?.trim()) newErrors.tradeCode = 'Trade Code is required (e.g., ELEC, WELD)';
      if (!formData.tradeName?.trim()) newErrors.tradeName = 'Trade / Craft Title is required';
    } else if (activeTab === 'locations') {
      if (!formData.projectId) newErrors.projectId = 'Project selection is required';
      if (!formData.locationCode?.trim()) newErrors.locationCode = 'Location Code is required (e.g., GATE-01)';
      if (!formData.locationName?.trim()) newErrors.locationName = 'Location Name is required';
      if (formData.latitude === undefined || formData.latitude === '' || isNaN(Number(formData.latitude))) {
        newErrors.latitude = 'Valid GPS Latitude is required (-90 to +90)';
      } else if (Number(formData.latitude) < -90 || Number(formData.latitude) > 90) {
        newErrors.latitude = 'Latitude must be between -90 and 90 degrees';
      }
      if (formData.longitude === undefined || formData.longitude === '' || isNaN(Number(formData.longitude))) {
        newErrors.longitude = 'Valid GPS Longitude is required (-180 to +180)';
      } else if (Number(formData.longitude) < -180 || Number(formData.longitude) > 180) {
        newErrors.longitude = 'Longitude must be between -180 and 180 degrees';
      }
      if (!formData.radiusMeters || Number(formData.radiusMeters) < 25) {
        newErrors.radiusMeters = 'Radius must be at least 25 meters';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSave(formData);
  };

  // Helper to fetch current coordinates via browser Geolocation API
  const handleCaptureCurrentLocation = () => {
    if (!navigator.geolocation) {
      setErrors(prev => ({ ...prev, locationCapture: 'Geolocation is not supported by this browser.' }));
      return;
    }
    setGeoLocating(true);
    setGeoSuccessMsg(null);
    setErrors(prev => {
      const rest = { ...prev };
      delete rest.locationCapture;
      return rest;
    });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLocating(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setFormData((prev: any) => ({
          ...prev,
          latitude: lat,
          longitude: lng
        }));
        setGeoSuccessMsg(`Captured GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setGeoLocating(false);
        setErrors(prev => ({ ...prev, locationCapture: `GPS Capture error: ${err.message}` }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Preset location coordinates in Oman
  const omanCoordinatePresets = [
    { label: 'Muscat HQ / Airport', lat: 23.5933, lng: 58.2844 },
    { label: 'Duqm Port & Drydock', lat: 19.6700, lng: 57.7050 },
    { label: 'Sohar Industrial Port', lat: 24.5020, lng: 56.6340 },
    { label: 'Salalah Port Freezone', lat: 16.9450, lng: 54.0080 },
    { label: 'Fahud PDO Oilfield', lat: 22.3480, lng: 56.4950 }
  ];

  // Tab metadata headers
  const getTabHeader = () => {
    switch (activeTab) {
      case 'companies':
        return {
          title: modalMode === 'create' ? 'Register Legal Company Entity' : 'Edit Company Master Record',
          subtitle: 'Central corporate entity for contract sponsorship, payroll disbursement, and WPS compliance',
          icon: Building2,
          color: 'indigo'
        };
      case 'departments':
        return {
          title: modalMode === 'create' ? 'Create New Department' : 'Edit Department Master Record',
          subtitle: 'Functional organization unit for resource allocation and cost attribution',
          icon: Layers,
          color: 'blue'
        };
      case 'designations':
        return {
          title: modalMode === 'create' ? 'Define Job Designation' : 'Edit Job Designation Master Record',
          subtitle: 'Standardized job title taxonomy linked to organizational departments',
          icon: Briefcase,
          color: 'purple'
        };
      case 'trades':
        return {
          title: modalMode === 'create' ? 'Register Specialized Trade Craft' : 'Edit Trade Craft Record',
          subtitle: 'Field labor skills classification utilized by Workforce App daily job assignments',
          icon: Wrench,
          color: 'amber'
        };
      case 'locations':
        return {
          title: modalMode === 'create' ? 'Configure Project Geofence Zone' : 'Edit Project Geofence Zone',
          subtitle: 'GPS perimeter boundary for mobile Workforce-App check-in / check-out verification',
          icon: MapPin,
          color: 'emerald'
        };
    }
  };

  const header = getTabHeader();
  const HeaderIcon = header.icon;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 shrink-0">
              <HeaderIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">{header.title}</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                  {modalMode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{header.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-700">
          <form id="masterDataEntryForm" onSubmit={handleSubmit} className="space-y-5">
            {/* ============================================================== */}
            {/* 1. COMPANIES FORM */}
            {/* ============================================================== */}
            {activeTab === 'companies' && (
              <div className="space-y-4">
                {/* Code & Commercial Name */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Company Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.companyCode || ''}
                      onChange={e => setFormData({ ...formData, companyCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. DGO, SMI, NC"
                      disabled={modalMode === 'edit'}
                      className={`w-full text-sm border rounded-lg px-3 py-2 font-mono font-bold tracking-wider uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.companyCode ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      } ${modalMode === 'edit' ? 'bg-slate-100 cursor-not-allowed text-slate-500' : ''}`}
                    />
                    {errors.companyCode && <p className="text-xs text-rose-600 mt-1">{errors.companyCode}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Unique primary key across ERP & HCMS</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Commercial Trade Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.companyName || ''}
                      onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="e.g. Duqm Global Oilfield Services LLC"
                      className={`w-full text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.companyName ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.companyName && <p className="text-xs text-rose-600 mt-1">{errors.companyName}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Standard display name used in dashboards and payslips</p>
                  </div>
                </div>

                {/* Legal Entity Name & CR Number */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Full Legal / Registered Name
                    </label>
                    <input
                      type="text"
                      value={formData.legalName || ''}
                      onChange={e => setFormData({ ...formData, legalName: e.target.value })}
                      placeholder="e.g. Duqm Global Oilfield Services LLC"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Exact name as registered with Ministry of Commerce</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Commercial Registration (CR) Number
                    </label>
                    <input
                      type="text"
                      value={formData.crNumber || ''}
                      onChange={e => setFormData({ ...formData, crNumber: e.target.value })}
                      placeholder="e.g. CR-1029384"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Ministry CR number for legal audit compliance</p>
                  </div>
                </div>

                {/* Jurisdiction, Currency & Tax ID */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Country Jurisdiction
                    </label>
                    <input
                      type="text"
                      value={formData.country || 'Oman'}
                      onChange={e => setFormData({ ...formData, country: e.target.value })}
                      placeholder="Oman"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Operating Currency
                    </label>
                    <input
                      type="text"
                      value={formData.currency || 'OMR'}
                      onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                      placeholder="OMR"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      VAT / Tax Identification No.
                    </label>
                    <input
                      type="text"
                      value={formData.taxId || ''}
                      onChange={e => setFormData({ ...formData, taxId: e.target.value })}
                      placeholder="OM-TAX-998811"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Contact Coordinates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Official Contact Email
                    </label>
                    <input
                      type="email"
                      value={formData.contactEmail || ''}
                      onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                      placeholder="payroll@company.om"
                      className={`w-full text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.contactEmail ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.contactEmail && <p className="text-xs text-rose-600 mt-1">{errors.contactEmail}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Telephone Contact
                    </label>
                    <input
                      type="text"
                      value={formData.contactPhone || ''}
                      onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                      placeholder="+968 2412 3456"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Physical Headquarters Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Registered Office Address
                  </label>
                  <textarea
                    rows={2}
                    value={formData.address || ''}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Building 404, Way 2135, Al Azaiba North, Muscat, Sultanate of Oman"
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Operational Status Toggle */}
                <div className="flex items-center gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="companyActiveToggle"
                    checked={formData.isActive !== false}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <label htmlFor="companyActiveToggle" className="text-sm font-semibold text-slate-800 cursor-pointer">
                      Active Entity Status
                    </label>
                    <p className="text-xs text-slate-500">
                      Active companies are selectable when hiring staff, allocating projects, and preparing WPS files.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 2. DEPARTMENTS FORM */}
            {/* ============================================================== */}
            {activeTab === 'departments' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Department Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.code || ''}
                      onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. ENG, HR, FIN"
                      className={`w-full text-sm border rounded-lg px-3 py-2 font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.code ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.code && <p className="text-xs text-rose-600 mt-1">{errors.code}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Short alphanumeric key</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Department Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Civil Construction & Earthworks"
                      className={`w-full text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.name ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Official department title for reporting</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Department Remarks & Scope
                  </label>
                  <textarea
                    rows={2}
                    value={formData.remarks || ''}
                    onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                    placeholder="Covers engineering planning, structural execution, and technical supervision."
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="departmentActiveToggle"
                    checked={formData.isActive !== false}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <label htmlFor="departmentActiveToggle" className="text-sm font-semibold text-slate-800 cursor-pointer">
                      Active Department Status
                    </label>
                    <p className="text-xs text-slate-500">
                      Disabling will prevent assigning new designations and staff to this department.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 3. DESIGNATIONS FORM */}
            {/* ============================================================== */}
            {activeTab === 'designations' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Designation / Job Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title || ''}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. Senior Project Engineer, Safety Officer, Site Foreman"
                    className={`w-full text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                      errors.title ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                    }`}
                  />
                  {errors.title && <p className="text-xs text-rose-600 mt-1">{errors.title}</p>}
                  <p className="text-[11px] text-slate-400 mt-1">Standardized title eliminating redundant typos and aliases</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Governing Department
                  </label>
                  <select
                    value={formData.departmentId || ''}
                    onChange={e => setFormData({ ...formData, departmentId: e.target.value || null })}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">-- General / Cross-Departmental (No Fixed Dept) --</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} {dept.code ? `(${dept.code})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Leave unassigned if this job position operates across multiple project sites or operations.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Job Description & Role Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={formData.remarks || ''}
                    onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                    placeholder="Key responsibilities, qualification requirements, or grading references."
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="designationActiveToggle"
                    checked={formData.isActive !== false}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <label htmlFor="designationActiveToggle" className="text-sm font-semibold text-slate-800 cursor-pointer">
                      Active Designation Status
                    </label>
                    <p className="text-xs text-slate-500">
                      Cannot be retired while active employees currently hold this title.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 4. TRADES FORM */}
            {/* ============================================================== */}
            {activeTab === 'trades' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Trade Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.tradeCode || ''}
                      onChange={e => setFormData({ ...formData, tradeCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. ELEC, WELD, MASON"
                      className={`w-full text-sm border rounded-lg px-3 py-2 font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.tradeCode ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.tradeCode && <p className="text-xs text-rose-600 mt-1">{errors.tradeCode}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Used on mobile app timesheets</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Trade / Craft Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.tradeName || ''}
                      onChange={e => setFormData({ ...formData, tradeName: e.target.value })}
                      placeholder="e.g. Certified High-Voltage Electrician"
                      className={`w-full text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.tradeName ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.tradeName && <p className="text-xs text-rose-600 mt-1">{errors.tradeName}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Full occupational title for site crew allocation</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Craft Category
                  </label>
                  <select
                    value={formData.category || 'Civil'}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Civil">Civil (Carpenters, Masons, Steel Fixers)</option>
                    <option value="Electrical">Electrical (Electricians, Cable Jointers, Instrumentation)</option>
                    <option value="Mechanical">Mechanical (Pipe Fitters, Welders, HVAC, Riggers)</option>
                    <option value="Logistics">Logistics (Heavy Equipment, Crane Operators, Drivers)</option>
                    <option value="General">General (Site Safety, Scaffolding, Helpers)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="tradeActiveToggle"
                    checked={formData.isActive !== false}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <div>
                    <label htmlFor="tradeActiveToggle" className="text-sm font-semibold text-slate-800 cursor-pointer">
                      Active Trade Skill Status
                    </label>
                    <p className="text-xs text-slate-500">
                      Syncs to Workforce-App to categorize field gang assignments and daily productivity rates.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 5. PROJECT LOCATIONS & GEOFENCES FORM */}
            {/* ============================================================== */}
            {activeTab === 'locations' && (
              <div className="space-y-4">
                {/* Associated Project */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Associated Construction Project <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.projectId || ''}
                    onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                    className={`w-full text-sm border rounded-lg px-3 py-2 font-medium bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                      errors.projectId ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300'
                    }`}
                    required
                  >
                    <option value="">-- Select Project Site --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.projectCode} — {p.projectName} ({p.client || 'Oman'})
                      </option>
                    ))}
                  </select>
                  {errors.projectId && <p className="text-xs text-rose-600 mt-1">{errors.projectId}</p>}
                </div>

                {/* Location Code & Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Location / Gate Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.locationCode || ''}
                      onChange={e => setFormData({ ...formData, locationCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. GATE-01, NORTH-CP"
                      className={`w-full text-sm border rounded-lg px-3 py-2 font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                        errors.locationCode ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                      }`}
                    />
                    {errors.locationCode && <p className="text-xs text-rose-600 mt-1">{errors.locationCode}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Short identifier for mobile check-in</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Zone Classification
                    </label>
                    <select
                      value={formData.locationType || 'Main Gate'}
                      onChange={e => setFormData({ ...formData, locationType: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="Main Gate">Main Gate (Primary Ingress/Egress)</option>
                      <option value="Work Zone">Work Zone (Fabrication, Concrete Plant, Trench)</option>
                      <option value="Office">Site Project Office / Engineering Trailer</option>
                      <option value="Camp">Labor Accommodation Camp</option>
                      <option value="Checkpoint">Security Checkpoint / Turnstile</option>
                    </select>
                  </div>
                </div>

                {/* Location Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Location Name & Description <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.locationName || ''}
                    onChange={e => setFormData({ ...formData, locationName: e.target.value })}
                    placeholder="e.g. Terminal Expansion - West Security Turnstiles"
                    className={`w-full text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                      errors.locationName ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                    }`}
                  />
                  {errors.locationName && <p className="text-xs text-rose-600 mt-1">{errors.locationName}</p>}
                </div>

                {/* GPS Coordinates & Interactive Auto-Capture */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5 text-indigo-600" /> GPS Geofence Centroid
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Latitude and Longitude in standard WGS-84 decimal degrees
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCaptureCurrentLocation}
                      disabled={geoLocating}
                      className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1.5 transition shrink-0"
                    >
                      <Compass className={`w-3.5 h-3.5 ${geoLocating ? 'animate-spin text-indigo-600' : ''}`} />
                      {geoLocating ? 'Detecting GPS...' : 'Use Current Device GPS'}
                    </button>
                  </div>

                  {geoSuccessMsg && (
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {geoSuccessMsg}
                    </div>
                  )}

                  {errors.locationCapture && (
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      {errors.locationCapture}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Latitude (-90 to +90) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={formData.latitude ?? ''}
                        onChange={e => setFormData({ ...formData, latitude: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                        placeholder="e.g. 23.593300"
                        className={`w-full text-sm border rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                          errors.latitude ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                        }`}
                      />
                      {errors.latitude && <p className="text-xs text-rose-600 mt-0.5">{errors.latitude}</p>}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Longitude (-180 to +180) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={formData.longitude ?? ''}
                        onChange={e => setFormData({ ...formData, longitude: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                        placeholder="e.g. 58.284400"
                        className={`w-full text-sm border rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                          errors.longitude ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                        }`}
                      />
                      {errors.longitude && <p className="text-xs text-rose-600 mt-0.5">{errors.longitude}</p>}
                    </div>
                  </div>

                  {/* Fast Oman Site Coordinates Preset Quick-Pills */}
                  <div className="pt-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                      Fast Regional Presets (Oman Projects):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {omanCoordinatePresets.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setFormData((prev: any) => ({
                              ...prev,
                              latitude: preset.lat,
                              longitude: preset.lng
                            }));
                            setGeoSuccessMsg(`Set to ${preset.label} (${preset.lat}, ${preset.lng})`);
                          }}
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium rounded shadow-xs transition"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Geofence Radius & Live Map Indicator */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Geofence Radius (Meters) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="25"
                        max="5000"
                        step="25"
                        value={formData.radiusMeters || 300}
                        onChange={e => setFormData({ ...formData, radiusMeters: parseInt(e.target.value, 10) || 0 })}
                        className={`w-full text-sm border rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                          errors.radiusMeters ? 'border-rose-400 bg-rose-50/50' : 'border-slate-300 bg-white'
                        }`}
                      />
                      <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">meters</span>
                    </div>
                    {errors.radiusMeters && <p className="text-xs text-rose-600 mt-1">{errors.radiusMeters}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">Recommended: 250m - 500m for perimeter fencing</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Effective Date
                    </label>
                    <input
                      type="date"
                      value={formData.effectiveFrom || ''}
                      onChange={e => setFormData({ ...formData, effectiveFrom: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Date when this checkpoint becomes active</p>
                  </div>
                </div>

                {/* Primary Gate & Active Checkboxes */}
                <div className="space-y-2 pt-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="isPrimaryGeofenceCheck"
                      checked={!!formData.isPrimary}
                      onChange={e => setFormData({ ...formData, isPrimary: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <label htmlFor="isPrimaryGeofenceCheck" className="text-xs font-bold text-slate-800 cursor-pointer">
                      Designate as Primary Project Gate
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500 ml-6.5">
                    When checked, the mobile app defaults to this checkpoint for site attendance validation and distance calculations.
                  </p>

                  <div className="flex items-center gap-2.5 pt-2 border-t border-slate-200">
                    <input
                      type="checkbox"
                      id="isActiveGeofenceCheck"
                      checked={formData.isActive !== false}
                      onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <label htmlFor="isActiveGeofenceCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Location Zone is Currently Active
                    </label>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 hidden sm:flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>HCMS Central Authority Enforcement</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="masterDataEntryForm"
              disabled={isSaving}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-75"
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving Record...
                </>
              ) : (
                <>
                  <span>Save Record</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
