import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, roundOMR } from '../db';
import { verifyAuth, requireRoles, requireWritePermission, AuthRequest } from '../auth';
import type { Employee, EmployeeType, NationalityType, WageType, EmployeeCompany, SalaryPaidBy, WPSStatus } from '../../src/types/index';

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

// GET /api/employees - List employees with filters
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { search, employeeType, nationalityType, employeeCompany, salaryPaidBy, wageType, status, sortField, sortOrder } = req.query;

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

// GET /api/employees/export/template - Generate blank Excel template for import
router.get('/export/template', verifyAuth, (req: AuthRequest, res: Response) => {
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

    const instructions = [
      ['FIELD', 'ACCEPTED VALUES / FORMAT', 'REQUIRED?'],
      ['Employee ID', 'Unique alphanumeric ID (e.g. EMP001)', 'Yes (Mandatory)'],
      ['Employee Name', 'Full Name of Employee', 'Yes (Mandatory)'],
      ['Employee Type', 'Worker, Staff', 'Yes (Mandatory)'],
      ['Nationality Type', 'Omani, Expat', 'Yes (Mandatory)'],
      ['Wage Type', 'Per Hour, Fixed Monthly', 'Yes (Mandatory)'],
      ['Date of Joining', 'YYYY-MM-DD (e.g. 2024-01-15)', 'Yes (Mandatory)'],
      ['Date of Leaving', 'YYYY-MM-DD (Leave blank if active)', 'No (Optional)'],
      ['Designation', 'Job Title (e.g. Site Engineer, Mason)', 'Yes (Mandatory)'],
      ['Employee Company', 'DGO, SMI, NC, Supplier, Azad', 'Yes (Mandatory)'],
      ['Salary Paid By', 'DGO, SMI, NC, Supplier', 'Yes (Mandatory)'],
      ['Monthly Salary / Wage Rate', 'OMR amount (e.g. 650.000 for Staff, 2.000 for Worker)', 'Yes (Mandatory)'],
      ['WPS Employee', 'Yes, No', 'Yes (Mandatory)'],
      ['WPS Salary', 'WPS registered salary amount (e.g. 700.000)', 'Optional (Default 0)'],
      ['Actual Salary', 'Gross salary benchmark in OMR', 'Optional (Default 0)'],
      ['Recover From', 'Company/Entity to recover excess WPS (e.g. DGO)', 'Optional'],
    ];

    const wb = XLSX.utils.book_new();

    // Empty Template Sheet with Headers
    const wsTemplate = XLSX.utils.aoa_to_sheet([headers]);
    // Set column widths
    wsTemplate['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
      { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Employee_Import_Template');

    // Instructions Sheet
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 25 }, { wch: 50 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions & Dropdowns');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.xlsx"');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate template' });
  }
});

// GET /api/employees/export/data - Export all/filtered employees to Excel
router.get('/export/data', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const employees = db.employees.getAll();

    const data = employees.map(e => ({
      'Employee ID': e.employeeId,
      'Employee Name': e.employeeName,
      'Employee Type': e.employeeType,
      'Nationality Type': e.nationalityType,
      'Wage Type': e.wageType,
      'Status': e.isActive ? 'Active' : 'Inactive',
      'Date of Joining': e.dateOfJoining,
      'Date of Leaving': e.dateOfLeaving || '',
      'Designation': e.designation,
      'Employee Company': e.employeeCompany,
      'Salary Paid By': e.salaryPaidBy,
      'Monthly Salary / Rate (OMR)': roundOMR(e.monthlySalaryOrRate).toFixed(3),
      'WPS Employee': e.wpsEmployee,
      'WPS Salary (OMR)': roundOMR(e.wpsSalary).toFixed(3),
      'Actual Gross Salary (OMR)': roundOMR(e.actualSalary).toFixed(3),
      'Recover From': e.recoverFrom || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 16 },
      { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 16 }
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
router.post('/', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
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

    db.employees.create(newEmployee);

    db.audit.log({
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
router.put('/:id', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
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

    const updated = db.employees.update(id, updates, req.user?.username);

    db.audit.log({
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
router.patch('/:id/toggle-active', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employee = db.employees.findById(id);
    if (!employee) return res.status(404).json({ error: 'Employee not found.' });

    const newStatus = !employee.isActive;
    const updated = db.employees.update(id, {
      isActive: newStatus,
      dateOfLeaving: newStatus ? null : (employee.dateOfLeaving || new Date().toISOString().split('T')[0]),
    }, req.user?.username);

    db.audit.log({
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
    const workbook = XLSX.read(buffer, { type: 'buffer' });
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
      const rawDoj = String(row['Date of Joining'] || row['DOJ'] || '').trim();
      const rawDol = String(row['Date of Leaving'] || row['DOL'] || '').trim();
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

      if (!normalizedId) {
        status = 'Invalid';
        reason = 'Employee ID is required';
      } else if (!rawName) {
        status = 'Invalid';
        reason = 'Employee Name is required';
      } else if (!isValidEmployeeType(rawType)) {
        status = 'Invalid';
        reason = `Invalid Employee Type: '${rawType}' (Must be Worker or Staff)`;
      } else if (!isValidNationalityType(rawNat)) {
        status = 'Invalid';
        reason = `Invalid Nationality Type: '${rawNat}' (Must be Omani or Expat)`;
      } else if (!isValidWageType(rawWage)) {
        status = 'Invalid';
        reason = `Invalid Wage Type: '${rawWage}' (Must be Per Hour or Fixed Monthly)`;
      } else if (!rawDesig) {
        status = 'Invalid';
        reason = 'Designation is required';
      } else if (!isValidEmployeeCompany(rawComp)) {
        status = 'Invalid';
        reason = `Invalid Employee Company: '${rawComp}' (DGO, SMI, NC, Supplier, Azad)`;
      } else if (!isValidSalaryPaidBy(rawPaidBy)) {
        status = 'Invalid';
        reason = `Invalid Salary Paid By: '${rawPaidBy}' (DGO, SMI, NC, Supplier)`;
      } else if (isNaN(Number(rawSalary)) || Number(rawSalary) < 0) {
        status = 'Invalid';
        reason = 'Salary / Rate must be a non-negative number';
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
router.post('/import/confirm', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
  try {
    const { rows, updateExisting } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No validated rows provided for import.' });
    }

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const timestamp = new Date().toISOString();

    for (const r of rows) {
      if (r.status === 'Invalid' || r.status === 'Duplicate') {
        skippedCount++;
        continue;
      }

      const normId = normalizeEmployeeId(r.employeeId);
      const existing = db.employees.findByEmployeeId(normId);

      if (existing) {
        if (updateExisting) {
          db.employees.update(existing.id, {
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
        db.employees.create(newEmp);
        importedCount++;
      }
    }

    db.audit.log({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit employee import.' });
  }
});

export default router;
