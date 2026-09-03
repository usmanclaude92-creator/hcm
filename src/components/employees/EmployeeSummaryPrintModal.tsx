import React, { useRef } from 'react';
import {
  Printer,
  Download,
  X,
  User,
  ShieldCheck,
  Building,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Briefcase,
  HeartHandshake,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { formatOMR, formatDate } from '../../api/client';
import { generateEmployeeSummaryPdf, EmployeeSummaryPdfData } from '../../utils/employeePdfSummary';
import type { Employee, EmployeePersonalDetails } from '../../types/index';

interface EmployeeSummaryPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  personalDetails?: EmployeePersonalDetails | null;
  complianceData?: any;
  summaryStats?: {
    totalSalaryDrawn?: number;
    outstandingSalary?: number;
    outstandingLoan?: number;
    totalLoanTaken?: number;
    totalLoanRecovered?: number;
  };
  currentProject?: string;
}

function calculateAge(dobString?: string): number | null {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export const EmployeeSummaryPrintModal: React.FC<EmployeeSummaryPrintModalProps> = ({
  isOpen,
  onClose,
  employee,
  personalDetails,
  complianceData,
  summaryStats,
  currentProject,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !employee) return null;

  const personal = complianceData?.personalDetails || personalDetails || {};
  const dob = personal?.dateOfBirth || personal?.dob;
  const age = calculateAge(dob);
  const mobile = personal?.mobileNumber || personal?.whatsappNumber || personal?.mobile;
  const email = personal?.personalEmail || personal?.email;
  const address = personal?.residentialAddress || personal?.currentAddress;

  const primaryEmergency = Array.isArray(personal?.emergencyContacts) && personal.emergencyContacts.length > 0
    ? personal.emergencyContacts.find((c: any) => c.isPrimary) || personal.emergencyContacts[0]
    : null;
  const emergencyName = primaryEmergency?.name || personal?.emergencyContactName;
  const emergencyRelation = primaryEmergency?.relationship || personal?.emergencyContactRelation;
  const emergencyPhone = primaryEmergency?.contactNumber || personal?.emergencyContactPhone;

  // Statutory Documents
  const civilIdDoc = complianceData?.currentCivilId;
  const civilIdNumber = civilIdDoc?.civilIdNumber || personal?.civilIdNumber || '—';
  const civilIdExpiry = civilIdDoc?.expiryDate ? formatDate(civilIdDoc.expiryDate) : '—';
  const civilIdStatus = civilIdDoc?.status || 'Valid';

  const passportDoc = (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Passport');
  const passportNumber = passportDoc?.documentNumber || personal?.passportNumber || '—';
  const passportExpiry = passportDoc?.expiryDate ? formatDate(passportDoc.expiryDate) : '—';
  const passportStatus = passportDoc?.status || 'Valid';

  const visaDoc = complianceData?.currentVisa || (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Visa');
  const visaNumber = visaDoc?.visaNumber || visaDoc?.documentNumber || personal?.visaNumber || '—';
  const visaExpiry = visaDoc?.expiryDate ? formatDate(visaDoc.expiryDate) : '—';
  const visaStatus = visaDoc?.status || 'Valid';

  const dlDoc = complianceData?.currentDrivingLicence || (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Driving Licence');
  const dlNumber = dlDoc?.licenceNumber || dlDoc?.documentNumber || personal?.drivingLicenceNumber;
  const dlExpiry = dlDoc?.expiryDate ? formatDate(dlDoc.expiryDate) : '—';

  const empAny = employee as any;
  const assignedProject = currentProject || empAny.currentProject || empAny.project || 'Headquarters';
  const basicSalary = empAny.basicSalary ?? employee.monthlySalaryOrRate ?? 0;
  const grossSalary = empAny.grossSalary ?? employee.actualSalary ?? employee.monthlySalaryOrRate ?? 0;
  const bankName = empAny.bankName || empAny.bank || '—';
  const accountNumber = empAny.accountNumber || empAny.accountNo || empAny.iban || '—';

  const handleDownloadPdf = () => {
    const pdfData: EmployeeSummaryPdfData = {
      employee,
      personalDetails,
      complianceData,
      summaryStats,
      currentProject,
    };
    const doc = generateEmployeeSummaryPdf(pdfData);
    doc.save(`Employee_Summary_${employee.employeeId}_${employee.employeeName.replace(/\s+/g, '_')}.pdf`);
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      {/* Modal Container */}
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Modal Header & Controls (Hidden in Print) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Printer size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Personal Information Summary Dossier</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">
                  {employee.employeeId}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Single-page employee profile summary with demographic details, summary stats, and statutory compliance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Download size={14} />
              <span>Download PDF</span>
            </button>
            <button
              onClick={handleBrowserPrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 flex justify-center">
          {/* Exact A4 Document Sheet Representation */}
          <div
            ref={printAreaRef}
            id="employee-summary-printable"
            className="employee-printable-summary w-full max-w-[210mm] bg-white border border-slate-300 sm:rounded-xl shadow-lg p-6 sm:p-8 space-y-4 text-slate-800"
            style={{ minHeight: '270mm' }}
          >
            {/* 1. Header Banner */}
            <div className="border-b-2 border-blue-900 pb-3 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center font-black text-sm">
                    A
                  </div>
                  <div>
                    <h1 className="text-base font-black text-blue-950 tracking-tight leading-none uppercase">
                      Artify Engineering &amp; Contracting LLC
                    </h1>
                    <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mt-0.5">
                      Confidential Employee Profile &amp; Statutory Record
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-right text-[11px]">
                <div className="font-bold text-blue-900">REF: HR-EMP-{employee.employeeId}</div>
                <div className="text-slate-500 text-[10px]">Date: {todayFormatted}</div>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                    employee.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {employee.isActive ? 'Active Employee' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* 2. Employee Hero Profile Block */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* Photo Box */}
              <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-900 text-white flex flex-col items-center justify-center font-bold text-2xl shadow-sm shrink-0 border-2 border-white">
                {(employee.employeeName || 'EMP')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()}
              </div>

              {/* Core Details */}
              <div className="flex-1 text-center sm:text-left space-y-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h2 className="text-lg font-bold text-slate-900">{employee.employeeName}</h2>
                  <span className="font-mono font-bold text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200 inline-block">
                    {employee.employeeId}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-700 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span>{employee.designation || 'Staff'}</span>
                  <span>•</span>
                  <span>{employee.employeeCompany || 'Artify Group'}</span>
                  <span>•</span>
                  <span>{employee.nationalityType || '—'}</span>
                  <span>•</span>
                  <span>{employee.employeeType || 'Direct'}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Assigned Project / Worksite: <strong className="text-slate-800">{assignedProject}</strong>
                </p>
              </div>
            </div>

            {/* 3. Summary Stats KPI Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-center">
                <div className="text-[9px] font-bold text-slate-500 uppercase">Basic Salary</div>
                <div className="text-xs font-bold text-blue-900 mt-0.5">OMR {formatOMR(basicSalary)}</div>
              </div>
              <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-center">
                <div className="text-[9px] font-bold text-slate-500 uppercase">Gross Salary</div>
                <div className="text-xs font-bold text-blue-900 mt-0.5">OMR {formatOMR(grossSalary)}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <div className="text-[9px] font-bold text-slate-500 uppercase">Salary Drawn</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">OMR {formatOMR(summaryStats?.totalSalaryDrawn || 0)}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <div className="text-[9px] font-bold text-slate-500 uppercase">Outstanding Salary</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">OMR {formatOMR(summaryStats?.outstandingSalary || 0)}</div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <div className="text-[9px] font-bold text-slate-500 uppercase">Outstanding Loan</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">OMR {formatOMR(summaryStats?.outstandingLoan || 0)}</div>
              </div>
            </div>

            {/* 4. Structured Information Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Section 1: Personal & Demographic Info */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-blue-900 text-white px-3 py-1.5 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <User size={13} />
                  <span>1. Personal &amp; Demographic Profile</span>
                </div>
                <div className="p-3 space-y-1.5 bg-white">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Father's Name:</span>
                    <span className="font-semibold text-slate-800">
                      {personal?.fatherName || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Date of Birth &amp; Age:</span>
                    <span className="font-semibold text-slate-800">
                      {dob ? `${formatDate(dob)} ${age !== null ? `(${age} yrs)` : ''}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Gender / Marital Status:</span>
                    <span className="font-semibold text-slate-800">
                      {personal?.gender || 'Male'} • {personal?.maritalStatus || 'Single'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Blood Group:</span>
                    <span className="font-bold text-rose-700 px-1.5 py-0.2 bg-rose-50 rounded text-[11px]">
                      {personal?.bloodGroup || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Mobile Phone:</span>
                    <span className="font-mono font-semibold text-slate-800">{mobile || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Personal Email:</span>
                    <span className="font-medium text-slate-800">{email || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Residential Address:</span>
                    <span className="text-right text-[11px] text-slate-700 max-w-[200px]">{address || '—'}</span>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span className="text-slate-500">Emergency Contact:</span>
                    <span className="text-right text-[11px] font-semibold text-slate-800">
                      {emergencyName ? `${emergencyName} (${emergencyRelation || 'Contact'}) - ${emergencyPhone || ''}` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Employment & Payroll */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-blue-900 text-white px-3 py-1.5 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase size={13} />
                  <span>2. Employment &amp; Payroll Setup</span>
                </div>
                <div className="p-3 space-y-1.5 bg-white">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Employment Status:</span>
                    <span className={`font-semibold ${employee.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {employee.isActive ? 'Active Employee' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Date of Joining:</span>
                    <span className="font-semibold text-slate-800">
                      {employee.dateOfJoining ? formatDate(employee.dateOfJoining) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Employee Company:</span>
                    <span className="font-semibold text-slate-800">{employee.employeeCompany || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Salary Paid By:</span>
                    <span className="font-semibold text-slate-800">{employee.salaryPaidBy || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Wage Type &amp; WPS:</span>
                    <span className="font-semibold text-slate-800">
                      {employee.wageType || 'Monthly'} • {employee.wpsEmployee === 'Yes' ? 'WPS Compliant' : 'Non-WPS'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-500">Bank Name:</span>
                    <span className="font-semibold text-slate-800">{bankName}</span>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span className="text-slate-500">Account Number / IBAN:</span>
                    <span className="font-mono text-slate-800">{accountNumber}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Statutory Identification Matrix */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <div className="bg-blue-900 text-white px-3 py-1.5 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={13} />
                <span>3. Statutory Documents &amp; Expiry Compliance</span>
              </div>
              <div className="p-3 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Civil ID / National ID</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">{civilIdNumber}</div>
                    <div className="text-[10px] text-slate-600 mt-1 flex justify-between">
                      <span>Expiry: {civilIdExpiry}</span>
                      <span className="font-bold text-emerald-700">{civilIdStatus}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Passport</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">{passportNumber}</div>
                    <div className="text-[10px] text-slate-600 mt-1 flex justify-between">
                      <span>Expiry: {passportExpiry}</span>
                      <span className="font-bold text-emerald-700">{passportStatus}</span>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Visa / Work Permit</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">{visaNumber}</div>
                    <div className="text-[10px] text-slate-600 mt-1 flex justify-between">
                      <span>Expiry: {visaExpiry}</span>
                      <span className="font-bold text-emerald-700">{visaStatus}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Authorization & Verification Sign-Off Footer */}
            <div className="pt-2">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="text-[10px] font-bold text-slate-700 uppercase">Prepared &amp; Verified By:</div>
                  <div className="text-[10px] text-slate-500 mt-1">HR &amp; Personnel Records Department</div>
                  <div className="mt-6 border-b border-slate-300 w-3/4"></div>
                  <div className="text-[9px] text-slate-400 mt-1">Signature &amp; Stamp • Date: {todayFormatted}</div>
                </div>

                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  <div className="text-[10px] font-bold text-slate-700 uppercase">Employee Acknowledgment:</div>
                  <div className="text-[10px] text-slate-500 mt-1">I certify the accuracy of the demographic data above.</div>
                  <div className="mt-6 border-b border-slate-300 w-3/4"></div>
                  <div className="text-[9px] text-slate-400 mt-1">Employee Signature • Date: _________________</div>
                </div>
              </div>
              <div className="text-center text-[9px] text-slate-400 mt-3 italic">
                This document is a certified digital extract generated from the central enterprise payroll &amp; personnel database. Page 1 of 1
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
