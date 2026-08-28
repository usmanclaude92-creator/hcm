import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, normalizeEmployeeId } from '../db.js';
import { verifyAuth, requireWritePermission, requirePermission, AuthRequest } from '../auth.js';
import type { AttendanceRecord, EmployeeType, EmployeeCompany } from '../../src/types/index';

const router = Router();

// The only payroll cycle this app processes is a monthly one -- "Payroll Type" on the
// attendance template is a validation constant, not a per-employee variant (unlike
// WageType, which already varies by employee for pay-RATE basis).
const PAYROLL_TYPE = 'Monthly';
const EMPLOYEE_COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];

// Threshold constants for exception detection -- named, not magic numbers scattered inline.
const EXCESSIVE_OVERTIME_HOURS_PER_MONTH = 60;
const MAX_STAFF_DAYS_PER_MONTH = 30;

function checkProjectCompanyPermission(proj: { allowedCompanies?: EmployeeCompany[] }, empCompany: EmployeeCompany): string | null {
  if (proj.allowedCompanies && proj.allowedCompanies.length > 0 && !proj.allowedCompanies.includes(empCompany)) {
    return `Employee company '${empCompany}' is not permitted on this project (allowed: ${proj.allowedCompanies.join(', ')})`;
  }
  return null;
}

// GET /api/attendance - Fetch attendance records for a month
router.get('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'Payroll month is required (YYYY-MM).' });
    }

    const attendanceRecords = db.attendance.getByMonth(String(month));
    const employees = db.employees.getAll().filter(e => e.isActive);
    const projects = db.projects.getAll();
    const monthStatus = await db.attendanceMonths.getOrCreate(String(month));

    // Group attendance by employee for easier UI rendering and project allocation
    const grouped = employees.map(emp => {
      const records = attendanceRecords.filter(a => normalizeEmployeeId(a.employeeId) === normalizeEmployeeId(emp.employeeId));
      const totalDays = records.reduce((sum, r) => sum + (Number(r.daysWorked) || 0), 0);
      const totalHours = records.reduce((sum, r) => sum + (Number(r.hoursWorked) || 0), 0);
      const totalOvertimeHours = records.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0);
      const totalBonus = records.reduce((sum, r) => sum + (Number(r.bonus) || 0), 0);
      const totalDeduction = records.reduce((sum, r) => sum + (Number(r.deduction) || 0), 0);

      return {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        employeeType: emp.employeeType,
        designation: emp.designation,
        employeeCompany: emp.employeeCompany,
        salaryPaidBy: emp.salaryPaidBy,
        monthlySalaryOrRate: emp.monthlySalaryOrRate,
        wageType: emp.wageType,
        totalDays,
        totalHours,
        totalOvertimeHours,
        totalBonus,
        totalDeduction,
        records: records.map(r => ({
          id: r.id,
          projectId: r.projectId,
          projectCode: r.projectCode,
          projectName: r.projectName,
          daysWorked: r.daysWorked,
          hoursWorked: r.hoursWorked,
          overtimeHours: r.overtimeHours || 0,
          bonus: r.bonus || 0,
          deduction: r.deduction || 0,
        })),
      };
    });

    res.json({
      month: String(month),
      monthStatus,
      grouped,
      rawRecords: attendanceRecords,
      allProjects: projects,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch attendance' });
  }
});

// POST /api/attendance - Save attendance for a month
router.post('/', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { month, records } = req.body;
    if (!month || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Month and attendance records array are required.' });
    }

    // Check if payroll for this month is already finalized
    const existingPayroll = db.payroll.getByMonth(month);
    if (existingPayroll && existingPayroll.status === 'Finalized') {
      return res.status(400).json({ error: `Payroll for ${month} is Finalized. Modify attendance only during Revision.` });
    }

    // Check if attendance itself has been finalized (separate, informational-workflow guard)
    const attendanceMonth = db.attendanceMonths.getByMonth(month);
    if (attendanceMonth && attendanceMonth.status === 'Finalized') {
      return res.status(400).json({ error: `Attendance for ${month} is Finalized. Use Revert before making changes.` });
    }

    const timestamp = new Date().toISOString();
    const processedRecords: AttendanceRecord[] = [];

    // Validation map for employee total days
    const staffDaysMap = new Map<string, number>();

    for (const r of records) {
      if (!r.employeeId || !r.projectId) continue;

      const normEmpId = normalizeEmployeeId(r.employeeId);
      const emp = db.employees.findByEmployeeId(normEmpId);
      const proj = db.projects.findById(r.projectId) || db.projects.findByCode(r.projectId);

      if (!emp || !proj) continue;

      const days = Math.max(0, Number(r.daysWorked) || 0);
      const hours = Math.max(0, Number(r.hoursWorked) || 0);
      const overtimeHours = Math.max(0, Number(r.overtimeHours) || 0);
      const bonus = Math.max(0, Number(r.bonus) || 0);
      const deduction = Math.max(0, Number(r.deduction) || 0);

      // Only add if employee worked some days or hours
      if (days === 0 && hours === 0) continue;

      if (emp.employeeType === 'Staff') {
        const currentDays = staffDaysMap.get(normEmpId) || 0;
        if (currentDays + days > MAX_STAFF_DAYS_PER_MONTH) {
          return res.status(400).json({
            error: `Total days worked for Staff ${emp.employeeId} (${emp.employeeName}) cannot exceed ${MAX_STAFF_DAYS_PER_MONTH} days. Currently entered: ${(currentDays + days)} days.`
          });
        }
        staffDaysMap.set(normEmpId, currentDays + days);
      }

      const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
      if (permissionError) {
        return res.status(400).json({ error: `${emp.employeeId}: ${permissionError}` });
      }

      processedRecords.push({
        id: r.id || crypto.randomUUID(),
        employeeId: normEmpId,
        employeeInternalId: emp.id,
        payrollMonth: month,
        projectId: proj.id,
        projectCode: proj.projectCode,
        projectName: proj.projectName,
        daysWorked: emp.employeeType === 'Staff' ? days : 0,
        hoursWorked: emp.employeeType === 'Worker' ? hours : 0,
        overtimeHours,
        bonus,
        deduction,
        company: emp.employeeCompany,
        payrollType: PAYROLL_TYPE,
        payBy: emp.salaryPaidBy,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const saved = await db.attendance.saveMonthRecords(month, processedRecords);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_SAVED',
      module: 'Attendance',
      description: `Saved ${saved.length} project attendance records for payroll month ${month}.`,
    });

    res.json({ success: true, count: saved.length, month });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save attendance' });
  }
});

// GET /api/attendance/export/template - Generate attendance Excel template pre-filled with active employees
router.get('/export/template', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;
    const payrollMonth = String(month || new Date().toISOString().slice(0, 7));

    const activeEmployees = db.employees.getAll().filter(e => e.isActive);
    const activeProjects = db.projects.getAll().filter(p => p.status === 'Active');

    const headers = [
      'Company', 'Payroll Type', 'Employee ID', 'Employee Name', 'Employee Type',
      'Designation', 'Project Code', 'Days Worked', 'Hours Worked', 'Overtime Hours',
      'Bonus', 'Deductions', 'Pay By',
    ];
    const colWidths = [12, 14, 14, 24, 14, 20, 14, 13, 13, 15, 12, 14, 12];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Attendance_${payrollMonth}`);
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));
    sheet.getRow(1).font = { bold: true };

    // Pre-fill active employees with their Employee Master details; leave the
    // attendance-specific columns blank for the user to fill.
    activeEmployees.forEach(e => {
      sheet.addRow([
        e.employeeCompany, PAYROLL_TYPE, e.employeeId, e.employeeName, e.employeeType,
        e.designation, '', '', '', '', '', '', e.salaryPaidBy,
      ]);
    });

    const LAST_ROW = Math.max(501, activeEmployees.length + 20);
    const dropdowns: { col: string; values: string[]; allowBlank?: boolean }[] = [
      { col: 'A', values: EMPLOYEE_COMPANIES },
      { col: 'B', values: [PAYROLL_TYPE] },
      { col: 'E', values: ['Worker', 'Staff'] },
      { col: 'M', values: ['DGO', 'SMI', 'NC', 'Supplier'] },
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

    const instructionsSheet = workbook.addWorksheet('Projects & Instructions');
    instructionsSheet.columns = [
      { header: 'FIELD', width: 25 },
      { header: 'ACCEPTED VALUES / FORMAT', width: 55 },
      { header: 'REQUIRED?', width: 18 },
    ];
    instructionsSheet.getRow(1).font = { bold: true };
    instructionsSheet.addRows([
      ['Company', 'DGO, SMI, NC, Supplier, Azad (dropdown enabled) -- must match the employee\'s company on Employee Master.', 'Yes (Mandatory)'],
      ['Payroll Type', `Fixed value: "${PAYROLL_TYPE}" (this app processes only the standard monthly payroll cycle).`, 'Yes (Mandatory)'],
      ['Employee ID', 'Must match an active Employee Master record.', 'Yes (Mandatory)'],
      ['Employee Type', 'Worker, Staff (dropdown enabled) -- must match Employee Master; a mismatch is flagged, not overwritten.', 'Yes (Mandatory)'],
      ['Project Code', 'Must match an active Project Master code. Duplicate this employee\'s row for each additional project worked.', 'Yes (Mandatory)'],
      ['Days Worked', 'Staff only -- total across all project rows cannot exceed 30/month.', 'Staff: Yes'],
      ['Hours Worked', 'Worker only.', 'Worker: Yes'],
      ['Overtime Hours', 'Optional. Captured for reporting/project-cost analysis only -- does not affect payroll calculation.', 'No (Optional)'],
      ['Bonus', 'Optional, OMR. Captured for reporting only.', 'No (Optional)'],
      ['Deductions', 'Optional, OMR. Captured for reporting only.', 'No (Optional)'],
      ['Pay By', 'DGO, SMI, NC, Supplier (dropdown enabled) -- must match Employee Master.', 'Yes (Mandatory)'],
      [''],
      ['ACTIVE PROJECTS REFERENCE', '', ''],
      ...activeProjects.map(p => [p.projectCode, p.projectName, p.allowedCompanies?.length ? `Restricted to: ${p.allowedCompanies.join(', ')}` : 'Unrestricted']),
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_Template_${payrollMonth}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate attendance template' });
  }
});

// POST /api/attendance/import/validate - Validate uploaded attendance Excel
router.post('/import/validate', verifyAuth, requireWritePermission, (req: AuthRequest, res: Response) => {
  try {
    const { fileData, month } = req.body;
    if (!fileData || !month) {
      return res.status(400).json({ error: 'Excel file data and payroll month are required.' });
    }

    const buffer = Buffer.from(fileData.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file has no data rows.' });
    }

    const previewRows: any[] = [];
    const staffDaysMap = new Map<string, number>();
    const seenEmpProj = new Set<string>();

    let validCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNum = i + 2;

      const rawId = String(r['Employee ID'] || r['EmployeeID'] || '').trim();
      const rawProj = String(r['Project Code'] || r['Project'] || r['ProjectCode'] || '').trim().toUpperCase();
      const rawDays = r['Days Worked'] || r['Days'] || 0;
      const rawHours = r['Hours Worked'] || r['Hours'] || 0;
      const rawOverthe = r['Overtime Hours'] || r['Overtime'] || 0;
      const rawBonus = r['Bonus'] || 0;
      const rawDeduction = r['Deductions'] || r['Deduction'] || 0;
      const rawCompany = String(r['Company'] || '').trim();
      const rawPayrollType = String(r['Payroll Type'] || '').trim();
      const rawPayBy = String(r['Pay By'] || r['PayBy'] || '').trim();

      const normEmpId = normalizeEmployeeId(rawId);
      const emp = db.employees.findByEmployeeId(normEmpId);
      const proj = db.projects.findByCode(rawProj);

      let status: 'Valid' | 'Invalid' = 'Valid';
      let reason = 'Ready';

      const numDays = Number(rawDays) || 0;
      const numHours = Number(rawHours) || 0;
      const numOvertime = Number(rawOverthe) || 0;
      const numBonus = Number(rawBonus) || 0;
      const numDeduction = Number(rawDeduction) || 0;

      if (!normEmpId) {
        status = 'Invalid';
        reason = 'Employee ID is missing';
      } else if (!emp) {
        status = 'Invalid';
        reason = `Employee '${normEmpId}' not found in system`;
      } else if (!emp.isActive) {
        status = 'Invalid';
        reason = `Employee '${normEmpId}' is inactive/terminated`;
      } else if (!rawProj) {
        status = 'Invalid';
        reason = 'Project Code is required';
      } else if (!proj) {
        status = 'Invalid';
        reason = `Project Code '${rawProj}' not found in Project Master`;
      } else if (proj.status !== 'Active') {
        status = 'Invalid';
        reason = `Project '${rawProj}' is Inactive`;
      } else if (numDays < 0 || numHours < 0 || numOvertime < 0 || numBonus < 0 || numDeduction < 0) {
        status = 'Invalid';
        reason = 'Days, Hours, Overtime, Bonus and Deductions cannot be negative';
      } else if (rawCompany && rawCompany !== emp.employeeCompany) {
        status = 'Invalid';
        reason = `Company mismatch: file says '${rawCompany}', Employee Master says '${emp.employeeCompany}'`;
      } else if (rawPayrollType && rawPayrollType !== PAYROLL_TYPE) {
        status = 'Invalid';
        reason = `Payroll Type must be '${PAYROLL_TYPE}'`;
      } else if (rawPayBy && rawPayBy !== emp.salaryPaidBy) {
        status = 'Invalid';
        reason = `Pay By mismatch: file says '${rawPayBy}', Employee Master says '${emp.salaryPaidBy}'`;
      } else if (checkProjectCompanyPermission(proj, emp.employeeCompany)) {
        status = 'Invalid';
        reason = checkProjectCompanyPermission(proj, emp.employeeCompany)!;
      } else {
        const empProjKey = `${normEmpId}_${rawProj}`;
        if (seenEmpProj.has(empProjKey)) {
          status = 'Invalid';
          reason = `Duplicate attendance row for ${normEmpId} on project ${rawProj}`;
        } else {
          seenEmpProj.add(empProjKey);
        }

        if (emp.employeeType === 'Staff') {
          if (numHours > 0 && numDays === 0) {
            status = 'Invalid';
            reason = 'Staff employee must have Days Worked entered, not Hours';
          } else {
            const accumulatedDays = (staffDaysMap.get(normEmpId) || 0) + numDays;
            if (accumulatedDays > MAX_STAFF_DAYS_PER_MONTH) {
              status = 'Invalid';
              reason = `Total days worked for Staff (${accumulatedDays}) exceeds ${MAX_STAFF_DAYS_PER_MONTH}-day monthly limit`;
            } else {
              staffDaysMap.set(normEmpId, accumulatedDays);
            }
          }
        } else if (emp.employeeType === 'Worker') {
          if (numDays > 0 && numHours === 0) {
            status = 'Invalid';
            reason = 'Worker employee must have Hours Worked entered, not Days';
          }
        }
      }

      if (status === 'Valid') validCount++;
      else invalidCount++;

      previewRows.push({
        rowNumber: rowNum,
        employeeId: normEmpId,
        employeeName: emp ? emp.employeeName : (r['Employee Name'] || '—'),
        employeeType: emp ? emp.employeeType : (r['Employee Type'] || '—'),
        company: emp ? emp.employeeCompany : rawCompany,
        payBy: emp ? emp.salaryPaidBy : rawPayBy,
        projectCode: rawProj,
        projectName: proj ? proj.projectName : '—',
        projectId: proj ? proj.id : '',
        daysWorked: numDays,
        hoursWorked: numHours,
        overtimeHours: numOvertime,
        bonus: numBonus,
        deduction: numDeduction,
        status,
        reason,
      });
    }

    res.json({
      month,
      summary: {
        totalRows: rawRows.length,
        validCount,
        invalidCount,
      },
      rows: previewRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to parse attendance file.' });
  }
});

// POST /api/attendance/import/confirm - Commit validated attendance to database
router.post('/import/confirm', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { month, rows } = req.body;
    if (!month || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Month and rows are required.' });
    }

    // Attendance-finalized guard (mirrors the same check in POST /)
    const attendanceMonth = db.attendanceMonths.getByMonth(month);
    if (attendanceMonth && attendanceMonth.status === 'Finalized') {
      return res.status(400).json({ error: `Attendance for ${month} is Finalized. Use Revert before making changes.` });
    }

    const validRows = rows.filter(r => r.status === 'Valid');
    if (validRows.length === 0) {
      return res.status(400).json({ error: 'No valid rows to import.' });
    }

    const timestamp = new Date().toISOString();
    const attendanceRecords: AttendanceRecord[] = [];
    const errors: Array<{ rowNumber: number; employeeId: string; description: string }> = [];

    for (const r of validRows) {
      try {
        // Defense-in-depth: re-validate server-side, never trust the client-echoed status.
        const emp = db.employees.findByEmployeeId(r.employeeId);
        if (!emp || !emp.isActive) {
          throw new Error(`Employee '${r.employeeId}' not found or inactive.`);
        }
        const proj = db.projects.findById(r.projectId) || db.projects.findByCode(r.projectCode);
        if (!proj || proj.status !== 'Active') {
          throw new Error(`Project '${r.projectCode}' not found or inactive.`);
        }
        const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
        if (permissionError) throw new Error(permissionError);

        attendanceRecords.push({
          id: crypto.randomUUID(),
          employeeId: emp.employeeId,
          employeeInternalId: emp.id,
          payrollMonth: month,
          projectId: proj.id,
          projectCode: proj.projectCode,
          projectName: proj.projectName,
          daysWorked: emp.employeeType === 'Staff' ? (Number(r.daysWorked) || 0) : 0,
          hoursWorked: emp.employeeType === 'Worker' ? (Number(r.hoursWorked) || 0) : 0,
          overtimeHours: Math.max(0, Number(r.overtimeHours) || 0),
          bonus: Math.max(0, Number(r.bonus) || 0),
          deduction: Math.max(0, Number(r.deduction) || 0),
          company: emp.employeeCompany,
          payrollType: PAYROLL_TYPE,
          payBy: emp.salaryPaidBy,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } catch (rowErr: any) {
        errors.push({ rowNumber: r.rowNumber, employeeId: r.employeeId, description: rowErr.message || 'Failed to import this row.' });
      }
    }

    await db.attendance.saveMonthRecords(month, attendanceRecords);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_IMPORTED',
      module: 'Attendance',
      description: `Imported ${attendanceRecords.length} attendance rows from Excel for ${month}.`,
    });

    res.json({
      success: true,
      message: `Successfully imported ${attendanceRecords.length} attendance records for ${month}.`,
      count: attendanceRecords.length,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit attendance import.' });
  }
});

// GET /api/attendance/:month/status - Current workflow status for a month
router.get('/:month/status', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const status = await db.attendanceMonths.getOrCreate(req.params.month);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch attendance status.' });
  }
});

// GET /api/attendance/:month/dashboard - Real derived summary + exceptions, no fabricated data
router.get('/:month/dashboard', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const month = req.params.month;
    const records = db.attendance.getByMonth(month);
    const activeEmployees = db.employees.getAll().filter(e => e.isActive);
    const projects = db.projects.getAll();

    const empProjectCount = new Map<string, Set<string>>();
    const empOvertime = new Map<string, number>();
    const empHasRecord = new Set<string>();
    const projectTotals = new Map<string, number>();
    let totalDays = 0, totalHours = 0, totalOvertimeHours = 0;

    for (const r of records) {
      const normId = normalizeEmployeeId(r.employeeId);
      empHasRecord.add(normId);
      totalDays += Number(r.daysWorked) || 0;
      totalHours += Number(r.hoursWorked) || 0;
      totalOvertimeHours += Number(r.overtimeHours) || 0;

      if (!empProjectCount.has(normId)) empProjectCount.set(normId, new Set());
      if (r.projectCode) empProjectCount.get(normId)!.add(r.projectCode);

      empOvertime.set(normId, (empOvertime.get(normId) || 0) + (Number(r.overtimeHours) || 0));

      const volume = (Number(r.daysWorked) || 0) + (Number(r.hoursWorked) || 0);
      projectTotals.set(r.projectCode, (projectTotals.get(r.projectCode) || 0) + volume);
    }

    const totalStaff = activeEmployees.filter(e => e.employeeType === 'Staff').length;
    const totalWorkers = activeEmployees.filter(e => e.employeeType === 'Worker').length;
    const multiProjectEmployeeCount = Array.from(empProjectCount.values()).filter(s => s.size > 1).length;
    const completionPercentage = activeEmployees.length > 0
      ? Number(((empHasRecord.size / activeEmployees.length) * 100).toFixed(1))
      : 0;

    const grandProjectVolume = Array.from(projectTotals.values()).reduce((s, v) => s + v, 0);
    const projectAllocation = Array.from(projectTotals.entries()).map(([projectCode, volume]) => ({
      projectCode,
      projectName: projects.find(p => p.projectCode === projectCode)?.projectName || projectCode,
      volume,
      percentage: grandProjectVolume > 0 ? Number(((volume / grandProjectVolume) * 100).toFixed(1)) : 0,
    }));

    const exceptions: Array<{ type: string; employeeId?: string; employeeName?: string; message: string }> = [];

    for (const emp of activeEmployees) {
      const normId = normalizeEmployeeId(emp.employeeId);
      if (!empHasRecord.has(normId)) {
        exceptions.push({ type: 'Missing Attendance', employeeId: emp.employeeId, employeeName: emp.employeeName, message: `No attendance recorded for ${emp.employeeId} (${emp.employeeName}) in ${month}.` });
      }
      const overtime = empOvertime.get(normId) || 0;
      if (overtime > EXCESSIVE_OVERTIME_HOURS_PER_MONTH) {
        exceptions.push({ type: 'Excessive Overtime', employeeId: emp.employeeId, employeeName: emp.employeeName, message: `${emp.employeeId} logged ${overtime} overtime hours, exceeding the ${EXCESSIVE_OVERTIME_HOURS_PER_MONTH}-hour threshold.` });
      }
    }

    const empDaysMap = new Map<string, number>();
    for (const r of records) {
      const normId = normalizeEmployeeId(r.employeeId);
      empDaysMap.set(normId, (empDaysMap.get(normId) || 0) + (Number(r.daysWorked) || 0));
    }
    for (const [normId, days] of empDaysMap.entries()) {
      if (days > MAX_STAFF_DAYS_PER_MONTH) {
        const emp = activeEmployees.find(e => normalizeEmployeeId(e.employeeId) === normId);
        exceptions.push({ type: 'Over-Allocation', employeeId: emp?.employeeId, employeeName: emp?.employeeName, message: `${emp?.employeeId || normId} has ${days} total days recorded, exceeding the ${MAX_STAFF_DAYS_PER_MONTH}-day limit.` });
      }
    }

    for (const r of records) {
      const emp = activeEmployees.find(e => normalizeEmployeeId(e.employeeId) === normalizeEmployeeId(r.employeeId));
      const proj = projects.find(p => p.id === r.projectId || p.projectCode === r.projectCode);
      if (emp && proj) {
        const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
        if (permissionError) {
          exceptions.push({ type: 'Project Permission Violation', employeeId: emp.employeeId, employeeName: emp.employeeName, message: `${emp.employeeId}: ${permissionError}` });
        }
      }
      if (!proj) {
        exceptions.push({ type: 'Invalid Project', employeeId: r.employeeId, message: `Attendance record references unknown project '${r.projectCode}'.` });
      }
    }

    res.json({
      month,
      totalEmployees: activeEmployees.length,
      totalStaff,
      totalWorkers,
      totalDays,
      totalHours,
      totalOvertimeHours,
      completionPercentage,
      multiProjectEmployeeCount,
      projectAllocation,
      exceptions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to build attendance dashboard.' });
  }
});

// POST /api/attendance/:month/submit
router.post('/:month/submit', verifyAuth, requirePermission('attendance.submit'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user?.username || 'Admin';
    const before = db.attendanceMonths.getByMonth(req.params.month);
    const updated = await db.attendanceMonths.submit(req.params.month, user);
    await db.audit.log({
      userId: req.user?.id, username: user, userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_SUBMITTED', module: 'Attendance', recordId: updated.id,
      description: `Submitted attendance for ${req.params.month} for approval.`,
      previousValue: { status: before?.status || 'Draft' }, newValue: { status: 'Submitted' },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit attendance.' });
  }
});

// POST /api/attendance/:month/approve
router.post('/:month/approve', verifyAuth, requirePermission('attendance.approve'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user?.username || 'Admin';
    const updated = await db.attendanceMonths.approve(req.params.month, user);
    await db.audit.log({
      userId: req.user?.id, username: user, userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_APPROVED', module: 'Attendance', recordId: updated.id,
      description: `Approved attendance for ${req.params.month}.`,
      previousValue: { status: 'Submitted' }, newValue: { status: 'Approved' },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to approve attendance.' });
  }
});

// POST /api/attendance/:month/finalize
router.post('/:month/finalize', verifyAuth, requirePermission('attendance.finalize'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user?.username || 'Admin';
    const updated = await db.attendanceMonths.finalize(req.params.month, user);
    await db.audit.log({
      userId: req.user?.id, username: user, userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_FINALIZED', module: 'Attendance', recordId: updated.id,
      description: `Finalized attendance for ${req.params.month}. This is informational only -- payroll calculation is unaffected.`,
      previousValue: { status: 'Approved' }, newValue: { status: 'Finalized' },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to finalize attendance.' });
  }
});

// POST /api/attendance/:month/revert - Requires a mandatory reason (mirrors salaryPayments.reverse)
router.post('/:month/revert', verifyAuth, requirePermission('attendance.revert'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Revert reason is mandatory for the audit trail.' });
    }
    const user = req.user?.username || 'Admin';
    const updated = await db.attendanceMonths.revert(req.params.month, String(reason).trim(), user);
    await db.audit.log({
      userId: req.user?.id, username: user, userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_REVERTED', module: 'Attendance', recordId: updated.id,
      description: `Reverted attendance for ${req.params.month} from Finalized to Approved. Reason: ${reason}`,
      previousValue: { status: 'Finalized' }, newValue: { status: 'Approved', reason },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to revert attendance.' });
  }
});

export default router;
