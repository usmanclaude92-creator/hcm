import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requirePermission, AuthRequest } from '../auth.js';
import type { TimesheetEntry, EmployeeCompany } from '../../src/types/index';

const router = Router();

const PAYROLL_TYPE = 'Monthly';
const EMPLOYEE_COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];

function checkProjectCompanyPermission(proj: { allowedCompanies?: EmployeeCompany[] }, empCompany: EmployeeCompany): string | null {
  if (proj.allowedCompanies && proj.allowedCompanies.length > 0 && !proj.allowedCompanies.includes(empCompany)) {
    return `Employee company '${empCompany}' is not permitted on this project (allowed: ${proj.allowedCompanies.join(', ')})`;
  }
  return null;
}

// GET /api/timesheets - List entries, filter by month/employee/project/company
router.get('/', verifyAuth, requirePermission('timesheet.view'), (req: AuthRequest, res: Response) => {
  try {
    const { month, employeeId, projectId, company } = req.query;
    let entries = month ? db.timesheets.getByMonth(String(month)) : db.timesheets.getAll().filter(t => !t.isVoided);
    if (employeeId) {
      const norm = normalizeEmployeeId(String(employeeId));
      entries = entries.filter(t => normalizeEmployeeId(t.employeeId) === norm);
    }
    if (projectId) entries = entries.filter(t => t.projectId === projectId);
    if (company) entries = entries.filter(t => t.company === company);

    entries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch timesheets' });
  }
});

// POST /api/timesheets - Create a single entry
router.post('/', verifyAuth, requirePermission('timesheet.create'), async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, date, project, taskActivity, normalHours, overtimeHours, remarks } = req.body;
    if (!employeeId || !date || !project) {
      return res.status(400).json({ error: 'Employee ID, Date and Project are required.' });
    }

    const normId = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(normId);
    if (!emp || !emp.isActive) {
      return res.status(404).json({ error: `Employee '${normId}' not found or inactive.` });
    }
    const proj = db.projects.findById(project) || db.projects.findByCode(project);
    if (!proj || proj.status !== 'Active') {
      return res.status(400).json({ error: `Project '${project}' not found or inactive.` });
    }
    const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
    if (permissionError) {
      return res.status(400).json({ error: permissionError });
    }

    const normalH = Math.max(0, Number(normalHours) || 0);
    const overtimeH = Math.max(0, Number(overtimeHours) || 0);
    if (normalH === 0 && overtimeH === 0) {
      return res.status(400).json({ error: 'Normal Hours or Overtime Hours must be greater than zero.' });
    }

    const timestamp = new Date().toISOString();
    const entry: TimesheetEntry = {
      id: crypto.randomUUID(),
      employeeId: normId,
      employeeName: emp.employeeName,
      date,
      payrollMonth: String(date).slice(0, 7),
      company: emp.employeeCompany,
      projectId: proj.id,
      projectCode: proj.projectCode,
      projectName: proj.projectName,
      taskActivity: taskActivity ? String(taskActivity).trim() : '',
      normalHours: normalH,
      overtimeHours: overtimeH,
      remarks: remarks ? String(remarks).trim() : '',
      approvalStatus: 'Draft',
      createdBy: req.user?.username,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.timesheets.create(entry);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_CREATED',
      module: 'Timesheet',
      recordId: entry.id,
      description: `Logged ${normalH}h normal + ${overtimeH}h overtime for ${normId} on ${proj.projectCode} (${date}).`,
    });

    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create timesheet entry' });
  }
});

// PUT /api/timesheets/:id - Edit a single entry
router.put('/:id', verifyAuth, requirePermission('timesheet.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.timesheets.getAll().find(t => t.id === id);
    if (!existing) return res.status(404).json({ error: 'Timesheet entry not found.' });
    if (existing.isVoided) return res.status(400).json({ error: 'Cannot edit a voided timesheet entry.' });

    const { taskActivity, normalHours, overtimeHours, remarks } = req.body;
    const updates: Partial<TimesheetEntry> = {};
    if (taskActivity !== undefined) updates.taskActivity = String(taskActivity).trim();
    if (normalHours !== undefined) updates.normalHours = Math.max(0, Number(normalHours) || 0);
    if (overtimeHours !== undefined) updates.overtimeHours = Math.max(0, Number(overtimeHours) || 0);
    if (remarks !== undefined) updates.remarks = String(remarks).trim();

    const updated = await db.timesheets.update(id, updates);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_EDITED',
      module: 'Timesheet',
      recordId: id,
      description: `Edited timesheet entry for ${existing.employeeId} on ${existing.date}.`,
      previousValue: { normalHours: existing.normalHours, overtimeHours: existing.overtimeHours, taskActivity: existing.taskActivity },
      newValue: updates,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update timesheet entry' });
  }
});

// POST /api/timesheets/:id/void - Soft-delete with a mandatory reason
router.post('/:id/void', verifyAuth, requirePermission('timesheet.edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Void reason is mandatory for the audit trail.' });
    }
    const updated = await db.timesheets.voidEntry(req.params.id, String(reason).trim(), req.user?.username || 'Admin');
    if (!updated) return res.status(404).json({ error: 'Timesheet entry not found.' });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_VOIDED',
      module: 'Timesheet',
      recordId: updated.id,
      description: `Voided timesheet entry for ${updated.employeeId} on ${updated.date}. Reason: ${reason}`,
      previousValue: { isVoided: false }, newValue: { isVoided: true, reason },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to void timesheet entry' });
  }
});

// POST /api/timesheets/:id/approve | /reject
router.post('/:id/approve', verifyAuth, requirePermission('timesheet.approve'), async (req: AuthRequest, res: Response) => {
  try {
    const updated = await db.timesheets.setApprovalStatus(req.params.id, 'Approved', req.user?.username || 'Admin');
    if (!updated) return res.status(404).json({ error: 'Timesheet entry not found.' });
    await db.audit.log({
      userId: req.user?.id, username: req.user?.username || 'User', userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_APPROVED', module: 'Timesheet', recordId: updated.id,
      description: `Approved timesheet entry for ${updated.employeeId} on ${updated.date}.`,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to approve timesheet entry' });
  }
});

router.post('/:id/reject', verifyAuth, requirePermission('timesheet.approve'), async (req: AuthRequest, res: Response) => {
  try {
    const updated = await db.timesheets.setApprovalStatus(req.params.id, 'Rejected', req.user?.username || 'Admin');
    if (!updated) return res.status(404).json({ error: 'Timesheet entry not found.' });
    await db.audit.log({
      userId: req.user?.id, username: req.user?.username || 'User', userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_REJECTED', module: 'Timesheet', recordId: updated.id,
      description: `Rejected timesheet entry for ${updated.employeeId} on ${updated.date}.`,
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reject timesheet entry' });
  }
});

// GET /api/timesheets/export/template
router.get('/export/template', verifyAuth, requirePermission('timesheet.export'), async (req: AuthRequest, res: Response) => {
  try {
    const activeProjects = db.projects.getAll().filter(p => p.status === 'Active');
    const headers = [
      'Company', 'Payroll Type', 'Employee ID', 'Employee Name', 'Employee Type',
      'Designation', 'Project Code', 'Date', 'Hrs/Days', 'Overtime', 'Bonus', 'Deductions', 'Pay By',
    ];
    const colWidths = [12, 14, 14, 24, 14, 20, 14, 14, 12, 12, 12, 14, 12];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Timesheet_Template');
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));
    sheet.getRow(1).font = { bold: true };

    const activeEmployees = db.employees.getAll().filter(e => e.isActive);
    activeEmployees.forEach(e => {
      sheet.addRow([e.employeeCompany, PAYROLL_TYPE, e.employeeId, e.employeeName, e.employeeType, e.designation, '', '', '', '', '', '', e.salaryPaidBy]);
    });

    const LAST_ROW = Math.max(501, activeEmployees.length + 20);
    const dropdowns: { col: string; values: string[] }[] = [
      { col: 'A', values: EMPLOYEE_COMPANIES },
      { col: 'B', values: [PAYROLL_TYPE] },
      { col: 'E', values: ['Worker', 'Staff'] },
      { col: 'M', values: ['DGO', 'SMI', 'NC', 'Supplier'] },
    ];
    for (const { col, values } of dropdowns) {
      for (let row = 2; row <= LAST_ROW; row++) {
        sheet.getCell(`${col}${row}`).dataValidation = {
          type: 'list', allowBlank: false, formulae: [`"${values.join(',')}"`],
          showErrorMessage: true, errorTitle: 'Invalid value', error: `Must be one of: ${values.join(', ')}`,
        };
      }
    }
    for (let row = 2; row <= LAST_ROW; row++) {
      sheet.getCell(`H${row}`).numFmt = 'dd-mmm-yyyy';
    }

    const instructionsSheet = workbook.addWorksheet('Projects & Instructions');
    instructionsSheet.columns = [
      { header: 'FIELD', width: 25 }, { header: 'ACCEPTED VALUES / FORMAT', width: 55 }, { header: 'REQUIRED?', width: 18 },
    ];
    instructionsSheet.getRow(1).font = { bold: true };
    instructionsSheet.addRows([
      ['Date', 'DD-MMM-YYYY (e.g. 01-Aug-2026). Multiple rows per employee are expected -- one per date/project worked.', 'Yes (Mandatory)'],
      ['Project Code', 'Must match an active Project Master code.', 'Yes (Mandatory)'],
      ['Hrs/Days', 'Normal hours worked that day/project.', 'Yes (Mandatory)'],
      ['Overtime', 'Optional overtime hours for that day/project.', 'No (Optional)'],
      [''],
      ['ACTIVE PROJECTS REFERENCE', '', ''],
      ...activeProjects.map(p => [p.projectCode, p.projectName, p.allowedCompanies?.length ? `Restricted to: ${p.allowedCompanies.join(', ')}` : 'Unrestricted']),
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Timesheet_Template.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate timesheet template' });
  }
});

// POST /api/timesheets/import/validate
router.post('/import/validate', verifyAuth, requirePermission('timesheet.import'), (req: AuthRequest, res: Response) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ error: 'Excel file data is required.' });

    const buffer = Buffer.from(fileData.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file has no data rows.' });
    }

    const previewRows: any[] = [];
    const seenEmpDateProj = new Set<string>();
    let validCount = 0, invalidCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNum = i + 2;

      const rawId = String(r['Employee ID'] || '').trim();
      const rawProj = String(r['Project Code'] || r['Project'] || '').trim().toUpperCase();
      const rawDateVal = r['Date'];
      const rawDate = rawDateVal instanceof Date
        ? `${rawDateVal.getFullYear()}-${String(rawDateVal.getMonth() + 1).padStart(2, '0')}-${String(rawDateVal.getDate()).padStart(2, '0')}`
        : String(rawDateVal || '').trim();
      const rawHours = r['Hrs/Days'] || r['Hours'] || 0;
      const rawOvertime = r['Overtime'] || 0;
      const rawCompany = String(r['Company'] || '').trim();
      const rawPayrollType = String(r['Payroll Type'] || '').trim();

      const normEmpId = normalizeEmployeeId(rawId);
      const emp = db.employees.findByEmployeeId(normEmpId);
      const proj = db.projects.findByCode(rawProj);
      const numHours = Number(rawHours) || 0;
      const numOvertime = Number(rawOvertime) || 0;

      let status: 'Valid' | 'Invalid' = 'Valid';
      let reason = 'Ready';

      if (!normEmpId) {
        status = 'Invalid'; reason = 'Employee ID is missing';
      } else if (!emp) {
        status = 'Invalid'; reason = `Employee '${normEmpId}' not found in system`;
      } else if (!emp.isActive) {
        status = 'Invalid'; reason = `Employee '${normEmpId}' is inactive/terminated`;
      } else if (!rawDate || isNaN(new Date(rawDate).getTime())) {
        status = 'Invalid'; reason = 'Date is missing or invalid';
      } else if (!rawProj) {
        status = 'Invalid'; reason = 'Project Code is required';
      } else if (!proj) {
        status = 'Invalid'; reason = `Project Code '${rawProj}' not found in Project Master`;
      } else if (proj.status !== 'Active') {
        status = 'Invalid'; reason = `Project '${rawProj}' is Inactive`;
      } else if (numHours < 0 || numOvertime < 0) {
        status = 'Invalid'; reason = 'Hours cannot be negative';
      } else if (numHours === 0 && numOvertime === 0) {
        status = 'Invalid'; reason = 'Normal Hours or Overtime must be greater than zero';
      } else if (rawCompany && rawCompany !== emp.employeeCompany) {
        status = 'Invalid'; reason = `Company mismatch: file says '${rawCompany}', Employee Master says '${emp.employeeCompany}'`;
      } else if (rawPayrollType && rawPayrollType !== PAYROLL_TYPE) {
        status = 'Invalid'; reason = `Payroll Type must be '${PAYROLL_TYPE}'`;
      } else {
        const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
        if (permissionError) {
          status = 'Invalid'; reason = permissionError;
        } else {
          const key = `${normEmpId}_${rawDate}_${rawProj}`;
          if (seenEmpDateProj.has(key)) {
            status = 'Invalid'; reason = `Duplicate row for ${normEmpId} on ${rawProj} at ${rawDate}`;
          } else {
            seenEmpDateProj.add(key);
          }
        }
      }

      if (status === 'Valid') validCount++; else invalidCount++;

      previewRows.push({
        rowNumber: rowNum,
        employeeId: normEmpId,
        employeeName: emp ? emp.employeeName : (r['Employee Name'] || '—'),
        company: emp ? emp.employeeCompany : rawCompany,
        date: rawDate,
        projectCode: rawProj,
        projectId: proj ? proj.id : '',
        projectName: proj ? proj.projectName : '—',
        normalHours: numHours,
        overtimeHours: numOvertime,
        taskActivity: String(r['Task/Activity'] || '').trim(),
        status,
        reason,
      });
    }

    res.json({ summary: { totalRows: rawRows.length, validCount, invalidCount }, rows: previewRows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to parse timesheet file.' });
  }
});

// POST /api/timesheets/import/confirm
router.post('/import/confirm', verifyAuth, requirePermission('timesheet.import'), async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Rows are required.' });

    const validRows = rows.filter(r => r.status === 'Valid');
    if (validRows.length === 0) return res.status(400).json({ error: 'No valid rows to import.' });

    const timestamp = new Date().toISOString();
    const entries: TimesheetEntry[] = [];
    const errors: Array<{ rowNumber: number; employeeId: string; description: string }> = [];

    for (const r of validRows) {
      try {
        const emp = db.employees.findByEmployeeId(r.employeeId);
        if (!emp || !emp.isActive) throw new Error(`Employee '${r.employeeId}' not found or inactive.`);
        const proj = db.projects.findById(r.projectId) || db.projects.findByCode(r.projectCode);
        if (!proj || proj.status !== 'Active') throw new Error(`Project '${r.projectCode}' not found or inactive.`);
        const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
        if (permissionError) throw new Error(permissionError);

        entries.push({
          id: crypto.randomUUID(),
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          date: r.date,
          payrollMonth: String(r.date).slice(0, 7),
          company: emp.employeeCompany,
          projectId: proj.id,
          projectCode: proj.projectCode,
          projectName: proj.projectName,
          taskActivity: r.taskActivity || '',
          normalHours: Math.max(0, Number(r.normalHours) || 0),
          overtimeHours: Math.max(0, Number(r.overtimeHours) || 0),
          approvalStatus: 'Draft',
          createdBy: req.user?.username,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (rowErr: any) {
        errors.push({ rowNumber: r.rowNumber, employeeId: r.employeeId, description: rowErr.message || 'Failed to import this row.' });
      }
    }

    await db.timesheets.importBatch(entries);

    await db.audit.log({
      userId: req.user?.id, username: req.user?.username || 'User', userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_IMPORTED', module: 'Timesheet',
      description: `Imported ${entries.length} timesheet entries from Excel.`,
    });

    res.json({ success: true, message: `Successfully imported ${entries.length} timesheet entries.`, count: entries.length, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit timesheet import.' });
  }
});

// GET /api/timesheets/analytics/employee?month=
router.get('/analytics/employee', verifyAuth, requirePermission('timesheet.view'), (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.query.month || '');
    const entries = month ? db.timesheets.getByMonth(month) : db.timesheets.getAll().filter(t => !t.isVoided);
    const activeEmployees = db.employees.getAll().filter(e => e.isActive);

    const byEmployee = new Map<string, TimesheetEntry[]>();
    for (const e of entries) {
      const norm = normalizeEmployeeId(e.employeeId);
      if (!byEmployee.has(norm)) byEmployee.set(norm, []);
      byEmployee.get(norm)!.push(e);
    }

    const result = activeEmployees.map(emp => {
      const norm = normalizeEmployeeId(emp.employeeId);
      const empEntries = byEmployee.get(norm) || [];
      const totalHours = roundOMR(empEntries.reduce((s, e) => s + e.normalHours, 0));
      const overtimeHours = roundOMR(empEntries.reduce((s, e) => s + e.overtimeHours, 0));
      const distinctProjects = new Set(empEntries.map(e => e.projectCode)).size;
      const distinctDates = new Set(empEntries.map(e => e.date)).size;
      const approvedEntries = empEntries.filter(e => e.approvalStatus === 'Approved').length;
      return {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        totalHours,
        overtimeHours,
        projectCount: distinctProjects,
        entryCount: empEntries.length,
        approvedEntries,
        missingEntries: distinctDates === 0,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute employee analytics' });
  }
});

// GET /api/timesheets/analytics/project?month=
router.get('/analytics/project', verifyAuth, requirePermission('timesheet.view'), (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.query.month || '');
    const entries = month ? db.timesheets.getByMonth(month) : db.timesheets.getAll().filter(t => !t.isVoided);
    const projects = db.projects.getAll();

    const byProject = new Map<string, TimesheetEntry[]>();
    for (const e of entries) {
      if (!byProject.has(e.projectCode)) byProject.set(e.projectCode, []);
      byProject.get(e.projectCode)!.push(e);
    }

    const result = Array.from(byProject.entries()).map(([projectCode, projEntries]) => ({
      projectCode,
      projectName: projects.find(p => p.projectCode === projectCode)?.projectName || projectCode,
      totalHours: roundOMR(projEntries.reduce((s, e) => s + e.normalHours, 0)),
      overtimeHours: roundOMR(projEntries.reduce((s, e) => s + e.overtimeHours, 0)),
      employeeCount: new Set(projEntries.map(e => normalizeEmployeeId(e.employeeId))).size,
      laborVolume: roundOMR(projEntries.reduce((s, e) => s + e.normalHours + e.overtimeHours, 0)),
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute project analytics' });
  }
});

// GET /api/timesheets/analytics/company?month=
router.get('/analytics/company', verifyAuth, requirePermission('timesheet.view'), (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.query.month || '');
    const entries = month ? db.timesheets.getByMonth(month) : db.timesheets.getAll().filter(t => !t.isVoided);
    const attendanceRecords = month ? db.attendance.getByMonth(month) : [];

    const byCompany = new Map<string, TimesheetEntry[]>();
    for (const e of entries) {
      if (!byCompany.has(e.company)) byCompany.set(e.company, []);
      byCompany.get(e.company)!.push(e);
    }

    const result = Array.from(byCompany.entries()).map(([company, compEntries]) => {
      const companyAttendance = attendanceRecords.filter(a => a.company === company);
      return {
        company,
        workforce: new Set(compEntries.map(e => normalizeEmployeeId(e.employeeId))).size,
        totalHours: roundOMR(compEntries.reduce((s, e) => s + e.normalHours, 0)),
        overtimeHours: roundOMR(compEntries.reduce((s, e) => s + e.overtimeHours, 0)),
        payrollImpactingBonus: roundOMR(companyAttendance.reduce((s, a) => s + (a.bonus || 0), 0)),
        payrollImpactingDeductions: roundOMR(companyAttendance.reduce((s, a) => s + (a.deduction || 0), 0)),
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute company analytics' });
  }
});

export default router;
