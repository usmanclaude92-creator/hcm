export type UserRole = 'Administrator' | 'Payroll Manager' | 'Payroll User' | 'Viewer';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export type EmployeeType = 'Worker' | 'Staff';
export type NationalityType = 'Omani' | 'Expat';
export type WageType = 'Per Hour' | 'Fixed Monthly';
export type EmployeeCompany = 'DGO' | 'SMI' | 'NC' | 'Supplier' | 'Azad';
export type SalaryPaidBy = 'DGO' | 'SMI' | 'NC' | 'Supplier';
export type WPSStatus = 'Yes' | 'No';
export type DocumentExpiryStatus = 'Valid' | 'Expiring Soon' | 'Urgent' | 'Expired' | 'Missing';
export type OverallComplianceStatus = 'Compliant' | 'Attention Required' | 'Critical / Expired';

export type DrivingLicenceCategory =
  | 'Light Vehicle'
  | 'Heavy Vehicle'
  | 'Motorcycle'
  | 'Bus'
  | 'Truck'
  | 'Heavy Equipment'
  | 'Other'
  | string;

export interface EmployeeCivilId {
  id: string;
  employeeId: string;
  civilIdNumber: string;
  issueDate: string;
  expiryDate: string;
  status: DocumentExpiryStatus;
  issuingAuthority: string;
  country: string;
  documentAttachment?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
  remarks?: string;
  isCurrent: boolean;
  replacedDate?: string | null;
  replaceReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDrivingLicence {
  id: string;
  employeeId: string;
  licenceNumber: string;
  category: DrivingLicenceCategory;
  issuingCountry: string;
  issuingAuthority: string;
  vehicleClass?: string;
  restrictions?: string;
  bloodGroupOnLicence?: string;
  issueDate: string;
  expiryDate: string;
  status: DocumentExpiryStatus;
  documentAttachment?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
  remarks?: string;
  isCurrent: boolean;
  previousLicenceId?: string | null;
  renewalDate?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeVisa {
  id: string;
  employeeId: string;
  visaNumber: string;
  tradeOnVisa: string;
  visaProfessionCode?: string;
  visaType: string;
  issueDate: string;
  expiryDate: string;
  sponsor: string;
  sponsorshipType?: string;
  issuingAuthority: string;
  country: string;
  status: DocumentExpiryStatus;
  documentAttachment?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
  remarks?: string;
  isCurrent: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reasonForChange?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type GovernmentDocumentType =
  | 'Passport'
  | 'Residence Card'
  | 'Work Permit'
  | 'Employment Contract'
  | 'Certification'
  | 'Other';

export interface EmployeeGovernmentDocument {
  id: string;
  employeeId: string;
  documentType: GovernmentDocumentType;
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  issuingAuthority?: string;
  country?: string;
  status: DocumentExpiryStatus;
  documentAttachment?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
  remarks?: string;
  isCurrent: boolean;
  replaceReason?: string | null;
  replacedDate?: string | null;
  previousDocId?: string | null;
  version?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentHistoryPayload {
  employeeId: string;
  employeeName: string;
  designation: string;
  employeeCompany: string;
  nationalityType: string;
  civilIdHistory: EmployeeCivilId[];
  drivingLicenceHistory: EmployeeDrivingLicence[];
  visaHistory: EmployeeVisa[];
  governmentDocumentsHistory: EmployeeGovernmentDocument[];
  repositoryDocuments: EmployeeDocument[];
}

export type EmployeeDocumentCategory =
  | 'civil-id'
  | 'driving-licence'
  | 'visa'
  | 'passport'
  | 'govt-docs'
  | 'contract'
  | 'education'
  | 'medical'
  | 'general'
  | 'receipt';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  documentType: string;
  category: EmployeeDocumentCategory;
  title: string;
  documentNumber?: string;
  fileName: string;
  storagePath: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: DocumentExpiryStatus;
  remarks?: string;
  uploadedBy: string;
  uploadedAt: string;
  updatedAt?: string;
}

export interface EmployeePersonalDetails {
  employeeId?: string;
  dob?: string;
  dateOfBirth?: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  maritalStatus?: 'Single' | 'Married' | 'Divorced' | 'Widowed' | string;
  bloodGroup?: string;
  mobile?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  email?: string;
  personalEmail?: string;
  currentAddress?: string;
  residentialAddress?: string;
  permanentAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  emergencyContacts?: Array<{
    name: string;
    relationship: string;
    contactNumber: string;
    address?: string;
    isPrimary?: boolean;
  }>;
  qualifications?: any;
  skills?: any;
  workExperience?: string;
  hrNotes?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TradeDiscrepancyInfo {
  hasWarning: boolean;
  designation: string;
  tradeOnVisa: string;
  message: string;
}

export interface EmployeeComplianceProfile {
  civilId?: EmployeeCivilId | null;
  civilIdHistory: EmployeeCivilId[];
  drivingLicences: EmployeeDrivingLicence[];
  drivingLicenceHistory: EmployeeDrivingLicence[];
  currentVisa?: EmployeeVisa | null;
  visaHistory: EmployeeVisa[];
  governmentDocuments: EmployeeGovernmentDocument[];
  overallStatus: OverallComplianceStatus;
  tradeDiscrepancyWarning?: TradeDiscrepancyInfo | null;
}

export interface DocumentExpiryWidgetStats {
  docType: string;
  label: string;
  total: number;
  valid: number;
  expiringSoon: number;
  urgent: number;
  expired: number;
  missing: number;
}

export interface DesignationHistory {
  id: string;
  employeeId: string;
  previousDesignation: string;
  newDesignation: string;
  effectiveDate: string;
  changedBy: string;
  createdAt: string;
}

export interface SalaryHistory {
  id: string;
  employeeId: string;
  previousSalary: number;
  newSalary: number;
  wageType: WageType;
  effectiveDate: string;
  changedBy: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  nationalityType: NationalityType;
  wageType: WageType;
  dateOfJoining: string;
  dateOfLeaving?: string | null;
  designation: string;
  employeeCompany: EmployeeCompany;
  salaryPaidBy: SalaryPaidBy;
  monthlySalaryOrRate: number;
  wpsEmployee: WPSStatus;
  wpsSalary: number;
  actualSalary: number;
  recoverFrom: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  status: 'Active' | 'Inactive';
  startDate?: string | null;
  endDate?: string | null;
  remarks?: string;
  // Undefined/empty = unrestricted (every existing project keeps its current unrestricted
  // behavior). When populated, only employees from a listed company may be allocated here.
  allowedCompanies?: EmployeeCompany[];
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeInternalId?: string;
  payrollMonth?: string;
  month?: string;
  projectId?: string;
  projectCode: string;
  projectName?: string;
  daysWorked: number;
  hoursWorked: number;
  // Capture-only fields (do NOT feed payroll's gross/net calculation) -- reporting and
  // project-cost-analysis inputs only.
  overtimeHours?: number;
  bonus?: number;
  deduction?: number;
  attendanceMonthId?: string;
  company?: EmployeeCompany;
  payrollType?: string;
  payBy?: SalaryPaidBy;
  createdAt?: string;
  updatedAt?: string;
}

export type AttendanceStatus = 'Draft' | 'Submitted' | 'Approved' | 'Finalized';

// One row per calendar month -- the atomic unit attendance status/workflow applies to,
// mirroring MonthlyPayroll's parent/lines split. Informational only: payroll reads
// AttendanceRecord[] directly regardless of this status.
export interface AttendanceMonth {
  id: string;
  payrollMonth: string;
  status: AttendanceStatus;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  finalizedBy?: string | null;
  finalizedAt?: string | null;
  revertedBy?: string | null;
  revertedAt?: string | null;
  revertReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TimesheetApprovalStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected';

// Independent, per-entry record (NOT a month-batch-replace like AttendanceRecord) -- an
// employee can have many rows across different dates/projects; edits to one entry must
// never affect any other. Does not feed payroll math; coexists with Attendance's day/hour
// totals for granular per-day/per-task labor tracking and project-cost analytics.
export interface TimesheetEntry {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  payrollMonth: string;
  company: EmployeeCompany;
  projectId: string;
  projectCode: string;
  projectName?: string;
  taskActivity: string;
  normalHours: number;
  overtimeHours: number;
  remarks?: string;
  approvalStatus: TimesheetApprovalStatus;
  isVoided?: boolean;
  voidReason?: string | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type CifBatchStatus = 'Uploaded' | 'Validated' | 'Previewed' | 'Processed' | 'Reconciled' | 'Complete';
export type CifRecordStatus = 'Valid' | 'Invalid' | 'Duplicate';

// Modeled deliberately on Attendance's own pattern (generic accountReference/amount fields),
// not a specific bank's regulatory WPS/SIF column spec, per explicit product decision.
export interface CifBatch {
  id: string;
  company: EmployeeCompany;
  payrollMonth: string;
  payrollType: string;
  cifFileType: string;
  status: CifBatchStatus;
  uploadedBy: string;
  uploadedAt: string;
  validatedAt?: string | null;
  processedAt?: string | null;
  processedBy?: string | null;
  payrollTotal?: number;
  cifTotal?: number;
  variance?: number;
  validCount?: number;
  invalidCount?: number;
  duplicateCount?: number;
  overrideUsed?: boolean;
  overrideReason?: string | null;
  overrideBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CifRecord {
  id: string;
  batchId: string;
  employeeId: string;
  employeeName?: string;
  accountReference: string;
  amount: number;
  reference?: string;
  status: CifRecordStatus;
  reason?: string;
  createdAt: string;
}

export type PayrollStatus = 'Draft' | 'Finalized' | 'In Revision';
export type PaymentMethod = 'WPS' | 'Non-WPS';

export interface PayrollLine {
  id: string;
  payrollId: string;
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  nationalityType: NationalityType;
  wageType: WageType;
  designation: string;
  employeeCompany: EmployeeCompany;
  salaryPaidBy: SalaryPaidBy;
  projectsSummary: string;
  daysWorked: number;
  hoursWorked: number;
  basicSalaryOrRate: number;
  grossSalary: number;
  houseAllowance: number;
  transportAllowance: number;
  bonus: number;
  otherAllowance: number;
  totalAdditions: number;
  loanRecovery: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  paymentMethod: PaymentMethod;
  wpsSalary: number;
  recoverableSalary: number;
  recoverFrom: string;
  wpsEmployee: WPSStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollRevision {
  id: string;
  payrollId: string;
  payrollMonth: string;
  revisionNumber: number;
  revisionDate: string;
  revisedBy: string;
  reason: string;
  previousGross: number;
  previousNet: number;
  newGross: number;
  newNet: number;
  snapshotLinesJson?: string;
  createdAt: string;
}

export interface MonthlyPayroll {
  id: string;
  payrollMonth: string;
  status: PayrollStatus;
  totalEmployees: number;
  totalGrossSalary: number;
  totalAdditions: number;
  totalDeductions: number;
  totalNetSalary: number;
  totalWpsSalary: number;
  totalRecoverableSalary: number;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
  lines?: PayrollLine[];
}

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Fully Paid';
export type PaymentMode = 'Cash' | 'Bank Transfer' | 'Cheque' | 'Direct Deposit' | string;

export interface SalaryPaymentTransaction {
  id: string;
  employeeId: string;
  employeeName: string;
  payrollMonth: string;
  payrollLineId?: string;
  paymentDate: string;
  amount?: number;
  payAmount?: number;
  paidAmount?: number;
  paymentMode?: PaymentMode;
  bankName?: string;
  payTo?: string;
  referenceNumber?: string;
  receiptUrl?: string | null;
  receiptAttachment?: string | null;
  receiptFileName?: string | null;
  receiptStoragePath?: string | null;
  receiptStatus?: 'Attached' | 'Attachment Pending';
  remarks?: string;
  createdByName?: string;
  createdBy?: string;
  isReversed?: boolean;
  reversedAt?: string | null;
  reversedBy?: string | null;
  reversalReason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type SalaryPayment = SalaryPaymentTransaction;

export interface PaymentLedgerRow {
  employeeId: string;
  employeeName: string;
  employeeCompany: EmployeeCompany;
  salaryPaidBy: SalaryPaidBy;
  wpsEmployee: WPSStatus;
  employeeType: EmployeeType;
  designation: string;
  paymentMethod: PaymentMethod;
  payrollLineId: string;
  netSalaryOwed: number;
  totalPaid: number;
  remainingBalance: number;
  paymentStatus: PaymentStatus;
  receiptStatus: 'Attached' | 'Attachment Pending' | 'No Payments';
  lastPaymentDate?: string | null;
  transactionsCount: number;
  receipts: { receiptUrl: string; fileName?: string | null; amount: number }[];
}

export interface EmployeeSalaryPaymentSummary {
  employeeId: string;
  employeeName: string;
  employeeCompany: EmployeeCompany;
  salaryPaidBy: SalaryPaidBy;
  wpsEmployee: WPSStatus;
  months: {
    payrollMonth: string;
    payrollLineId: string;
    employeeType: EmployeeType;
    designation: string;
    paymentMethod: PaymentMethod;
    grossSalary: number;
    totalAdditions: number;
    totalDeductions: number;
    netSalary: number;
    totalPaid: number;
    outstanding: number;
    status: PaymentStatus;
    receiptStatus: 'Attached' | 'Attachment Pending' | 'No Payments';
    transactions: SalaryPaymentTransaction[];
  }[];
  totalNetSalary: number;
  totalPaid: number;
  totalOutstanding: number;
}

// Payment Planning: a purely intentional "should pay" figure per employee/payroll-month.
// Never linked to actual payments -- saving a plan must never create a SalaryPaymentTransaction
// or change totalPaid/outstanding/status anywhere.
export interface PaymentPlanLine {
  id: string;
  planId: string;
  employeeId: string;
  employeeName: string;
  shouldPayAmount: number;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPlan {
  id: string;
  payrollId: string;
  payrollMonth: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines?: PaymentPlanLine[];
}

export type WPSRecoveryStatus = 'Outstanding' | 'Pending' | 'Partially Recovered' | 'Fully Recovered' | 'Recovered';

export interface WPSRecoveryTransaction {
  id: string;
  wpsRecoveryId?: string;
  recoveryId?: string;
  employeeId: string;
  payrollMonth?: string;
  month?: string;
  recoveredFrom?: string;
  recoverFrom?: string;
  amount?: number;
  recoveryAmount?: number;
  recoveryDate: string;
  recoveryMode?: string;
  referenceNumber?: string;
  receiptAttachment?: string | null;
  receiptFileName?: string | null;
  remarks?: string;
  createdByName?: string;
  createdBy?: string;
  createdAt: string;
}

export interface WPSRecoveryRecord {
  id: string;
  month?: string;
  payrollMonth?: string;
  employeeId: string;
  employeeName: string;
  employeeCompany?: EmployeeCompany;
  salaryPaidBy?: SalaryPaidBy;
  wpsSalary: number;
  actualNetSalary?: number;
  netSalary?: number;
  recoverableAmount?: number;
  totalRecoverable?: number;
  recoveredAmount?: number;
  totalRecovered?: number;
  remainingAmount?: number;
  remainingBalance?: number;
  recoverFrom?: string;
  recoveredFrom?: string;
  status: WPSRecoveryStatus;
  createdAt: string;
  updatedAt?: string;
  transactions?: WPSRecoveryTransaction[];
}

export type WPSRecovery = WPSRecoveryRecord;

export type LoanStatus = 'Active' | 'Fully Repaid' | 'Completed' | 'Cancelled';

export interface LoanRepayment {
  id: string;
  loanId: string;
  employeeId: string;
  source?: 'Payroll Deduction' | 'Direct Payment' | string;
  recoverySource?: string;
  payrollMonth?: string | null;
  amount?: number;
  recoveryAmount?: number;
  repaymentDate?: string;
  recoveryDate?: string;
  repaymentMode?: string;
  referenceNumber?: string;
  receiptAttachment?: string | null;
  receiptFileName?: string | null;
  remarks?: string;
  createdByName?: string;
  createdBy?: string;
  isReversed?: boolean;
  reversedAt?: string | null;
  createdAt: string;
}

export type LoanRecoveryTransaction = LoanRepayment;

export interface EmployeeLoan {
  id: string;
  employeeId: string;
  employeeName: string;
  loanAmount: number;
  loanDate: string;
  monthlyDeduction?: number;
  monthlyRecoveryAmount?: number;
  repaidAmount?: number;
  totalRecovered?: number;
  remainingBalance?: number;
  outstandingBalance?: number;
  purpose?: string;
  status: LoanStatus;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
  recoveries?: LoanRepayment[];
}

export interface AuditLog {
  id: string;
  userId?: string;
  username?: string;
  userName?: string;
  userRole: string;
  action: string;
  module: string;
  recordId?: string;
  description: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  timestamp: string;
}
