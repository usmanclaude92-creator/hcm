import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  User,
  Building,
  CreditCard,
  Car,
  FileCheck,
  FileText,
  FolderOpen,
  ArrowLeft,
  Save,
  AlertTriangle,
  History,
  Printer,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest, buildStorageFileUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ComplianceBadge } from '../compliance/ComplianceBadge';
import { FileUploadComponent } from '../common/FileUploadComponent';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { DocumentHistoryModal, HistoryCategory } from './DocumentHistoryModal';
import { EmployeeDocumentRepository } from './EmployeeDocumentRepository';
import { EmployeeSummaryPrintModal } from './EmployeeSummaryPrintModal';

// Modular Sub-forms
import { PersonalInformationTab } from './forms/PersonalInformationTab';
import { EmploymentPlacementTab } from './forms/EmploymentPlacementTab';
import { CompensationWpsTab } from './forms/CompensationWpsTab';
import { CivilIdTab } from './forms/CivilIdTab';
import { DrivingLicenceTab } from './forms/DrivingLicenceTab';
import { VisaTradeTab } from './forms/VisaTradeTab';
import { GovernmentDocsTab } from './forms/GovernmentDocsTab';
import { validateBankDetails } from '../../utils/bankValidation';

import type {
  Employee,
  EmployeeCivilId,
  EmployeeDrivingLicence,
  EmployeeVisa,
  EmployeeGovernmentDocument,
  EmployeePersonalDetails,
  DrivingLicenceCategory,
  EmployeeType,
  NationalityType,
  WageType,
  EmployeeCompany,
  SalaryPaidBy,
  WPSStatus,
} from '../../types/index';

export type EmployeeRecordTab =
  | 'personal'
  | 'employment'
  | 'payroll'
  | 'civil-id'
  | 'driving-licence'
  | 'visa'
  | 'govt-docs'
  | 'documents';

export interface EmployeeIdentificationModalProps {
  employee?: Employee | null;
  isOpen: boolean;
  mode?: 'modal' | 'inline';
  initialTab?: EmployeeRecordTab;
  backLabel?: string;
  onClose: () => void;
  onUpdated?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface PendingRegistrationCalloutProps {
  tabName: string;
  onGoToPersonal: () => void;
  onRegister: () => Promise<void>;
  saving: boolean;
}

const PendingRegistrationCallout: React.FC<PendingRegistrationCalloutProps> = ({
  tabName,
  onGoToPersonal,
  onRegister,
  saving,
}) => (
  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto my-8 shadow-xs">
    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
      <ShieldCheck size={24} />
    </div>
    <h3 className="text-sm font-bold text-slate-800 mb-1">
      {tabName} Lifecycle Requires Registered Profile
    </h3>
    <p className="text-xs text-slate-500 leading-relaxed mb-5">
      Statutory document renewal workflows, validity status tracking, and encrypted file archives unlock once the employee record is created in the database.
    </p>
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onGoToPersonal}
        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
      >
        Review Details (Tab 1)
      </button>
      <button
        type="button"
        onClick={onRegister}
        disabled={saving}
        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
      >
        <CheckCircle2 size={15} />
        <span>{saving ? 'Registering...' : 'Save & Register Employee'}</span>
      </button>
    </div>
  </div>
);

export const EmployeeIdentificationModal: React.FC<EmployeeIdentificationModalProps> = ({
  employee,
  isOpen,
  mode = 'modal',
  initialTab = 'personal',
  backLabel,
  onClose,
  onUpdated,
  onDirtyChange,
}) => {
  const { user, hasPermission } = useAuth();
  const canWrite = hasPermission('compliance.edit');

  const [activeTab, setActiveTab] = useState<EmployeeRecordTab>(initialTab);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(employee || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // New Employee Basic Form state (if starting from Tab 1 without an existing employee)
  const [basicInfoForm, setBasicInfoForm] = useState({
    employeeId: '',
    employeeName: '',
    nationalityType: 'Expat' as NationalityType,
  });

  // Compliance & Sub-form datasets
  const [complianceData, setComplianceData] = useState<{
    currentCivilId?: EmployeeCivilId | null;
    currentDrivingLicence?: EmployeeDrivingLicence | null;
    currentVisa?: EmployeeVisa | null;
    governmentDocuments?: EmployeeGovernmentDocument[];
    designationHistory?: any[];
    salaryHistory?: any[];
    personalDetails?: EmployeePersonalDetails | null;
  } | null>(null);

  const [docCount, setDocCount] = useState<number>(0);

  // Form State: Tab 1 (Personal)
  const [personalForm, setPersonalForm] = useState<EmployeePersonalDetails>({
    employeeId: '',
    gender: 'Male',
    maritalStatus: 'Single',
    qualifications: [],
    skills: [],
    emergencyContacts: [],
  });

  // Form State: Tab 2 (Employment)
  const [employmentForm, setEmploymentForm] = useState({
    employeeCompany: 'DGO' as EmployeeCompany,
    designation: '',
    employeeType: 'Staff' as EmployeeType,
    nationalityType: 'Expat' as NationalityType,
    dateOfJoining: new Date().toISOString().split('T')[0],
    dateOfLeaving: '',
    isActive: true,
    promotionReason: '',
  });

  // Form State: Tab 3 (Payroll & WPS)
  const [payrollForm, setPayrollForm] = useState({
    wageType: 'Fixed Monthly' as WageType,
    monthlySalaryOrRate: 0,
    wpsEmployee: 'No' as WPSStatus,
    wpsSalary: 0,
    actualSalary: 0,
    salaryPaidBy: 'DGO' as SalaryPaidBy,
    recoverFrom: '',
    salaryRevisionReason: '',
  });

  // Sub-modal Popups (Renewal & Add)
  const [isRenewCidOpen, setIsRenewCidOpen] = useState(false);
  const [cidForm, setCidForm] = useState({
    civilIdNumber: '',
    expiryDate: '',
    issueDate: '',
    issuingAuthority: 'Royal Oman Police',
    country: 'Oman',
    replaceReason: '',
    remarks: '',
    documentAttachment: '',
  });

  const [isRenewDlOpen, setIsRenewDlOpen] = useState(false);
  const [dlForm, setDlForm] = useState({
    licenceNumber: '',
    category: 'Light Vehicle' as DrivingLicenceCategory,
    expiryDate: '',
    issueDate: '',
    vehicleClass: 'Light Vehicle',
    restrictions: '',
    remarks: '',
    documentAttachment: '',
  });

  const [isRenewVisaOpen, setIsRenewVisaOpen] = useState(false);
  const [visaForm, setVisaForm] = useState({
    tradeOnVisa: '',
    visaNumber: '',
    expiryDate: '',
    issueDate: '',
    sponsor: 'DGO',
    sponsorshipType: 'Corporate' as any,
    reasonForChange: '',
    remarks: '',
    documentAttachment: '',
  });

  const [isAddGovtDocOpen, setIsAddGovtDocOpen] = useState(false);
  const [newGovtDoc, setNewGovtDoc] = useState({
    documentType: 'Passport' as any,
    documentNumber: '',
    expiryDate: '',
    issueDate: '',
    issuingAuthority: '',
    country: 'Oman',
    remarks: '',
    documentAttachment: '',
  });

  // Document Preview Modal State
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    url?: string;
    fileName?: string;
    title?: string;
    documentType?: string;
    documentNumber?: string;
    expiryDate?: string;
    status?: string;
    remarks?: string;
  }>({ isOpen: false });

  // Document History Modal State
  const [historyModalState, setHistoryModalState] = useState<{
    isOpen: boolean;
    category: HistoryCategory;
    title: string;
  }>({
    isOpen: false,
    category: 'civil-id',
    title: 'Civil ID Document History',
  });

  // Category Quick-Add
  const [licenceCategories, setLicenceCategories] = useState<string[]>([
    'Light Vehicle',
    'Heavy Equipment',
    'Heavy Vehicle',
    'Motorcycle',
    'Bus',
    'Truck',
    'Other',
  ]);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Unsaved Changes Tracking & Discard Confirmation
  const serializeForms = useCallback(
    (
      b: { employeeId?: string; employeeName?: string; nationalityType?: string },
      p: any,
      e: {
        employeeCompany?: string;
        designation?: string;
        employeeType?: string;
        nationalityType?: string;
        dateOfJoining?: string;
        dateOfLeaving?: string;
        isActive?: boolean;
        promotionReason?: string;
      },
      pay: {
        wageType?: string;
        monthlySalaryOrRate?: number | string;
        wpsEmployee?: string;
        wpsSalary?: number | string;
        actualSalary?: number | string;
        salaryPaidBy?: string;
        recoverFrom?: string;
        salaryRevisionReason?: string;
      }
    ) => {
      return JSON.stringify({
        b: {
          employeeId: (b.employeeId || '').trim().toUpperCase(),
          employeeName: (b.employeeName || '').trim(),
          nationalityType: b.nationalityType || 'Expat',
        },
        p: {
          employeeId: (p?.employeeId || '').trim().toUpperCase(),
          fatherName: (p?.fatherName || '').trim(),
          dateOfBirth: p?.dateOfBirth || p?.dob || '',
          gender: p?.gender || 'Male',
          maritalStatus: p?.maritalStatus || 'Single',
          bloodGroup: p?.bloodGroup || '',
          mobileNumber: (p?.mobileNumber || p?.mobile || '').trim(),
          personalEmail: (p?.personalEmail || p?.email || '').trim(),
          currentAddress: (p?.currentAddress || '').trim(),
          permanentAddress: (p?.permanentAddress || '').trim(),
          bankName: (p?.bankName || '').trim(),
          bankAccountNumber: (p?.bankAccountNumber || '').trim(),
          iban: (p?.iban || '').trim(),
          qualifications: p?.qualifications || [],
          skills: p?.skills || [],
          emergencyContacts: (p?.emergencyContacts || []).map((c: any) => ({
            name: (c.name || '').trim(),
            relationship: (c.relationship || '').trim(),
            contactNumber: (c.contactNumber || c.mobileNumber || '').trim(),
          })),
          notes: (p?.notes || p?.hrNotes || '').trim(),
        },
        e: {
          employeeCompany: e.employeeCompany || 'DGO',
          designation: (e.designation || '').trim(),
          employeeType: e.employeeType || 'Staff',
          nationalityType: e.nationalityType || 'Expat',
          dateOfJoining: e.dateOfJoining || '',
          dateOfLeaving: e.dateOfLeaving || '',
          isActive: Boolean(e.isActive),
          promotionReason: (e.promotionReason || '').trim(),
        },
        pay: {
          wageType: pay.wageType || 'Fixed Monthly',
          monthlySalaryOrRate: Number(pay.monthlySalaryOrRate) || 0,
          wpsEmployee: pay.wpsEmployee || 'No',
          wpsSalary: Number(pay.wpsSalary) || 0,
          actualSalary: Number(pay.actualSalary) || 0,
          salaryPaidBy: pay.salaryPaidBy || 'DGO',
          recoverFrom: (pay.recoverFrom || '').trim(),
          salaryRevisionReason: (pay.salaryRevisionReason || '').trim(),
        },
      });
    },
    []
  );

  const [baselineSnapshot, setBaselineSnapshot] = useState<string>('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const currentSnapshot = useMemo(() => {
    return serializeForms(basicInfoForm, personalForm, employmentForm, payrollForm);
  }, [basicInfoForm, personalForm, employmentForm, payrollForm, serializeForms]);

  const isDirty = useMemo(() => {
    if (!baselineSnapshot) return false;
    return baselineSnapshot !== currentSnapshot;
  }, [baselineSnapshot, currentSnapshot]);

  const dirtySections = useMemo(() => {
    if (!baselineSnapshot || baselineSnapshot === currentSnapshot) return [];
    const sections: string[] = [];
    try {
      const base = JSON.parse(baselineSnapshot);
      const curr = JSON.parse(currentSnapshot);
      if (
        JSON.stringify(base.b) !== JSON.stringify(curr.b) ||
        JSON.stringify(base.p) !== JSON.stringify(curr.p)
      ) {
        sections.push('Personal Information');
      }
      if (JSON.stringify(base.e) !== JSON.stringify(curr.e)) {
        sections.push('Employment & Placement');
      }
      if (JSON.stringify(base.pay) !== JSON.stringify(curr.pay)) {
        sections.push('Compensation & WPS');
      }
    } catch {
      sections.push('Employee Record');
    }
    return sections;
  }, [baselineSnapshot, currentSnapshot]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSafeClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Fetch full employee compliance data
  const fetchCompliance = async () => {
    if (!currentEmployee) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/api/employees/${currentEmployee.employeeId}/compliance`);
      setComplianceData(res);

      if (res.personalDetails) {
        setPersonalForm({
          ...res.personalDetails,
          photoUrl: res.personalDetails.photoUrl || currentEmployee.photoUrl || undefined,
        });
      } else {
        setPersonalForm({
          employeeId: currentEmployee.employeeId,
          photoUrl: currentEmployee.photoUrl || undefined,
          gender: 'Male',
          maritalStatus: 'Single',
          qualifications: [],
          skills: [],
          emergencyContacts: [],
        });
      }

      setEmploymentForm({
        employeeCompany: currentEmployee.employeeCompany,
        designation: currentEmployee.designation,
        employeeType: currentEmployee.employeeType,
        nationalityType: currentEmployee.nationalityType,
        dateOfJoining: currentEmployee.dateOfJoining,
        dateOfLeaving: currentEmployee.dateOfLeaving || '',
        isActive: currentEmployee.isActive,
        promotionReason: '',
      });

      setPayrollForm({
        wageType: currentEmployee.wageType,
        monthlySalaryOrRate: currentEmployee.monthlySalaryOrRate,
        wpsEmployee: currentEmployee.wpsEmployee,
        wpsSalary: currentEmployee.wpsSalary || 0,
        actualSalary: currentEmployee.actualSalary || currentEmployee.monthlySalaryOrRate,
        salaryPaidBy: currentEmployee.salaryPaidBy,
        recoverFrom: currentEmployee.recoverFrom || '',
        salaryRevisionReason: '',
      });

      // Populate CID form default
      if (res.currentCivilId) {
        setCidForm({
          civilIdNumber: res.currentCivilId.civilIdNumber,
          expiryDate: res.currentCivilId.expiryDate,
          issueDate: res.currentCivilId.issueDate || '',
          issuingAuthority: res.currentCivilId.issuingAuthority || 'Royal Oman Police',
          country: res.currentCivilId.country || 'Oman',
          replaceReason: '',
          remarks: res.currentCivilId.remarks || '',
          documentAttachment: res.currentCivilId.documentAttachment || '',
        });
      }

      // Populate DL form default
      if (res.currentDrivingLicence) {
        setDlForm({
          licenceNumber: res.currentDrivingLicence.licenceNumber,
          category: res.currentDrivingLicence.category as any,
          expiryDate: res.currentDrivingLicence.expiryDate,
          issueDate: res.currentDrivingLicence.issueDate || '',
          vehicleClass: res.currentDrivingLicence.vehicleClass || 'Light Vehicle',
          restrictions: res.currentDrivingLicence.restrictions || '',
          remarks: res.currentDrivingLicence.remarks || '',
          documentAttachment: res.currentDrivingLicence.documentAttachment || '',
        });
      }

      // Populate Visa form default
      if (res.currentVisa) {
        setVisaForm({
          tradeOnVisa: res.currentVisa.tradeOnVisa,
          visaNumber: res.currentVisa.visaNumber || '',
          expiryDate: res.currentVisa.expiryDate,
          issueDate: res.currentVisa.issueDate || '',
          sponsor: res.currentVisa.sponsor || currentEmployee.employeeCompany,
          sponsorshipType: (res.currentVisa.sponsorshipType as any) || 'Corporate',
          reasonForChange: '',
          remarks: res.currentVisa.remarks || '',
          documentAttachment: res.currentVisa.documentAttachment || '',
        });
      }

      // Fetch repository doc count
      try {
        const docsRes = await apiRequest(`/api/storage/employees/${currentEmployee.employeeId}/documents`);
        if (docsRes?.documents) {
          setDocCount(docsRes.documents.length);
        }
      } catch {
        // non-fatal
      }

      // Establish baseline snapshot for unsaved change tracking
      const loadedPersonal = res.personalDetails || {
        employeeId: currentEmployee.employeeId,
        gender: 'Male',
        maritalStatus: 'Single',
        qualifications: [],
        skills: [],
        emergencyContacts: [],
      };
      const loadedEmployment = {
        employeeCompany: currentEmployee.employeeCompany,
        designation: currentEmployee.designation,
        employeeType: currentEmployee.employeeType,
        nationalityType: currentEmployee.nationalityType,
        dateOfJoining: currentEmployee.dateOfJoining,
        dateOfLeaving: currentEmployee.dateOfLeaving || '',
        isActive: currentEmployee.isActive,
        promotionReason: '',
      };
      const loadedPayroll = {
        wageType: currentEmployee.wageType,
        monthlySalaryOrRate: currentEmployee.monthlySalaryOrRate,
        wpsEmployee: currentEmployee.wpsEmployee,
        wpsSalary: currentEmployee.wpsSalary || 0,
        actualSalary: currentEmployee.actualSalary || currentEmployee.monthlySalaryOrRate,
        salaryPaidBy: currentEmployee.salaryPaidBy,
        recoverFrom: currentEmployee.recoverFrom || '',
        salaryRevisionReason: '',
      };
      const loadedBasic = {
        employeeId: currentEmployee.employeeId,
        employeeName: currentEmployee.employeeName,
        nationalityType: currentEmployee.nationalityType,
      };
      setBaselineSnapshot(serializeForms(loadedBasic, loadedPersonal, loadedEmployment, loadedPayroll));
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to load employee records.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentEmployee(employee || null);
    if (employee) {
      setBasicInfoForm({
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        nationalityType: employee.nationalityType,
      });
    } else {
      // Reset all forms cleanly for new employee onboarding
      const newBasic = {
        employeeId: '',
        employeeName: '',
        nationalityType: 'Expat' as NationalityType,
      };
      const newEmployment = {
        employeeCompany: 'DGO' as EmployeeCompany,
        designation: '',
        employeeType: 'Staff' as EmployeeType,
        nationalityType: 'Expat' as NationalityType,
        dateOfJoining: new Date().toISOString().split('T')[0],
        dateOfLeaving: '',
        isActive: true,
        promotionReason: '',
      };
      const newPayroll = {
        wageType: 'Fixed Monthly' as WageType,
        monthlySalaryOrRate: 0,
        wpsEmployee: 'No' as WPSStatus,
        wpsSalary: 0,
        actualSalary: 0,
        salaryPaidBy: 'DGO' as SalaryPaidBy,
        recoverFrom: '',
        salaryRevisionReason: '',
      };
      const newPersonal = {
        employeeId: '',
        gender: 'Male',
        maritalStatus: 'Single',
        qualifications: [],
        skills: [],
        emergencyContacts: [],
      };

      setBasicInfoForm(newBasic);
      setEmploymentForm(newEmployment);
      setPayrollForm(newPayroll);
      setPersonalForm(newPersonal);
      setComplianceData(null);
      setDocCount(0);
      setBaselineSnapshot(serializeForms(newBasic, newPersonal, newEmployment, newPayroll));
    }
    setActiveTab(initialTab);
  }, [employee, initialTab, isOpen]);

  useEffect(() => {
    if (isOpen && currentEmployee) {
      fetchCompliance();
    }
  }, [isOpen, currentEmployee?.employeeId]);

  if (!isOpen) return null;

  // UNIFIED REGISTRATION HANDLER FOR NEW EMPLOYEE
  const handleRegisterNewEmployee = async () => {
    if (!basicInfoForm.employeeId?.trim() || !basicInfoForm.employeeName?.trim()) {
      setFeedback({
        type: 'error',
        message: 'Please provide both Employee ID and Full Legal Name to register the employee.',
      });
      setActiveTab('personal');
      return;
    }

    // Validate bank details format before saving
    const bankCheck = validateBankDetails(personalForm.bankName, personalForm.bankAccountNumber, personalForm.iban);
    if (!bankCheck.isValid) {
      const errorMsg =
        bankCheck.errors.bankAccountNumber ||
        bankCheck.errors.iban ||
        'Invalid bank credentials format';
      setFeedback({
        type: 'error',
        message: `Bank Validation Error: ${errorMsg}. Please verify in Tab 1 (Personal & Banking).`,
      });
      setActiveTab('personal');
      return;
    }

    setSaving(true);
    try {
      const normalizedId = basicInfoForm.employeeId.trim().toUpperCase();
      const normName = basicInfoForm.employeeName.trim();
      const effectiveNat = basicInfoForm.nationalityType || employmentForm.nationalityType || 'Expat';

      const payload = {
        employeeId: normalizedId,
        employeeName: normName,
        nationalityType: effectiveNat,
        photoUrl: personalForm.photoUrl || undefined,
        employeeType: employmentForm.employeeType || 'Staff',
        wageType: payrollForm.wageType || 'Fixed Monthly',
        dateOfJoining: employmentForm.dateOfJoining || new Date().toISOString().split('T')[0],
        dateOfLeaving: employmentForm.dateOfLeaving || null,
        designation: (employmentForm.designation || 'Staff').trim(),
        employeeCompany: employmentForm.employeeCompany || 'DGO',
        salaryPaidBy: payrollForm.salaryPaidBy || employmentForm.employeeCompany || 'DGO',
        monthlySalaryOrRate: Number(payrollForm.monthlySalaryOrRate) || 0,
        wpsEmployee: payrollForm.wpsEmployee === 'Yes' ? 'Yes' : 'No',
        wpsSalary: Number(payrollForm.wpsSalary) || 0,
        actualSalary: Number(payrollForm.actualSalary) || Number(payrollForm.monthlySalaryOrRate) || 0,
        recoverFrom: payrollForm.recoverFrom || (payrollForm.wpsEmployee === 'Yes' ? (employmentForm.employeeCompany || 'DGO') : ''),
        isActive: employmentForm.isActive !== false,
        bankName: (personalForm.bankName || '').trim(),
        bankAccountNumber: (personalForm.bankAccountNumber || '').trim(),
        iban: (personalForm.iban || '').trim().toUpperCase(),
        bankBranch: (personalForm.bankBranch || '').trim(),
        accountHolderName: (personalForm.accountHolderName || normName).trim(),
        personalDetails: {
          ...personalForm,
          employeeId: normalizedId,
          employeeName: normName,
          nationalityType: effectiveNat,
          photoUrl: personalForm.photoUrl || undefined,
        },
      };

      const created = await apiRequest('/api/employees', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setCurrentEmployee(created);
      setFeedback({
        type: 'success',
        message: `Employee ${created.employeeId} (${created.employeeName}) registered successfully with complete profile, employment placement, and compensation records!`,
      });
      onUpdated?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to register employee.',
      });
    } finally {
      setSaving(false);
    }
  };

  // SAVE HANDLERS
  const handleSavePersonal = async () => {
    if (!currentEmployee) {
      await handleRegisterNewEmployee();
      return;
    }

    // Validate bank details format before saving
    const bankCheck = validateBankDetails(personalForm.bankName, personalForm.bankAccountNumber, personalForm.iban);
    if (!bankCheck.isValid) {
      const errorMsg =
        bankCheck.errors.bankAccountNumber ||
        bankCheck.errors.iban ||
        'Invalid bank credentials format';
      setFeedback({
        type: 'error',
        message: `Validation Error: ${errorMsg}. Please check bank account number and IBAN.`,
      });
      setActiveTab('personal');
      return;
    }

    setSaving(true);
    try {
      await apiRequest(`/api/employees/${currentEmployee.employeeId}/personal`, {
        method: 'PUT',
        body: JSON.stringify({
          ...personalForm,
          employeeName: basicInfoForm.employeeName,
          nationalityType: basicInfoForm.nationalityType,
        }),
      });

      // Synchronize currentEmployee state with updated Name / Nationality / Photo
      if (
        basicInfoForm.employeeName !== currentEmployee.employeeName ||
        basicInfoForm.nationalityType !== currentEmployee.nationalityType ||
        personalForm.photoUrl !== currentEmployee.photoUrl
      ) {
        setCurrentEmployee((prev: any) =>
          prev
            ? {
                ...prev,
                employeeName: basicInfoForm.employeeName,
                nationalityType: basicInfoForm.nationalityType,
                photoUrl: personalForm.photoUrl,
              }
            : prev
        );
      }

      setFeedback({
        type: 'success',
        message: 'Personal details, legal identity, and banking credentials saved successfully.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save personal details.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmployment = async () => {
    if (!currentEmployee) {
      await handleRegisterNewEmployee();
      return;
    }
    setSaving(true);
    try {
      const updated = await apiRequest(`/api/employees/${currentEmployee.id}`, {
        method: 'PUT',
        body: JSON.stringify(employmentForm),
      });
      setCurrentEmployee(updated);
      setBasicInfoForm((prev) => ({
        ...prev,
        nationalityType: updated.nationalityType || prev.nationalityType,
      }));
      setFeedback({
        type: 'success',
        message: 'Employment and organizational placement saved successfully.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update employment details.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayroll = async () => {
    if (!currentEmployee) {
      await handleRegisterNewEmployee();
      return;
    }
    setSaving(true);
    try {
      const updated = await apiRequest(`/api/employees/${currentEmployee.id}`, {
        method: 'PUT',
        body: JSON.stringify(payrollForm),
      });
      setCurrentEmployee(updated);
      setFeedback({
        type: 'success',
        message: 'Compensation, remuneration rates and WPS parameters saved successfully.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update compensation.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCivilId = async (isRenewal: boolean) => {
    if (!currentEmployee) return;
    setSaving(true);
    try {
      if (isRenewal) {
        await apiRequest(`/api/employees/${currentEmployee.employeeId}/civil-id/renew`, {
          method: 'POST',
          body: JSON.stringify(cidForm),
        });
      } else {
        await apiRequest(`/api/employees/${currentEmployee.employeeId}/civil-id`, {
          method: 'POST',
          body: JSON.stringify(cidForm),
        });
      }
      setIsRenewCidOpen(false);
      setFeedback({
        type: 'success',
        message: isRenewal
          ? 'Civil ID renewed successfully and archived in version history.'
          : 'Civil ID record established successfully.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save Civil ID.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDrivingLicence = async (isRenewal: boolean) => {
    if (!currentEmployee) return;
    setSaving(true);
    try {
      if (isRenewal) {
        await apiRequest(`/api/employees/${currentEmployee.employeeId}/driving-licence/renew`, {
          method: 'POST',
          body: JSON.stringify(dlForm),
        });
      } else {
        await apiRequest(`/api/employees/${currentEmployee.employeeId}/driving-licence`, {
          method: 'POST',
          body: JSON.stringify(dlForm),
        });
      }
      setIsRenewDlOpen(false);
      setFeedback({
        type: 'success',
        message: isRenewal
          ? 'Driving licence renewed and archived.'
          : 'Driving licence record established.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save Driving Licence.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVisa = async (isRenewal: boolean) => {
    if (!currentEmployee) return;
    setSaving(true);
    try {
      if (isRenewal) {
        await apiRequest(`/api/employees/${currentEmployee.employeeId}/visa/renew`, {
          method: 'POST',
          body: JSON.stringify(visaForm),
        });
      } else {
        await apiRequest(`/api/employees/${currentEmployee.employeeId}/visa`, {
          method: 'POST',
          body: JSON.stringify(visaForm),
        });
      }
      setIsRenewVisaOpen(false);
      setFeedback({
        type: 'success',
        message: isRenewal
          ? 'Visa & registered trade updated and archived.'
          : 'Visa record established.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save Visa record.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddGovtDoc = async () => {
    if (!currentEmployee) return;
    setSaving(true);
    try {
      await apiRequest(`/api/employees/${currentEmployee.employeeId}/government-documents`, {
        method: 'POST',
        body: JSON.stringify(newGovtDoc),
      });
      setIsAddGovtDocOpen(false);
      setNewGovtDoc({
        documentType: 'Passport' as any,
        documentNumber: '',
        expiryDate: '',
        issueDate: '',
        issuingAuthority: '',
        country: 'Oman',
        remarks: '',
        documentAttachment: '',
      });
      setFeedback({
        type: 'success',
        message: 'Government document / passport registered successfully.',
      });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to add document.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGovtDoc = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this government document record?')) return;
    try {
      await apiRequest(`/api/employees/${currentEmployee?.employeeId}/government-documents/${docId}`, {
        method: 'DELETE',
      });
      setFeedback({ type: 'success', message: 'Document record deleted.' });
      fetchCompliance();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete document.' });
    }
  };

  const handlePreviewDocument = (docUrl: string, fileName?: string) => {
    setPreviewModal({
      isOpen: true,
      url: buildStorageFileUrl(docUrl) || docUrl,
      fileName: fileName || 'Document',
      title: fileName || 'Document Preview',
    });
  };

  const isModalMode = mode === 'modal';

  const renderContent = () => (
    <div
      className={`bg-white rounded-2xl shadow-xl border border-slate-200 w-full overflow-hidden flex flex-col ${
        isModalMode ? 'max-w-5xl max-h-[92vh]' : 'shadow-xs border-slate-200'
      }`}
    >
      {/* Header Bar */}
      <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {backLabel && (
            <button
              onClick={handleSafeClose}
              className="mr-2 text-slate-400 hover:text-white flex items-center gap-1 text-xs font-semibold cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>{backLabel}</span>
            </button>
          )}
          {currentEmployee?.photoUrl || personalForm?.photoUrl ? (
            <img
              src={currentEmployee?.photoUrl || personalForm?.photoUrl}
              alt={currentEmployee?.employeeName || basicInfoForm?.employeeName || 'Profile'}
              className="w-9 h-9 rounded-xl object-cover border border-slate-700 shadow-xs"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              {currentEmployee?.employeeName || basicInfoForm?.employeeName ? (
                (currentEmployee?.employeeName || basicInfoForm?.employeeName || '')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n: string) => n[0])
                  .join('')
                  .toUpperCase()
              ) : (
                <User size={18} />
              )}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">
                {currentEmployee
                  ? `${currentEmployee.employeeName} (${currentEmployee.employeeId})`
                  : 'New Employee Profile & Identification'}
              </h2>
              {currentEmployee && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                  {currentEmployee.employeeCompany} • {currentEmployee.designation}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Professional HR Record, Statutory Identification &amp; 360° Compliance Dossier
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentEmployee && (
            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print Single-Page Summary Dossier"
            >
              <Printer size={13} className="text-blue-400" />
              <span>Print Dossier</span>
            </button>
          )}
          {isModalMode && (
            <button
              onClick={handleSafeClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`px-6 py-3 text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-b border-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Category Navigation Tabs */}
      <div className="flex items-center px-6 border-b border-slate-200 bg-slate-50 gap-1 overflow-x-auto shrink-0">
        {/* TAB 1: PERSONAL INFORMATION (FIRST TAB!) */}
        <button
          type="button"
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'personal'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <User size={15} />
          <span>Personal Information</span>
        </button>

        {/* TAB 2: EMPLOYMENT & ORGANIZATION */}
        <button
          type="button"
          onClick={() => setActiveTab('employment')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'employment'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Building size={15} />
          <span>Employment &amp; Organization</span>
        </button>

        {/* TAB 3: COMPENSATION & WPS */}
        <button
          type="button"
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'payroll'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <CreditCard size={15} />
          <span>Compensation &amp; WPS</span>
        </button>

        {/* TAB 4: CIVIL ID */}
        <button
          type="button"
          onClick={() => setActiveTab('civil-id')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
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

        {/* TAB 5: DRIVING LICENCE */}
        <button
          type="button"
          onClick={() => setActiveTab('driving-licence')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
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

        {/* TAB 6: VISA & TRADE */}
        {((currentEmployee ? currentEmployee.nationalityType : (basicInfoForm.nationalityType || employmentForm.nationalityType || 'Expat')) === 'Expat') && (
          <button
            type="button"
            onClick={() => setActiveTab('visa')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'visa'
                ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <FileCheck size={15} />
            <span>Visa &amp; Trade Details</span>
            {complianceData?.currentVisa && (
              <ComplianceBadge status={complianceData.currentVisa.status} size="sm" />
            )}
          </button>
        )}

        {/* TAB 7: GOVT DOCS */}
        <button
          type="button"
          onClick={() => setActiveTab('govt-docs')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'govt-docs'
              ? 'border-blue-600 text-blue-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <FileText size={15} />
          <span>Government Documents &amp; Passports</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
            {complianceData?.governmentDocuments?.length || 0}
          </span>
        </button>

        {/* TAB 8: DOCUMENTS REPOSITORY */}
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'documents'
              ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <FolderOpen size={15} className="text-indigo-600" />
          <span>Document Repository &amp; Storage</span>
          <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
            {docCount || complianceData?.governmentDocuments?.length || 0}
          </span>
        </button>
      </div>

      {/* Content Body */}
      <div
        className={`p-6 bg-slate-50/50 flex-1 ${
          isModalMode ? 'overflow-y-auto max-h-[calc(92vh-160px)]' : ''
        }`}
      >
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs">Loading employee verification &amp; document records...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: PERSONAL INFORMATION */}
            {activeTab === 'personal' && (
              <PersonalInformationTab
                employee={currentEmployee}
                personalForm={personalForm}
                setPersonalForm={setPersonalForm}
                canWrite={canWrite}
                saving={saving}
                onSave={handleSavePersonal}
                isNewEmployee={!currentEmployee}
                basicInfoForm={basicInfoForm}
                setBasicInfoForm={setBasicInfoForm}
                onContinueToEmployment={() => setActiveTab('employment')}
                complianceData={complianceData}
                onDocumentUploaded={fetchCompliance}
              />
            )}

            {/* TAB 2: EMPLOYMENT & ORGANIZATION */}
            {activeTab === 'employment' && (
              <EmploymentPlacementTab
                employee={currentEmployee}
                employmentForm={employmentForm}
                setEmploymentForm={setEmploymentForm}
                canWrite={canWrite}
                saving={saving}
                onSave={handleSaveEmployment}
                designationHistory={complianceData?.designationHistory || []}
                onContinueToCompensation={() => setActiveTab('payroll')}
                isNewEmployee={!currentEmployee}
                basicInfoForm={basicInfoForm}
                setBasicInfoForm={setBasicInfoForm}
                onNavigateToPersonal={() => setActiveTab('personal')}
              />
            )}

            {/* TAB 3: COMPENSATION & WPS */}
            {activeTab === 'payroll' && (
              <CompensationWpsTab
                employee={currentEmployee}
                payrollForm={payrollForm}
                setPayrollForm={setPayrollForm}
                canWrite={canWrite}
                saving={saving}
                onSave={handleSavePayroll}
                salaryHistory={complianceData?.salaryHistory || []}
                bankDetails={{
                  bankName: personalForm.bankName || currentEmployee?.bankName,
                  bankAccountNumber: personalForm.bankAccountNumber || currentEmployee?.bankAccountNumber,
                  iban: personalForm.iban || currentEmployee?.iban,
                  bankBranch: personalForm.bankBranch || currentEmployee?.bankBranch,
                  accountHolderName: personalForm.accountHolderName || currentEmployee?.accountHolderName,
                }}
                onNavigateToPersonal={() => setActiveTab('personal')}
                onCompleteEmployee={handleRegisterNewEmployee}
                isNewEmployee={!currentEmployee}
                basicInfoForm={basicInfoForm}
              />
            )}

            {/* TAB 4: CIVIL ID */}
            {activeTab === 'civil-id' && (
              currentEmployee ? (
                <CivilIdTab
                  employee={currentEmployee}
                  currentCivilId={complianceData?.currentCivilId || null}
                  canWrite={canWrite}
                  onOpenRenewModal={() => setIsRenewCidOpen(true)}
                  onOpenHistoryModal={() =>
                    setHistoryModalState({
                      isOpen: true,
                      category: 'civil-id',
                      title: 'Civil ID Document Lifecycle & Audit Trail',
                    })
                  }
                  onPreviewDocument={handlePreviewDocument}
                />
              ) : (
                <PendingRegistrationCallout
                  tabName="Civil ID / Resident ID"
                  onGoToPersonal={() => setActiveTab('personal')}
                  onRegister={handleRegisterNewEmployee}
                  saving={saving}
                />
              )
            )}

            {/* TAB 5: DRIVING LICENCE */}
            {activeTab === 'driving-licence' && (
              currentEmployee ? (
                <DrivingLicenceTab
                  employee={currentEmployee}
                  currentDrivingLicence={complianceData?.currentDrivingLicence || null}
                  canWrite={canWrite}
                  onOpenRenewModal={() => setIsRenewDlOpen(true)}
                  onOpenHistoryModal={() =>
                    setHistoryModalState({
                      isOpen: true,
                      category: 'driving-licence',
                      title: 'Driving Licence Document Lifecycle & Audit Trail',
                    })
                  }
                  onPreviewDocument={handlePreviewDocument}
                />
              ) : (
                <PendingRegistrationCallout
                  tabName="Driving Licence"
                  onGoToPersonal={() => setActiveTab('personal')}
                  onRegister={handleRegisterNewEmployee}
                  saving={saving}
                />
              )
            )}

            {/* TAB 6: VISA & TRADE */}
            {activeTab === 'visa' && (
              currentEmployee ? (
                <VisaTradeTab
                  employee={currentEmployee}
                  currentVisa={complianceData?.currentVisa || null}
                  canWrite={canWrite}
                  onOpenRenewModal={() => setIsRenewVisaOpen(true)}
                  onOpenHistoryModal={() =>
                    setHistoryModalState({
                      isOpen: true,
                      category: 'visa',
                      title: 'Employment Visa Document Lifecycle & Audit Trail',
                    })
                  }
                  onPreviewDocument={handlePreviewDocument}
                />
              ) : (
                <PendingRegistrationCallout
                  tabName="Employment Visa & Trade"
                  onGoToPersonal={() => setActiveTab('personal')}
                  onRegister={handleRegisterNewEmployee}
                  saving={saving}
                />
              )
            )}

            {/* TAB 7: GOVERNMENT DOCUMENTS */}
            {activeTab === 'govt-docs' && (
              currentEmployee ? (
                <GovernmentDocsTab
                  employee={currentEmployee}
                  governmentDocuments={complianceData?.governmentDocuments || []}
                  canWrite={canWrite}
                  onOpenAddDocModal={() => setIsAddGovtDocOpen(true)}
                  onDeleteDoc={handleDeleteGovtDoc}
                  onPreviewDocument={handlePreviewDocument}
                />
              ) : (
                <PendingRegistrationCallout
                  tabName="Government Documents & Passports"
                  onGoToPersonal={() => setActiveTab('personal')}
                  onRegister={handleRegisterNewEmployee}
                  saving={saving}
                />
              )
            )}

            {/* TAB 8: DOCUMENT REPOSITORY & STORAGE */}
            {activeTab === 'documents' && (
              currentEmployee ? (
                <EmployeeDocumentRepository
                  employeeId={currentEmployee.employeeId}
                  employeeName={currentEmployee.employeeName}
                  designation={currentEmployee.designation}
                  company={currentEmployee.employeeCompany}
                  canUpload={canWrite}
                />
              ) : (
                <PendingRegistrationCallout
                  tabName="Encrypted Document Repository"
                  onGoToPersonal={() => setActiveTab('personal')}
                  onRegister={handleRegisterNewEmployee}
                  saving={saving}
                />
              )
            )}
          </>
        )}
      </div>

      {/* Footer Close Button in Modal Mode */}
      {isModalMode && (
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            {currentEmployee ? (
              <span>
                Employee ID: <strong className="font-mono text-slate-700">{currentEmployee.employeeId}</strong> • Status: {currentEmployee.isActive ? 'Active' : 'Inactive'}
              </span>
            ) : (
              <span>Registration Mode</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Dossier
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {isModalMode ? (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleSafeClose();
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          {renderContent()}
        </div>
      ) : (
        renderContent()
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {previewModal.isOpen && (
        <DocumentPreviewModal
          isOpen={previewModal.isOpen}
          onClose={() => setPreviewModal({ isOpen: false })}
          documentUrl={previewModal.url}
          fileName={previewModal.fileName}
          title={previewModal.title}
          documentType={previewModal.documentType}
          documentNumber={previewModal.documentNumber}
          employeeName={currentEmployee?.employeeName || ''}
          employeeId={currentEmployee?.employeeId || ''}
          expiryDate={previewModal.expiryDate}
          status={previewModal.status}
          remarks={previewModal.remarks}
        />
      )}

      {/* DOCUMENT HISTORY MODAL */}
      {historyModalState.isOpen && currentEmployee && (
        <DocumentHistoryModal
          isOpen={historyModalState.isOpen}
          onClose={() =>
            setHistoryModalState((prev) => ({ ...prev, isOpen: false }))
          }
          employeeId={currentEmployee.employeeId}
          employeeName={currentEmployee.employeeName}
          category={historyModalState.category}
          title={historyModalState.title}
        />
      )}

      {/* RENEW CIVIL ID MODAL */}
      {isRenewCidOpen && currentEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {complianceData?.currentCivilId ? 'Renew Civil ID Card' : 'Create Civil ID Record'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRenewCidOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
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

              {/* Document File Attachment Upload */}
              <div className="pt-2 border-t border-slate-200">
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Civil ID / Resident ID Document Attachment (Scan / PDF / Photo)
                </label>
                <FileUploadComponent
                  employeeId={currentEmployee.employeeId}
                  category="Civil ID"
                  title="Upload / Replace Civil ID Document File"
                  autoSyncCompliance={true}
                  onUploadSuccess={(res) => {
                    setCidForm((prev) => ({ ...prev, documentAttachment: res.fileUrl }));
                  }}
                />
                {cidForm.documentAttachment && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Document attachment linked: {cidForm.documentAttachment}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRenewCidOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveCivilId(Boolean(complianceData?.currentCivilId))}
                disabled={saving || !cidForm.civilIdNumber || !cidForm.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Processing...' : 'Confirm & Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEW / ADD DRIVING LICENCE MODAL */}
      {isRenewDlOpen && currentEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {complianceData?.currentDrivingLicence ? 'Renew Driving Licence' : 'Add Driving Licence'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRenewDlOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
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
                      className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                    >
                      + Add Category
                    </button>
                  </div>
                  <select
                    value={dlForm.category}
                    onChange={(e) => setDlForm({ ...dlForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium bg-white"
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

              {/* Driving Licence File Attachment Upload */}
              <div className="pt-2 border-t border-slate-200">
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Driving Licence Document Attachment (Scan / PDF / Photo)
                </label>
                <FileUploadComponent
                  employeeId={currentEmployee.employeeId}
                  category="Driving Licence"
                  title="Upload / Replace Driving Licence Document File"
                  autoSyncCompliance={true}
                  onUploadSuccess={(res) => {
                    setDlForm((prev) => ({ ...prev, documentAttachment: res.fileUrl }));
                  }}
                />
                {dlForm.documentAttachment && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Document attachment linked: {dlForm.documentAttachment}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRenewDlOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveDrivingLicence(Boolean(complianceData?.currentDrivingLicence))}
                disabled={saving || !dlForm.licenceNumber || !dlForm.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Processing...' : 'Save Licence'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEW VISA / AMEND TRADE MODAL */}
      {isRenewVisaOpen && currentEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {complianceData?.currentVisa ? 'Renew Visa / Amend Trade on Visa' : 'Create Employment Visa Record'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRenewVisaOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
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

              {/* Visa Document File Attachment Upload */}
              <div className="pt-2 border-t border-slate-200">
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Visa Document Attachment (Ministry of Labour Visa Stamp / Resident Card / PDF)
                </label>
                <FileUploadComponent
                  employeeId={currentEmployee.employeeId}
                  category="Visa"
                  title="Upload / Replace Visa Document File"
                  autoSyncCompliance={true}
                  onUploadSuccess={(res) => {
                    setVisaForm((prev) => ({ ...prev, documentAttachment: res.fileUrl }));
                  }}
                />
                {visaForm.documentAttachment && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Document attachment linked: {visaForm.documentAttachment}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRenewVisaOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveVisa(Boolean(complianceData?.currentVisa))}
                disabled={saving || !visaForm.tradeOnVisa || !visaForm.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? 'Processing...' : 'Save Visa & Trade'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD GOVERNMENT DOCUMENT MODAL */}
      {isAddGovtDocOpen && currentEmployee && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Government Document / Passport</h3>
              <button
                type="button"
                onClick={() => setIsAddGovtDocOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium bg-white"
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

              {/* Document File Attachment Upload */}
              <div className="pt-2 border-t border-slate-200">
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Document Attachment Scan / PDF
                </label>
                <FileUploadComponent
                  employeeId={currentEmployee.employeeId}
                  category={
                    newGovtDoc.documentType === 'Passport'
                      ? 'Passport'
                      : newGovtDoc.documentType === 'Work Permit'
                      ? 'Labour Card'
                      : newGovtDoc.documentType === 'Employment Contract'
                      ? 'Contract'
                      : 'Other'
                  }
                  title="Upload Document File"
                  autoSyncCompliance={true}
                  onUploadSuccess={(res) => {
                    setNewGovtDoc((prev) => ({ ...prev, documentAttachment: res.fileUrl }));
                  }}
                />
                {newGovtDoc.documentAttachment && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">
                    ✓ Document attachment linked: {newGovtDoc.documentAttachment}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddGovtDocOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddGovtDoc}
                disabled={saving || !newGovtDoc.documentNumber || !newGovtDoc.expiryDate}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
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
              <button
                type="button"
                onClick={() => setIsAddCategoryOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
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
                type="button"
                onClick={() => setIsAddCategoryOpen(false)}
                className="px-3 py-1 bg-slate-200 text-slate-700 rounded-md text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newCategoryName.trim() && !licenceCategories.includes(newCategoryName.trim())) {
                    setLicenceCategories([...licenceCategories, newCategoryName.trim()]);
                    setDlForm({ ...dlForm, category: newCategoryName.trim() as any });
                  }
                  setIsAddCategoryOpen(false);
                  setNewCategoryName('');
                }}
                disabled={!newCategoryName.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dedicated Employee Summary Print Modal */}
      {currentEmployee && (
        <EmployeeSummaryPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          employee={currentEmployee}
          personalDetails={personalForm}
          complianceData={complianceData}
        />
      )}

      {/* DISCARD CHANGES CONFIRMATION DIALOG */}
      {showDiscardConfirm && (
        <div
          id="discard-changes-modal"
          className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Discard Unsaved Changes?
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  You have unsaved edits in this employee record. If you navigate away now, any modifications made will be lost.
                </p>
                {dirtySections.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">Modified:</span>
                    {dirtySections.map((sec) => (
                      <span
                        key={sec}
                        className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200/70"
                      >
                        {sec}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                id="btn-keep-editing"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                id="btn-discard-confirm"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors cursor-pointer"
              >
                Discard Changes
              </button>
              <button
                type="button"
                id="btn-save-exit"
                disabled={saving}
                onClick={async () => {
                  try {
                    if (!currentEmployee) {
                      await handleRegisterNewEmployee();
                    } else if (activeTab === 'personal') {
                      await handleSavePersonal();
                    } else if (activeTab === 'employment') {
                      await handleSaveEmployment();
                    } else if (activeTab === 'payroll') {
                      await handleSavePayroll();
                    } else {
                      await handleSavePersonal();
                    }
                    setShowDiscardConfirm(false);
                    onClose();
                  } catch {
                    // keep dialog open on error
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Save size={13} />
                <span>Save &amp; Exit</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
