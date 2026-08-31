import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CreditCard,
  Car,
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Building,
  User,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  History,
  FileCheck,
  Trash2,
  Save,
  Phone,
  MapPin,
  GraduationCap,
  Wrench,
  AlertOctagon,
  ChevronRight,
  Download,
} from 'lucide-react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ComplianceBadge } from '../compliance/ComplianceBadge';
import type {
  Employee,
  EmployeeCivilId,
  EmployeeDrivingLicence,
  EmployeeVisa,
  EmployeeGovernmentDocument,
  EmployeePersonalDetails,
  DrivingLicenceCategory,
} from '../../types/index';

interface EmployeeIdentificationModalProps {
  employee: Employee;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  initialTab?: 'civil-id' | 'driving-licence' | 'visa' | 'govt-docs' | 'personal';
}

export const EmployeeIdentificationModal: React.FC<EmployeeIdentificationModalProps> = ({
  employee,
  isOpen,
  onClose,
  onUpdated,
  initialTab = 'civil-id',
}) => {
  const { canWrite, isAdmin, isManager, hasPermission } = useAuth();
  const canViewSensitive = isAdmin || isManager || hasPermission('compliance.view');

  const [activeTab, setActiveTab] = useState<'civil-id' | 'driving-licence' | 'visa' | 'govt-docs' | 'personal'>(
    initialTab
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Compliance Data State
  const [complianceData, setComplianceData] = useState<any>(null);
  const [showSensitiveCid, setShowSensitiveCid] = useState(false);
  const [showSensitiveDl, setShowSensitiveDl] = useState(false);
  const [showSensitiveVisa, setShowSensitiveVisa] = useState(false);

  // Available Categories
  const [licenceCategories, setLicenceCategories] = useState<string[]>([
    'Light Vehicle',
    'Heavy Vehicle',
    'Motorcycle',
    'Bus',
    'Truck',
    'Heavy Equipment',
    'Other',
  ]);

  // Renewal Modal States
  const [isRenewCidOpen, setIsRenewCidOpen] = useState(false);
  const [isRenewDlOpen, setIsRenewDlOpen] = useState(false);
  const [isRenewVisaOpen, setIsRenewVisaOpen] = useState(false);
  const [isAddGovtDocOpen, setIsAddGovtDocOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

  // Form States for Direct Edits / Initial Setup
  const [cidForm, setCidForm] = useState({
    civilIdNumber: '',
    issueDate: '',
    expiryDate: '',
    issuingAuthority: 'Royal Oman Police (ROP)',
    country: 'Oman',
    documentAttachment: '',
    remarks: '',
    replaceReason: 'Renewal / Reissue',
  });

  const [dlForm, setDlForm] = useState({
    licenceNumber: '',
    category: 'Light Vehicle' as DrivingLicenceCategory,
    issuingCountry: 'Oman',
    issuingAuthority: 'ROP Directorate General of Traffic',
    vehicleClass: 'Private / Light Commercial',
    restrictions: '',
    bloodGroupOnLicence: '',
    issueDate: '',
    expiryDate: '',
    documentAttachment: '',
    remarks: '',
    reason: 'Periodic Renewal',
  });

  const [visaForm, setVisaForm] = useState({
    visaNumber: '',
    tradeOnVisa: employee.designation || '',
    visaProfessionCode: '',
    visaType: 'Employment Visa',
    issueDate: '',
    expiryDate: '',
    sponsor: employee.employeeCompany || 'DGO',
    sponsorshipType: 'Corporate',
    issuingAuthority: 'Royal Oman Police - Passports & Residence',
    country: 'Oman',
    documentAttachment: '',
    remarks: '',
    effectiveFrom: '',
    reasonForChange: 'Visa Renewal / Profession Alignment',
  });

  const [newGovtDoc, setNewGovtDoc] = useState({
    documentType: 'Passport' as any,
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    issuingAuthority: '',
    country: employee.nationalityType === 'Omani' ? 'Oman' : '',
    documentAttachment: '',
    remarks: '',
  });

  const [personalForm, setPersonalForm] = useState<EmployeePersonalDetails>({
    employeeId: employee.employeeId,
    dateOfBirth: '',
    gender: 'Male',
    maritalStatus: 'Single',
    bloodGroup: '',
    personalEmail: '',
    mobileNumber: '',
    whatsappNumber: '',
    residentialAddress: '',
    permanentAddress: '',
    emergencyContacts: [
      { name: '', relationship: 'Family', contactNumber: '', address: '', isPrimary: true },
    ],
    qualifications: [],
    skills: [],
    notes: '',
  });

  const [newCategoryName, setNewCategoryName] = useState('');

  const fetchCompliance = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest(`/api/employees/${encodeURIComponent(employee.employeeId)}/compliance`);
      setComplianceData(data);

      if (data.currentCivilId) {
        setCidForm({
          civilIdNumber: data.currentCivilId.civilIdNumber || '',
          issueDate: data.currentCivilId.issueDate || '',
          expiryDate: data.currentCivilId.expiryDate || '',
          issuingAuthority: data.currentCivilId.issuingAuthority || 'Royal Oman Police (ROP)',
          country: data.currentCivilId.country || 'Oman',
          documentAttachment: data.currentCivilId.documentAttachment || '',
          remarks: data.currentCivilId.remarks || '',
          replaceReason: 'Renewal / Reissue',
        });
      }

      if (data.currentDrivingLicence) {
        setDlForm({
          licenceNumber: data.currentDrivingLicence.licenceNumber || '',
          category: data.currentDrivingLicence.category || 'Light Vehicle',
          issuingCountry: data.currentDrivingLicence.issuingCountry || 'Oman',
          issuingAuthority: data.currentDrivingLicence.issuingAuthority || 'ROP Directorate General of Traffic',
          vehicleClass: data.currentDrivingLicence.vehicleClass || '',
          restrictions: data.currentDrivingLicence.restrictions || '',
          bloodGroupOnLicence: data.currentDrivingLicence.bloodGroupOnLicence || '',
          issueDate: data.currentDrivingLicence.issueDate || '',
          expiryDate: data.currentDrivingLicence.expiryDate || '',
          documentAttachment: data.currentDrivingLicence.documentAttachment || '',
          remarks: data.currentDrivingLicence.remarks || '',
          reason: 'Periodic Renewal',
        });
      }

      if (data.currentVisa) {
        setVisaForm({
          visaNumber: data.currentVisa.visaNumber || '',
          tradeOnVisa: data.currentVisa.tradeOnVisa || employee.designation,
          visaProfessionCode: data.currentVisa.visaProfessionCode || '',
          visaType: data.currentVisa.visaType || 'Employment Visa',
          issueDate: data.currentVisa.issueDate || '',
          expiryDate: data.currentVisa.expiryDate || '',
          sponsor: data.currentVisa.sponsor || employee.employeeCompany,
          sponsorshipType: data.currentVisa.sponsorshipType || 'Corporate',
          issuingAuthority: data.currentVisa.issuingAuthority || 'Royal Oman Police - Passports & Residence',
          country: data.currentVisa.country || 'Oman',
          documentAttachment: data.currentVisa.documentAttachment || '',
          remarks: data.currentVisa.remarks || '',
          effectiveFrom: data.currentVisa.effectiveFrom || '',
          reasonForChange: 'Visa Renewal / Profession Alignment',
        });
      }

      if (data.personalDetails) {
        setPersonalForm({
          ...data.personalDetails,
          emergencyContacts:
            data.personalDetails.emergencyContacts && data.personalDetails.emergencyContacts.length > 0
              ? data.personalDetails.emergencyContacts
              : [{ name: '', relationship: 'Family', contactNumber: '', address: '', isPrimary: true }],
        });
      }

      // Fetch Driving Licence Categories
      try {
        const catRes = await apiRequest('/api/compliance/driving-licence-categories');
        if (catRes && Array.isArray(catRes.categories)) {
          setLicenceCategories(catRes.categories);
        }
      } catch {
        // use fallback categories
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load employee compliance details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCompliance();
    }
  }, [isOpen, employee.employeeId]);

  if (!isOpen) return null;

  // Masking helper
  const maskValue = (val: string, show: boolean) => {
    if (!val) return '—';
    if (show && canViewSensitive) return val;
    if (val.length <= 4) return '****';
    return `${val.slice(0, 2)}${'*'.repeat(Math.max(4, val.length - 4))}${val.slice(-2)}`;
  };

  // Handlers for Civil ID
  const handleSaveCivilId = async (isRenew = false) => {
    try {
      setSaving(true);
      setError(null);
      const endpoint = isRenew
        ? `/api/employees/${encodeURIComponent(employee.employeeId)}/civil-id/renew`
        : `/api/employees/${encodeURIComponent(employee.employeeId)}/civil-id`;

      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(cidForm),
      });

      setSuccessMessage(isRenew ? 'Civil ID renewed successfully with full historical audit.' : 'Civil ID saved successfully.');
      setIsRenewCidOpen(false);
      await fetchCompliance();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save Civil ID.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Handlers for Driving Licence
  const handleSaveDrivingLicence = async (isRenew = false) => {
    try {
      setSaving(true);
      setError(null);
      const endpoint = isRenew
        ? `/api/employees/${encodeURIComponent(employee.employeeId)}/driving-licence/renew`
        : `/api/employees/${encodeURIComponent(employee.employeeId)}/driving-licence`;

      const payload = isRenew
        ? { ...dlForm, oldLicenceId: complianceData?.currentDrivingLicence?.id }
        : dlForm;

      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccessMessage(isRenew ? 'Driving licence renewed and previous record archived.' : 'Driving licence saved successfully.');
      setIsRenewDlOpen(false);
      await fetchCompliance();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save driving licence.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Handlers for Visa
  const handleSaveVisa = async (isRenew = false) => {
    try {
      setSaving(true);
      setError(null);
      const endpoint = isRenew
        ? `/api/employees/${encodeURIComponent(employee.employeeId)}/visa/renew`
        : `/api/employees/${encodeURIComponent(employee.employeeId)}/visa`;

      await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(visaForm),
      });

      setSuccessMessage(isRenew ? 'Visa & trade details renewed/amended with history preserved.' : 'Visa record saved successfully.');
      setIsRenewVisaOpen(false);
      await fetchCompliance();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save visa record.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Handlers for Government Documents
  const handleAddGovtDoc = async () => {
    try {
      setSaving(true);
      setError(null);
      await apiRequest(`/api/employees/${encodeURIComponent(employee.employeeId)}/government-documents`, {
        method: 'POST',
        body: JSON.stringify(newGovtDoc),
      });

      setSuccessMessage(`Added ${newGovtDoc.documentType} document successfully.`);
      setIsAddGovtDocOpen(false);
      setNewGovtDoc({
        documentType: 'Passport',
        documentNumber: '',
        issueDate: '',
        expiryDate: '',
        issuingAuthority: '',
        country: employee.nationalityType === 'Omani' ? 'Oman' : '',
        documentAttachment: '',
        remarks: '',
      });
      await fetchCompliance();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save document.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const handleDeleteGovtDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document record?')) return;
    try {
      setSaving(true);
      setError(null);
      await apiRequest(
        `/api/employees/${encodeURIComponent(employee.employeeId)}/government-documents/${encodeURIComponent(docId)}`,
        { method: 'DELETE' }
      );
      setSuccessMessage('Document removed.');
      await fetchCompliance();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete document.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Handlers for Personal Details
  const handleSavePersonal = async () => {
    try {
      setSaving(true);
      setError(null);
      await apiRequest(`/api/employees/${encodeURIComponent(employee.employeeId)}/personal-details`, {
        method: 'POST',
        body: JSON.stringify(personalForm),
      });
      setSuccessMessage('Personal and emergency contact details updated.');
      await fetchCompliance();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save personal details.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Add new Driving Licence Category
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await apiRequest('/api/compliance/driving-licence-categories', {
        method: 'POST',
        body: JSON.stringify({ category: newCategoryName.trim() }),
      });
      if (res && res.categories) {
        setLicenceCategories(res.categories);
        setDlForm({ ...dlForm, category: newCategoryName.trim() as any });
      }
      setNewCategoryName('');
      setIsAddCategoryOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to add licence category.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {employee.employeeName}
                </h2>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {employee.employeeId}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                    employee.nationalityType === 'Omani'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                  }`}
                >
                  {employee.nationalityType}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {employee.designation} • {employee.employeeCompany} (Paid by {employee.salaryPaidBy})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {complianceData?.overallCompliance && (
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                <span className="text-xs text-slate-400">Overall Compliance:</span>
                <ComplianceBadge
                  status={complianceData.overallCompliance.status}
                  showDays={false}
                  size="sm"
                />
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertOctagon size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Trade Discrepancy Alert Banner */}
        {complianceData?.tradeDiscrepancy?.hasWarning && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <div className="flex-1 text-xs">
              <span className="font-semibold text-amber-900">Trade Discrepancy Warning: </span>
              <span className="text-amber-800">{complianceData.tradeDiscrepancy.message}</span>
              <p className="text-[11px] text-amber-700 mt-0.5">
                Internal designation is <strong>{employee.designation}</strong>, whereas registered Trade on Visa is{' '}
                <strong>{complianceData.currentVisa?.tradeOnVisa}</strong>. Under Oman Labour Regulations, high discrepancy risk may attract inspection penalties.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-slate-200 bg-slate-50 gap-1 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('civil-id')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'civil-id'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <CreditCard size={15} />
            <span>Civil ID / Resident ID</span>
            {complianceData?.currentCivilId && (
              <ComplianceBadge status={complianceData.currentCivilId.status} size="sm" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('driving-licence')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'driving-licence'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Car size={15} />
            <span>Driving Licence</span>
            {complianceData?.currentDrivingLicence && (
              <ComplianceBadge status={complianceData.currentDrivingLicence.status} size="sm" />
            )}
          </button>

          {employee.nationalityType === 'Expat' && (
            <button
              onClick={() => setActiveTab('visa')}
              className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'visa'
                  ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
              }`}
            >
              <FileCheck size={15} />
              <span>Visa & Trade Details</span>
              {complianceData?.currentVisa && (
                <ComplianceBadge status={complianceData.currentVisa.status} size="sm" />
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('govt-docs')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'govt-docs'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <FileText size={15} />
            <span>Government Documents & Passports</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
              {complianceData?.governmentDocuments?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('personal')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'personal'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <User size={15} />
            <span>Personal & Emergency Contacts</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading employee verification & document records...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: CIVIL ID / RESIDENT ID */}
              {activeTab === 'civil-id' && (
                <div className="space-y-6">
                  {/* Current Active Civil ID Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <CreditCard className="text-blue-600" size={18} />
                        <h3 className="text-sm font-bold text-slate-800">
                          {employee.nationalityType === 'Omani'
                            ? 'Oman National Smart Civil ID Card'
                            : 'Oman Expat Resident Identity Card'}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {complianceData?.currentCivilId && (
                          <ComplianceBadge
                            status={complianceData.currentCivilId.status}
                            daysRemaining={complianceData.currentCivilId.daysRemaining}
                            showDays
                          />
                        )}
                        {canWrite && (
                          <button
                            onClick={() => setIsRenewCidOpen(true)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                          >
                            <RefreshCw size={13} />
                            <span>Renew Civil ID</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {complianceData?.currentCivilId ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Civil ID / Resident Number
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-bold text-slate-900">
                              {maskValue(complianceData.currentCivilId.civilIdNumber, showSensitiveCid)}
                            </span>
                            {canViewSensitive && (
                              <button
                                onClick={() => setShowSensitiveCid(!showSensitiveCid)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                                title={showSensitiveCid ? 'Mask sensitive ID' : 'Reveal unmasked ID (RBAC Authorized)'}
                              >
                                {showSensitiveCid ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Issuance Date
                          </span>
                          <span className="text-sm font-semibold text-slate-800">
                            {formatDate(complianceData.currentCivilId.issueDate) || '—'}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Expiry Date
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {formatDate(complianceData.currentCivilId.expiryDate)}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Issuing Authority
                          </span>
                          <span className="text-xs font-medium text-slate-800">
                            {complianceData.currentCivilId.issuingAuthority || 'Royal Oman Police (ROP)'}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Issuing Country
                          </span>
                          <span className="text-xs font-medium text-slate-800">
                            {complianceData.currentCivilId.country || 'Oman'}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Attached Document
                          </span>
                          {complianceData.currentCivilId.documentAttachment ? (
                            <div className="flex items-center gap-2 text-xs text-blue-600 font-medium truncate">
                              <FileCheck size={14} className="shrink-0" />
                              <span className="truncate">
                                {complianceData.currentCivilId.fileName || complianceData.currentCivilId.documentAttachment}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No attachment uploaded</span>
                          )}
                        </div>

                        {complianceData.currentCivilId.remarks && (
                          <div className="col-span-full p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                              Remarks / Smart Card Notes
                            </span>
                            <p className="text-xs text-slate-700">{complianceData.currentCivilId.remarks}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-500 space-y-3">
                        <AlertTriangle size={28} className="mx-auto text-amber-500" />
                        <p className="text-xs">No active Civil ID / Resident ID recorded for this employee.</p>
                        {canWrite && (
                          <button
                            onClick={() => setIsRenewCidOpen(true)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus size={14} />
                            <span>Create Civil ID Record</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Civil ID Historical Timeline */}
                  {complianceData?.civilIdHistory && complianceData.civilIdHistory.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                        <History className="text-slate-500" size={16} />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Civil ID Audit History & Prior Renewals ({complianceData.civilIdHistory.length})
                        </h4>
                      </div>

                      <div className="space-y-3">
                        {complianceData.civilIdHistory.map((hist: EmployeeCivilId) => (
                          <div
                            key={hist.id}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                              hist.isCurrent
                                ? 'bg-blue-50/50 border-blue-200'
                                : 'bg-slate-50 border-slate-200 opacity-80'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-800">
                                  {maskValue(hist.civilIdNumber, showSensitiveCid)}
                                </span>
                                {hist.isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-600 text-white font-semibold">
                                    Current Active
                                  </span>
                                )}
                                <ComplianceBadge status={hist.status} size="sm" />
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                <span>Issued: {formatDate(hist.issueDate)}</span>
                                <span>Expires: {formatDate(hist.expiryDate)}</span>
                                {hist.replaceReason && <span>Reason: {hist.replaceReason}</span>}
                              </div>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Updated: {formatDate(hist.updatedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: DRIVING LICENCE */}
              {activeTab === 'driving-licence' && (
                <div className="space-y-6">
                  {/* Current Active Driving Licence */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <Car className="text-blue-600" size={18} />
                        <h3 className="text-sm font-bold text-slate-800">
                          Royal Oman Police (ROP) Driving Licence & Plant Operation
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {complianceData?.currentDrivingLicence && (
                          <ComplianceBadge
                            status={complianceData.currentDrivingLicence.status}
                            daysRemaining={complianceData.currentDrivingLicence.daysRemaining}
                            showDays
                          />
                        )}
                        {canWrite && (
                          <button
                            onClick={() => setIsRenewDlOpen(true)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                          >
                            <RefreshCw size={13} />
                            <span>Renew / Add Licence</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {complianceData?.currentDrivingLicence ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Licence Number
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-bold text-slate-900">
                              {maskValue(complianceData.currentDrivingLicence.licenceNumber, showSensitiveDl)}
                            </span>
                            {canViewSensitive && (
                              <button
                                onClick={() => setShowSensitiveDl(!showSensitiveDl)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                              >
                                {showSensitiveDl ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Licence Category
                          </span>
                          <span className="text-sm font-bold text-blue-700">
                            {complianceData.currentDrivingLicence.category}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Expiry Date
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {formatDate(complianceData.currentDrivingLicence.expiryDate)}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Issuing Authority & Country
                          </span>
                          <span className="text-xs font-medium text-slate-800">
                            {complianceData.currentDrivingLicence.issuingAuthority || 'ROP Directorate of Traffic'} (
                            {complianceData.currentDrivingLicence.issuingCountry || 'Oman'})
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Vehicle Class / Machinery Class
                          </span>
                          <span className="text-xs font-semibold text-slate-800">
                            {complianceData.currentDrivingLicence.vehicleClass || 'Light Vehicle'}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Restrictions / Blood Group
                          </span>
                          <span className="text-xs text-slate-800">
                            {complianceData.currentDrivingLicence.restrictions || 'None'}
                            {complianceData.currentDrivingLicence.bloodGroupOnLicence &&
                              ` • Blood: ${complianceData.currentDrivingLicence.bloodGroupOnLicence}`}
                          </span>
                        </div>

                        {complianceData.currentDrivingLicence.remarks && (
                          <div className="col-span-full p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                              Remarks / Operator Certifications
                            </span>
                            <p className="text-xs text-slate-700">{complianceData.currentDrivingLicence.remarks}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-500 space-y-3">
                        <Car size={28} className="mx-auto text-slate-400" />
                        <p className="text-xs">No driving licence currently registered for this employee.</p>
                        {canWrite && (
                          <button
                            onClick={() => setIsRenewDlOpen(true)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus size={14} />
                            <span>Add Driving Licence</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Licence History */}
                  {complianceData?.drivingLicenceHistory && complianceData.drivingLicenceHistory.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                        <History className="text-slate-500" size={16} />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Historical Licence Records & Category Upgrades ({complianceData.drivingLicenceHistory.length})
                        </h4>
                      </div>

                      <div className="space-y-3">
                        {complianceData.drivingLicenceHistory.map((hist: EmployeeDrivingLicence) => (
                          <div
                            key={hist.id}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                              hist.isCurrent
                                ? 'bg-blue-50/50 border-blue-200'
                                : 'bg-slate-50 border-slate-200 opacity-80'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">{hist.category}</span>
                                <span className="font-mono text-slate-600">
                                  {maskValue(hist.licenceNumber, showSensitiveDl)}
                                </span>
                                {hist.isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-600 text-white font-semibold">
                                    Active
                                  </span>
                                )}
                                <ComplianceBadge status={hist.status} size="sm" />
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                <span>Expires: {formatDate(hist.expiryDate)}</span>
                                <span>Authority: {hist.issuingAuthority}</span>
                              </div>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              Updated: {formatDate(hist.updatedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VISA & TRADE DETAILS */}
              {activeTab === 'visa' && (
                <div className="space-y-6">
                  {/* Current Active Visa */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <FileCheck className="text-blue-600" size={18} />
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">
                            Oman Employment Visa & Trade on Visa
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Ministry of Labour & Royal Oman Police Residence details
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {complianceData?.currentVisa && (
                          <ComplianceBadge
                            status={complianceData.currentVisa.status}
                            daysRemaining={complianceData.currentVisa.daysRemaining}
                            showDays
                          />
                        )}
                        {canWrite && (
                          <button
                            onClick={() => setIsRenewVisaOpen(true)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                          >
                            <RefreshCw size={13} />
                            <span>Renew Visa / Amend Trade</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {complianceData?.currentVisa ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200">
                          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block mb-1">
                            Trade on Visa (Registered Profession)
                          </span>
                          <span className="text-base font-bold text-blue-950 block">
                            {complianceData.currentVisa.tradeOnVisa}
                          </span>
                          {complianceData.currentVisa.visaProfessionCode && (
                            <span className="text-[10px] text-blue-700 font-mono">
                              Code: {complianceData.currentVisa.visaProfessionCode}
                            </span>
                          )}
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Active Job Designation
                          </span>
                          <span className="text-sm font-bold text-slate-800 block">
                            {employee.designation}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Internal Company Role
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Visa Expiry Date
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {formatDate(complianceData.currentVisa.expiryDate)}
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Visa Number
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-mono font-bold text-slate-900">
                              {maskValue(complianceData.currentVisa.visaNumber, showSensitiveVisa)}
                            </span>
                            {canViewSensitive && (
                              <button
                                onClick={() => setShowSensitiveVisa(!showSensitiveVisa)}
                                className="text-slate-400 hover:text-slate-600 p-1"
                              >
                                {showSensitiveVisa ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Sponsoring Entity & Type
                          </span>
                          <span className="text-xs font-semibold text-slate-800">
                            {complianceData.currentVisa.sponsor || employee.employeeCompany} (
                            {complianceData.currentVisa.sponsorshipType || 'Corporate'})
                          </span>
                        </div>

                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                            Visa Type & Issuing Authority
                          </span>
                          <span className="text-xs text-slate-800">
                            {complianceData.currentVisa.visaType || 'Employment Visa'} •{' '}
                            {complianceData.currentVisa.issuingAuthority || 'ROP'}
                          </span>
                        </div>

                        {complianceData.currentVisa.remarks && (
                          <div className="col-span-full p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                              Visa Notes & Renewal History
                            </span>
                            <p className="text-xs text-slate-700">{complianceData.currentVisa.remarks}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-500 space-y-3">
                        <FileCheck size={28} className="mx-auto text-slate-400" />
                        <p className="text-xs">No visa details recorded for this expat employee.</p>
                        {canWrite && (
                          <button
                            onClick={() => setIsRenewVisaOpen(true)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus size={14} />
                            <span>Create Visa Record</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Visa Historical Trade Chain */}
                  {complianceData?.visaHistory && complianceData.visaHistory.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                        <History className="text-slate-500" size={16} />
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Historical Trade & Visa Chronology ({complianceData.visaHistory.length})
                        </h4>
                      </div>

                      <div className="space-y-3">
                        {complianceData.visaHistory.map((hist: EmployeeVisa) => (
                          <div
                            key={hist.id}
                            className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                              hist.isCurrent
                                ? 'bg-blue-50/50 border-blue-200'
                                : 'bg-slate-50 border-slate-200 opacity-80'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  Trade: {hist.tradeOnVisa}
                                </span>
                                {hist.isCurrent && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-600 text-white font-semibold">
                                    Current
                                  </span>
                                )}
                                <ComplianceBadge status={hist.status} size="sm" />
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                <span>Expires: {formatDate(hist.expiryDate)}</span>
                                <span>Sponsor: {hist.sponsor}</span>
                                {hist.reasonForChange && <span>Note: {hist.reasonForChange}</span>}
                              </div>
                            </div>
                            <span className="text-[11px] text-slate-400">
                              From: {formatDate(hist.effectiveFrom || hist.issueDate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: GOVERNMENT DOCUMENTS & PASSPORTS */}
              {activeTab === 'govt-docs' && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="text-blue-600" size={18} />
                        <h3 className="text-sm font-bold text-slate-800">
                          Passports, Ministry of Labour Work Permits & Legal Contracts
                        </h3>
                      </div>
                      {canWrite && (
                        <button
                          onClick={() => setIsAddGovtDocOpen(true)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Plus size={14} />
                          <span>Add Document Record</span>
                        </button>
                      )}
                    </div>

                    {complianceData?.governmentDocuments && complianceData.governmentDocuments.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {complianceData.governmentDocuments.map((doc: EmployeeGovernmentDocument) => (
                          <div
                            key={doc.id}
                            className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/60 transition-colors flex flex-col justify-between"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-200">
                                  {doc.documentType}
                                </span>
                                <ComplianceBadge status={doc.status} size="sm" />
                              </div>

                              <div className="space-y-1">
                                <div className="text-xs font-mono font-bold text-slate-900">
                                  {maskValue(doc.documentNumber, showSensitiveVisa)}
                                </div>
                                <div className="text-[11px] text-slate-600 flex items-center justify-between">
                                  <span>Authority: {doc.issuingAuthority || doc.country || 'Oman'}</span>
                                  <span>Expires: {formatDate(doc.expiryDate)}</span>
                                </div>
                                {doc.remarks && (
                                  <p className="text-[11px] text-slate-500 italic mt-1">{doc.remarks}</p>
                                )}
                              </div>
                            </div>

                            {canWrite && (
                              <div className="mt-3 pt-2 border-t border-slate-200 flex justify-end">
                                <button
                                  onClick={() => handleDeleteGovtDoc(doc.id)}
                                  className="text-rose-600 hover:text-rose-800 text-xs flex items-center gap-1 p-1"
                                >
                                  <Trash2 size={13} />
                                  <span>Remove</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-400 space-y-3">
                        <FileText size={32} className="mx-auto text-slate-300" />
                        <p className="text-xs">No supplemental passports or work permits recorded yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: PERSONAL & EMERGENCY CONTACTS */}
              {activeTab === 'personal' && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <User className="text-blue-600" size={18} />
                      <h3 className="text-sm font-bold text-slate-800">
                        Personal Information & Emergency Contact Directory
                      </h3>
                    </div>
                    {canWrite && (
                      <button
                        onClick={handleSavePersonal}
                        disabled={saving}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Save size={14} />
                        <span>{saving ? 'Saving...' : 'Save Personal Details'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Date of Birth</label>
                      <input
                        type="date"
                        disabled={!canWrite}
                        value={personalForm.dateOfBirth || ''}
                        onChange={(e) => setPersonalForm({ ...personalForm, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Gender</label>
                      <select
                        disabled={!canWrite}
                        value={personalForm.gender || 'Male'}
                        onChange={(e) => setPersonalForm({ ...personalForm, gender: e.target.value as any })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Blood Group</label>
                      <input
                        type="text"
                        disabled={!canWrite}
                        placeholder="e.g. O+, A+, B-"
                        value={personalForm.bloodGroup || ''}
                        onChange={(e) => setPersonalForm({ ...personalForm, bloodGroup: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Contact</label>
                      <input
                        type="text"
                        disabled={!canWrite}
                        placeholder="+968 9123 4567"
                        value={personalForm.mobileNumber || ''}
                        onChange={(e) => setPersonalForm({ ...personalForm, mobileNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">WhatsApp Contact</label>
                      <input
                        type="text"
                        disabled={!canWrite}
                        placeholder="+968 9123 4567"
                        value={personalForm.whatsappNumber || ''}
                        onChange={(e) => setPersonalForm({ ...personalForm, whatsappNumber: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Personal Email</label>
                      <input
                        type="email"
                        disabled={!canWrite}
                        placeholder="name@email.com"
                        value={personalForm.personalEmail || ''}
                        onChange={(e) => setPersonalForm({ ...personalForm, personalEmail: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                    </div>

                    <div className="col-span-full">
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Residential Address in Oman (Camp / Villa / Building)
                      </label>
                      <input
                        type="text"
                        disabled={!canWrite}
                        placeholder="e.g. Al Khuwair, Way 2819, Building 14, Muscat"
                        value={personalForm.residentialAddress || ''}
                        onChange={(e) => setPersonalForm({ ...personalForm, residentialAddress: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      />
                    </div>

                    {/* Primary Emergency Contact */}
                    <div className="col-span-full pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Phone size={14} className="text-rose-600" />
                        <span>Primary Emergency Contact</span>
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-slate-600 block mb-1">Contact Name</label>
                          <input
                            type="text"
                            disabled={!canWrite}
                            placeholder="Full Name"
                            value={personalForm.emergencyContacts?.[0]?.name || ''}
                            onChange={(e) => {
                              const contacts = [...(personalForm.emergencyContacts || [{ name: '', relationship: '', contactNumber: '', address: '', isPrimary: true }])];
                              contacts[0] = { ...contacts[0], name: e.target.value };
                              setPersonalForm({ ...personalForm, emergencyContacts: contacts });
                            }}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-medium text-slate-600 block mb-1">Relationship</label>
                          <input
                            type="text"
                            disabled={!canWrite}
                            placeholder="e.g. Spouse, Brother, Father"
                            value={personalForm.emergencyContacts?.[0]?.relationship || ''}
                            onChange={(e) => {
                              const contacts = [...(personalForm.emergencyContacts || [{ name: '', relationship: '', contactNumber: '', address: '', isPrimary: true }])];
                              contacts[0] = { ...contacts[0], relationship: e.target.value };
                              setPersonalForm({ ...personalForm, emergencyContacts: contacts });
                            }}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-medium text-slate-600 block mb-1">Emergency Phone Number</label>
                          <input
                            type="text"
                            disabled={!canWrite}
                            placeholder="+968 ... or International"
                            value={personalForm.emergencyContacts?.[0]?.contactNumber || ''}
                            onChange={(e) => {
                              const contacts = [...(personalForm.emergencyContacts || [{ name: '', relationship: '', contactNumber: '', address: '', isPrimary: true }])];
                              contacts[0] = { ...contacts[0], contactNumber: e.target.value };
                              setPersonalForm({ ...personalForm, emergencyContacts: contacts });
                            }}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Governed under Oman Labour Law (Royal Decree 53/2023) & Royal Oman Police Regulations.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* RENEW CIVIL ID MODAL */}
      {isRenewCidOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {complianceData?.currentCivilId ? 'Renew Civil ID Card' : 'Create Civil ID Record'}
              </h3>
              <button onClick={() => setIsRenewCidOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Civil ID / Resident ID Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10293847"
                  value={cidForm.civilIdNumber}
                  onChange={(e) => setCidForm({ ...cidForm, civilIdNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={cidForm.issueDate}
                    onChange={(e) => setCidForm({ ...cidForm, issueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={cidForm.expiryDate}
                    onChange={(e) => setCidForm({ ...cidForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Issuing Authority</label>
                  <input
                    type="text"
                    value={cidForm.issuingAuthority}
                    onChange={(e) => setCidForm({ ...cidForm, issuingAuthority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Country</label>
                  <input
                    type="text"
                    value={cidForm.country}
                    onChange={(e) => setCidForm({ ...cidForm, country: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reason for Renewal / Replace</label>
                <input
                  type="text"
                  placeholder="e.g. Periodic 5-Year Card Renewal"
                  value={cidForm.replaceReason}
                  onChange={(e) => setCidForm({ ...cidForm, replaceReason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Smart ID card remarks"
                  value={cidForm.remarks}
                  onChange={(e) => setCidForm({ ...cidForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsRenewCidOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveCivilId(Boolean(complianceData?.currentCivilId))}
                disabled={saving || !cidForm.civilIdNumber || !cidForm.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Save size={14} />
                <span>{saving ? 'Processing...' : 'Confirm & Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEW / ADD DRIVING LICENCE MODAL */}
      {isRenewDlOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {complianceData?.currentDrivingLicence ? 'Renew Driving Licence' : 'Add Driving Licence'}
              </h3>
              <button onClick={() => setIsRenewDlOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Licence Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DL-OM-89214"
                  value={dlForm.licenceNumber}
                  onChange={(e) => setDlForm({ ...dlForm, licenceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Category *</label>
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryOpen(true)}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      + Add Category
                    </button>
                  </div>
                  <select
                    value={dlForm.category}
                    onChange={(e) => setDlForm({ ...dlForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    {licenceCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={dlForm.expiryDate}
                    onChange={(e) => setDlForm({ ...dlForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Vehicle / Equipment Class</label>
                  <input
                    type="text"
                    placeholder="e.g. Light Vehicle / Excavator"
                    value={dlForm.vehicleClass}
                    onChange={(e) => setDlForm({ ...dlForm, vehicleClass: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Restrictions / Blood Group</label>
                  <input
                    type="text"
                    placeholder="e.g. Corrective Lenses, O+"
                    value={dlForm.restrictions}
                    onChange={(e) => setDlForm({ ...dlForm, restrictions: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Licence remarks / endorsements"
                  value={dlForm.remarks}
                  onChange={(e) => setDlForm({ ...dlForm, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsRenewDlOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveDrivingLicence(Boolean(complianceData?.currentDrivingLicence))}
                disabled={saving || !dlForm.licenceNumber || !dlForm.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Save size={14} />
                <span>{saving ? 'Processing...' : 'Save Licence'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEW VISA / AMEND TRADE MODAL */}
      {isRenewVisaOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {complianceData?.currentVisa ? 'Renew Visa / Amend Trade on Visa' : 'Create Employment Visa Record'}
              </h3>
              <button onClick={() => setIsRenewVisaOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Trade on Visa (Registered Profession with Ministry of Labour) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mason, Carpenter, Electrician, General Helper"
                  value={visaForm.tradeOnVisa}
                  onChange={(e) => setVisaForm({ ...visaForm, tradeOnVisa: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Visa Number</label>
                  <input
                    type="text"
                    placeholder="e.g. V-882910"
                    value={visaForm.visaNumber}
                    onChange={(e) => setVisaForm({ ...visaForm, visaNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Visa Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={visaForm.expiryDate}
                    onChange={(e) => setVisaForm({ ...visaForm, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Sponsoring Entity</label>
                  <input
                    type="text"
                    value={visaForm.sponsor}
                    onChange={(e) => setVisaForm({ ...visaForm, sponsor: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Sponsorship Type</label>
                  <select
                    value={visaForm.sponsorshipType}
                    onChange={(e) => setVisaForm({ ...visaForm, sponsorshipType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Corporate">Corporate / SMI Sponsorship</option>
                    <option value="Direct">Direct Company</option>
                    <option value="Subcontractor">Subcontractor</option>
                    <option value="Azad">Azad / Freelance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reason for Change / Amendment</label>
                <input
                  type="text"
                  placeholder="e.g. Trade amended from General Helper to Electrician"
                  value={visaForm.reasonForChange}
                  onChange={(e) => setVisaForm({ ...visaForm, reasonForChange: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsRenewVisaOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveVisa(Boolean(complianceData?.currentVisa))}
                disabled={saving || !visaForm.tradeOnVisa || !visaForm.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Save size={14} />
                <span>{saving ? 'Processing...' : 'Save Visa & Trade'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD GOVERNMENT DOCUMENT MODAL */}
      {isAddGovtDocOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Government Document / Passport</h3>
              <button onClick={() => setIsAddGovtDocOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Document Type *</label>
                  <select
                    value={newGovtDoc.documentType}
                    onChange={(e) => setNewGovtDoc({ ...newGovtDoc, documentType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  >
                    <option value="Passport">Passport</option>
                    <option value="Work Permit">Work Permit / Labour Card</option>
                    <option value="Residence Permit">Residence Permit</option>
                    <option value="Employment Contract">Employment Contract</option>
                    <option value="Medical Certificate">Medical Fitness Certificate</option>
                    <option value="Other">Other Government Doc</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Document Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="Document Number"
                    value={newGovtDoc.documentNumber}
                    onChange={(e) => setNewGovtDoc({ ...newGovtDoc, documentNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={newGovtDoc.issueDate}
                    onChange={(e) => setNewGovtDoc({ ...newGovtDoc, issueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={newGovtDoc.expiryDate}
                    onChange={(e) => setNewGovtDoc({ ...newGovtDoc, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Issuing Authority</label>
                  <input
                    type="text"
                    placeholder="e.g. ROP Passports Dept"
                    value={newGovtDoc.issuingAuthority}
                    onChange={(e) => setNewGovtDoc({ ...newGovtDoc, issuingAuthority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Country</label>
                  <input
                    type="text"
                    placeholder="Country of Issue"
                    value={newGovtDoc.country}
                    onChange={(e) => setNewGovtDoc({ ...newGovtDoc, country: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="Additional notes"
                  value={newGovtDoc.remarks}
                  onChange={(e) => setNewGovtDoc({ ...newGovtDoc, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsAddGovtDocOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGovtDoc}
                disabled={saving || !newGovtDoc.documentNumber || !newGovtDoc.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Save size={14} />
                <span>Save Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD CATEGORY MODAL */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <h4 className="text-xs font-bold">Add Driving Licence Category</h4>
              <button onClick={() => setIsAddCategoryOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">New Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Tower Crane Operator"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsAddCategoryOpen(false)}
                className="px-3 py-1 bg-slate-200 text-slate-700 rounded-md text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-semibold disabled:opacity-50"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
