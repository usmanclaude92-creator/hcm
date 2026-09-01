import React, { useState } from 'react';
import {
  User,
  Phone,
  MapPin,
  Save,
  Plus,
  Trash2,
  GraduationCap,
  Wrench,
  FileText,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  CreditCard,
  Globe,
  FileCheck,
  Car,
  UploadCloud,
  ShieldCheck,
  FileSpreadsheet,
  Info,
  Printer,
} from 'lucide-react';
import { FileUploadComponent, type FileUploadResult } from '../../common/FileUploadComponent';
import { EmployeeSummaryPrintModal } from '../EmployeeSummaryPrintModal';
import type { Employee, EmployeePersonalDetails, NationalityType } from '../../../types/index';

interface PersonalInformationTabProps {
  employee: Employee | null;
  personalForm: EmployeePersonalDetails;
  setPersonalForm: React.Dispatch<React.SetStateAction<EmployeePersonalDetails>>;
  canWrite: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  // For new employee registration flow
  isNewEmployee?: boolean;
  basicInfoForm?: {
    employeeId: string;
    employeeName: string;
    nationalityType: NationalityType;
  };
  setBasicInfoForm?: React.Dispatch<
    React.SetStateAction<{
      employeeId: string;
      employeeName: string;
      nationalityType: NationalityType;
    }>
  >;
  onContinueToEmployment?: () => void;
  complianceData?: any;
  onDocumentUploaded?: () => void;
}

export const PersonalInformationTab: React.FC<PersonalInformationTabProps> = ({
  employee,
  personalForm,
  setPersonalForm,
  canWrite,
  saving,
  onSave,
  isNewEmployee = false,
  basicInfoForm,
  setBasicInfoForm,
  onContinueToEmployment,
  complianceData,
  onDocumentUploaded,
}) => {
  const [newQual, setNewQual] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [showOptionalDl, setShowOptionalDl] = useState(
    Boolean(
      personalForm.drivingLicenceAttachment ||
        personalForm.drivingLicenceNumber ||
        complianceData?.currentDrivingLicence?.documentAttachment
    )
  );

  // Active employee ID and name
  const effectiveEmployeeId = employee?.employeeId || basicInfoForm?.employeeId || '';
  const effectiveEmployeeName = employee?.employeeName || basicInfoForm?.employeeName || '';
  const effectiveNationality: NationalityType =
    employee?.nationalityType || basicInfoForm?.nationalityType || 'Expat';

  // Calculate age from date of birth
  const calculateAge = (dobString?: string) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age > 0 ? age : null;
  };

  const age = calculateAge(personalForm.dateOfBirth);

  // Qualifications management
  const addQualification = () => {
    if (!newQual.trim()) return;
    const current = personalForm.qualifications || [];
    setPersonalForm({
      ...personalForm,
      qualifications: [...current, newQual.trim()],
    });
    setNewQual('');
  };

  const removeQualification = (index: number) => {
    const current = personalForm.qualifications || [];
    setPersonalForm({
      ...personalForm,
      qualifications: current.filter((_, i) => i !== index),
    });
  };

  // Skills management
  const addSkill = () => {
    if (!newSkill.trim()) return;
    const current = personalForm.skills || [];
    setPersonalForm({
      ...personalForm,
      skills: [...current, newSkill.trim()],
    });
    setNewSkill('');
  };

  const removeSkill = (index: number) => {
    const current = personalForm.skills || [];
    setPersonalForm({
      ...personalForm,
      skills: current.filter((_, i) => i !== index),
    });
  };

  // Helper for emergency contacts
  const emergencyContacts =
    personalForm.emergencyContacts && personalForm.emergencyContacts.length > 0
      ? personalForm.emergencyContacts
      : [
          {
            name: '',
            relationship: 'Family',
            contactNumber: '',
            address: '',
            isPrimary: true,
          },
        ];

  const updateEmergencyContact = (
    index: number,
    field: string,
    value: string | boolean
  ) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setPersonalForm({ ...personalForm, emergencyContacts: updated });
  };

  const addEmergencyContact = () => {
    setPersonalForm({
      ...personalForm,
      emergencyContacts: [
        ...emergencyContacts,
        {
          name: '',
          relationship: 'Friend',
          contactNumber: '',
          address: '',
          isPrimary: false,
        },
      ],
    });
  };

  const removeEmergencyContact = (index: number) => {
    if (emergencyContacts.length <= 1) return;
    setPersonalForm({
      ...personalForm,
      emergencyContacts: emergencyContacts.filter((_, i) => i !== index),
    });
  };

  // Attached files status checks
  const hasPassportFile = Boolean(
    personalForm.passportAttachment ||
      complianceData?.governmentDocuments?.find((d: any) => d.documentType === 'Passport')
        ?.documentAttachment
  );
  const hasCivilIdFile = Boolean(
    personalForm.civilIdAttachment ||
      complianceData?.currentCivilId?.documentAttachment
  );
  const hasVisaFile = Boolean(
    personalForm.visaAttachment ||
      complianceData?.currentVisa?.documentAttachment
  );
  const hasDlFile = Boolean(
    personalForm.drivingLicenceAttachment ||
      complianceData?.currentDrivingLicence?.documentAttachment
  );

  return (
    <div className="space-y-6">
      {/* SECTION 1: Core Personal Identity & Demographics */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <User className="text-blue-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Personal Identity &amp; Demographic Profile
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {employee && (
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="text-xs bg-white text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Print Personal Information Summary"
              >
                <Printer size={13} className="text-blue-600" />
                <span>Print Summary</span>
              </button>
            )}
            {employee ? (
              <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-semibold">
                ID: <strong className="font-mono text-blue-600">{employee.employeeId}</strong>
              </span>
            ) : (
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                <Sparkles size={12} /> New Employee Record
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* If creating new employee, show core ID and name fields */}
          {isNewEmployee && basicInfoForm && setBasicInfoForm && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Employee ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP001"
                  value={basicInfoForm.employeeId}
                  onChange={(e) =>
                    setBasicInfoForm({
                      ...basicInfoForm,
                      employeeId: e.target.value.toUpperCase().trim(),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase font-mono font-bold focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Legal Name (English) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ahmed Al-Harthy or Suresh Kumar"
                  value={basicInfoForm.employeeName}
                  onChange={(e) =>
                    setBasicInfoForm({
                      ...basicInfoForm,
                      employeeName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nationality Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={basicInfoForm.nationalityType}
                  onChange={(e) =>
                    setBasicInfoForm({
                      ...basicInfoForm,
                      nationalityType: e.target.value as NationalityType,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="Omani">Omani (Citizen)</option>
                  <option value="Expat">Expat (Foreign Resident)</option>
                </select>
              </div>
            </>
          )}

          {/* Date of Birth */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Date of Birth
              </label>
              {age !== null && (
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.2 rounded-md">
                  {age} yrs old
                </span>
              )}
            </div>
            <input
              type="date"
              disabled={!canWrite}
              value={personalForm.dateOfBirth || ''}
              onChange={(e) =>
                setPersonalForm({ ...personalForm, dateOfBirth: e.target.value })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Gender
            </label>
            <select
              disabled={!canWrite}
              value={personalForm.gender || 'Male'}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  gender: e.target.value as any,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Marital Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Marital Status
            </label>
            <select
              disabled={!canWrite}
              value={personalForm.maritalStatus || 'Single'}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  maritalStatus: e.target.value as any,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>

          {/* Blood Group */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Blood Group
            </label>
            <select
              disabled={!canWrite}
              value={personalForm.bloodGroup || ''}
              onChange={(e) =>
                setPersonalForm({ ...personalForm, bloodGroup: e.target.value })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono"
            >
              <option value="">— Select Blood Group —</option>
              <option value="A+">A+ (Positive)</option>
              <option value="A-">A- (Negative)</option>
              <option value="B+">B+ (Positive)</option>
              <option value="B-">B- (Negative)</option>
              <option value="AB+">AB+ (Positive)</option>
              <option value="AB-">AB- (Negative)</option>
              <option value="O+">O+ (Positive)</option>
              <option value="O-">O- (Negative)</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 2: Critical Statutory Document Scans (Passport, Visa, Civil ID) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={18} />
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Critical Statutory Documents &amp; Digital Scans
              </h3>
              <p className="text-[11px] text-slate-500">
                Upload scans of Passport, Visa, and Civil ID copies. Files are encrypted and stored in persistent storage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                hasCivilIdFile
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <CreditCard size={12} />
              Civil ID: {hasCivilIdFile ? 'Attached' : 'Pending'}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                hasPassportFile
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <Globe size={12} />
              Passport: {hasPassportFile ? 'Attached' : 'Pending'}
            </span>
            {effectiveNationality === 'Expat' && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  hasVisaFile
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                <FileCheck size={12} />
                Visa: {hasVisaFile ? 'Attached' : 'Pending'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* CARD 1: Civil ID / Resident ID Document */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <CreditCard size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Civil ID / Resident Card
                    </h4>
                    <p className="text-[10px] text-slate-500">Royal Oman Police (ROP)</p>
                  </div>
                </div>
                {hasCivilIdFile && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                    <CheckCircle2 size={11} /> Scan Attached
                  </span>
                )}
              </div>

              {/* Civil ID Metadata inputs */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Civil ID Number
                  </label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    placeholder="e.g. 12345678"
                    value={personalForm.civilIdNumber || complianceData?.currentCivilId?.civilIdNumber || ''}
                    onChange={(e) =>
                      setPersonalForm({ ...personalForm, civilIdNumber: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Civil ID Expiry Date
                  </label>
                  <input
                    type="date"
                    disabled={!canWrite}
                    value={personalForm.civilIdExpiryDate || complianceData?.currentCivilId?.expiryDate || ''}
                    onChange={(e) =>
                      setPersonalForm({ ...personalForm, civilIdExpiryDate: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Civil ID Upload Component */}
              <FileUploadComponent
                employeeId={effectiveEmployeeId}
                employeeName={effectiveEmployeeName}
                category="civil-id"
                documentType="Civil ID"
                title={`Civil ID - ${effectiveEmployeeName || effectiveEmployeeId}`}
                documentNumber={personalForm.civilIdNumber || complianceData?.currentCivilId?.civilIdNumber}
                expiryDate={personalForm.civilIdExpiryDate || complianceData?.currentCivilId?.expiryDate}
                value={personalForm.civilIdAttachment || complianceData?.currentCivilId?.documentAttachment || null}
                fileName={personalForm.civilIdFileName || complianceData?.currentCivilId?.fileName || null}
                storagePath={personalForm.civilIdStoragePath || complianceData?.currentCivilId?.storagePath || null}
                disabled={!canWrite}
                autoUpload={true}
                syncToModule={true}
                helperText="Upload official scan or photo of ROP Civil Card (PDF/JPG/PNG)"
                onChange={(res) => {
                  setPersonalForm((prev) => ({
                    ...prev,
                    civilIdAttachment: res ? res.fileUrl || res.fileData : null,
                    civilIdFileName: res ? res.fileName : null,
                    civilIdStoragePath: res ? res.storagePath : null,
                  }));
                }}
                onUploadSuccess={() => {
                  onDocumentUploaded?.();
                }}
                onRemove={() => {
                  setPersonalForm((prev) => ({
                    ...prev,
                    civilIdAttachment: null,
                    civilIdFileName: null,
                    civilIdStoragePath: null,
                  }));
                  onDocumentUploaded?.();
                }}
              />
            </div>
          </div>

          {/* CARD 2: Passport Copy Document */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Globe size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Passport (Bio-Data Copy)
                    </h4>
                    <p className="text-[10px] text-slate-500">Government Identity &amp; Travel</p>
                  </div>
                </div>
                {hasPassportFile && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                    <CheckCircle2 size={11} /> Scan Attached
                  </span>
                )}
              </div>

              {/* Passport Metadata inputs */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Passport Number
                  </label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    placeholder="e.g. Z1234567"
                    value={
                      personalForm.passportNumber ||
                      complianceData?.governmentDocuments?.find((d: any) => d.documentType === 'Passport')
                        ?.documentNumber ||
                      ''
                    }
                    onChange={(e) =>
                      setPersonalForm({ ...personalForm, passportNumber: e.target.value.toUpperCase() })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold uppercase border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Passport Expiry Date
                  </label>
                  <input
                    type="date"
                    disabled={!canWrite}
                    value={
                      personalForm.passportExpiryDate ||
                      complianceData?.governmentDocuments?.find((d: any) => d.documentType === 'Passport')
                        ?.expiryDate ||
                      ''
                    }
                    onChange={(e) =>
                      setPersonalForm({ ...personalForm, passportExpiryDate: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Passport Upload Component */}
              <FileUploadComponent
                employeeId={effectiveEmployeeId}
                employeeName={effectiveEmployeeName}
                category="passport"
                documentType="Passport"
                title={`Passport - ${effectiveEmployeeName || effectiveEmployeeId}`}
                documentNumber={personalForm.passportNumber}
                expiryDate={personalForm.passportExpiryDate}
                value={
                  personalForm.passportAttachment ||
                  complianceData?.governmentDocuments?.find((d: any) => d.documentType === 'Passport')
                    ?.documentAttachment ||
                  null
                }
                fileName={
                  personalForm.passportFileName ||
                  complianceData?.governmentDocuments?.find((d: any) => d.documentType === 'Passport')
                    ?.fileName ||
                  null
                }
                storagePath={
                  personalForm.passportStoragePath ||
                  complianceData?.governmentDocuments?.find((d: any) => d.documentType === 'Passport')
                    ?.storagePath ||
                  null
                }
                disabled={!canWrite}
                autoUpload={true}
                syncToModule={true}
                helperText="Upload official passport bio-data and photo page (PDF/JPG/PNG)"
                onChange={(res) => {
                  setPersonalForm((prev) => ({
                    ...prev,
                    passportAttachment: res ? res.fileUrl || res.fileData : null,
                    passportFileName: res ? res.fileName : null,
                    passportStoragePath: res ? res.storagePath : null,
                  }));
                }}
                onUploadSuccess={() => {
                  onDocumentUploaded?.();
                }}
                onRemove={() => {
                  setPersonalForm((prev) => ({
                    ...prev,
                    passportAttachment: null,
                    passportFileName: null,
                    passportStoragePath: null,
                  }));
                  onDocumentUploaded?.();
                }}
              />
            </div>
          </div>

          {/* CARD 3: Employment Visa / Resident Permit Copy */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <FileCheck size={15} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      Employment Visa / Permit
                    </h4>
                    <p className="text-[10px] text-slate-500">Ministry of Labour &amp; ROP Visa</p>
                  </div>
                </div>
                {effectiveNationality === 'Omani' ? (
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md">
                    N/A (Omani Citizen)
                  </span>
                ) : hasVisaFile ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                    <CheckCircle2 size={11} /> Scan Attached
                  </span>
                ) : null}
              </div>

              {effectiveNationality === 'Omani' ? (
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-center my-4">
                  <Info className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-semibold text-slate-700">Omani National</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Employment visa and residency permit are not required for Omani citizens.
                  </p>
                </div>
              ) : (
                <>
                  {/* Visa Metadata inputs */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                        Visa Number
                      </label>
                      <input
                        type="text"
                        disabled={!canWrite}
                        placeholder="e.g. 98765432"
                        value={personalForm.visaNumber || complianceData?.currentVisa?.visaNumber || ''}
                        onChange={(e) =>
                          setPersonalForm({ ...personalForm, visaNumber: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                        Visa Expiry Date
                      </label>
                      <input
                        type="date"
                        disabled={!canWrite}
                        value={personalForm.visaExpiryDate || complianceData?.currentVisa?.expiryDate || ''}
                        onChange={(e) =>
                          setPersonalForm({ ...personalForm, visaExpiryDate: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Visa Upload Component */}
                  <FileUploadComponent
                    employeeId={effectiveEmployeeId}
                    employeeName={effectiveEmployeeName}
                    category="visa"
                    documentType="Visa"
                    title={`Visa - ${effectiveEmployeeName || effectiveEmployeeId}`}
                    documentNumber={personalForm.visaNumber || complianceData?.currentVisa?.visaNumber}
                    expiryDate={personalForm.visaExpiryDate || complianceData?.currentVisa?.expiryDate}
                    value={personalForm.visaAttachment || complianceData?.currentVisa?.documentAttachment || null}
                    fileName={personalForm.visaFileName || complianceData?.currentVisa?.fileName || null}
                    storagePath={personalForm.visaStoragePath || complianceData?.currentVisa?.storagePath || null}
                    disabled={!canWrite}
                    autoUpload={true}
                    syncToModule={true}
                    helperText="Upload official resident visa sticker or e-Visa document (PDF/JPG/PNG)"
                    onChange={(res) => {
                      setPersonalForm((prev) => ({
                        ...prev,
                        visaAttachment: res ? res.fileUrl || res.fileData : null,
                        visaFileName: res ? res.fileName : null,
                        visaStoragePath: res ? res.storagePath : null,
                      }));
                    }}
                    onUploadSuccess={() => {
                      onDocumentUploaded?.();
                    }}
                    onRemove={() => {
                      setPersonalForm((prev) => ({
                        ...prev,
                        visaAttachment: null,
                        visaFileName: null,
                        visaStoragePath: null,
                      }));
                      onDocumentUploaded?.();
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* OPTIONAL: Driving Licence Upload Accordion */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowOptionalDl(!showOptionalDl)}
              className="text-xs font-semibold text-slate-700 hover:text-indigo-600 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Car size={14} className="text-slate-500" />
              <span>
                {showOptionalDl
                  ? 'Hide Driving Licence & Operator Authorization Attachment'
                  : '+ Attach Driving Licence / Heavy Equipment Operator Card (Optional)'}
              </span>
              {hasDlFile && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-md ml-1">
                  Attached
                </span>
              )}
            </button>
          </div>

          {showOptionalDl && (
            <div className="mt-3 p-4 bg-slate-50/70 rounded-xl border border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Licence Number
                  </label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    placeholder="e.g. DL-123456"
                    value={
                      personalForm.drivingLicenceNumber ||
                      complianceData?.currentDrivingLicence?.licenceNumber ||
                      ''
                    }
                    onChange={(e) =>
                      setPersonalForm({ ...personalForm, drivingLicenceNumber: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-600 block mb-0.5">
                    Licence Expiry Date
                  </label>
                  <input
                    type="date"
                    disabled={!canWrite}
                    value={
                      personalForm.drivingLicenceExpiryDate ||
                      complianceData?.currentDrivingLicence?.expiryDate ||
                      ''
                    }
                    onChange={(e) =>
                      setPersonalForm({ ...personalForm, drivingLicenceExpiryDate: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <div className="w-full">
                    <FileUploadComponent
                      employeeId={effectiveEmployeeId}
                      employeeName={effectiveEmployeeName}
                      category="driving-licence"
                      documentType="Driving Licence"
                      title={`Driving Licence - ${effectiveEmployeeName || effectiveEmployeeId}`}
                      documentNumber={personalForm.drivingLicenceNumber}
                      expiryDate={personalForm.drivingLicenceExpiryDate}
                      value={
                        personalForm.drivingLicenceAttachment ||
                        complianceData?.currentDrivingLicence?.documentAttachment ||
                        null
                      }
                      fileName={
                        personalForm.drivingLicenceFileName ||
                        complianceData?.currentDrivingLicence?.fileName ||
                        null
                      }
                      storagePath={
                        personalForm.drivingLicenceStoragePath ||
                        complianceData?.currentDrivingLicence?.storagePath ||
                        null
                      }
                      disabled={!canWrite}
                      compact={true}
                      autoUpload={true}
                      syncToModule={true}
                      onChange={(res) => {
                        setPersonalForm((prev) => ({
                          ...prev,
                          drivingLicenceAttachment: res ? res.fileUrl || res.fileData : null,
                          drivingLicenceFileName: res ? res.fileName : null,
                          drivingLicenceStoragePath: res ? res.storagePath : null,
                        }));
                      }}
                      onUploadSuccess={() => {
                        onDocumentUploaded?.();
                      }}
                      onRemove={() => {
                        setPersonalForm((prev) => ({
                          ...prev,
                          drivingLicenceAttachment: null,
                          drivingLicenceFileName: null,
                          drivingLicenceStoragePath: null,
                        }));
                        onDocumentUploaded?.();
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: Contact & Residential Directory */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Phone className="text-emerald-600" size={18} />
          <h3 className="font-bold text-slate-800 text-sm">
            Contact Channels &amp; Residential Directory
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Primary Mobile */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Primary Mobile Contact
            </label>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="+968 9123 4567"
              value={personalForm.mobileNumber || ''}
              onChange={(e) =>
                setPersonalForm({ ...personalForm, mobileNumber: e.target.value })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono"
            />
          </div>

          {/* WhatsApp Contact */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              WhatsApp Contact Number
            </label>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="+968 9123 4567"
              value={personalForm.whatsappNumber || ''}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  whatsappNumber: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-mono"
            />
          </div>

          {/* Personal Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Personal / Official Email
            </label>
            <input
              type="email"
              disabled={!canWrite}
              placeholder="employee@domain.com"
              value={personalForm.personalEmail || ''}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  personalEmail: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Residential Address in Oman */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <MapPin size={13} className="text-slate-500" />
              <span>Current Residential Address in Oman (Camp / Building, Way, Area, Governorate)</span>
            </label>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="e.g. Camp 3, Room 12, Ghala Industrial Area, Wilayat Bawshar, Muscat"
              value={personalForm.residentialAddress || ''}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  residentialAddress: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Permanent Home Country Address */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Permanent / Home Country Address (for Emergency Records &amp; Expat Dossier)
            </label>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="e.g. Village/Town, District, State/Province, Country, Postal Code"
              value={personalForm.permanentAddress || ''}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  permanentAddress: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>
      </div>

      {/* SECTION 4: Emergency Contacts Directory */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Phone className="text-rose-600" size={18} />
            <h3 className="font-bold text-slate-800 text-sm">
              Emergency Contact Directory
            </h3>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={addEmergencyContact}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Alternate Contact</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          {emergencyContacts.map((contact, idx) => (
            <div
              key={idx}
              className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      contact.isPrimary ? 'bg-rose-500' : 'bg-slate-400'
                    }`}
                  />
                  {contact.isPrimary ? 'Primary Emergency Contact' : `Alternate Contact #${idx + 1}`}
                </span>
                {idx > 0 && canWrite && (
                  <button
                    type="button"
                    onClick={() => removeEmergencyContact(idx)}
                    className="text-rose-600 hover:text-rose-800 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Contact Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    placeholder="Full Name"
                    value={contact.name || ''}
                    onChange={(e) =>
                      updateEmergencyContact(idx, 'name', e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Relationship
                  </label>
                  <select
                    disabled={!canWrite}
                    value={contact.relationship || 'Family'}
                    onChange={(e) =>
                      updateEmergencyContact(idx, 'relationship', e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Brother">Brother</option>
                    <option value="Sister">Sister</option>
                    <option value="Son">Son</option>
                    <option value="Daughter">Daughter</option>
                    <option value="Friend">Friend / Colleague</option>
                    <option value="Embassy / Consulate">Embassy / Consulate</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Emergency Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    placeholder="+968 ... or International"
                    value={contact.contactNumber || ''}
                    onChange={(e) =>
                      updateEmergencyContact(idx, 'contactNumber', e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-mono focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Contact Physical Location / City / Remarks
                  </label>
                  <input
                    type="text"
                    disabled={!canWrite}
                    placeholder="e.g. Muscat / Dubai / Kerala, India"
                    value={contact.address || ''}
                    onChange={(e) =>
                      updateEmergencyContact(idx, 'address', e.target.value)
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 5: Qualifications & Skills */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <GraduationCap className="text-indigo-600" size={18} />
          <h3 className="font-bold text-slate-800 text-sm">
            Educational Qualifications &amp; Technical Skills
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Qualifications */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <GraduationCap size={14} className="text-indigo-600" />
              <span>Academic Degrees &amp; Diplomas</span>
            </label>
            {canWrite && (
              <div className="flex gap-2 mb-2.5">
                <input
                  type="text"
                  placeholder="e.g. B.Tech Civil Engineering"
                  value={newQual}
                  onChange={(e) => setNewQual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addQualification();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
                <button
                  type="button"
                  onClick={addQualification}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 min-h-[36px]">
              {(personalForm.qualifications || []).map((q, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-indigo-50 text-indigo-800 border border-indigo-100"
                >
                  <span>{q}</span>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => removeQualification(idx)}
                      className="text-indigo-400 hover:text-indigo-700"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {(!personalForm.qualifications || personalForm.qualifications.length === 0) && (
                <span className="text-xs text-slate-400 italic">No academic degrees recorded.</span>
              )}
            </div>
          </div>

          {/* Skills & Certifications */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5 flex items-center gap-1.5">
              <Wrench size={14} className="text-amber-600" />
              <span>Technical Skills &amp; Certifications</span>
            </label>
            {canWrite && (
              <div className="flex gap-2 mb-2.5">
                <input
                  type="text"
                  placeholder="e.g. First Aid, Tower Crane, AutoCAD"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 min-h-[36px]">
              {(personalForm.skills || []).map((s, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-amber-50 text-amber-800 border border-amber-100"
                >
                  <span>{s}</span>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => removeSkill(idx)}
                      className="text-amber-400 hover:text-amber-700"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {(!personalForm.skills || personalForm.skills.length === 0) && (
                <span className="text-xs text-slate-400 italic">No technical skills recorded.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 6: HR Notes & Health Records */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
          <FileText className="text-slate-600" size={18} />
          <h3 className="font-bold text-slate-800 text-sm">
            HR Dossier Notes &amp; Health Remarks
          </h3>
        </div>
        <textarea
          disabled={!canWrite}
          rows={3}
          placeholder="Enter any medical precautions, allergies, uniform sizing, or general HR background remarks..."
          value={personalForm.notes || ''}
          onChange={(e) =>
            setPersonalForm({ ...personalForm, notes: e.target.value })
          }
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Action Footer */}
      {canWrite && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          {isNewEmployee && onContinueToEmployment ? (
            <button
              type="button"
              onClick={onContinueToEmployment}
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <span>{saving ? 'Processing...' : 'Continue to Employment & Placement'}</span>
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Save size={15} />
              <span>{saving ? 'Saving Records...' : 'Save Personal Details & Documents'}</span>
            </button>
          )}
        </div>
      )}
      {/* Print Summary Modal */}
      {employee && (
        <EmployeeSummaryPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          employee={employee}
          personalDetails={personalForm}
          complianceData={complianceData}
        />
      )}
    </div>
  );
};

