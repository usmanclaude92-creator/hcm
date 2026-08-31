import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, normalizeEmployeeId, roundOMR, calculateExpiryStatus, calculateOverallCompliance, checkTradeDiscrepancy, maskSensitiveId } from '../db.js';
import { verifyAuth, requireRoles, requireWritePermission, AuthRequest } from '../auth.js';
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
function isValidDateString(val: any): boolean {
  if (typeof val !== 'string' || !val.trim()) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

// Excel date cells arrive as native JS Date objects when the workbook is read with cellDates:true.
// Normalize those (and passthrough strings) to the app's YYYY-MM-DD convention.
function excelCellToDateString(val: any): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val || '').trim();
}

// Shared field-level validation used by both import/validate (preview) and import/confirm
// (defense-in-depth re-check, since confirm's payload is client-supplied and must not be trusted blindly).
function validateEmployeeFields(f: {
  employeeId: string; employeeName: string; employeeType: string; nationalityType: string;
  wageType: string; designation: string; employeeCompany: string; salaryPaidBy: string;
  salary: any; wpsSalary: any; actualSalary: any; dateOfJoining: string; dateOfLeaving: string;
}): string | null {
  if (!f.employeeId) return 'Employee ID is required';
  if (!f.employeeName) return 'Employee Name is required';
  if (!isValidEmployeeType(f.employeeType)) return `Invalid Employee Type: '${f.employeeType}' (Must be Worker or Staff)`;
  if (!isValidNationalityType(f.nationalityType)) return `Invalid Nationality Type: '${f.nationalityType}' (Must be Omani or Expat)`;
  if (!isValidWageType(f.wageType)) return `Invalid Wage Type: '${f.wageType}' (Must be Per Hour or Fixed Monthly)`;
  if (!f.designation) return 'Designation is required';
  if (!isValidEmployeeCompany(f.employeeCompany)) return `Invalid Employee Company: '${f.employeeCompany}' (DGO, SMI, NC, Supplier, Azad)`;
  if (!isValidSalaryPaidBy(f.salaryPaidBy)) return `Invalid Salary Paid By: '${f.salaryPaidBy}' (DGO, SMI, NC, Supplier)`;
  if (isNaN(Number(f.salary)) || Number(f.salary) < 0) return 'Salary / Rate must be a non-negative number';
  if (isNaN(Number(f.wpsSalary)) || Number(f.wpsSalary) < 0) return 'WPS Salary must be a non-negative number';
  if (isNaN(Number(f.actualSalary)) || Number(f.actualSalary) < 0) return 'Actual Salary must be a non-negative number';
  if (f.dateOfJoining && !isValidDateString(f.dateOfJoining)) return `Invalid Date of Joining: '${f.dateOfJoining}'`;
  if (f.dateOfLeaving && !isValidDateString(f.dateOfLeaving)) return `Invalid Date of Leaving: '${f.dateOfLeaving}'`;
  if (f.dateOfJoining && f.dateOfLeaving && isValidDateString(f.dateOfJoining) && isValidDateString(f.dateOfLeaving) && f.dateOfLeaving < f.dateOfJoining) {
    return 'Date of Leaving cannot be before Date of Joining';
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

// GET /api/employees/export/template - Generate blank Excel template for import,
// with real Excel dropdown (data validation) lists for fixed-choice columns.
router.get('/export/template', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const headers = [
      'Employee ID',
      'Employee Name',
      'Employee Type',
      'Nationality Type',
      'Wage Type',
      'Date of Joining',
      'Date of Leaving',
      'Designation',
      'Employee Company',
      'Salary Paid By',
      'Monthly Salary / Wage Rate',
      'WPS Employee',
      'WPS Salary',
      'Actual Salary',
      'Recover From',
    ];

    const colWidths = [15, 25, 15, 16, 16, 16, 16, 20, 18, 16, 26, 14, 14, 14, 18];

    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet('Employee_Import_Template');
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));
    sheet.getRow(1).font = { bold: true };

    // Real Excel dropdown validation for every data row (2-501), so the values
    // in the spreadsheet are constrained at edit time, not just documented.
    const LAST_ROW = 501;
    const dropdowns: { col: string; values: string[]; allowBlank?: boolean }[] = [
      { col: 'C', values: ['Worker', 'Staff'] },
      { col: 'D', values: ['Omani', 'Expat'] },
      { col: 'E', values: ['Per Hour', 'Fixed Monthly'] },
      { col: 'I', values: ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'] },
      { col: 'J', values: ['DGO', 'SMI', 'NC', 'Supplier'] },
      { col: 'L', values: ['Yes', 'No'], allowBlank: true },
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

    // Date format hint for the two date columns
    for (const col of ['F', 'G']) {
      for (let row = 2; row <= LAST_ROW; row++) {
        sheet.getCell(`${col}${row}`).numFmt = 'yyyy-mm-dd';
      }
    }

    const instructionsSheet = workbook.addWorksheet('Instructions & Dropdowns');
    instructionsSheet.columns = [
      { header: 'FIELD', width: 25 },
      { header: 'ACCEPTED VALUES / FORMAT', width: 50 },
      { header: 'REQUIRED?', width: 18 },
    ];
    instructionsSheet.getRow(1).font = { bold: true };
    instructionsSheet.addRows([
      ['Employee ID', 'Unique alphanumeric ID (e.g. EMP001). Spaces/case are normalized automatically.', 'Yes (Mandatory)'],
      ['Employee Name', 'Full Name of Employee', 'Yes (Mandatory)'],
      ['Employee Type', 'Worker, Staff (dropdown enabled on the template sheet)', 'Yes (Mandatory)'],
      ['Nationality Type', 'Omani, Expat (dropdown enabled)', 'Yes (Mandatory)'],
      ['Wage Type', 'Per Hour, Fixed Monthly (dropdown enabled)', 'Yes (Mandatory)'],
      ['Date of Joining', 'YYYY-MM-DD (e.g. 2024-01-15)', 'Yes (Mandatory)'],
      ['Date of Leaving', 'YYYY-MM-DD (Leave blank if active). Cannot be before Date of Joining.', 'No (Optional)'],
      ['Designation', 'Job Title (e.g. Site Engineer, Mason)', 'Yes (Mandatory)'],
      ['Employee Company', 'DGO, SMI, NC, Supplier, Azad (dropdown enabled)', 'Yes (Mandatory)'],
      ['Salary Paid By', 'DGO, SMI, NC, Supplier (dropdown enabled)', 'Yes (Mandatory)'],
      ['Monthly Salary / Wage Rate', 'OMR amount, cannot be negative (e.g. 650.000 for Staff, 2.000 for Worker)', 'Yes (Mandatory)'],
      ['WPS Employee', 'Yes, No (dropdown enabled)', 'Yes (Mandatory)'],
      ['WPS Salary', 'WPS registered salary amount, cannot be negative (e.g. 700.000)', 'Optional (Default 0)'],
      ['Actual Salary', 'Gross salary benchmark in OMR, cannot be negative', 'Optional (Default 0)'],
      ['Recover From', 'Company/Entity to recover excess WPS (e.g. DGO)', 'Optional'],
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate template' });
  }
});

// GET /api/employees/export/data - Export all/filtered employees to Excel
router.get('/export/data', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const employees = db.employees.getAll();

    // Column names/order match the import template exactly, so an exported file can be
    // re-imported unmodified. "Status" is appended as a bonus trailing column, not part of
    // the A-O structure the import parser keys off of.
    const data = employees.map(e => ({
      'Employee ID': e.employeeId,
      'Employee Name': e.employeeName,
      'Employee Type': e.employeeType,
      'Nationality Type': e.nationalityType,
      'Wage Type': e.wageType,
      'Date of Joining': e.dateOfJoining,
      'Date of Leaving': e.dateOfLeaving || '',
      'Designation': e.designation,
      'Employee Company': e.employeeCompany,
      'Salary Paid By': e.salaryPaidBy,
      'Monthly Salary / Wage Rate': roundOMR(e.monthlySalaryOrRate).toFixed(3),
      'WPS Employee': e.wpsEmployee,
      'WPS Salary': roundOMR(e.wpsSalary).toFixed(3),
      'Actual Salary': roundOMR(e.actualSalary).toFixed(3),
      'Recover From': e.recoverFrom || '',
      'Status': e.isActive ? 'Active' : 'Inactive',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
      { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }
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

    res.json({
      ...employee,
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
    } = req.body;

    if (!employeeId || !employeeName || !employeeType || !nationalityType || !wageType || !designation || !employeeCompany || !salaryPaidBy) {
      return res.status(400).json({ error: 'Please fill in all mandatory employee fields.' });
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
    const newEmployee: Employee = {
      id: crypto.randomUUID(),
      employeeId: normalizedId,
      employeeName: employeeName.trim(),
      employeeType,
      nationalityType,
      wageType,
      dateOfJoining: dateOfJoining || new Date().toISOString().split('T')[0],
      dateOfLeaving: dateOfLeaving || null,
      designation: designation.trim(),
      employeeCompany,
      salaryPaidBy,
      monthlySalaryOrRate: roundOMR(numericSalary),
      wpsEmployee: wpsEmployee === 'Yes' ? 'Yes' : 'No',
      wpsSalary: roundOMR(Number(wpsSalary) || 0),
      actualSalary: roundOMR(Number(actualSalary) || numericSalary),
      recoverFrom: recoverFrom ? recoverFrom.trim() : (wpsEmployee === 'Yes' ? employeeCompany : ''),
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.employees.create(newEmployee);

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
    } = req.body;

    const updates: Partial<Employee> = {};
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

    const updated = await db.employees.update(id, updates, req.user?.username);

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

// POST /api/employees/import/validate - Parse and validate uploaded Excel file
router.post('/import/validate', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
  try {
    const { fileData } = req.body; // Base64 data from client
    if (!fileData) {
      return res.status(400).json({ error: 'No Excel file data received.' });
    }

    const buffer = Buffer.from(fileData.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded spreadsheet contains no data rows.' });
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

      const rawId = String(row['Employee ID'] || row['EmployeeID'] || row['employee_id'] || '').trim();
      const rawName = String(row['Employee Name'] || row['EmployeeName'] || row['employee_name'] || '').trim();
      const rawType = String(row['Employee Type'] || row['Type'] || '').trim();
      const rawNat = String(row['Nationality Type'] || row['Nationality'] || '').trim();
      const rawWage = String(row['Wage Type'] || row['WageType'] || '').trim();
      const rawDoj = excelCellToDateString(row['Date of Joining'] || row['DOJ']);
      const rawDol = excelCellToDateString(row['Date of Leaving'] || row['DOL']);
      const rawDesig = String(row['Designation'] || '').trim();
      const rawComp = String(row['Employee Company'] || row['Company'] || '').trim();
      const rawPaidBy = String(row['Salary Paid By'] || row['PaidBy'] || '').trim();
      const rawSalary = row['Monthly Salary / Wage Rate'] || row['Salary'] || row['Rate'] || 0;
      const rawWps = String(row['WPS Employee'] || row['WPS'] || 'No').trim();
      const rawWpsSalary = row['WPS Salary'] || 0;
      const rawActual = row['Actual Salary'] || rawSalary;
      const rawRecover = String(row['Recover From'] || '').trim();

      const normalizedId = normalizeEmployeeId(rawId);

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
        dateOfJoining: rawDoj,
        dateOfLeaving: rawDol,
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
        employeeType: rawType,
        nationalityType: rawNat,
        wageType: rawWage,
        dateOfJoining: rawDoj || new Date().toISOString().split('T')[0],
        dateOfLeaving: rawDol || null,
        designation: rawDesig,
        employeeCompany: rawComp,
        salaryPaidBy: rawPaidBy,
        monthlySalaryOrRate: roundOMR(Number(rawSalary) || 0),
        wpsEmployee: rawWps.toLowerCase() === 'yes' ? 'Yes' : 'No',
        wpsSalary: roundOMR(Number(rawWpsSalary) || 0),
        actualSalary: roundOMR(Number(rawActual) || Number(rawSalary) || 0),
        recoverFrom: rawRecover || (rawWps.toLowerCase() === 'yes' ? rawComp : ''),
        status,
        reason,
      });
    }

    res.json({
      summary: {
        totalRows: rawRows.length,
        newCount,
        existingCount,
        duplicateCount,
        invalidCount,
      },
      rows: previewRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to parse Excel file.' });
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

      // Defense-in-depth: re-validate every row server-side, since this payload is client-supplied
      // and must not be trusted purely on the say-so of an earlier /import/validate call.
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
        dateOfJoining: r.dateOfJoining,
        dateOfLeaving: r.dateOfLeaving,
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
            }, req.user?.username);
            updatedCount++;
          } else {
            skippedCount++;
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
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await db.employees.create(newEmp);
          importedCount++;
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

    res.json({
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      employeeType: emp.employeeType,
      nationalityType: emp.nationalityType,
      designation: emp.designation,
      employeeCompany: emp.employeeCompany,
      overallCompliance,
      tradeDiscrepancy,
      currentCivilId,
      civilIdHistory,
      currentDrivingLicence,
      drivingLicenceHistory,
      currentVisa,
      visaHistory,
      governmentDocuments,
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

// GET /api/employees/:employeeId/personal-details
router.get('/:employeeId/personal-details', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const details = db.personalDetails.get(employeeId);
    res.json({ details: details || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees/:employeeId/personal-details
router.post('/:employeeId/personal-details', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const norm = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(norm);
    if (!emp) return res.status(404).json({ error: 'Employee not found.' });

    const saved = await db.personalDetails.save(norm, req.body);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'PERSONAL_DETAILS_UPDATED',
      module: 'Employee Master',
      description: `Updated personal & emergency contact details for ${emp.employeeName} (${norm}).`,
      ipAddress: req.ip,
    });

    res.json({ details: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save personal details.' });
  }
});

export default router;
