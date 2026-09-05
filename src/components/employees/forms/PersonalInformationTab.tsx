import React, { useState, useMemo, useRef } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  CreditCard,
  Globe,
  FileCheck,
  Car,
  UploadCloud,
  ShieldCheck,
  ShieldAlert,
  FileSpreadsheet,
  Info,
  Printer,
  Landmark,
  Copy,
  Check,
  XCircle,
  Camera,
  Crop,
  Maximize2,
} from 'lucide-react';
import { FileUploadComponent, type FileUploadResult } from '../../common/FileUploadComponent';
import { EmployeeSummaryPrintModal } from '../EmployeeSummaryPrintModal';
import { ImageCropModal } from '../ImageCropModal';
import type { Employee, EmployeePersonalDetails, NationalityType } from '../../../types/index';
import {
  validateBankAccountNumber,
  validateIban,
  validateBankDetails,
  generateOmanIban,
  formatIbanDisplay,
  cleanBankAccountNumber,
  cleanIban,
} from '../../../utils/bankValidation';

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
  const [copiedIban, setCopiedIban] = useState(false);

  const OMAN_BANKS = [
    'Bank Muscat',
    'Bank Dhofar',
    'National Bank of Oman (NBO)',
    'Sohar International',
    'Oman Arab Bank (OAB)',
    'Ahli Bank',
    'Bank Nizwa',
    'Alizz Islamic Bank',
    'Meethaq Islamic Banking',
    'Maisarah Islamic Banking',
    'HSBC Bank Oman',
    'Standard Chartered Bank',
    'Habib Bank AG Zurich',
    'State Bank of India',
    'Bank of Baroda',
  ];

  const [bankSubmitAttempted, setBankSubmitAttempted] = useState(false);
  const [isIbanFormattedView, setIsIbanFormattedView] = useState(false);

  // Employee Photo State & Controls
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [selectedImageForCrop, setSelectedImageForCrop] = useState<string | null>(null);
  const [photoFit, setPhotoFit] = useState<'cover' | 'contain'>('cover');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const currentPhoto = personalForm.photoUrl || employee?.photoUrl || null;

  const processPhotoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select a valid image file (JPG, PNG, WEBP, or GIF).');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError('Photo file size should be less than 12MB.');
      return;
    }
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSelectedImageForCrop(dataUrl);
      setIsCropModalOpen(true);
    };
    reader.onerror = () => {
      setPhotoError('Error reading photo file.');
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processPhotoFile(file);
    }
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handlePhotoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingPhoto(false);
    if (!canWrite) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processPhotoFile(file);
    }
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    setIsCropModalOpen(false);
    setSelectedImageForCrop(null);
    setPersonalForm((prev) => ({
      ...prev,
      photoUrl: croppedDataUrl,
    }));
  };

  const handleRemovePhoto = () => {
    setPersonalForm((prev) => ({
      ...prev,
      photoUrl: '',
    }));
  };

  // Field-level validations for Bank Account Number & IBAN
  const accountValidation = useMemo(
    () => validateBankAccountNumber(personalForm.bankAccountNumber, personalForm.bankName),
    [personalForm.bankAccountNumber, personalForm.bankName]
  );

  const ibanValidation = useMemo(
    () => validateIban(personalForm.iban, personalForm.bankName),
    [personalForm.iban, personalForm.bankName]
  );

  const bankFormValidation = useMemo(
    () => validateBankDetails(personalForm.bankName, personalForm.bankAccountNumber, personalForm.iban),
    [personalForm.bankName, personalForm.bankAccountNumber, personalForm.iban]
  );

  const handleGenerateCboIban = () => {
    if (!personalForm.bankAccountNumber || !accountValidation.isValid) return;
    const targetBank = personalForm.bankName || 'Bank Muscat';
    const gen = generateOmanIban(targetBank, personalForm.bankAccountNumber);
    if (gen) {
      setPersonalForm((prev) => ({
        ...prev,
        iban: gen,
        ...(prev.bankName ? {} : { bankName: 'Bank Muscat' }),
      }));
    }
  };

  const handleMoveAccToIban = () => {
    if (!personalForm.bankAccountNumber) return;
    const cleaned = cleanIban(personalForm.bankAccountNumber);
    setPersonalForm((prev) => ({
      ...prev,
      iban: cleaned,
      bankAccountNumber: '',
    }));
  };

  const [identityError, setIdentityError] = useState<string | null>(null);

  const handleValidatedSave = async () => {
    setIdentityError(null);
    if (isNewEmployee && (!basicInfoForm?.employeeId?.trim() || !basicInfoForm?.employeeName?.trim())) {
      setIdentityError('Please provide both Employee ID and Full Legal Name before registering.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBankSubmitAttempted(true);
    const check = validateBankDetails(personalForm.bankName, personalForm.bankAccountNumber, personalForm.iban);
    if (!check.isValid) {
      const section = document.getElementById('employee-banking-section');
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    await onSave();
  };

  const handleValidatedContinue = () => {
    setIdentityError(null);
    if (isNewEmployee && (!basicInfoForm?.employeeId?.trim() || !basicInfoForm?.employeeName?.trim())) {
      setIdentityError('Please provide both Employee ID and Full Legal Name before proceeding.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBankSubmitAttempted(true);
    const check = validateBankDetails(personalForm.bankName, personalForm.bankAccountNumber, personalForm.iban);
    if (!check.isValid) {
      const section = document.getElementById('employee-banking-section');
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onContinueToEmployment?.();
  };

  const handleCopyIban = (ibanStr?: string) => {
    if (!ibanStr) return;
    const clean = ibanStr.replace(/\s+/g, '');
    navigator.clipboard.writeText(clean);
    setCopiedIban(true);
    setTimeout(() => setCopiedIban(false), 2000);
  };

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
  const getQualificationDisplay = (q: any): { title: string; subtitle?: string } => {
    if (!q) return { title: '' };
    if (typeof q === 'string') return { title: q };
    if (typeof q === 'object') {
      const title = q.degree || q.title || q.name || Object.values(q).filter((v) => typeof v === 'string').join(' - ') || 'Degree';
      const subParts: string[] = [];
      if (q.institution) subParts.push(q.institution);
      if (q.yearOfPassing) subParts.push(String(q.yearOfPassing));
      if (q.grade) subParts.push(q.grade);
      return {
        title,
        subtitle: subParts.length > 0 ? subParts.join(' • ') : undefined,
      };
    }
    return { title: String(q) };
  };

  const getSkillDisplay = (s: any): string => {
    if (!s) return '';
    if (typeof s === 'string') return s;
    if (typeof s === 'object') {
      if (s.name) return s.name + (s.level ? ` (${s.level})` : '');
      if (s.skillName) return s.skillName;
      if (s.skill) return s.skill;
      return Object.values(s).filter((v) => typeof v === 'string').join(' - ');
    }
    return String(s);
  };

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
      {identityError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span className="font-semibold">{identityError}</span>
          </div>
          <button
            type="button"
            onClick={() => setIdentityError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

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

        {/* Photo Upload & Identity Header Card */}
        <div className="mb-5 p-4 bg-slate-50/80 rounded-xl border border-slate-200/80">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            {/* Photo Avatar Preview & Dropzone */}
            <div className="flex flex-col items-center sm:items-start shrink-0">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
                id="employee-photo-upload-input"
                aria-label="Upload Employee Photo"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (canWrite) setIsDraggingPhoto(true);
                }}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={handlePhotoDrop}
                onClick={() => {
                  if (canWrite) photoInputRef.current?.click();
                }}
                className={`relative group w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border-2 transition-all flex items-center justify-center cursor-pointer select-none shadow-2xs ${
                  isDraggingPhoto
                    ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100 scale-102'
                    : currentPhoto
                    ? 'border-slate-200 bg-slate-100 hover:border-blue-400'
                    : 'border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/40'
                }`}
                title={canWrite ? 'Click or drag & drop to upload employee photo' : 'Employee Photo'}
                role="button"
                tabIndex={canWrite ? 0 : -1}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && canWrite) {
                    e.preventDefault();
                    photoInputRef.current?.click();
                  }
                }}
              >
                {currentPhoto ? (
                  <img
                    src={currentPhoto}
                    alt={basicInfoForm?.employeeName || employee?.employeeName || 'Employee Photo'}
                    className={`w-full h-full ${
                      photoFit === 'contain' ? 'object-contain' : 'object-cover'
                    } transition-transform duration-200 group-hover:scale-105`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-2 text-center">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                      {basicInfoForm?.employeeName || employee?.employeeName ? (
                        <span className="font-bold text-xs tracking-wider uppercase">
                          {(basicInfoForm?.employeeName || employee?.employeeName || '')
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((n: string) => n[0])
                            .join('')}
                        </span>
                      ) : (
                        <Camera size={20} />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">Add Photo</span>
                    <span className="text-[9px] text-slate-400">Click / Drop</span>
                  </div>
                )}

                {/* Hover Overlay if photo exists */}
                {currentPhoto && canWrite && (
                  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white p-2">
                    <Camera size={18} className="drop-shadow-xs" />
                    <span className="text-[10px] font-semibold drop-shadow-xs">Change Photo</span>
                  </div>
                )}

                {/* Corner Camera Badge Indicator */}
                {currentPhoto && (
                  <div className="absolute bottom-1.5 right-1.5 bg-white/95 p-1 rounded-full shadow-xs border border-slate-200 text-slate-600 group-hover:opacity-0 transition-opacity pointer-events-none">
                    <Camera size={11} />
                  </div>
                )}
              </div>
            </div>

            {/* Photo Metadata & Actions */}
            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center justify-center sm:justify-start gap-1.5">
                    <Camera size={14} className="text-blue-600" />
                    <span>Employee Photo (Headshot)</span>
                    {currentPhoto ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} /> Photo Attached
                      </span>
                    ) : (
                      <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Official employee photograph used across workforce rosters, digital ID badges, gate pass verification, and print dossiers.
                  </p>
                </div>

                {/* Action Buttons */}
                {canWrite && (
                  <div className="flex items-center justify-center sm:justify-end gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <UploadCloud size={13} />
                      <span>{currentPhoto ? 'Change Photo' : 'Upload Photo'}</span>
                    </button>

                    {currentPhoto && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedImageForCrop(currentPhoto);
                            setIsCropModalOpen(true);
                          }}
                          className="text-xs font-semibold px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Adjust zoom and frame center"
                        >
                          <Crop size={12} className="text-blue-600" />
                          <span>Crop / Adjust</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPhotoFit((prev) => (prev === 'cover' ? 'contain' : 'cover'))}
                          className="text-xs font-semibold px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                          title={photoFit === 'cover' ? 'Fit entire photo' : 'Fill box'}
                        >
                          <Maximize2 size={12} className="text-slate-500" />
                          <span>{photoFit === 'cover' ? 'Fit' : 'Fill'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="text-xs font-semibold px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Remove photo"
                        >
                          <Trash2 size={12} />
                          <span>Remove</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Photo Error Banner */}
              {photoError && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px] font-medium flex items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{photoError}</span>
                </div>
              )}

              {/* Specs description */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-emerald-600" /> JPG, PNG, WEBP
                </span>
                <span>•</span>
                <span>Max 12MB</span>
                <span>•</span>
                <span>Passport headshot or clean portrait</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Core Identification Fields (Editable for both New Employee and Existing Records) */}
          {basicInfoForm && setBasicInfoForm && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Employee ID <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-blue-600 font-mono font-medium">EMP ID</span>
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs uppercase font-mono font-bold focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Legal Name (English) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!canWrite}
                  placeholder="e.g. Ahmed Al-Harthy or Suresh Kumar"
                  value={basicInfoForm.employeeName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBasicInfoForm({
                      ...basicInfoForm,
                      employeeName: val,
                    });
                    setPersonalForm((prev) => ({
                      ...prev,
                      accountHolderName: prev.accountHolderName || val,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nationality Status <span className="text-rose-500">*</span>
                </label>
                <select
                  disabled={!canWrite}
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

          {/* Father's Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Father's Name
            </label>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="e.g. Hamdan Al-Balushi"
              value={personalForm.fatherName || ''}
              onChange={(e) =>
                setPersonalForm({ ...personalForm, fatherName: e.target.value })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400"
            />
          </div>

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

      {/* SECTION 4: Banking & Wage Disbursal Account */}
      <div id="employee-banking-section" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Landmark size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>Banking &amp; Wage Disbursal Account</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Standard Format Validated
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Official employee bank credentials for Wages Protection System (WPS) files and direct salary remittances.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {personalForm.iban && ibanValidation.isValid ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Check size={12} /> CBO 23-Digit IBAN (Mod-97 Verified)
              </span>
            ) : personalForm.iban ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 border border-red-200">
                <AlertCircle size={12} /> Invalid IBAN ({cleanIban(personalForm.iban).length}/23 Chars)
              </span>
            ) : personalForm.bankAccountNumber && accountValidation.isValid ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                <Check size={12} /> Local Account Verified ({accountValidation.cleaned.length} digits)
              </span>
            ) : personalForm.bankAccountNumber ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 border border-red-200">
                <AlertCircle size={12} /> Invalid Account Number
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                No Bank Registered
              </span>
            )}
          </div>
        </div>

        {/* Accidental Submission Prevention Banner */}
        {bankSubmitAttempted && !bankFormValidation.isValid && (
          <div className="p-3.5 mb-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-900 animate-in fade-in duration-200">
            <ShieldAlert size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-red-900">
                Accidental Submission Blocked: Invalid Banking Data Format
              </p>
              <p className="text-[11px] text-red-700 mt-0.5">
                Bank credentials must adhere to standard Central Bank of Oman (CBO) numeric account or 23-character IBAN formats before saving:
              </p>
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-[11px] text-red-800 font-medium">
                {bankFormValidation.errors.bankAccountNumber && (
                  <li>
                    <strong className="font-semibold">Account Number:</strong>{' '}
                    {bankFormValidation.errors.bankAccountNumber}
                  </li>
                )}
                {bankFormValidation.errors.iban && (
                  <li>
                    <strong className="font-semibold">Oman IBAN:</strong>{' '}
                    {bankFormValidation.errors.iban}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Advisory Coherence Warning */}
        {(!bankSubmitAttempted || bankFormValidation.isValid) &&
          (bankFormValidation.warnings.bankName ||
            bankFormValidation.warnings.bankAccountNumber ||
            bankFormValidation.warnings.iban) && (
            <div className="p-3 mb-4 bg-amber-50/80 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] space-y-0.5">
                {bankFormValidation.warnings.bankName && (
                  <p>{bankFormValidation.warnings.bankName}</p>
                )}
                {bankFormValidation.warnings.bankAccountNumber && (
                  <p>{bankFormValidation.warnings.bankAccountNumber}</p>
                )}
                {bankFormValidation.warnings.iban && (
                  <p>{bankFormValidation.warnings.iban}</p>
                )}
              </div>
            </div>
          )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Bank Name Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bank Name <span className="text-slate-400 font-normal">(Oman / Licensed Bank)</span>
            </label>
            <div className="space-y-1.5">
              <select
                disabled={!canWrite}
                value={
                  OMAN_BANKS.includes(personalForm.bankName || '')
                    ? personalForm.bankName
                    : personalForm.bankName
                    ? 'OTHER'
                    : ''
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'OTHER') {
                    setPersonalForm({
                      ...personalForm,
                      bankName: personalForm.bankName && !OMAN_BANKS.includes(personalForm.bankName) ? personalForm.bankName : '',
                    });
                  } else {
                    setPersonalForm({
                      ...personalForm,
                      bankName: val,
                    });
                  }
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Select Bank --</option>
                {OMAN_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                <option value="OTHER">Other / International Bank (Specify below)...</option>
              </select>

              {(!OMAN_BANKS.includes(personalForm.bankName || '') || personalForm.bankName === '') && (
                <input
                  type="text"
                  disabled={!canWrite}
                  placeholder="Enter custom bank name..."
                  value={personalForm.bankName || ''}
                  onChange={(e) =>
                    setPersonalForm({
                      ...personalForm,
                      bankName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-dashed border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              )}
            </div>
          </div>

          {/* Account Number with Real-time Validation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Bank Account Number
              </label>
              {personalForm.bankAccountNumber && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {cleanBankAccountNumber(personalForm.bankAccountNumber).length} digits
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                disabled={!canWrite}
                placeholder="e.g. 0423012345670019"
                value={personalForm.bankAccountNumber || ''}
                onChange={(e) =>
                  setPersonalForm({
                    ...personalForm,
                    bankAccountNumber: e.target.value.replace(/[\s\-]/g, ''),
                  })
                }
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono font-medium border rounded-lg transition-colors ${
                  !accountValidation.isValid
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-400 text-red-900'
                    : personalForm.bankAccountNumber
                    ? 'border-emerald-400 bg-emerald-50/15 focus:ring-2 focus:ring-emerald-500 text-slate-800'
                    : 'border-slate-200 focus:ring-2 focus:ring-blue-500 bg-white'
                }`}
              />
              {personalForm.bankAccountNumber && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {accountValidation.isValid ? (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  ) : (
                    <AlertCircle size={15} className="text-red-500" />
                  )}
                </div>
              )}
            </div>

            {/* Account Validation Status & Actions */}
            {!accountValidation.isValid ? (
              <div className="mt-1 space-y-1">
                <p className="text-[11px] text-red-600 font-medium flex items-start gap-1">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  <span>{accountValidation.error}</span>
                </p>
                {accountValidation.error?.includes('IBAN') && (
                  <button
                    type="button"
                    onClick={handleMoveAccToIban}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Move value to Oman IBAN field</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ) : accountValidation.warning ? (
              <p className="text-[11px] text-amber-700 font-medium flex items-start gap-1 mt-1">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{accountValidation.warning}</span>
              </p>
            ) : personalForm.bankAccountNumber && accountValidation.isValid ? (
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <Check size={12} /> Valid standard numeric format
                </span>
                {(!personalForm.iban || !ibanValidation.isValid) && canWrite && (
                  <button
                    type="button"
                    onClick={handleGenerateCboIban}
                    className="text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    title="Generate standard CBO 23-character IBAN from this account"
                  >
                    <Sparkles size={11} />
                    <span>Auto-generate IBAN</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 mt-1">
                Core domestic bank branch account number (6–24 digits)
              </p>
            )}
          </div>

          {/* IBAN with Real-time CBO Checksum Validation */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <span>Oman IBAN Number</span>
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                {personalForm.iban && (
                  <button
                    type="button"
                    onClick={() => setIsIbanFormattedView(!isIbanFormattedView)}
                    className="text-slate-500 hover:text-slate-700 cursor-pointer text-[10px] underline"
                  >
                    {isIbanFormattedView ? 'Compact' : 'Grouped'}
                  </button>
                )}
                {personalForm.iban && (
                  <button
                    type="button"
                    onClick={() => handleCopyIban(personalForm.iban)}
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                    title="Copy IBAN"
                  >
                    {copiedIban ? (
                      <>
                        <Check size={12} className="text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <input
                type="text"
                disabled={!canWrite}
                placeholder="e.g. OM45BMUS000123456789012"
                maxLength={34}
                value={
                  isIbanFormattedView
                    ? formatIbanDisplay(personalForm.iban)
                    : personalForm.iban || ''
                }
                onChange={(e) => {
                  const cleaned = cleanIban(e.target.value);
                  setPersonalForm({
                    ...personalForm,
                    iban: cleaned,
                  });
                }}
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono font-bold tracking-wider border rounded-lg transition-colors ${
                  !ibanValidation.isValid
                    ? 'border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-400 text-red-900'
                    : personalForm.iban
                    ? 'border-emerald-400 bg-emerald-50/15 focus:ring-2 focus:ring-emerald-500 text-blue-900'
                    : 'border-slate-200 focus:ring-2 focus:ring-blue-500 bg-white'
                }`}
              />
              {personalForm.iban && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {ibanValidation.isValid ? (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  ) : (
                    <AlertCircle size={15} className="text-red-500" />
                  )}
                </div>
              )}
            </div>

            {/* IBAN Validation Status */}
            {!ibanValidation.isValid ? (
              <div className="mt-1 space-y-1">
                <p className="text-[11px] text-red-600 font-medium flex items-start gap-1">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  <span>{ibanValidation.error}</span>
                </p>
                {personalForm.iban && !personalForm.iban.toUpperCase().startsWith('OM') && (
                  <button
                    type="button"
                    onClick={() => {
                      const prefixed = ('OM' + (personalForm.iban || '')).toUpperCase();
                      setPersonalForm({ ...personalForm, iban: prefixed });
                    }}
                    className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    + Add 'OM' Country Code Prefix
                  </button>
                )}
              </div>
            ) : ibanValidation.warning ? (
              <p className="text-[11px] text-amber-700 font-medium flex items-start gap-1 mt-1">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{ibanValidation.warning}</span>
              </p>
            ) : personalForm.iban && ibanValidation.isValid ? (
              <div className="mt-1 flex items-center justify-between text-[10px] text-emerald-700 font-medium">
                <span className="flex items-center gap-1">
                  <Check size={12} /> CBO Standard 23-char IBAN &amp; Mod-97 verified
                </span>
                <span className="font-mono text-slate-500">23/23 chars</span>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                <span>Standard format: 23 chars starting with OM</span>
              </div>
            )}
          </div>

          {/* Account Holder Legal Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Account Holder Legal Name
              </label>
              {effectiveEmployeeName && personalForm.accountHolderName !== effectiveEmployeeName && canWrite && (
                <button
                  type="button"
                  onClick={() =>
                    setPersonalForm({
                      ...personalForm,
                      accountHolderName: effectiveEmployeeName,
                    })
                  }
                  className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                >
                  Use Employee Name
                </button>
              )}
            </div>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="Full name as printed on bank statement"
              value={personalForm.accountHolderName || ''}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  accountHolderName: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Bank Branch / Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bank Branch / City
            </label>
            <input
              type="text"
              disabled={!canWrite}
              placeholder="e.g. Ruwi Main Branch, Muscat"
              value={personalForm.bankBranch || ''}
              onChange={(e) =>
                setPersonalForm({
                  ...personalForm,
                  bankBranch: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* WPS Disbursal Mode Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-start gap-2 text-xs text-slate-600">
            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800">WPS &amp; SIF Integration:</span>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Bank credentials configured here are synchronized with the employee ledger, WPS SIF generator, and payment voucher dispatch.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 5: Emergency Contacts Directory */}
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
              {(personalForm.qualifications || []).map((q, idx) => {
                const { title, subtitle } = getQualificationDisplay(q);
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-indigo-50 text-indigo-800 border border-indigo-100"
                  >
                    <span className="flex items-center gap-1">
                      <span className="font-semibold">{title}</span>
                      {subtitle && (
                        <span className="text-[10px] text-indigo-600 font-normal">
                          ({subtitle})
                        </span>
                      )}
                    </span>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => removeQualification(idx)}
                        className="text-indigo-400 hover:text-indigo-700 ml-0.5 cursor-pointer font-bold"
                        title="Remove qualification"
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
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
              {(personalForm.skills || []).map((s, idx) => {
                const text = getSkillDisplay(s);
                return (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-amber-50 text-amber-800 border border-amber-100"
                  >
                    <span>{text}</span>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => removeSkill(idx)}
                        className="text-amber-400 hover:text-amber-700 ml-0.5 cursor-pointer font-bold"
                        title="Remove skill"
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
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
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {isNewEmployee ? (
              <span>Fields marked with <span className="text-rose-500">*</span> are required for registration.</span>
            ) : (
              <span>All updates will be timestamped and saved to the employee master record.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isNewEmployee ? (
              <>
                <button
                  type="button"
                  onClick={handleValidatedSave}
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <CheckCircle2 size={15} />
                  <span>{saving ? 'Registering...' : 'Save & Register Employee'}</span>
                </button>
                {onContinueToEmployment && (
                  <button
                    type="button"
                    onClick={handleValidatedContinue}
                    disabled={saving}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                  >
                    <span>Continue to Employment &amp; Placement</span>
                    <ArrowRight size={15} />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleValidatedSave}
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Save size={15} />
                <span>{saving ? 'Saving Records...' : 'Save Personal Details & Documents'}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {/* Image Crop & Zoom Modal */}
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageSrc={selectedImageForCrop}
        onClose={() => {
          setIsCropModalOpen(false);
          setSelectedImageForCrop(null);
        }}
        onCropComplete={handleCropComplete}
        title="Adjust & Center Employee Photo"
      />

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

