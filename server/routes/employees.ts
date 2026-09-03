import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, normalizeEmployeeId, roundOMR, calculateExpiryStatus, calculateOverallCompliance, checkTradeDiscrepancy, maskSensitiveId } from '../db.js';
import { verifyAuth, requireRoles, requireWritePermission, AuthRequest } from '../auth.js';
import { roleHasPermission } from '../../src/permissions.js';
import type {
  Employee,
  EmployeeType,
  NationalityType,
  WageType,
  EmployeeCompany,
  SalaryPaidBy,
  WPSStatus,
  EmployeeCivilId,
  EmployeeDrivingLicence,
  EmployeeVisa,
  EmployeeGovernmentDocument,
  EmployeePersonalDetails,
} from '../../src/types/index';
import { validateBankAccountNumber, validateIban, validateBankDetails } from '../../src/utils/bankValidation.js';

const router = Router();

// Helper to validate employee enum types
function isValidEmployeeType(val: any): val is EmployeeType {
  return ['Worker', 'Staff'].includes(val);
}
function isValidNationalityType(val: any): val is NationalityType {
  return ['Omani', 'Expat'].includes(val);
}
function isValidWageType(val: any): val is WageType {
  return ['Per Hour', 'Fixed Monthly'].includes(val);
}
function isValidEmployeeCompany(val: any): val is EmployeeCompany {
  return ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'].includes(val);
}
function isValidSalaryPaidBy(val: any): val is SalaryPaidBy {
  return ['DGO', 'SMI', 'NC', 'Supplier'].includes(val);
}
function isValidWPSStatus(val: any): val is WPSStatus {
  return ['Yes', 'No'].includes(val);
}

// Normalizers for enum and text values to be resilient against CSV/Excel casing and formatting variances
function normalizeEmployeeType(val: any): string {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'worker' || s === 'w' || s === 'labor' || s === 'labour') return 'Worker';
  if (s === 'staff' || s === 's' || s === 'office' || s === 'management') return 'Staff';
  return String(val || '').trim();
}

function normalizeNationalityType(val: any): string {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'omani' || s === 'om' || s === 'national' || s === 'citizen') return 'Omani';
  if (s === 'expat' || s === 'expatriate' || s === 'foreigner' || s === 'non-omani') return 'Expat';
  return String(val || '').trim();
}

function normalizeWageType(val: any): string {
  const s = String(val || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes('hour') || s === 'hourly') return 'Per Hour';
  if (s.includes('month') || s === 'fixed' || s === 'monthly' || s === 'fixedmonthly') return 'Fixed Monthly';
  return String(val || '').trim();
}

function normalizeCompany(val: any): string {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'dgo') return 'DGO';
  if (s === 'smi') return 'SMI';
  if (s === 'nc') return 'NC';
  if (s === 'supplier') return 'Supplier';
  if (s === 'azad') return 'Azad';
  return String(val || '').trim();
}

function normalizePaidBy(val: any): string {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'dgo') return 'DGO';
  if (s === 'smi') return 'SMI';
  if (s === 'nc') return 'NC';
  if (s === 'supplier') return 'Supplier';
  return String(val || '').trim();
}

function normalizeWPS(val: any): 'Yes' | 'No' {
  const s = String(val || '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return 'Yes';
  return 'No';
}

function normalizeGender(val: any): 'Male' | 'Female' | 'Other' {
  const s = String(val || '').trim().toLowerCase();
  if (s.startsWith('f') || s === 'woman') return 'Female';
  if (s.startsWith('o')) return 'Other';
  return 'Male';
}

function normalizeMaritalStatus(val: any): 'Single' | 'Married' | 'Divorced' | 'Widowed' {
  const s = String(val || '').trim().toLowerCase();
  if (s.startsWith('m')) return 'Married';
  if (s.startsWith('d')) return 'Divorced';
  if (s.startsWith('w')) return 'Widowed';
  return 'Single';
}

function normalizeBloodGroup(val: any): string {
  const s = String(val || '').trim().toUpperCase().replace(/\s+/g, '');
  const valid = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  if (valid.includes(s)) return s;
  return s || '';
}

function cleanNumber(val: any, defaultVal = 0): number {
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (!val) return defaultVal;
  const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

function isValidDateString(val: any): boolean {
  if (typeof val !== 'string' || !val.trim()) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }
  const d = new Date(val);
  return !isNaN(d.getTime());
}

// Flexible date parser supporting JS Date objects, Excel serial dates, ISO strings, and UK/Gulf DD/MM/YYYY formats
function excelCellToDateString(val: any): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && val > 20000 && val < 90000) {
    const excelDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(excelDate.getTime())) {
      const y = excelDate.getFullYear();
      const m = String(excelDate.getMonth() + 1).padStart(2, '0');
      const d = String(excelDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(val).trim();
  if (!s) return '';
  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const ukMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ukMatch) {
    return `${ukMatch[3]}-${ukMatch[2].padStart(2, '0')}-${ukMatch[1].padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

// Case-insensitive, space-insensitive row cell accessor
function getRowValue(row: Record<string, any>, possibleKeys: string[]): any {
  for (const k of possibleKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
  }
  const normalizedRow: Record<string, any> = {};
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    normalizedRow[norm] = row[k];
  }
  for (const k of possibleKeys) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedRow[norm] !== undefined && normalizedRow[norm] !== null && String(normalizedRow[norm]).trim() !== '') {
      return normalizedRow[norm];
    }
  }
  return '';
}

// Shared field-level validation used by both import/validate (preview) and import/confirm
// (defense-in-depth re-check, since confirm's payload is client-supplied and must not be trusted blindly).
function validateEmployeeFields(f: {
  employeeId: string; employeeName: string; employeeType: string; nationalityType: string;
  wageType: string; designation: string; employeeCompany: string; salaryPaidBy: string;
  salary: any; wpsSalary: any; actualSalary: any; dateOfJoining: string; dateOfLeaving: string;
  bankName?: string; bankAccountNumber?: string; iban?: string;
}): string | null {
  if (!f.employeeId) return 'Employee ID is required';
  if (!f.employeeName) return 'Employee Name is required';
  if (!isValidEmployeeType(f.employeeType)) return `Invalid Employee Type: '${f.employeeType}' (Must be Worker or Staff)`;
  if (!isValidNationalityType(f.nationalityType)) return `Invalid Nationality Type: '${f.nationalityType}' (Must be Omani or Expat)`;
  if (!isValidWageType(f.wageType)) return `Invalid Wage Type: '${f.wageType}' (Must be Per Hour or Fixed Monthly)`;
  if (!f.designation) return 'Designation is required';
  if (!isValidEmployeeCompany(f.employeeCompany)) return `Invalid Employee Company: '${f.employeeCompany}' (Must be DGO, SMI, NC, Supplier, or Azad)`;
  if (!isValidSalaryPaidBy(f.salaryPaidBy)) return `Invalid Salary Paid By: '${f.salaryPaidBy}' (Must be DGO, SMI, NC, or Supplier)`;
  if (isNaN(Number(f.salary)) || Number(f.salary) < 0) return 'Salary / Rate must be a non-negative number';
  if (isNaN(Number(f.wpsSalary)) || Number(f.wpsSalary) < 0) return 'WPS Salary must be a non-negative number';
  if (isNaN(Number(f.actualSalary)) || Number(f.actualSalary) < 0) return 'Actual Salary must be a non-negative number';
  if (f.dateOfJoining && !isValidDateString(f.dateOfJoining)) return `Invalid Date of Joining: '${f.dateOfJoining}' (Expected YYYY-MM-DD)`;
  if (f.dateOfLeaving && !isValidDateString(f.dateOfLeaving)) return `Invalid Date of Leaving: '${f.dateOfLeaving}' (Expected YYYY-MM-DD)`;
  if (f.dateOfJoining && f.dateOfLeaving && isValidDateString(f.dateOfJoining) && isValidDateString(f.dateOfLeaving) && f.dateOfLeaving < f.dateOfJoining) {
    return 'Date of Leaving cannot be before Date of Joining';
  }
  if (f.bankAccountNumber && String(f.bankAccountNumber).trim()) {
    const accCheck = validateBankAccountNumber(f.bankAccountNumber, f.bankName);
    if (!accCheck.isValid) return `Invalid Bank Account Number: ${accCheck.error}`;
  }
  if (f.iban && String(f.iban).trim()) {
    const ibanCheck = validateIban(f.iban, f.bankName);
    if (!ibanCheck.isValid) return `Invalid Bank IBAN: ${ibanCheck.error}`;
  }
  return null;
}

// GET /api/employees - List employees with filters
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const {
      search,
      employeeType,
      nationalityType,
      employeeCompany,
      salaryPaidBy,
      wageType,
      status,
      docType,
      docStatus,
      expiryStatus,
      sortField,
      sortOrder,
    } = req.query;

    let employees = db.employees.getAll();

    if (search) {
      const q = String(search).trim().toLowerCase();
      employees = employees.filter(e =>
        e.employeeId.toLowerCase().includes(q) ||
        e.employeeName.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q)
      );
    }

    if (employeeType && employeeType !== 'ALL') {
      employees = employees.filter(e => e.employeeType === employeeType);
    }

    if (nationalityType && nationalityType !== 'ALL') {
      employees = employees.filter(e => e.nationalityType === nationalityType);
    }

    if (employeeCompany && employeeCompany !== 'ALL') {
      employees = employees.filter(e => e.employeeCompany === employeeCompany);
    }

    if (salaryPaidBy && salaryPaidBy !== 'ALL') {
      employees = employees.filter(e => e.salaryPaidBy === salaryPaidBy);
    }

    if (wageType && wageType !== 'ALL') {
      employees = employees.filter(e => e.wageType === wageType);
    }

    if (status === 'active') {
      employees = employees.filter(e => e.isActive);
    } else if (status === 'inactive') {
      employees = employees.filter(e => !e.isActive);
    }

    // Document expiry filtering (e.g. from Dashboard Expiry Monitoring widgets)
    const targetDocStatus = (docStatus || expiryStatus || '') as string;
    const targetDocType = (docType || '') as string;

    if (targetDocType || targetDocStatus) {
      const civilIds = db.civilIds.getAll().filter(c => c.isCurrent);
      const drivingLicences = db.drivingLicences.getAll().filter(d => d.isCurrent);
      const visas = db.visas.getAll().filter(v => v.isCurrent);
      const govtDocs = db.governmentDocuments.getAll().filter(g => g.isCurrent);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const matchesStatus = (st: string) => {
        if (!targetDocStatus || targetDocStatus === 'ALL') return true;
        if (targetDocStatus === 'Action Needed') {
          return st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon';
        }
        return st.toLowerCase() === targetDocStatus.toLowerCase();
      };

      const dtLow = targetDocType ? targetDocType.toLowerCase().replace(/[\s-_]/g, '') : '';

      const enrichedEmployees = employees.map(emp => {
        const empNorm = normalizeEmployeeId(emp.employeeId);
        const docs: Array<{
          category: string;
          type: string;
          number: string;
          expiryDate: string;
          status: string;
          daysRemaining: number;
        }> = [];

        // Civil ID
        const cid = civilIds.find(c => normalizeEmployeeId(c.employeeId) === empNorm);
        if (cid) {
          const st = calculateExpiryStatus(cid.expiryDate);
          const exp = new Date(cid.expiryDate);
          exp.setHours(0, 0, 0, 0);
          docs.push({
            category: 'civilId',
            type: 'Civil ID',
            number: cid.civilIdNumber,
            expiryDate: cid.expiryDate,
            status: st,
            daysRemaining: Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }

        // Visa
        if (emp.nationalityType === 'Expat') {
          const v = visas.find(vi => normalizeEmployeeId(vi.employeeId) === empNorm);
          if (v) {
            const st = calculateExpiryStatus(v.expiryDate);
            const exp = new Date(v.expiryDate);
            exp.setHours(0, 0, 0, 0);
            docs.push({
              category: 'visa',
              type: 'Visa',
              number: v.visaNumber,
              expiryDate: v.expiryDate,
              status: st,
              daysRemaining: Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
            });
          }
        }

        // Driving Licence
        const dl = drivingLicences.find(d => normalizeEmployeeId(d.employeeId) === empNorm);
        if (dl) {
          const st = calculateExpiryStatus(dl.expiryDate);
          const exp = new Date(dl.expiryDate);
          exp.setHours(0, 0, 0, 0);
          docs.push({
            category: 'drivingLicence',
            type: `Driving Licence (${dl.category})`,
            number: dl.licenceNumber,
            expiryDate: dl.expiryDate,
            status: st,
            daysRemaining: Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }

        // Passport
        const pass = govtDocs.find(g => normalizeEmployeeId(g.employeeId) === empNorm && g.documentType === 'Passport');
        if (pass) {
          const st = calculateExpiryStatus(pass.expiryDate);
          const exp = new Date(pass.expiryDate);
          exp.setHours(0, 0, 0, 0);
          docs.push({
            category: 'passport',
            type: 'Passport',
            number: pass.documentNumber,
            expiryDate: pass.expiryDate,
            status: st,
            daysRemaining: Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }

        // Work Permit
        const wp = govtDocs.find(g => normalizeEmployeeId(g.employeeId) === empNorm && g.documentType === 'Work Permit');
        if (wp) {
          const st = calculateExpiryStatus(wp.expiryDate);
          const exp = new Date(wp.expiryDate);
          exp.setHours(0, 0, 0, 0);
          docs.push({
            category: 'workPermit',
            type: 'Work Permit',
            number: wp.documentNumber,
            expiryDate: wp.expiryDate,
            status: st,
            daysRemaining: Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }

        // Employment Contract
        const contract = govtDocs.find(g => normalizeEmployeeId(g.employeeId) === empNorm && ((g.documentType as any) === 'Employment Contract' || (g.documentType as any) === 'Contract'));
        if (contract) {
          const st = calculateExpiryStatus(contract.expiryDate);
          const exp = new Date(contract.expiryDate);
          exp.setHours(0, 0, 0, 0);
          docs.push({
            category: 'contract',
            type: 'Employment Contract',
            number: contract.documentNumber || 'CONTRACT',
            expiryDate: contract.expiryDate,
            status: st,
            daysRemaining: Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }

        // Find matched document if criteria specified
        const matchingDoc = docs.find(d => {
          const matchType = !dtLow || d.category.toLowerCase().replace(/[\s-_]/g, '').includes(dtLow) || d.type.toLowerCase().replace(/[\s-_]/g, '').includes(dtLow);
          const matchSt = matchesStatus(d.status);
          return matchType && matchSt;
        });

        return {
          ...emp,
          _matchedDoc: matchingDoc || null,
          _allDocs: docs,
        };
      });

      employees = enrichedEmployees.filter(e => e._matchedDoc !== null) as any;
    }

    // Enrich each employee record with bank details & father name from personal details store
    employees = employees.map((emp: any) => {
      const personal = db.personalDetails.get(normalizeEmployeeId(emp.employeeId));
      return {
        ...emp,
        fatherName: emp.fatherName || personal?.fatherName || '',
        bankName: emp.bankName || personal?.bankName || '',
        bankAccountNumber: emp.bankAccountNumber || personal?.bankAccountNumber || '',
        iban: emp.iban || personal?.iban || '',
        bankBranch: emp.bankBranch || personal?.bankBranch || '',
        accountHolderName: emp.accountHolderName || personal?.accountHolderName || emp.employeeName,
      };
    });

    // Sorting
    const field = String(sortField || 'employeeId');
    const order = sortOrder === 'desc' ? -1 : 1;

    employees.sort((a: any, b: any) => {
      if (a[field] < b[field]) return -1 * order;
      if (a[field] > b[field]) return 1 * order;
      return 0;
    });

    res.json(employees);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch employees' });
  }
});

// GET /api/employees/export/template - Generate blank Excel or CSV template for import,
// with real Excel dropdown (data validation) lists for fixed-choice columns.
router.get('/export/template', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const isCsv = String(req.query.format || '').toLowerCase() === 'csv';

    const headers = [
      // 1. Basic Employment Information
      'Employee ID',
      'Employee Name',
      'Father Name',
      'Employee Type',
      'Nationality Type',
      'Designation',
      'Employee Company',
      'Salary Paid By',
      'Date of Joining',
      'Date of Leaving',
      'Employment Status',
      'Assigned Project',

      // 2. Compensation & WPS
      'Wage Type',
      'Monthly Salary / Wage Rate',
      'WPS Employee',
      'WPS Salary',
      'Actual Salary',
      'Recover From',

      // 3. Banking Details
      'Bank Name',
      'Bank Account Number',
      'Bank IBAN',

      // 4. Personal Information & Demographics
      'Date of Birth',
      'Gender',
      'Marital Status',
      'Blood Group',
      'Mobile Number',
      'WhatsApp Number',
      'Personal Email',
      'Residential Address',
      'Permanent Address',
      'Emergency Contact Name',
      'Emergency Contact Relationship',
      'Emergency Contact Phone',

      // 5. Statutory & Government Documents
      'Civil ID Number',
      'Civil ID Expiry Date',
      'Passport Number',
      'Passport Expiry Date',
      'Visa Number',
      'Visa Expiry Date',
      'Visa Trade',
      'Visa Sponsor',
      'Driving Licence Number',
      'Driving Licence Expiry Date',

      // 6. Ledger & Opening Balances
      'Opening Loan Balance',
      'Monthly Loan Recovery',
      'Opening Salary Balance',
    ];

    const sampleRows = [
      [
        'EMP001',
        'Ahmed Al-Harthy',
        'Said Al-Harthy',
        'Staff',
        'Omani',
        'Site Engineer',
        'DGO',
        'DGO',
        '2024-01-15',
        '',
        'Active',
        'Ghala Commercial Hub',
        'Fixed Monthly',
        '650.000',
        'Yes',
        '650.000',
        '650.000',
        'DGO',
        'Bank Muscat',
        '0312048192019',
        'OM62BMUS0312048192019',
        '1988-04-12',
        'Male',
        'Married',
        'O+',
        '+968 9123 4567',
        '+968 9123 4567',
        'ahmed.balushi@artify.om',
        'Villa 14, Way 2819, Al Khuwair, Muscat',
        'Barka, South Al Batinah, Oman',
        'Said Al-Balushi',
        'Brother',
        '+968 9234 5678',
        '10928374',
        '2027-05-14',
        'A12345678',
        '2029-08-20',
        '',
        '',
        '',
        '',
        'DL-882910',
        '2033-01-09',
        '0.000',
        '0.000',
        '0.000',
      ],
      [
        'EMP002',
        'Rajesh Kumar',
        'Ram Kumar',
        'Worker',
        'Expat',
        'Electrician',
        'SMI',
        'SMI',
        '2024-02-01',
        '',
        'Active',
        'Mabelah Industrial Center',
        'Per Hour',
        '2.500',
        'No',
        '0.000',
        '250.000',
        '',
        'Bank Dhofar',
        '0102049102910',
        'OM44BDHO0102049102910',
        '1992-07-22',
        'Male',
        'Married',
        'B+',
        '+968 9876 5432',
        '+968 9876 5432',
        '',
        'Al Ghubrah Labour Camp, Block B, Muscat',
        'Kerala, India',
        'Fatima Hassan',
        'Spouse',
        '+91 98765 43210',
        '77461928',
        '2026-08-11',
        'M88761234',
        '2030-02-15',
        'VS-9928172',
        '2026-12-31',
        'Electrician',
        'SMI',
        '',
        '',
        '200.000',
        '25.000',
        '0.000',
      ],
    ];

    if (isCsv) {
      const escapeCsvCell = (val: any) => {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const csvContent = '\uFEFF' + [
        headers.map(escapeCsvCell).join(','),
        ...sampleRows.map(r => r.map(escapeCsvCell).join(','))
      ].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.csv"');
      return res.send(csvContent);
    }

    const colWidths = [
      15, // Employee ID
      25, // Employee Name
      22, // Father Name
      15, // Employee Type
      16, // Nationality Type
      22, // Designation
      18, // Employee Company
      16, // Salary Paid By
      16, // Date of Joining
      16, // Date of Leaving
      18, // Employment Status
      24, // Assigned Project
      16, // Wage Type
      26, // Monthly Salary / Wage Rate
      15, // WPS Employee
      16, // WPS Salary
      16, // Actual Salary
      16, // Recover From
      20, // Bank Name
      22, // Bank Account Number
      28, // Bank IBAN
      16, // Date of Birth
      12, // Gender
      15, // Marital Status
      14, // Blood Group
      18, // Mobile Number
      18, // WhatsApp Number
      25, // Personal Email
      32, // Residential Address
      32, // Permanent Address
      22, // Emergency Contact Name
      20, // Emergency Contact Relationship
      20, // Emergency Contact Phone
      18, // Civil ID Number
      20, // Civil ID Expiry Date
      18, // Passport Number
      20, // Passport Expiry Date
      18, // Visa Number
      18, // Visa Expiry Date
      20, // Visa Trade
      22, // Visa Sponsor
      22, // Driving Licence Number
      24, // Driving Licence Expiry Date
      22, // Opening Loan Balance
      22, // Monthly Loan Recovery
      22, // Opening Salary Balance
    ];

    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet('Employee_Import_Template');
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] || 18 }));
    sheet.getRow(1).font = { bold: true };

    // Real Excel dropdown validation for every data row (2-501)
    const LAST_ROW = 501;
    const dropdowns: { col: string; values: string[]; allowBlank?: boolean }[] = [
      { col: 'D', values: ['Worker', 'Staff'] },
      { col: 'E', values: ['Omani', 'Expat'] },
      { col: 'G', values: ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'] },
      { col: 'H', values: ['DGO', 'SMI', 'NC', 'Supplier'] },
      { col: 'K', values: ['Active', 'Inactive'], allowBlank: true },
      { col: 'M', values: ['Per Hour', 'Fixed Monthly'] },
      { col: 'O', values: ['Yes', 'No'], allowBlank: true },
      { col: 'R', values: ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'], allowBlank: true },
      { col: 'W', values: ['Male', 'Female', 'Other'], allowBlank: true },
      { col: 'X', values: ['Single', 'Married', 'Divorced', 'Widowed'], allowBlank: true },
      { col: 'Y', values: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], allowBlank: true },
    ];

    for (const { col, values, allowBlank } of dropdowns) {
      for (let row = 2; row <= LAST_ROW; row++) {
        sheet.getCell(`${col}${row}`).dataValidation = {
          type: 'list',
          allowBlank: allowBlank ?? false,
          formulae: [`"${values.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Invalid value',
          error: `Must be one of: ${values.join(', ')}`,
        };
      }
    }

    // Date format hint for date columns (I, J, V, AI, AK, AM, AQ)
    for (const col of ['I', 'J', 'V', 'AI', 'AK', 'AM', 'AQ']) {
      for (let row = 2; row <= LAST_ROW; row++) {
        sheet.getCell(`${col}${row}`).numFmt = 'yyyy-mm-dd';
      }
    }

    // Number format hint for numeric OMR columns (N, P, Q, AR, AS, AT)
    for (const col of ['N', 'P', 'Q', 'AR', 'AS', 'AT']) {
      for (let row = 2; row <= LAST_ROW; row++) {
        sheet.getCell(`${col}${row}`).numFmt = '#,##0.000';
      }
    }

    // Add sample rows to worksheet
    sampleRows.forEach(rowVals => {
      sheet.addRow(rowVals);
    });

    const instructionsSheet = workbook.addWorksheet('Instructions & Dropdowns');
    instructionsSheet.columns = [
      { header: 'SECTION', width: 22 },
      { header: 'FIELD NAME', width: 26 },
      { header: 'ACCEPTED VALUES / FORMAT', width: 55 },
      { header: 'REQUIRED?', width: 18 },
    ];
    instructionsSheet.getRow(1).font = { bold: true };
    instructionsSheet.addRows([
      // Basic Info
      ['1. Employment Profile', 'Employee ID', 'Unique alphanumeric ID (e.g. EMP001). Normalized automatically.', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Employee Name', 'Full Legal Name of Employee (English)', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Father Name', 'Father\'s Name (as in Passport / Official Records)', 'Recommended'],
      ['1. Employment Profile', 'Employee Type', 'Worker, Staff (dropdown enabled)', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Nationality Type', 'Omani, Expat (dropdown enabled)', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Designation', 'Job Title (e.g. Site Engineer, Mason, Electrician)', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Employee Company', 'DGO, SMI, NC, Supplier, Azad (dropdown enabled)', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Salary Paid By', 'DGO, SMI, NC, Supplier (dropdown enabled)', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Date of Joining', 'YYYY-MM-DD (e.g. 2024-01-15). Defaults to today if empty.', 'Yes (Mandatory)'],
      ['1. Employment Profile', 'Date of Leaving', 'YYYY-MM-DD (leave blank if active). Cannot be before Date of Joining.', 'No (Optional)'],
      ['1. Employment Profile', 'Employment Status', 'Active, Inactive (defaults to Active)', 'Optional (Default Active)'],
      ['1. Employment Profile', 'Assigned Project', 'Project Name or Site (e.g. Ghala Commercial Hub)', 'No (Optional)'],

      // Compensation & WPS
      ['2. Compensation & WPS', 'Wage Type', 'Per Hour, Fixed Monthly (dropdown enabled)', 'Yes (Mandatory)'],
      ['2. Compensation & WPS', 'Monthly Salary / Wage Rate', 'OMR amount (e.g. 650.000 for Staff, 2.500 for hourly Worker)', 'Yes (Mandatory)'],
      ['2. Compensation & WPS', 'WPS Employee', 'Yes, No (dropdown enabled)', 'Yes (Mandatory)'],
      ['2. Compensation & WPS', 'WPS Salary', 'WPS registered salary amount in OMR (e.g. 650.000)', 'Optional (Default 0)'],
      ['2. Compensation & WPS', 'Actual Salary', 'Gross salary benchmark in OMR (defaults to Monthly Salary)', 'Optional (Default 0)'],
      ['2. Compensation & WPS', 'Recover From', 'Company/Entity to recover excess WPS from (e.g. DGO, SMI, NC)', 'Optional'],

      // Banking
      ['3. Banking Details', 'Bank Name', 'Bank Name in Oman (e.g. Bank Muscat, Bank Dhofar, NBO)', 'Optional'],
      ['3. Banking Details', 'Bank Account Number', 'Bank Account Number for direct wage deposit', 'Optional'],
      ['3. Banking Details', 'Bank IBAN', 'International Bank Account Number (e.g. OM62BMUS...)', 'Optional'],

      // Personal & Demographic
      ['4. Personal & Contact', 'Date of Birth', 'YYYY-MM-DD (e.g. 1990-05-15). Auto-computes age in profile.', 'Optional'],
      ['4. Personal & Contact', 'Gender', 'Male, Female, Other (dropdown enabled)', 'Optional (Default Male)'],
      ['4. Personal & Contact', 'Marital Status', 'Single, Married, Divorced, Widowed (dropdown enabled)', 'Optional (Default Single)'],
      ['4. Personal & Contact', 'Blood Group', 'A+, A-, B+, B-, AB+, AB-, O+, O- (dropdown enabled)', 'Optional'],
      ['4. Personal & Contact', 'Mobile Number', 'Contact phone number (e.g. +968 9123 4567)', 'Optional'],
      ['4. Personal & Contact', 'WhatsApp Number', 'WhatsApp contact number (e.g. +968 9123 4567)', 'Optional'],
      ['4. Personal & Contact', 'Personal Email', 'Personal email address for correspondence', 'Optional'],
      ['4. Personal & Contact', 'Residential Address', 'Current accommodation / camp address in Oman', 'Optional'],
      ['4. Personal & Contact', 'Permanent Address', 'Home country / permanent hometown address', 'Optional'],
      ['4. Personal & Contact', 'Emergency Contact Name', 'Name of primary emergency contact person', 'Optional'],
      ['4. Personal & Contact', 'Emergency Contact Relationship', 'Relationship (e.g. Spouse, Brother, Father, Friend)', 'Optional'],
      ['4. Personal & Contact', 'Emergency Contact Phone', 'Emergency contact phone number', 'Optional'],

      // Statutory Documents
      ['5. Statutory Documents', 'Civil ID Number', 'Civil ID / Resident Card Number (e.g. 10928374)', 'Recommended'],
      ['5. Statutory Documents', 'Civil ID Expiry Date', 'YYYY-MM-DD. Auto-monitored in HR Compliance dashboard.', 'Recommended'],
      ['5. Statutory Documents', 'Passport Number', 'Passport Number (e.g. A12345678)', 'Recommended for Expats'],
      ['5. Statutory Documents', 'Passport Expiry Date', 'YYYY-MM-DD. Auto-monitored in HR Compliance dashboard.', 'Recommended for Expats'],
      ['5. Statutory Documents', 'Visa Number', 'Visa Number (e.g. VS-9928172)', 'Recommended for Expats'],
      ['5. Statutory Documents', 'Visa Expiry Date', 'YYYY-MM-DD. Auto-monitored in HR Compliance dashboard.', 'Recommended for Expats'],
      ['5. Statutory Documents', 'Visa Trade', 'Trade / profession registered on visa (e.g. Civil Engineer)', 'Optional'],
      ['5. Statutory Documents', 'Visa Sponsor', 'Sponsoring company name (e.g. Artify Engineering LLC)', 'Optional'],
      ['5. Statutory Documents', 'Driving Licence Number', 'Oman or Gulf Driving Licence Number (e.g. DL-882910)', 'Optional'],
      ['5. Statutory Documents', 'Driving Licence Expiry Date', 'YYYY-MM-DD. Auto-monitored in HR Compliance dashboard.', 'Optional'],

      // Ledger & Opening Balances
      ['6. Ledger & Balances', 'Opening Loan Balance', 'Opening Loan Balance in OMR (e.g. 300.000 or 0). Creates active loan in ledger.', 'Optional (Default 0)'],
      ['6. Ledger & Balances', 'Monthly Loan Recovery', 'Monthly loan recovery deduction in OMR (e.g. 50.000)', 'Optional (Default 0)'],
      ['6. Ledger & Balances', 'Opening Salary Balance', 'Initial outstanding salary balance in OMR', 'Optional (Default 0)'],
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate template' });
  }
});

// GET /api/employees/export/data - Export all/filtered employees to Excel or CSV with full profile & ledger details
router.get('/export/data', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const isCsv = String(req.query.format || '').toLowerCase() === 'csv';
    const employees = db.employees.getAll();

    // Column names/order match the comprehensive import template exactly, so an exported file can be
    // re-imported unmodified.
    const data = employees.map(e => {
      const norm = normalizeEmployeeId(e.employeeId);
      const personal = db.personalDetails.get(norm) || db.personalDetails.get(e.employeeId) || {};
      const civilId = db.civilIds.getAll().find(c => normalizeEmployeeId(c.employeeId) === norm && c.isCurrent);
      const passport = db.governmentDocuments.getAll().find(g => normalizeEmployeeId(g.employeeId) === norm && g.documentType === 'Passport' && g.isCurrent);
      const visa = db.visas.getAll().find(v => normalizeEmployeeId(v.employeeId) === norm && v.isCurrent);
      const dl = db.drivingLicences.getAll().find(d => normalizeEmployeeId(d.employeeId) === norm && d.isCurrent);
      const activeLoan = db.loans.getAll().find(l => normalizeEmployeeId(l.employeeId) === norm && l.status === 'Active');

      const primaryEmerg = Array.isArray(personal.emergencyContacts) && personal.emergencyContacts.length > 0
        ? (personal.emergencyContacts.find((c: any) => c.isPrimary) || personal.emergencyContacts[0])
        : null;

      return {
        'Employee ID': e.employeeId,
        'Employee Name': e.employeeName,
        'Father Name': personal.fatherName || '',
        'Employee Type': e.employeeType,
        'Nationality Type': e.nationalityType,
        'Designation': e.designation,
        'Employee Company': e.employeeCompany,
        'Salary Paid By': e.salaryPaidBy,
        'Date of Joining': e.dateOfJoining,
        'Date of Leaving': e.dateOfLeaving || '',
        'Employment Status': e.isActive ? 'Active' : 'Inactive',
        'Assigned Project': personal.assignedProject || '',
        'Wage Type': e.wageType,
        'Monthly Salary / Wage Rate': roundOMR(e.monthlySalaryOrRate).toFixed(3),
        'WPS Employee': e.wpsEmployee,
        'WPS Salary': roundOMR(e.wpsSalary).toFixed(3),
        'Actual Salary': roundOMR(e.actualSalary).toFixed(3),
        'Recover From': e.recoverFrom || '',
        'Bank Name': personal.bankName || e.bankName || '',
        'Bank Account Number': personal.bankAccountNumber || e.bankAccountNumber || '',
        'Bank IBAN': personal.iban || e.iban || '',
        'Date of Birth': personal.dateOfBirth || personal.dob || '',
        'Gender': personal.gender || 'Male',
        'Marital Status': personal.maritalStatus || 'Single',
        'Blood Group': personal.bloodGroup || '',
        'Mobile Number': personal.mobileNumber || personal.mobile || '',
        'WhatsApp Number': personal.whatsappNumber || '',
        'Personal Email': personal.personalEmail || personal.email || '',
        'Residential Address': personal.residentialAddress || personal.currentAddress || '',
        'Permanent Address': personal.permanentAddress || '',
        'Emergency Contact Name': primaryEmerg?.name || personal.emergencyContactName || '',
        'Emergency Contact Relationship': primaryEmerg?.relationship || personal.emergencyContactRelation || '',
        'Emergency Contact Phone': primaryEmerg?.contactNumber || personal.emergencyContactPhone || '',
        'Civil ID Number': civilId?.civilIdNumber || personal.civilIdNumber || '',
        'Civil ID Expiry Date': civilId?.expiryDate || personal.civilIdExpiryDate || '',
        'Passport Number': passport?.documentNumber || personal.passportNumber || '',
        'Passport Expiry Date': passport?.expiryDate || personal.passportExpiryDate || '',
        'Visa Number': visa?.visaNumber || personal.visaNumber || '',
        'Visa Expiry Date': visa?.expiryDate || personal.visaExpiryDate || '',
        'Visa Trade': visa?.tradeOnVisa || '',
        'Visa Sponsor': visa?.sponsor || '',
        'Driving Licence Number': dl?.licenceNumber || personal.drivingLicenceNumber || '',
        'Driving Licence Expiry Date': dl?.expiryDate || personal.drivingLicenceExpiryDate || '',
        'Opening Loan Balance': activeLoan ? roundOMR(activeLoan.loanAmount).toFixed(3) : '0.000',
        'Monthly Loan Recovery': activeLoan ? roundOMR(activeLoan.monthlyRecoveryAmount).toFixed(3) : '0.000',
        'Opening Salary Balance': '0.000',
      };
    });

    if (isCsv) {
      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Employee_Master_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send('\uFEFF' + csv);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
      { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 15 },
      { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 24 }, { wch: 14 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
      { wch: 26 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 28 }, { wch: 28 },
      { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
      { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Employee_Master');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Employee_Master_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export employees' });
  }
});

// GET /api/employees/:id - Get single employee + designation & salary histories
router.get('/:id', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    let employee = db.employees.findById(id);
    if (!employee) {
      // Try by business employeeId
      employee = db.employees.findByEmployeeId(id);
    }
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const designationHistory = db.employees.getDesignationHistory(employee.employeeId);
    const salaryHistory = db.employees.getSalaryHistory(employee.employeeId);
    const personal = db.personalDetails.get(normalizeEmployeeId(employee.employeeId));

    res.json({
      ...employee,
      fatherName: (employee as any).fatherName || personal?.fatherName || '',
      bankName: employee.bankName || personal?.bankName || '',
      bankAccountNumber: employee.bankAccountNumber || personal?.bankAccountNumber || '',
      iban: employee.iban || personal?.iban || '',
      bankBranch: employee.bankBranch || personal?.bankBranch || '',
      accountHolderName: employee.accountHolderName || personal?.accountHolderName || employee.employeeName,
      designationHistory,
      salaryHistory,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch employee' });
  }
});

// POST /api/employees - Create new employee
router.post('/', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const {
      employeeId,
      employeeName,
      employeeType = 'Staff',
      nationalityType = 'Expat',
      wageType = 'Fixed Monthly',
      dateOfJoining,
      dateOfLeaving,
      designation = 'Staff',
      employeeCompany = 'DGO',
      salaryPaidBy = 'DGO',
      monthlySalaryOrRate = 0,
      wpsEmployee = 'No',
      wpsSalary = 0,
      actualSalary = 0,
      recoverFrom,
      bankName,
      bankAccountNumber,
      iban,
      bankBranch,
      accountHolderName,
      photoUrl,
      personalDetails,
    } = req.body;

    if (!employeeId || !employeeName) {
      return res.status(400).json({ error: 'Employee ID and Full Name are required.' });
    }

    const normalizedId = normalizeEmployeeId(employeeId);
    if (!normalizedId) {
      return res.status(400).json({ error: 'Employee ID cannot be empty.' });
    }

    const existing = db.employees.findByEmployeeId(normalizedId);
    if (existing) {
      return res.status(400).json({ error: `Employee ID '${normalizedId}' already exists in the system.` });
    }

    if (!isValidEmployeeType(employeeType)) {
      return res.status(400).json({ error: 'Employee Type must be Worker or Staff.' });
    }
    if (!isValidNationalityType(nationalityType)) {
      return res.status(400).json({ error: 'Nationality Type must be Omani or Expat.' });
    }
    if (!isValidWageType(wageType)) {
      return res.status(400).json({ error: 'Wage Type must be Per Hour or Fixed Monthly.' });
    }
    if (!isValidEmployeeCompany(employeeCompany)) {
      return res.status(400).json({ error: 'Employee Company must be DGO, SMI, NC, Supplier, or Azad.' });
    }
    if (!isValidSalaryPaidBy(salaryPaidBy)) {
      return res.status(400).json({ error: 'Salary Paid By must be DGO, SMI, NC, or Supplier.' });
    }

    const numericSalary = Number(monthlySalaryOrRate);
    if (isNaN(numericSalary) || numericSalary < 0) {
      return res.status(400).json({ error: 'Monthly Salary / Wage Rate cannot be negative.' });
    }
    if (wpsSalary !== undefined && (isNaN(Number(wpsSalary)) || Number(wpsSalary) < 0)) {
      return res.status(400).json({ error: 'WPS Salary cannot be negative.' });
    }
    if (actualSalary !== undefined && (isNaN(Number(actualSalary)) || Number(actualSalary) < 0)) {
      return res.status(400).json({ error: 'Actual Salary cannot be negative.' });
    }
    if (dateOfJoining && !isValidDateString(dateOfJoining)) {
      return res.status(400).json({ error: 'Date of Joining is not a valid date.' });
    }
    if (dateOfLeaving) {
      if (!isValidDateString(dateOfLeaving)) {
        return res.status(400).json({ error: 'Date of Leaving is not a valid date.' });
      }
      if (dateOfJoining && dateOfLeaving < dateOfJoining) {
        return res.status(400).json({ error: 'Date of Leaving cannot be before Date of Joining.' });
      }
    }

    const timestamp = new Date().toISOString();
    const finalBankName = bankName ? String(bankName).trim() : (personalDetails?.bankName ? String(personalDetails.bankName).trim() : '');
    const finalBankAccountNumber = bankAccountNumber ? String(bankAccountNumber).trim() : (personalDetails?.bankAccountNumber ? String(personalDetails.bankAccountNumber).trim() : '');
    const finalIban = iban ? String(iban).trim().toUpperCase() : (personalDetails?.iban ? String(personalDetails.iban).trim().toUpperCase() : '');
    const finalBankBranch = bankBranch ? String(bankBranch).trim() : (personalDetails?.bankBranch ? String(personalDetails.bankBranch).trim() : '');
    const finalAccountHolderName = accountHolderName ? String(accountHolderName).trim() : (personalDetails?.accountHolderName ? String(personalDetails.accountHolderName).trim() : employeeName.trim());

    if (finalBankAccountNumber) {
      const accCheck = validateBankAccountNumber(finalBankAccountNumber, finalBankName);
      if (!accCheck.isValid) {
        return res.status(400).json({ error: `Invalid Bank Account Number: ${accCheck.error}` });
      }
    }
    if (finalIban) {
      const ibanCheck = validateIban(finalIban, finalBankName);
      if (!ibanCheck.isValid) {
        return res.status(400).json({ error: `Invalid Bank IBAN: ${ibanCheck.error}` });
      }
    }

    const effectivePhoto = photoUrl || personalDetails?.photoUrl || undefined;

    const newEmployee: Employee = {
      id: crypto.randomUUID(),
      employeeId: normalizedId,
      employeeName: employeeName.trim(),
      photoUrl: effectivePhoto,
      employeeType,
      nationalityType,
      wageType,
      dateOfJoining: dateOfJoining || new Date().toISOString().split('T')[0],
      dateOfLeaving: dateOfLeaving || null,
      designation: (designation || 'Staff').trim(),
      employeeCompany,
      salaryPaidBy,
      monthlySalaryOrRate: roundOMR(numericSalary),
      wpsEmployee: wpsEmployee === 'Yes' ? 'Yes' : 'No',
      wpsSalary: roundOMR(Number(wpsSalary) || 0),
      actualSalary: roundOMR(Number(actualSalary) || numericSalary),
      recoverFrom: recoverFrom ? recoverFrom.trim() : (wpsEmployee === 'Yes' ? employeeCompany : ''),
      isActive: true,
      bankName: finalBankName,
      bankAccountNumber: finalBankAccountNumber,
      iban: finalIban,
      bankBranch: finalBankBranch,
      accountHolderName: finalAccountHolderName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.employees.create(newEmployee);

    const mergedPersonal = {
      ...(personalDetails && typeof personalDetails === 'object' ? personalDetails : {}),
      employeeId: normalizedId,
      photoUrl: effectivePhoto,
      bankName: finalBankName,
      bankAccountNumber: finalBankAccountNumber,
      iban: finalIban,
      bankBranch: finalBankBranch,
      accountHolderName: finalAccountHolderName,
    };
    await db.personalDetails.save(normalizedId, mergedPersonal);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'EMPLOYEE_CREATED',
      module: 'Employee Master',
      recordId: newEmployee.id,
      description: `Created employee ${newEmployee.employeeId} (${newEmployee.employeeName}, ${newEmployee.designation}) at ${newEmployee.employeeCompany}.`,
    });

    res.status(201).json(newEmployee);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create employee' });
  }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.employees.findById(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const {
      employeeName,
      employeeType,
      nationalityType,
      wageType,
      dateOfJoining,
      dateOfLeaving,
      designation,
      employeeCompany,
      salaryPaidBy,
      monthlySalaryOrRate,
      wpsEmployee,
      wpsSalary,
      actualSalary,
      recoverFrom,
      isActive,
      bankName,
      bankAccountNumber,
      iban,
      bankBranch,
      accountHolderName,
      photoUrl,
      personalDetails,
    } = req.body;

    const updates: Partial<Employee> = {};
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;
    if (employeeName) updates.employeeName = employeeName.trim();
    if (employeeType && isValidEmployeeType(employeeType)) updates.employeeType = employeeType;
    if (nationalityType && isValidNationalityType(nationalityType)) updates.nationalityType = nationalityType;
    if (wageType && isValidWageType(wageType)) updates.wageType = wageType;
    if (dateOfJoining) updates.dateOfJoining = dateOfJoining;
    if (dateOfLeaving !== undefined) updates.dateOfLeaving = dateOfLeaving || null;
    if (designation) updates.designation = designation.trim();
    if (employeeCompany && isValidEmployeeCompany(employeeCompany)) updates.employeeCompany = employeeCompany;
    if (salaryPaidBy && isValidSalaryPaidBy(salaryPaidBy)) updates.salaryPaidBy = salaryPaidBy;
    if (monthlySalaryOrRate !== undefined) updates.monthlySalaryOrRate = roundOMR(Number(monthlySalaryOrRate));
    if (wpsEmployee !== undefined) updates.wpsEmployee = wpsEmployee === 'Yes' ? 'Yes' : 'No';
    if (wpsSalary !== undefined) updates.wpsSalary = roundOMR(Number(wpsSalary));
    if (actualSalary !== undefined) updates.actualSalary = roundOMR(Number(actualSalary));
    if (recoverFrom !== undefined) updates.recoverFrom = recoverFrom.trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const targetBankName = bankName !== undefined ? String(bankName).trim() : (employee.bankName || '');
    if (bankAccountNumber !== undefined && String(bankAccountNumber).trim()) {
      const accCheck = validateBankAccountNumber(String(bankAccountNumber).trim(), targetBankName);
      if (!accCheck.isValid) {
        return res.status(400).json({ error: `Invalid Bank Account Number: ${accCheck.error}` });
      }
    }
    if (iban !== undefined && String(iban).trim()) {
      const ibanCheck = validateIban(String(iban).trim(), targetBankName);
      if (!ibanCheck.isValid) {
        return res.status(400).json({ error: `Invalid Bank IBAN: ${ibanCheck.error}` });
      }
    }

    if (bankName !== undefined) updates.bankName = String(bankName).trim();
    if (bankAccountNumber !== undefined) updates.bankAccountNumber = String(bankAccountNumber).trim();
    if (iban !== undefined) updates.iban = String(iban).trim().toUpperCase();
    if (bankBranch !== undefined) updates.bankBranch = String(bankBranch).trim();
    if (accountHolderName !== undefined) updates.accountHolderName = String(accountHolderName).trim();

    const updated = await db.employees.update(id, updates, req.user?.username);

    // Synchronize to personal details store
    const existingPersonal = db.personalDetails.get(employee.employeeId) || {};
    const mergedPersonal = {
      ...existingPersonal,
      ...(personalDetails && typeof personalDetails === 'object' ? personalDetails : {}),
      ...(bankName !== undefined ? { bankName: String(bankName).trim() } : {}),
      ...(bankAccountNumber !== undefined ? { bankAccountNumber: String(bankAccountNumber).trim() } : {}),
      ...(iban !== undefined ? { iban: String(iban).trim().toUpperCase() } : {}),
      ...(bankBranch !== undefined ? { bankBranch: String(bankBranch).trim() } : {}),
      ...(accountHolderName !== undefined ? { accountHolderName: String(accountHolderName).trim() } : {}),
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      employeeId: employee.employeeId,
    };
    await db.personalDetails.save(employee.employeeId, mergedPersonal);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'EMPLOYEE_UPDATED',
      module: 'Employee Master',
      recordId: id,
      description: `Updated employee details for ${employee.employeeId} (${employee.employeeName}).`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update employee' });
  }
});

// PATCH /api/employees/:id/toggle-active
router.patch('/:id/toggle-active', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.employees.findById(id);
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    const newStatus = !employee.isActive;
    const updated = await db.employees.update(id, {
      isActive: newStatus,
      dateOfLeaving: newStatus ? null : (employee.dateOfLeaving || new Date().toISOString().split('T')[0]),
    }, req.user?.username);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: newStatus ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED',
      module: 'Employee Master',
      recordId: id,
      description: `${newStatus ? 'Activated' : 'Deactivated'} employee ${employee.employeeId} (${employee.employeeName}).`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle employee status' });
  }
});

// POST /api/employees/import/validate - Parse and validate uploaded Excel or CSV file
router.post('/import/validate', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
  try {
    const { fileData } = req.body; // Base64 data from client
    if (!fileData) {
      return res.status(400).json({ error: 'No Excel or CSV file data received.' });
    }

    const buffer = Buffer.from(fileData.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    // Smart sheet detection: find the sheet containing employee headers or data,
    // avoiding reading the 'Instructions & Dropdowns' sheet if it happens to be first.
    let targetSheetName = workbook.SheetNames[0];
    for (const name of workbook.SheetNames) {
      if (name.toLowerCase().includes('instruction')) continue;
      const ws = workbook.Sheets[name];
      if (!ws) continue;
      const sample = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' }) as any[][];
      if (sample && sample[0] && Array.isArray(sample[0])) {
        const hasEmpHeader = sample[0].some((cell: any) => {
          const c = String(cell || '').toLowerCase().replace(/[^a-z]/g, '');
          return c.includes('employeeid') || c.includes('employeename') || c === 'empid' || c === 'id';
        });
        if (hasEmpHeader) {
          targetSheetName = name;
          break;
        }
      }
    }

    const worksheet = workbook.Sheets[targetSheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file contains no data rows.' });
    }

    const seenIdsInFile = new Set<string>();
    const previewRows: any[] = [];
    let newCount = 0;
    let existingCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNumber = i + 2; // Accounting for 1-based header row

      // 1. Basic Employment Information
      const rawId = String(getRowValue(row, ['Employee ID', 'EmployeeID', 'employee_id', 'Emp ID', 'EmpID', 'ID']) || '').trim();
      const rawName = String(getRowValue(row, ['Employee Name', 'EmployeeName', 'employee_name', 'Full Name', 'Name']) || '').trim();
      const rawFather = String(getRowValue(row, ['Father Name', 'FatherName', 'father_name', 'Fathers Name', "Father's Name", 'Father']) || '').trim();
      const rawType = normalizeEmployeeType(getRowValue(row, ['Employee Type', 'EmployeeType', 'employee_type', 'Type', 'Emp Type']));
      const rawNat = normalizeNationalityType(getRowValue(row, ['Nationality Type', 'NationalityType', 'nationality_type', 'Nationality', 'Nation']));
      const rawDesig = String(getRowValue(row, ['Designation', 'designation', 'Job Title', 'JobTitle', 'Position', 'Role']) || '').trim();
      const rawComp = normalizeCompany(getRowValue(row, ['Employee Company', 'EmployeeCompany', 'employee_company', 'Company', 'Emp Company']));
      const rawPaidByInput = normalizePaidBy(getRowValue(row, ['Salary Paid By', 'SalaryPaidBy', 'salary_paid_by', 'Paid By', 'PaidBy']));
      const rawPaidBy = rawPaidByInput || (['DGO', 'SMI', 'NC', 'Supplier'].includes(rawComp) ? rawComp : 'DGO');
      const rawDoj = excelCellToDateString(getRowValue(row, ['Date of Joining', 'DateOfJoining', 'date_of_joining', 'DOJ', 'Joining Date', 'Join Date']));
      const rawDol = excelCellToDateString(getRowValue(row, ['Date of Leaving', 'DateOfLeaving', 'date_of_leaving', 'DOL', 'Leaving Date', 'Leave Date']));
      const rawStatusStr = String(getRowValue(row, ['Employment Status', 'EmploymentStatus', 'Status', 'Is Active']) || '').trim().toLowerCase();
      const isActive = !rawStatusStr.includes('inact') && !rawStatusStr.includes('left') && !rawStatusStr.includes('term');
      const rawProject = String(getRowValue(row, ['Assigned Project', 'AssignedProject', 'Project', 'Project Name', 'Site']) || '').trim();

      // 2. Compensation & WPS
      const rawWage = normalizeWageType(getRowValue(row, ['Wage Type', 'WageType', 'wage_type', 'Wage', 'Pay Type']));
      const rawSalary = cleanNumber(getRowValue(row, ['Monthly Salary / Wage Rate', 'Monthly Salary', 'Wage Rate', 'Salary', 'Rate', 'Basic Salary', 'WageRate', 'MonthlySalary']), 0);
      const rawWps = normalizeWPS(getRowValue(row, ['WPS Employee', 'WPSEmployee', 'wps_employee', 'WPS', 'Is WPS']));
      const rawWpsSalaryInput = cleanNumber(getRowValue(row, ['WPS Salary', 'WPSSalary', 'wps_salary']), 0);
      const rawWpsSalary = rawWps === 'Yes' ? (rawWpsSalaryInput > 0 ? rawWpsSalaryInput : rawSalary) : 0;
      const rawActualInput = cleanNumber(getRowValue(row, ['Actual Salary', 'ActualSalary', 'actual_salary']), 0);
      const rawActual = rawActualInput > 0 ? rawActualInput : rawSalary;
      const rawRecover = normalizeCompany(getRowValue(row, ['Recover From', 'RecoverFrom', 'recover_from', 'Recovery Company'])) || (rawWps === 'Yes' ? rawComp : '');

      // 3. Banking Details
      const rawBankName = String(getRowValue(row, ['Bank Name', 'BankName', 'bank_name', 'Bank']) || '').trim();
      const rawBankAccount = String(getRowValue(row, ['Bank Account Number', 'BankAccountNumber', 'bank_account_number', 'Account Number', 'Account No', 'Bank Account']) || '').trim();
      const rawIban = String(getRowValue(row, ['Bank IBAN', 'BankIBAN', 'IBAN', 'iban', 'Bank Iban']) || '').trim().toUpperCase();

      // 4. Personal Information & Demographics
      const rawDob = excelCellToDateString(getRowValue(row, ['Date of Birth', 'DateOfBirth', 'date_of_birth', 'DOB', 'Birth Date']));
      const rawGender = normalizeGender(getRowValue(row, ['Gender', 'gender', 'Sex', 'sex']));
      const rawMarital = normalizeMaritalStatus(getRowValue(row, ['Marital Status', 'MaritalStatus', 'marital_status']));
      const rawBlood = normalizeBloodGroup(getRowValue(row, ['Blood Group', 'BloodGroup', 'blood_group', 'Blood']));
      const rawMobile = String(getRowValue(row, ['Mobile Number', 'MobileNumber', 'mobile_number', 'Mobile', 'Phone', 'Phone Number']) || '').trim();
      const rawWhatsapp = String(getRowValue(row, ['WhatsApp Number', 'WhatsAppNumber', 'whatsapp_number', 'WhatsApp', 'Whatsapp']) || '').trim();
      const rawEmail = String(getRowValue(row, ['Personal Email', 'PersonalEmail', 'personal_email', 'Email', 'Email Address']) || '').trim();
      const rawResAddress = String(getRowValue(row, ['Residential Address', 'ResidentialAddress', 'residential_address', 'Current Address', 'Accommodation', 'Address']) || '').trim();
      const rawPermAddress = String(getRowValue(row, ['Permanent Address', 'PermanentAddress', 'permanent_address', 'Home Address']) || '').trim();
      const rawEmergName = String(getRowValue(row, ['Emergency Contact Name', 'EmergencyContactName', 'emergency_contact_name', 'Emergency Contact']) || '').trim();
      const rawEmergRel = String(getRowValue(row, ['Emergency Contact Relationship', 'EmergencyContactRelationship', 'emergency_contact_relationship', 'Relationship', 'Relation']) || '').trim();
      const rawEmergPhone = String(getRowValue(row, ['Emergency Contact Phone', 'EmergencyContactPhone', 'emergency_contact_phone', 'Emergency Phone']) || '').trim();

      // 5. Statutory & Government Documents
      const rawCivilId = String(getRowValue(row, ['Civil ID Number', 'CivilIDNumber', 'Civil ID', 'CivilId', 'Civil ID No', 'Resident Card', 'civil_id_number']) || '').trim();
      const rawCivilIdExp = excelCellToDateString(getRowValue(row, ['Civil ID Expiry Date', 'CivilIDExpiryDate', 'Civil ID Expiry', 'civil_id_expiry_date']));
      const rawPassport = String(getRowValue(row, ['Passport Number', 'PassportNumber', 'Passport', 'Passport No', 'passport_number']) || '').trim();
      const rawPassportExp = excelCellToDateString(getRowValue(row, ['Passport Expiry Date', 'PassportExpiryDate', 'Passport Expiry', 'passport_expiry_date']));
      const rawVisa = String(getRowValue(row, ['Visa Number', 'VisaNumber', 'Visa No', 'Visa', 'visa_number']) || '').trim();
      const rawVisaExp = excelCellToDateString(getRowValue(row, ['Visa Expiry Date', 'VisaExpiryDate', 'Visa Expiry', 'visa_expiry_date']));
      const rawVisaTrade = String(getRowValue(row, ['Visa Trade', 'VisaTrade', 'Trade On Visa', 'visa_trade']) || '').trim();
      const rawVisaSponsor = String(getRowValue(row, ['Visa Sponsor', 'VisaSponsor', 'Sponsor', 'visa_sponsor']) || '').trim();
      const rawDL = String(getRowValue(row, ['Driving Licence Number', 'DrivingLicenceNumber', 'Driving License Number', 'Driving Licence', 'Driving License', 'DL Number', 'driving_licence_number']) || '').trim();
      const rawDLExp = excelCellToDateString(getRowValue(row, ['Driving Licence Expiry Date', 'DrivingLicenceExpiryDate', 'Driving License Expiry Date', 'DL Expiry Date', 'DL Expiry', 'driving_licence_expiry_date']));

      // 6. Ledger & Opening Balances
      const rawOpeningLoan = cleanNumber(getRowValue(row, ['Opening Loan Balance', 'OpeningLoanBalance', 'opening_loan_balance', 'Loan Balance', 'Loan Amount']), 0);
      const rawLoanRecovery = cleanNumber(getRowValue(row, ['Monthly Loan Recovery', 'MonthlyLoanRecovery', 'monthly_loan_recovery', 'Loan Recovery', 'Monthly Deduction']), 0);
      const rawOpeningSalary = cleanNumber(getRowValue(row, ['Opening Salary Balance', 'OpeningSalaryBalance', 'opening_salary_balance', 'Salary Balance']), 0);

      // Skip completely empty rows that Excel often generates at the bottom
      if (!rawId && !rawName && !rawDesig && !rawType) {
        continue;
      }

      const normalizedId = normalizeEmployeeId(rawId);
      const finalDoj = rawDoj || new Date().toISOString().split('T')[0];
      const finalDol = rawDol || null;

      // Validation Checks
      let status: 'New' | 'Existing' | 'Duplicate' | 'Invalid' = 'New';
      let reason = 'Ready to import';

      const fieldError = validateEmployeeFields({
        employeeId: normalizedId,
        employeeName: rawName,
        employeeType: rawType,
        nationalityType: rawNat,
        wageType: rawWage,
        designation: rawDesig,
        employeeCompany: rawComp,
        salaryPaidBy: rawPaidBy,
        salary: rawSalary,
        wpsSalary: rawWpsSalary,
        actualSalary: rawActual,
        dateOfJoining: finalDoj,
        dateOfLeaving: rawDol || '',
        bankName: rawBankName,
        bankAccountNumber: rawBankAccount,
        iban: rawIban,
      });

      if (fieldError) {
        status = 'Invalid';
        reason = fieldError;
      } else if (seenIdsInFile.has(normalizedId)) {
        status = 'Duplicate';
        reason = `Duplicate Employee ID '${normalizedId}' in spreadsheet`;
      } else {
        seenIdsInFile.add(normalizedId);
        const existsInDb = db.employees.findByEmployeeId(normalizedId);
        if (existsInDb) {
          status = 'Existing';
          reason = `Employee ID '${normalizedId}' already exists in database`;
        }
      }

      if (status === 'New') newCount++;
      else if (status === 'Existing') existingCount++;
      else if (status === 'Duplicate') duplicateCount++;
      else if (status === 'Invalid') invalidCount++;

      previewRows.push({
        rowNumber,
        employeeId: normalizedId || rawId,
        employeeName: rawName,
        fatherName: rawFather,
        employeeType: rawType,
        nationalityType: rawNat,
        wageType: rawWage,
        dateOfJoining: finalDoj,
        dateOfLeaving: finalDol,
        designation: rawDesig,
        employeeCompany: rawComp,
        salaryPaidBy: rawPaidBy,
        monthlySalaryOrRate: roundOMR(Number(rawSalary) || 0),
        wpsEmployee: rawWps,
        wpsSalary: roundOMR(Number(rawWpsSalary) || 0),
        actualSalary: roundOMR(Number(rawActual) || Number(rawSalary) || 0),
        recoverFrom: rawRecover || (rawWps === 'Yes' ? rawComp : ''),
        assignedProject: rawProject,
        isActive,
        bankName: rawBankName,
        bankAccountNumber: rawBankAccount,
        iban: rawIban,
        dateOfBirth: rawDob,
        gender: rawGender,
        maritalStatus: rawMarital,
        bloodGroup: rawBlood,
        mobileNumber: rawMobile,
        whatsappNumber: rawWhatsapp,
        personalEmail: rawEmail,
        residentialAddress: rawResAddress,
        permanentAddress: rawPermAddress,
        emergencyContactName: rawEmergName,
        emergencyContactRelationship: rawEmergRel,
        emergencyContactPhone: rawEmergPhone,
        civilIdNumber: rawCivilId,
        civilIdExpiryDate: rawCivilIdExp,
        passportNumber: rawPassport,
        passportExpiryDate: rawPassportExp,
        visaNumber: rawVisa,
        visaExpiryDate: rawVisaExp,
        visaTrade: rawVisaTrade,
        visaSponsor: rawVisaSponsor,
        drivingLicenceNumber: rawDL,
        drivingLicenceExpiryDate: rawDLExp,
        openingLoanBalance: rawOpeningLoan,
        monthlyLoanRecovery: rawLoanRecovery,
        openingSalaryBalance: rawOpeningSalary,
        status,
        reason,
      });
    }

    res.json({
      summary: {
        totalRows: previewRows.length,
        newCount,
        existingCount,
        duplicateCount,
        invalidCount,
      },
      rows: previewRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to parse file.' });
  }
});

// POST /api/employees/import/confirm - Commit validated rows to database
router.post('/import/confirm', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { rows, updateExisting } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No validated rows provided for import.' });
    }

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const timestamp = new Date().toISOString();

    const errors: Array<{ rowNumber: number; employeeId: string; employeeName: string; errorType: string; description: string }> = [];

    for (const r of rows) {
      if (r.status === 'Invalid' || r.status === 'Duplicate') {
        skippedCount++;
        continue;
      }

      // Defense-in-depth: re-validate every row server-side
      const rowDoj = r.dateOfJoining || timestamp.split('T')[0];
      const rowDol = r.dateOfLeaving || '';
      const fieldError = validateEmployeeFields({
        employeeId: normalizeEmployeeId(r.employeeId),
        employeeName: r.employeeName,
        employeeType: r.employeeType,
        nationalityType: r.nationalityType,
        wageType: r.wageType,
        designation: r.designation,
        employeeCompany: r.employeeCompany,
        salaryPaidBy: r.salaryPaidBy,
        salary: r.monthlySalaryOrRate,
        wpsSalary: r.wpsSalary,
        actualSalary: r.actualSalary,
        dateOfJoining: rowDoj,
        dateOfLeaving: rowDol,
        bankName: r.bankName,
        bankAccountNumber: r.bankAccountNumber,
        iban: r.iban,
      });

      if (fieldError) {
        errors.push({ rowNumber: r.rowNumber, employeeId: r.employeeId, employeeName: r.employeeName, errorType: 'Invalid', description: fieldError });
        skippedCount++;
        continue;
      }

      const normId = normalizeEmployeeId(r.employeeId);
      const existing = db.employees.findByEmployeeId(normId);

      try {
        if (existing) {
          if (updateExisting) {
            await db.employees.update(existing.id, {
              employeeName: r.employeeName,
              employeeType: r.employeeType,
              nationalityType: r.nationalityType,
              wageType: r.wageType,
              dateOfJoining: r.dateOfJoining,
              dateOfLeaving: r.dateOfLeaving,
              designation: r.designation,
              employeeCompany: r.employeeCompany,
              salaryPaidBy: r.salaryPaidBy,
              monthlySalaryOrRate: roundOMR(Number(r.monthlySalaryOrRate)),
              wpsEmployee: r.wpsEmployee,
              wpsSalary: roundOMR(Number(r.wpsSalary)),
              actualSalary: roundOMR(Number(r.actualSalary)),
              recoverFrom: r.recoverFrom,
              isActive: r.isActive !== undefined ? Boolean(r.isActive) : existing.isActive,
            }, req.user?.username);
            updatedCount++;
          } else {
            skippedCount++;
            continue;
          }
        } else {
          const newEmp: Employee = {
            id: crypto.randomUUID(),
            employeeId: normId,
            employeeName: r.employeeName,
            employeeType: r.employeeType,
            nationalityType: r.nationalityType,
            wageType: r.wageType,
            dateOfJoining: r.dateOfJoining || timestamp.split('T')[0],
            dateOfLeaving: r.dateOfLeaving || null,
            designation: r.designation,
            employeeCompany: r.employeeCompany,
            salaryPaidBy: r.salaryPaidBy,
            monthlySalaryOrRate: roundOMR(Number(r.monthlySalaryOrRate)),
            wpsEmployee: r.wpsEmployee === 'Yes' ? 'Yes' : 'No',
            wpsSalary: roundOMR(Number(r.wpsSalary) || 0),
            actualSalary: roundOMR(Number(r.actualSalary) || Number(r.monthlySalaryOrRate) || 0),
            recoverFrom: r.recoverFrom || (r.wpsEmployee === 'Yes' ? r.employeeCompany : ''),
            isActive: r.isActive !== undefined ? Boolean(r.isActive) : true,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await db.employees.create(newEmp);
          importedCount++;
        }

        // Commit Personal Details (including Father Name, Demographics, Banking, and Contacts)
        const existingPersonal = db.personalDetails.get(normId) || {};
        const emergencyContacts = [...(existingPersonal.emergencyContacts || [])];
        if (r.emergencyContactName || r.emergencyContactPhone) {
          const contactObj = {
            name: r.emergencyContactName || 'Emergency Contact',
            relationship: r.emergencyContactRelationship || 'Contact',
            contactNumber: r.emergencyContactPhone || '',
            isPrimary: true,
          };
          if (emergencyContacts.length > 0) {
            emergencyContacts[0] = contactObj;
          } else {
            emergencyContacts.push(contactObj);
          }
        }

        const updatedPersonal: EmployeePersonalDetails = {
          ...existingPersonal,
          employeeId: normId,
          fatherName: r.fatherName || existingPersonal.fatherName || '',
          dateOfBirth: r.dateOfBirth || existingPersonal.dateOfBirth,
          dob: r.dateOfBirth || existingPersonal.dob,
          gender: r.gender || existingPersonal.gender || 'Male',
          maritalStatus: r.maritalStatus || existingPersonal.maritalStatus || 'Single',
          bloodGroup: r.bloodGroup || existingPersonal.bloodGroup,
          mobileNumber: r.mobileNumber || existingPersonal.mobileNumber,
          whatsappNumber: r.whatsappNumber || existingPersonal.whatsappNumber,
          personalEmail: r.personalEmail || existingPersonal.personalEmail,
          residentialAddress: r.residentialAddress || existingPersonal.residentialAddress,
          permanentAddress: r.permanentAddress || existingPersonal.permanentAddress,
          bankName: r.bankName || existingPersonal.bankName,
          bankAccountNumber: r.bankAccountNumber || existingPersonal.bankAccountNumber,
          iban: r.iban || existingPersonal.iban,
          assignedProject: r.assignedProject || existingPersonal.assignedProject,
          emergencyContacts: emergencyContacts.length > 0 ? emergencyContacts : existingPersonal.emergencyContacts,
          civilIdNumber: r.civilIdNumber || existingPersonal.civilIdNumber,
          civilIdExpiryDate: r.civilIdExpiryDate || existingPersonal.civilIdExpiryDate,
          passportNumber: r.passportNumber || existingPersonal.passportNumber,
          passportExpiryDate: r.passportExpiryDate || existingPersonal.passportExpiryDate,
          visaNumber: r.visaNumber || existingPersonal.visaNumber,
          visaExpiryDate: r.visaExpiryDate || existingPersonal.visaExpiryDate,
          drivingLicenceNumber: r.drivingLicenceNumber || existingPersonal.drivingLicenceNumber,
          drivingLicenceExpiryDate: r.drivingLicenceExpiryDate || existingPersonal.drivingLicenceExpiryDate,
          updatedAt: timestamp,
        };
        await db.personalDetails.save(normId, updatedPersonal);

        // Commit Statutory Records: Civil ID
        if (r.civilIdNumber) {
          const existingCivil = db.civilIds.getAll().find(c => normalizeEmployeeId(c.employeeId) === normId);
          if (existingCivil) {
            await db.civilIds.update(existingCivil.id, {
              civilIdNumber: r.civilIdNumber,
              expiryDate: r.civilIdExpiryDate || existingCivil.expiryDate,
              country: 'Oman',
            });
          } else {
            await db.civilIds.create({
              id: crypto.randomUUID(),
              employeeId: normId,
              civilIdNumber: r.civilIdNumber,
              issueDate: '',
              expiryDate: r.civilIdExpiryDate || '',
              issuingAuthority: 'ROP',
              country: 'Oman',
              status: 'Valid',
              isCurrent: true,
              createdAt: timestamp,
              updatedAt: timestamp,
              createdBy: req.user?.username || 'Import',
            });
          }
        }

        // Commit Statutory Records: Passport
        if (r.passportNumber) {
          const existingPassport = db.governmentDocuments.getAll().find(g => normalizeEmployeeId(g.employeeId) === normId && g.documentType === 'Passport');
          if (existingPassport) {
            await db.governmentDocuments.update(existingPassport.id, {
              documentNumber: r.passportNumber,
              expiryDate: r.passportExpiryDate || existingPassport.expiryDate,
            });
          } else {
            await db.governmentDocuments.create({
              id: crypto.randomUUID(),
              employeeId: normId,
              documentType: 'Passport',
              documentNumber: r.passportNumber,
              issueDate: '',
              expiryDate: r.passportExpiryDate || '',
              status: 'Valid',
              isCurrent: true,
              createdAt: timestamp,
              updatedAt: timestamp,
              createdBy: req.user?.username || 'Import',
            });
          }
        }

        // Commit Statutory Records: Visa
        if (r.visaNumber) {
          const existingVisa = db.visas.getAll().find(v => normalizeEmployeeId(v.employeeId) === normId);
          if (existingVisa) {
            await db.visas.update(existingVisa.id, {
              visaNumber: r.visaNumber,
              expiryDate: r.visaExpiryDate || existingVisa.expiryDate,
              tradeOnVisa: r.visaTrade || existingVisa.tradeOnVisa,
              sponsor: r.visaSponsor || existingVisa.sponsor,
            });
          } else {
            await db.visas.create({
              id: crypto.randomUUID(),
              employeeId: normId,
              visaNumber: r.visaNumber,
              visaType: 'Work Visa',
              sponsor: r.visaSponsor || r.employeeCompany,
              issueDate: '',
              expiryDate: r.visaExpiryDate || '',
              effectiveFrom: r.dateOfJoining || timestamp.slice(0, 10),
              status: 'Valid',
              isCurrent: true,
              tradeOnVisa: r.visaTrade || r.designation,
              issuingAuthority: 'ROP Immigration',
              country: 'Oman',
              createdAt: timestamp,
              updatedAt: timestamp,
              createdBy: req.user?.username || 'Import',
            });
          }
        }

        // Commit Statutory Records: Driving Licence
        if (r.drivingLicenceNumber) {
          const existingDL = db.drivingLicences.getAll().find(d => normalizeEmployeeId(d.employeeId) === normId);
          if (existingDL) {
            await db.drivingLicences.update(existingDL.id, {
              licenceNumber: r.drivingLicenceNumber,
              expiryDate: r.drivingLicenceExpiryDate || existingDL.expiryDate,
            });
          } else {
            await db.drivingLicences.create({
              id: crypto.randomUUID(),
              employeeId: normId,
              licenceNumber: r.drivingLicenceNumber,
              category: 'Light Vehicle',
              issuingCountry: 'Oman',
              issuingAuthority: 'ROP',
              issueDate: '',
              expiryDate: r.drivingLicenceExpiryDate || '',
              status: 'Valid',
              isCurrent: true,
              createdAt: timestamp,
              updatedAt: timestamp,
              createdBy: req.user?.username || 'Import',
            });
          }
        }

        // Commit Ledger / Opening Loan Balance
        const loanAmt = Number(r.openingLoanBalance);
        if (loanAmt > 0) {
          const hasActiveLoan = db.loans.getAll().some(l => normalizeEmployeeId(l.employeeId) === normId && l.status === 'Active');
          if (!hasActiveLoan) {
            const recoveryAmt = Number(r.monthlyLoanRecovery) > 0 ? Number(r.monthlyLoanRecovery) : Math.min(50, loanAmt);
            await db.loans.create({
              id: crypto.randomUUID(),
              employeeId: normId,
              employeeName: r.employeeName,
              loanAmount: loanAmt,
              loanDate: r.dateOfJoining || timestamp.slice(0, 10),
              monthlyRecoveryAmount: recoveryAmt,
              monthlyDeduction: recoveryAmt,
              status: 'Active',
              remarks: 'Opening Loan Balance from Employee Import',
              createdAt: timestamp,
              updatedAt: timestamp,
            });
          }
        }
      } catch (rowErr: any) {
        errors.push({ rowNumber: r.rowNumber, employeeId: r.employeeId, employeeName: r.employeeName, errorType: 'Database Error', description: rowErr.message || 'Failed to save this row.' });
        skippedCount++;
      }
    }

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'EMPLOYEES_IMPORTED',
      module: 'Employee Master',
      description: `Excel Import completed: ${importedCount} new employees created, ${updatedCount} updated, ${skippedCount} skipped.`,
    });

    res.json({
      success: true,
      message: `Import successful: ${importedCount} created, ${updatedCount} updated, ${skippedCount} skipped.`,
      importedCount,
      updatedCount,
      skippedCount,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit employee import.' });
  }
});

// ==========================================
// OMAN HR COMPLIANCE & GOVERNMENT DOCUMENTS
// ==========================================

// GET /api/employees/:employeeId/compliance - Full compliance 360 overview
router.get('/:employeeId/compliance', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) {
      return res.status(404).json({ error: `Employee ${employeeId} not found.` });
    }

    const currentCivilId = db.civilIds.getCurrent(norm);
    const civilIdHistory = db.civilIds.getByEmployeeId(norm);
    const currentDrivingLicence = db.drivingLicences.getCurrent(norm);
    const drivingLicenceHistory = db.drivingLicences.getByEmployeeId(norm);
    const currentVisa = db.visas.getCurrent(norm);
    const visaHistory = db.visas.getByEmployeeId(norm);
    const governmentDocuments = db.governmentDocuments.getByEmployeeId(norm);
    const personalDetails = db.personalDetails.get(norm);

    const overallCompliance = calculateOverallCompliance(
      emp,
      currentCivilId,
      currentVisa,
      currentDrivingLicence,
      governmentDocuments
    );

    const tradeDiscrepancy = currentVisa
      ? checkTradeDiscrepancy(emp.designation, currentVisa.tradeOnVisa)
      : { hasWarning: false, message: '' };

    // Sensitive ID numbers (Civil ID, Visa, Licence, government document numbers) are only
    // sent unmasked to roles holding compliance.reveal; everyone else gets the masked form,
    // since the frontend's own masking is a display preference, not a security boundary.
    const hasReveal = roleHasPermission(req.user?.role, 'compliance.reveal');
    const maskField = <T extends Record<string, any>>(record: T | null | undefined, field: keyof T): T | null | undefined => {
      if (!record || hasReveal) return record;
      const value = record[field];
      if (value === undefined || value === null || value === '') return record;
      return { ...record, [field]: maskSensitiveId(String(value)) };
    };

    res.json({
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      employeeType: emp.employeeType,
      nationalityType: emp.nationalityType,
      designation: emp.designation,
      employeeCompany: emp.employeeCompany,
      overallCompliance,
      tradeDiscrepancy,
      currentCivilId: maskField(currentCivilId, 'civilIdNumber'),
      civilIdHistory: civilIdHistory.map((r) => maskField(r, 'civilIdNumber')),
      currentDrivingLicence: maskField(currentDrivingLicence, 'licenceNumber'),
      drivingLicenceHistory: drivingLicenceHistory.map((r) => maskField(r, 'licenceNumber')),
      currentVisa: maskField(currentVisa, 'visaNumber'),
      visaHistory: visaHistory.map((r) => maskField(r, 'visaNumber')),
      governmentDocuments: governmentDocuments.map((r) => maskField(r, 'documentNumber')),
      personalDetails,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch employee compliance details.' });
  }
});

// --- CIVIL ID ---

// GET /api/employees/:employeeId/civil-id
router.get('/:employeeId/civil-id', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const records = db.civilIds.getByEmployeeId(employeeId);
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:employeeId/civil-id - Create initial or update Civil ID
router.post('/:employeeId/civil-id', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      civilIdNumber,
      issueDate,
      expiryDate,
      issuingAuthority,
      country,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
    } = req.body;

    if (!civilIdNumber || !expiryDate) {
      return res.status(400).json({ error: 'Civil ID Number and Expiry Date are required.' });
    }

    const newRecord: EmployeeCivilId = {
      id: crypto.randomUUID(),
      employeeId: norm,
      civilIdNumber: String(civilIdNumber).trim(),
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      status: calculateExpiryStatus(expiryDate),
      issuingAuthority: issuingAuthority || 'Royal Oman Police (ROP)',
      country: country || 'Oman',
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.civilIds.create(newRecord);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'CIVIL_ID_UPDATED',
      module: 'Compliance',
      recordId: saved.id,
      description: `Saved Civil ID ${maskSensitiveId(newRecord.civilIdNumber)} for ${emp.employeeName} (${norm}).`,
      ipAddress: req.ip,
    });

    res.json({ record: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save Civil ID.' });
  }
});

// POST /api/employees/:employeeId/civil-id/renew - Renew Civil ID (preserves history)
router.post('/:employeeId/civil-id/renew', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      civilIdNumber,
      issueDate,
      expiryDate,
      issuingAuthority,
      country,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
      replaceReason,
    } = req.body;

    if (!civilIdNumber || !expiryDate) {
      return res.status(400).json({ error: 'Civil ID Number and Expiry Date are required.' });
    }

    const newRecord: EmployeeCivilId = {
      id: crypto.randomUUID(),
      employeeId: norm,
      civilIdNumber: String(civilIdNumber).trim(),
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      status: calculateExpiryStatus(expiryDate),
      issuingAuthority: issuingAuthority || 'Royal Oman Police (ROP)',
      country: country || 'Oman',
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const renewed = await db.civilIds.renew(norm, newRecord, replaceReason, req.user?.username || 'admin');

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'CIVIL_ID_RENEWED',
      module: 'Compliance',
      recordId: renewed.id,
      description: `Renewed Civil ID for ${emp.employeeName} (${norm}). New Expiry: ${renewed.expiryDate}. Reason: ${replaceReason || 'Routine renewal'}`,
      ipAddress: req.ip,
    });

    res.json({ record: renewed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to renew Civil ID.' });
  }
});

// --- DRIVING LICENCE ---

// GET /api/employees/:employeeId/driving-licence
router.get('/:employeeId/driving-licence', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const records = db.drivingLicences.getByEmployeeId(employeeId);
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:employeeId/driving-licence - Create/add Driving Licence
router.post('/:employeeId/driving-licence', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      licenceNumber,
      category,
      issuingCountry,
      issuingAuthority,
      vehicleClass,
      restrictions,
      bloodGroupOnLicence,
      issueDate,
      expiryDate,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
    } = req.body;

    if (!licenceNumber || !category || !expiryDate) {
      return res.status(400).json({ error: 'Licence Number, Category, and Expiry Date are required.' });
    }

    const newRecord: EmployeeDrivingLicence = {
      id: crypto.randomUUID(),
      employeeId: norm,
      licenceNumber: String(licenceNumber).trim(),
      category: category,
      issuingCountry: issuingCountry || 'Oman',
      issuingAuthority: issuingAuthority || 'ROP Directorate General of Traffic',
      vehicleClass: vehicleClass || '',
      restrictions: restrictions || '',
      bloodGroupOnLicence: bloodGroupOnLicence || '',
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      status: calculateExpiryStatus(expiryDate),
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.drivingLicences.create(newRecord);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'DRIVING_LICENCE_UPDATED',
      module: 'Compliance',
      recordId: saved.id,
      description: `Added ${category} Driving Licence ${maskSensitiveId(newRecord.licenceNumber)} for ${emp.employeeName} (${norm}).`,
      ipAddress: req.ip,
    });

    res.json({ record: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save driving licence.' });
  }
});

// POST /api/employees/:employeeId/driving-licence/renew - Renew Driving Licence
router.post('/:employeeId/driving-licence/renew', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      oldLicenceId,
      licenceNumber,
      category,
      issuingCountry,
      issuingAuthority,
      vehicleClass,
      restrictions,
      bloodGroupOnLicence,
      issueDate,
      expiryDate,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
      reason,
    } = req.body;

    if (!licenceNumber || !category || !expiryDate) {
      return res.status(400).json({ error: 'Licence Number, Category, and Expiry Date are required.' });
    }

    const newRecord: EmployeeDrivingLicence = {
      id: crypto.randomUUID(),
      employeeId: norm,
      licenceNumber: String(licenceNumber).trim(),
      category: category,
      issuingCountry: issuingCountry || 'Oman',
      issuingAuthority: issuingAuthority || 'ROP Directorate General of Traffic',
      vehicleClass: vehicleClass || '',
      restrictions: restrictions || '',
      bloodGroupOnLicence: bloodGroupOnLicence || '',
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      status: calculateExpiryStatus(expiryDate),
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const renewed = await db.drivingLicences.renew(
      norm,
      oldLicenceId,
      newRecord,
      reason || 'Renewal',
      req.user?.username || 'admin'
    );

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'DRIVING_LICENCE_RENEWED',
      module: 'Compliance',
      recordId: renewed.id,
      description: `Renewed ${category} Driving Licence for ${emp.employeeName} (${norm}). Expiry: ${renewed.expiryDate}`,
      ipAddress: req.ip,
    });

    res.json({ record: renewed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to renew driving licence.' });
  }
});

// --- VISA & TRADE DETAILS ---

// GET /api/employees/:employeeId/visa
router.get('/:employeeId/visa', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const records = db.visas.getByEmployeeId(employeeId);
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:employeeId/visa - Add/Update Visa
router.post('/:employeeId/visa', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      visaNumber,
      tradeOnVisa,
      visaProfessionCode,
      visaType,
      issueDate,
      expiryDate,
      sponsor,
      sponsorshipType,
      issuingAuthority,
      country,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
      effectiveFrom,
    } = req.body;

    if (!tradeOnVisa || !expiryDate) {
      return res.status(400).json({ error: 'Trade on Visa and Expiry Date are required.' });
    }

    const newRecord: EmployeeVisa = {
      id: crypto.randomUUID(),
      employeeId: norm,
      visaNumber: visaNumber ? String(visaNumber).trim() : '',
      tradeOnVisa: String(tradeOnVisa).trim(),
      visaProfessionCode: visaProfessionCode ? String(visaProfessionCode).trim() : '',
      visaType: visaType || 'Employment Visa',
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      sponsor: sponsor || emp.employeeCompany,
      sponsorshipType: sponsorshipType || 'Corporate',
      issuingAuthority: issuingAuthority || 'Royal Oman Police - Passports & Residence',
      country: country || 'Oman',
      status: calculateExpiryStatus(expiryDate),
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      effectiveFrom: effectiveFrom || issueDate || new Date().toISOString().slice(0, 10),
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.visas.create(newRecord);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'VISA_RECORD_UPDATED',
      module: 'Compliance',
      recordId: saved.id,
      description: `Saved Visa record (Trade: ${saved.tradeOnVisa}) for ${emp.employeeName} (${norm}).`,
      ipAddress: req.ip,
    });

    res.json({ record: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save visa record.' });
  }
});

// POST /api/employees/:employeeId/visa/renew - Renew Visa / Amendment (preserves historical trade records)
router.post('/:employeeId/visa/renew', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      visaNumber,
      tradeOnVisa,
      visaProfessionCode,
      visaType,
      issueDate,
      expiryDate,
      sponsor,
      sponsorshipType,
      issuingAuthority,
      country,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
      effectiveFrom,
      reasonForChange,
    } = req.body;

    if (!tradeOnVisa || !expiryDate) {
      return res.status(400).json({ error: 'Trade on Visa and Expiry Date are required.' });
    }

    const newRecord: EmployeeVisa = {
      id: crypto.randomUUID(),
      employeeId: norm,
      visaNumber: visaNumber ? String(visaNumber).trim() : '',
      tradeOnVisa: String(tradeOnVisa).trim(),
      visaProfessionCode: visaProfessionCode ? String(visaProfessionCode).trim() : '',
      visaType: visaType || 'Employment Visa',
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      sponsor: sponsor || emp.employeeCompany,
      sponsorshipType: sponsorshipType || 'Corporate',
      issuingAuthority: issuingAuthority || 'Royal Oman Police - Passports & Residence',
      country: country || 'Oman',
      status: calculateExpiryStatus(expiryDate),
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      effectiveFrom: effectiveFrom || issueDate || new Date().toISOString().slice(0, 10),
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const renewed = await db.visas.renewOrChangeTrade(
      norm,
      newRecord,
      reasonForChange || 'Visa renewal / trade designation amendment',
      req.user?.username || 'admin'
    );

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'VISA_RECORD_RENEWED',
      module: 'Compliance',
      recordId: renewed.id,
      description: `Renewed / Amended Visa for ${emp.employeeName} (${norm}). Trade: ${renewed.tradeOnVisa}, Expiry: ${renewed.expiryDate}. Reason: ${reasonForChange || 'Renewal'}`,
      ipAddress: req.ip,
    });

    res.json({ record: renewed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to renew visa.' });
  }
});

// --- GOVERNMENT DOCUMENTS (Passport, Work Permit, Residence, Contract) ---

// GET /api/employees/:employeeId/government-documents
router.get('/:employeeId/government-documents', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const records = db.governmentDocuments.getByEmployeeId(employeeId);
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:employeeId/government-documents
router.post('/:employeeId/government-documents', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      documentType,
      documentNumber,
      issueDate,
      expiryDate,
      issuingAuthority,
      country,
      documentAttachment,
      fileName,
      storagePath,
      remarks,
    } = req.body;

    if (!documentType || !documentNumber || !expiryDate) {
      return res.status(400).json({ error: 'Document Type, Document Number, and Expiry Date are required.' });
    }

    const newDoc: EmployeeGovernmentDocument = {
      id: crypto.randomUUID(),
      employeeId: norm,
      documentType,
      documentNumber: String(documentNumber).trim(),
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      issuingAuthority: issuingAuthority || '',
      country: country || (emp.nationalityType === 'Omani' ? 'Oman' : ''),
      status: calculateExpiryStatus(expiryDate),
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.governmentDocuments.create(newDoc);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'GOVERNMENT_DOCUMENT_ADDED',
      module: 'Compliance',
      recordId: saved.id,
      description: `Added ${documentType} (${maskSensitiveId(newDoc.documentNumber)}) for ${emp.employeeName} (${norm}).`,
      ipAddress: req.ip,
    });

    res.json({ record: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save document.' });
  }
});

// POST /api/employees/:employeeId/government-documents/renew - Renew an existing government document
router.post('/:employeeId/government-documents/renew', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const {
      previousDocId,
      documentType,
      documentNumber,
      issueDate,
      expiryDate,
      issuingAuthority,
      country,
      documentAttachment,
      fileName,
      storagePath,
      reasonForRenewal,
      remarks,
    } = req.body;

    if (!documentType || !documentNumber || !expiryDate) {
      return res.status(400).json({ error: 'Document Type, Document Number, and Expiry Date are required.' });
    }

    const newDoc: EmployeeGovernmentDocument = {
      id: crypto.randomUUID(),
      employeeId: norm,
      documentType,
      documentNumber: String(documentNumber).trim(),
      issueDate: issueDate || '',
      expiryDate: String(expiryDate).trim(),
      issuingAuthority: issuingAuthority || '',
      country: country || (emp.nationalityType === 'Omani' ? 'Oman' : ''),
      status: calculateExpiryStatus(expiryDate),
      documentAttachment: documentAttachment || '',
      fileName: fileName || '',
      storagePath: storagePath || '',
      remarks: remarks || '',
      isCurrent: true,
      createdBy: req.user?.username || 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await db.governmentDocuments.renew(
      norm,
      previousDocId || '',
      newDoc,
      reasonForRenewal || 'Renewed with updated document version',
      req.user?.username || 'admin'
    );

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'GOVERNMENT_DOCUMENT_RENEWED',
      module: 'Compliance',
      recordId: saved.id,
      description: `Renewed ${documentType} (${maskSensitiveId(newDoc.documentNumber)}) for ${emp.employeeName} (${norm}). Reason: ${reasonForRenewal || 'Renewed'}`,
      ipAddress: req.ip,
    });

    res.json({ record: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to renew government document.' });
  }
});

// GET /api/employees/:employeeId/document-history - Comprehensive multi-document version history & lifecycle
router.get('/:employeeId/document-history', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const civilIdHistory = db.civilIds.getByEmployeeId(norm);
    const drivingLicenceHistory = db.drivingLicences.getByEmployeeId(norm);
    const visaHistory = db.visas.getByEmployeeId(norm);
    const governmentDocumentsHistory = db.governmentDocuments.getByEmployeeId(norm);
    const repositoryDocuments = db.documents.getByEmployeeId(norm);

    res.json({
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      designation: emp.designation,
      employeeCompany: emp.employeeCompany,
      nationalityType: emp.nationalityType,
      civilIdHistory,
      drivingLicenceHistory,
      visaHistory,
      governmentDocumentsHistory,
      repositoryDocuments,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch document history.' });
  }
});

// DELETE /api/employees/:employeeId/government-documents/:docId
router.delete('/:employeeId/government-documents/:docId', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { docId, employeeId } = req.params;
    const deleted = await db.governmentDocuments.delete(docId);
    if (!deleted) return res.status(404).json({ error: 'Document not found.' });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'GOVERNMENT_DOCUMENT_DELETED',
      module: 'Compliance',
      recordId: docId,
      description: `Deleted government document from employee ${employeeId}.`,
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PERSONAL & CONTACT DETAILS ---

const handleSavePersonalDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const payload = req.body || {};

    const targetBankName = payload.bankName !== undefined ? String(payload.bankName).trim() : (emp.bankName || '');
    if (payload.bankAccountNumber !== undefined && String(payload.bankAccountNumber).trim()) {
      const accCheck = validateBankAccountNumber(String(payload.bankAccountNumber).trim(), targetBankName);
      if (!accCheck.isValid) {
        return res.status(400).json({ error: `Invalid Bank Account Number: ${accCheck.error}` });
      }
    }
    if (payload.iban !== undefined && String(payload.iban).trim()) {
      const ibanCheck = validateIban(String(payload.iban).trim(), targetBankName);
      if (!ibanCheck.isValid) {
        return res.status(400).json({ error: `Invalid Bank IBAN: ${ibanCheck.error}` });
      }
    }

    const saved = await db.personalDetails.save(norm, payload);

    // Synchronize photoUrl back to employee record if provided
    if (payload.photoUrl !== undefined || payload.avatarUrl !== undefined) {
      const photoToSync = payload.photoUrl !== undefined ? payload.photoUrl : payload.avatarUrl;
      await db.employees.update(emp.id, {
        photoUrl: photoToSync,
      });
    }

    // Synchronize employeeName and nationalityType if updated from personal info tab
    if (payload.employeeName || payload.nationalityType) {
      await db.employees.update(emp.id, {
        ...(payload.employeeName && typeof payload.employeeName === 'string' ? { employeeName: payload.employeeName.trim() } : {}),
        ...(payload.nationalityType && isValidNationalityType(payload.nationalityType) ? { nationalityType: payload.nationalityType } : {}),
      });
    }

    // Synchronize bank details back to employee record if provided
    if (
      payload.bankName !== undefined ||
      payload.bankAccountNumber !== undefined ||
      payload.iban !== undefined ||
      payload.bankBranch !== undefined ||
      payload.accountHolderName !== undefined
    ) {
      await db.employees.update(emp.id, {
        ...(payload.bankName !== undefined ? { bankName: String(payload.bankName).trim() } : {}),
        ...(payload.bankAccountNumber !== undefined ? { bankAccountNumber: String(payload.bankAccountNumber).trim() } : {}),
        ...(payload.iban !== undefined ? { iban: String(payload.iban).trim().toUpperCase() } : {}),
        ...(payload.bankBranch !== undefined ? { bankBranch: String(payload.bankBranch).trim() } : {}),
        ...(payload.accountHolderName !== undefined ? { accountHolderName: String(payload.accountHolderName).trim() } : {}),
      });
    }

    // Synchronize critical documents with compliance modules if provided
    const timestamp = new Date().toISOString();

    // 1. Civil ID Sync
    if (payload.civilIdNumber || payload.civilIdAttachment || payload.civilIdExpiryDate) {
      const currentCid = db.civilIds.getCurrent(norm);
      if (currentCid) {
        await db.civilIds.update(currentCid.id, {
          ...(payload.civilIdNumber ? { civilIdNumber: String(payload.civilIdNumber).trim() } : {}),
          ...(payload.civilIdExpiryDate ? { expiryDate: payload.civilIdExpiryDate } : {}),
          ...(payload.civilIdAttachment ? { documentAttachment: payload.civilIdAttachment } : {}),
          ...(payload.civilIdFileName ? { fileName: payload.civilIdFileName } : {}),
          ...(payload.civilIdStoragePath ? { storagePath: payload.civilIdStoragePath } : {}),
          updatedAt: timestamp,
        });
      } else if (payload.civilIdNumber || payload.civilIdExpiryDate) {
        await db.civilIds.create({
          id: crypto.randomUUID(),
          employeeId: norm,
          civilIdNumber: payload.civilIdNumber ? String(payload.civilIdNumber).trim() : 'PENDING',
          issueDate: payload.civilIdIssueDate || '',
          expiryDate: payload.civilIdExpiryDate || new Date(Date.now() + 365 * 86400000 * 2).toISOString().slice(0, 10),
          status: payload.civilIdExpiryDate ? calculateExpiryStatus(payload.civilIdExpiryDate) : 'Valid',
          issuingAuthority: 'Royal Oman Police',
          country: 'Oman',
          documentAttachment: payload.civilIdAttachment || '',
          fileName: payload.civilIdFileName || '',
          storagePath: payload.civilIdStoragePath || '',
          remarks: 'Registered via Personal Information form',
          isCurrent: true,
          createdBy: req.user?.username || 'admin',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    // 2. Passport Sync
    if (payload.passportNumber || payload.passportAttachment || payload.passportExpiryDate) {
      const currentPassport = db.governmentDocuments.getByEmployeeId(norm).find((d) => d.documentType === 'Passport' && d.isCurrent);
      if (currentPassport) {
        await db.governmentDocuments.update(currentPassport.id, {
          ...(payload.passportNumber ? { documentNumber: String(payload.passportNumber).trim() } : {}),
          ...(payload.passportExpiryDate ? { expiryDate: payload.passportExpiryDate } : {}),
          ...(payload.passportAttachment ? { documentAttachment: payload.passportAttachment } : {}),
          ...(payload.passportFileName ? { fileName: payload.passportFileName } : {}),
          ...(payload.passportStoragePath ? { storagePath: payload.passportStoragePath } : {}),
          updatedAt: timestamp,
        });
      } else if (payload.passportNumber || payload.passportExpiryDate || payload.passportAttachment) {
        await db.governmentDocuments.create({
          id: crypto.randomUUID(),
          employeeId: norm,
          documentType: 'Passport',
          documentNumber: payload.passportNumber ? String(payload.passportNumber).trim() : 'PENDING',
          issueDate: payload.passportIssueDate || '',
          expiryDate: payload.passportExpiryDate || new Date(Date.now() + 365 * 86400000 * 5).toISOString().slice(0, 10),
          issuingAuthority: 'Immigration & Passports Authority',
          country: emp.nationalityType === 'Omani' ? 'Oman' : '',
          status: payload.passportExpiryDate ? calculateExpiryStatus(payload.passportExpiryDate) : 'Valid',
          documentAttachment: payload.passportAttachment || '',
          fileName: payload.passportFileName || '',
          storagePath: payload.passportStoragePath || '',
          remarks: 'Registered via Personal Information form',
          isCurrent: true,
          createdBy: req.user?.username || 'admin',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    // 3. Visa Sync (for Expats)
    if (payload.visaNumber || payload.visaAttachment || payload.visaExpiryDate) {
      const currentVisa = db.visas.getCurrent(norm);
      if (currentVisa) {
        await db.visas.update(currentVisa.id, {
          ...(payload.visaNumber ? { visaNumber: String(payload.visaNumber).trim() } : {}),
          ...(payload.visaExpiryDate ? { expiryDate: payload.visaExpiryDate } : {}),
          ...(payload.visaAttachment ? { documentAttachment: payload.visaAttachment } : {}),
          ...(payload.visaFileName ? { fileName: payload.visaFileName } : {}),
          ...(payload.visaStoragePath ? { storagePath: payload.visaStoragePath } : {}),
          updatedAt: timestamp,
        });
      } else if (payload.visaNumber || payload.visaExpiryDate || payload.visaAttachment) {
        await db.visas.create({
          id: crypto.randomUUID(),
          employeeId: norm,
          visaNumber: payload.visaNumber ? String(payload.visaNumber).trim() : 'PENDING',
          tradeOnVisa: emp.designation || 'Worker',
          visaProfessionCode: '',
          visaType: 'Employment Visa',
          issueDate: payload.visaIssueDate || '',
          expiryDate: payload.visaExpiryDate || new Date(Date.now() + 365 * 86400000 * 2).toISOString().slice(0, 10),
          sponsor: emp.employeeCompany,
          sponsorshipType: 'Corporate',
          issuingAuthority: 'Royal Oman Police - Passports & Residence',
          country: 'Oman',
          status: payload.visaExpiryDate ? calculateExpiryStatus(payload.visaExpiryDate) : 'Valid',
          documentAttachment: payload.visaAttachment || '',
          fileName: payload.visaFileName || '',
          storagePath: payload.visaStoragePath || '',
          remarks: 'Registered via Personal Information form',
          isCurrent: true,
          effectiveFrom: payload.visaIssueDate || timestamp.slice(0, 10),
          createdBy: req.user?.username || 'admin',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    // 4. Driving Licence Sync
    if (payload.drivingLicenceNumber || payload.drivingLicenceAttachment || payload.drivingLicenceExpiryDate) {
      const currentDl = db.drivingLicences.getCurrent(norm);
      if (currentDl) {
        await db.drivingLicences.update(currentDl.id, {
          ...(payload.drivingLicenceNumber ? { licenceNumber: String(payload.drivingLicenceNumber).trim() } : {}),
          ...(payload.drivingLicenceExpiryDate ? { expiryDate: payload.drivingLicenceExpiryDate } : {}),
          ...(payload.drivingLicenceAttachment ? { documentAttachment: payload.drivingLicenceAttachment } : {}),
          ...(payload.drivingLicenceFileName ? { fileName: payload.drivingLicenceFileName } : {}),
          ...(payload.drivingLicenceStoragePath ? { storagePath: payload.drivingLicenceStoragePath } : {}),
          updatedAt: timestamp,
        });
      }
    }

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'PERSONAL_DETAILS_UPDATED',
      module: 'Employee Master',
      description: `Updated personal details & critical document attachments for ${emp.employeeName} (${norm}).`,
      ipAddress: req.ip,
    });

    res.json({ details: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save personal details.' });
  }
};

// GET /api/employees/:employeeId/personal-details & /personal
router.get('/:employeeId/personal-details', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const details = db.personalDetails.get(employeeId);
    res.json({ details: details || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:employeeId/personal', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const details = db.personalDetails.get(employeeId);
    res.json({ details: details || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST & PUT routes for personal details
router.post('/:employeeId/personal-details', verifyAuth, requireWritePermission, handleSavePersonalDetails);
router.put('/:employeeId/personal-details', verifyAuth, requireWritePermission, handleSavePersonalDetails);
router.post('/:employeeId/personal', verifyAuth, requireWritePermission, handleSavePersonalDetails);
router.put('/:employeeId/personal', verifyAuth, requireWritePermission, handleSavePersonalDetails);

export default router;
