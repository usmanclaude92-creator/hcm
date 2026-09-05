import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, normalizeEmployeeId, isHourlyPaid, employedDaysInMonth, STANDARD_HOURS_PER_DAY } from '../db.js';
import {
  verifyAuth,
  requireWritePermission,
  requirePermission,
  AuthRequest,
  companyScopeOf,
  canSeeCompany,
} from '../auth.js';
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
// Hourly employees had no ceiling at all while monthly ones were capped at 30 days, so
// 500 hours in a month was accepted without comment. 30 days x 12 hours is already well
// beyond any lawful schedule and leaves room for heavy overtime months.
const MAX_WORKER_HOURS_PER_MONTH = 360;

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

    const scope = companyScopeOf(req.user);
    const attendanceRecords = db.attendance.getByMonth(String(month));
    const employees = db.employees.getAll().filter(e => e.isActive && canSeeCompany(scope, e.employeeCompany));
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

    // Running per-employee totals, so a ceiling is applied to the month as a whole and
    // not to each project row in isolation.
    const staffDaysMap = new Map<string, number>();
    const workerHoursMap = new Map<string, number>();
    // Rows that cannot be stored as entered must be reported, not dropped. A silent
    // `continue` returned {success:true} while quietly discarding a mistyped employee
    // ID, an unknown project, or Worker days / Staff hours entered in the wrong column.
    const rejectedRows: string[] = [];

    for (const r of records) {
      if (!r.employeeId || !r.projectId) {
        // An entirely blank grid row is normal and is ignored; a row that carries work
        // but no employee/project is a real data-entry error and must be reported.
        const carriesWork = (Number(r.daysWorked) || 0) > 0 || (Number(r.hoursWorked) || 0) > 0;
        if (carriesWork) {
          rejectedRows.push(`A row with work entered is missing ${!r.employeeId ? 'an Employee ID' : 'a Project'}.`);
        }
        continue;
      }

      const normEmpId = normalizeEmployeeId(r.employeeId);
      const emp = db.employees.findByEmployeeId(normEmpId);
      const proj = db.projects.findById(r.projectId) || db.projects.findByCode(r.projectId);

      if (!emp) { rejectedRows.push(`Employee '${normEmpId}' does not exist.`); continue; }
      if (!canSeeCompany(companyScopeOf(req.user), emp.employeeCompany)) {
        rejectedRows.push(`Employee '${normEmpId}' does not exist.`);
        continue;
      }
      if (!proj) { rejectedRows.push(`${normEmpId}: project '${r.projectId}' does not exist.`); continue; }

      const days = Math.max(0, Number(r.daysWorked) || 0);
      const hours = Math.max(0, Number(r.hoursWorked) || 0);

      // Pay basis follows wageType (falling back to employeeType on older records), the
      // same rule the payroll engine uses. Entering the other unit used to be stored as
      // an all-zero attendance row, which then produced a zero-value payroll line with
      // no indication that anything had been entered at all.
      const hourly = isHourlyPaid(emp);
      if (!hourly && days === 0 && hours > 0) {
        rejectedRows.push(`${normEmpId} (${emp.employeeName}) is paid monthly and is measured in days worked, but only hours were entered.`);
        continue;
      }
      if (hourly && hours === 0 && days > 0) {
        rejectedRows.push(`${normEmpId} (${emp.employeeName}) is paid hourly and is measured in hours worked, but only days were entered.`);
        continue;
      }
      const overtimeHours = Math.max(0, Number(r.overtimeHours) || 0);
      const bonus = Math.max(0, Number(r.bonus) || 0);
      const deduction = Math.max(0, Number(r.deduction) || 0);

      // Only add if employee worked some days or hours
      if (days === 0 && hours === 0) continue;

      if (!hourly) {
        const currentDays = staffDaysMap.get(normEmpId) || 0;
        // A mid-month joiner or leaver can only be credited for the part of the month
        // they were actually employed. Without this the sheet happily accepted 30 days
        // for someone who started on the 20th.
        const employableDays = employedDaysInMonth(emp, month);
        const ceiling = Math.min(MAX_STAFF_DAYS_PER_MONTH, employableDays);
        if (currentDays + days > ceiling) {
          const employmentNote = employableDays < MAX_STAFF_DAYS_PER_MONTH
            ? ` They were only employed for ${employableDays} day(s) of ${month} (joined ${emp.dateOfJoining}${emp.dateOfLeaving ? `, left ${emp.dateOfLeaving}` : ''}).`
            : '';
          return res.status(400).json({
            error: `Total days worked for ${emp.employeeId} (${emp.employeeName}) cannot exceed ${ceiling} days. Currently entered: ${(currentDays + days)} days.${employmentNote}`
          });
        }
        staffDaysMap.set(normEmpId, currentDays + days);
      } else {
        const currentHours = workerHoursMap.get(normEmpId) || 0;
        const employableDays = employedDaysInMonth(emp, month);
        const ceiling = Math.min(MAX_WORKER_HOURS_PER_MONTH, employableDays * 12);
        if (currentHours + hours > ceiling) {
          return res.status(400).json({
            error: `Total hours worked for ${emp.employeeId} (${emp.employeeName}) cannot exceed ${ceiling} hours for ${month} (a maximum of 12 hours on each of ${employableDays} employed day(s)). Currently entered: ${(currentHours + hours)} hours.`
          });
        }
        workerHoursMap.set(normEmpId, currentHours + hours);
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
        daysWorked: hourly ? 0 : days,
        hoursWorked: hourly ? hours : 0,
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

    if (rejectedRows.length > 0) {
      return res.status(400).json({
        error:
          `${rejectedRows.length} attendance row(s) could not be saved, so nothing was written for ${month}. ` +
          'Correct the rows below and save again.',
        rejectedRows,
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

    const projectByRef = new Map<string, string>();
    activeProjects.forEach(p => {
      projectByRef.set(p.id, p.projectCode);
      projectByRef.set(p.projectCode, p.projectCode);
      projectByRef.set(p.projectName, p.projectCode);
    });

    const headers = [
      'Employee ID',
      'Payroll Type',
      'Employee Name',
      'Project Code',
      'Job',
      'Days Worked',
      'Hours Worked',
      'Overtime Hours',
      'Pay By',
    ];
    const colWidths = [15, 14, 25, 15, 20, 14, 14, 16, 14];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Attendance_${payrollMonth}`);
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));
    sheet.getRow(1).font = { bold: true };

    const existingMonthAttendance = db.attendance.getByMonth(payrollMonth);
    const existingProjectByEmp = new Map<string, string>();
    existingMonthAttendance.forEach(a => {
      if (a.employeeId && a.projectId) {
        const proj = activeProjects.find(p => p.id === a.projectId);
        if (proj) existingProjectByEmp.set(a.employeeId, proj.projectCode);
      }
    });

    // Pre-fill active employees with their Employee Master details; leave the
    // attendance-specific columns blank for the user to fill.
    activeEmployees.forEach(e => {
      const assignedCode =
        existingProjectByEmp.get(e.employeeId) ||
        (e as any).assignedProject ||
        '';
      sheet.addRow([
        e.employeeId,
        PAYROLL_TYPE,
        e.employeeName,
        assignedCode,
        e.designation || '',
        '',
        '',
        '',
        e.salaryPaidBy || 'DGO',
      ]);
    });

    const LAST_ROW = Math.max(501, activeEmployees.length + 20);
    const dropdowns: { col: string; values: string[]; allowBlank?: boolean }[] = [
      { col: 'B', values: [PAYROLL_TYPE] },
      { col: 'I', values: ['DGO', 'SMI', 'NC', 'Supplier'] },
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
      ['Employee ID', 'Must match an active Employee Master record.', 'Yes (Mandatory)'],
      ['Payroll Type', `Fixed value: "${PAYROLL_TYPE}" (this app processes only the standard monthly payroll cycle).`, 'Yes (Mandatory)'],
      ['Employee Name', 'Pre-filled from Employee Master.', 'Informational'],
      ['Project Code', 'Must match an active Project Master code. Duplicate this employee\'s row for each additional project worked.', 'Yes (Mandatory)'],
      ['Job', 'Designation / Job title from Employee Master.', 'Informational'],
      ['Days Worked', 'Staff only -- total across all project rows cannot exceed 30/month.', 'Staff: Yes'],
      ['Hours Worked', 'Worker only.', 'Worker: Yes'],
      ['Overtime Hours', 'Optional overtime hours. Captured for project-cost and overtime analysis.', 'No (Optional)'],
      ['Pay By', 'DGO, SMI, NC, Supplier (dropdown enabled) -- salary paying entity.', 'Yes (Mandatory)'],
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

      const rawId = String(r['Employee ID'] || r['EmployeeID'] || r['Employee Code'] || r['EmployeeCode'] || '').trim();
      const rawProj = String(r['Project Code'] || r['Project'] || r['ProjectCode'] || '').trim().toUpperCase();
      const rawJob = String(r['Job'] || r['Designation'] || '').trim();
      const rawDays = r['Days Worked'] || r['Days'] || 0;
      const rawHours = r['Hours Worked'] || r['Hours'] || 0;
      const rawOverthe = r['Overtime Hours'] || r['Overtime'] || 0;
      const rawBonus = r['Bonus'] || 0;
      const rawDeduction = r['Deductions'] || r['Deduction'] || 0;
      const rawCompany = String(r['Company'] || '').trim();
      const rawPayrollType = String(r['Payroll Type'] || r['PayrollType'] || '').trim();
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
        job: emp ? emp.designation : (rawJob || '—'),
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
    const { month, rows, replaceMonth } = req.body;
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

    // Merge by default: only the employees present in the file are rewritten. A whole-month
    // replace silently deleted every employee absent from the upload -- correcting five
    // rows in a 200-employee month wiped the other 195 and zeroed their payroll gross.
    // Replacing the month is still possible, but only as an explicit, audited choice.
    const isReplace = replaceMonth === true;
    const removedCount = isReplace
      ? Math.max(0, db.attendance.countForMonth(month) - attendanceRecords.length)
      : 0;

    if (isReplace) {
      await db.attendance.saveMonthRecords(month, attendanceRecords);
    } else {
      await db.attendance.mergeMonthRecords(month, attendanceRecords);
    }

    const affectedEmployees = new Set(attendanceRecords.map(r => normalizeEmployeeId(r.employeeId))).size;

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_IMPORTED',
      module: 'Attendance',
      description: isReplace
        ? `Imported ${attendanceRecords.length} attendance rows for ${month} in REPLACE mode, covering ${affectedEmployees} employee(s). Records removed for employees absent from the file: ${removedCount}.`
        : `Imported ${attendanceRecords.length} attendance rows for ${month} in merge mode, covering ${affectedEmployees} employee(s). Employees absent from the file were left unchanged.`,
    });

    res.json({
      success: true,
      mode: isReplace ? 'replace' : 'merge',
      message: isReplace
        ? `Replaced attendance for ${month}: ${attendanceRecords.length} records imported, ${removedCount} pre-existing record(s) removed.`
        : `Imported ${attendanceRecords.length} attendance records for ${month} across ${affectedEmployees} employee(s). Other employees were not modified.`,
      count: attendanceRecords.length,
      affectedEmployees,
      removedCount,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit attendance import.' });
  }
});

// POST /api/attendance/:month/assign - Assign one employee to one project for a month.
// Replaces only that employee's allocation; every other employee is untouched. This exists
// because the Assign Project quick action previously rebuilt the entire month in the
// browser and posted it back, which dropped concurrent edits and defaulted missing input
// to 25 days / 200 hours -- invented figures that fed straight into gross pay.
router.post('/:month/assign', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const month = req.params.month;
    const { employeeId, projectId, daysWorked, hoursWorked } = req.body;

    if (!employeeId || !projectId) {
      return res.status(400).json({ error: 'Employee and project are required.' });
    }

    const existingPayroll = db.payroll.getByMonth(month);
    if (existingPayroll && existingPayroll.status === 'Finalized') {
      return res.status(400).json({ error: `Payroll for ${month} is Finalized. Modify attendance only during Revision.` });
    }
    const attendanceMonth = db.attendanceMonths.getByMonth(month);
    if (attendanceMonth && attendanceMonth.status === 'Finalized') {
      return res.status(400).json({ error: `Attendance for ${month} is Finalized. Use Revert before making changes.` });
    }

    const emp = db.employees.findByEmployeeId(normalizeEmployeeId(employeeId));
    if (!emp) return res.status(404).json({ error: `Employee '${employeeId}' not found.` });
    if (!emp.isActive) return res.status(400).json({ error: `Employee '${emp.employeeId}' is inactive.` });

    const proj = db.projects.findById(projectId) || db.projects.findByCode(projectId);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });
    if (proj.status !== 'Active') return res.status(400).json({ error: `Project '${proj.projectCode}' is Inactive.` });

    const permissionError = checkProjectCompanyPermission(proj, emp.employeeCompany);
    if (permissionError) return res.status(400).json({ error: `${emp.employeeId}: ${permissionError}` });

    // No invented defaults: the figure that drives pay must be entered, not assumed.
    const isStaff = emp.employeeType === 'Staff';
    const days = isStaff ? Number(daysWorked) : 0;
    const hours = isStaff ? 0 : Number(hoursWorked);

    if (isStaff) {
      if (!Number.isFinite(days) || days <= 0) {
        return res.status(400).json({ error: 'Days worked is required for Staff and must be greater than zero.' });
      }
      if (days > MAX_STAFF_DAYS_PER_MONTH) {
        return res.status(400).json({ error: `Days worked cannot exceed ${MAX_STAFF_DAYS_PER_MONTH} in a month.` });
      }
    } else {
      if (!Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'Hours worked is required for Workers and must be greater than zero.' });
      }
    }

    const timestamp = new Date().toISOString();
    const record: AttendanceRecord = {
      id: crypto.randomUUID(),
      employeeId: emp.employeeId,
      employeeInternalId: emp.id,
      payrollMonth: month,
      projectId: proj.id,
      projectCode: proj.projectCode,
      projectName: proj.projectName,
      daysWorked: days,
      hoursWorked: hours,
      overtimeHours: 0,
      bonus: 0,
      deduction: 0,
      company: emp.employeeCompany,
      payrollType: PAYROLL_TYPE,
      payBy: emp.salaryPaidBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const previous = db.attendance.getByEmployeeAndMonth(emp.employeeId, month);
    await db.attendance.mergeMonthRecords(month, [record]);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'ATTENDANCE_PROJECT_ASSIGNED',
      module: 'Attendance',
      recordId: record.id,
      description: `Assigned ${emp.employeeId} (${emp.employeeName}) to ${proj.projectCode} for ${month} at ${isStaff ? `${days} day(s)` : `${hours} hour(s)`}. Replaced ${previous.length} prior allocation row(s) for this employee.`,
      previousValue: { allocations: previous.map(p => ({ projectCode: p.projectCode, daysWorked: p.daysWorked, hoursWorked: p.hoursWorked })) },
      newValue: { projectCode: proj.projectCode, daysWorked: days, hoursWorked: hours },
    });

    res.json({ success: true, record, replacedAllocations: previous.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to assign project.' });
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
    const totalProjects = projects.filter(p => p.status === 'Active').length || projects.length;
    const uniqueJobs = new Set(activeEmployees.map(e => (e.designation || '').trim()).filter(Boolean));
    const totalJobs = uniqueJobs.size;
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
      totalProjects,
      totalJobs,
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

    // Separation of duties: the person who submitted a month may not also approve it.
    // Payroll finalisation is gated on this approval, so one account was otherwise able
    // to take a month from data entry all the way to locked payroll unchallenged.
    // ALLOW_SELF_APPROVAL=true exists for a genuinely single-operator installation.
    const monthRecord = db.attendanceMonths.getByMonth(req.params.month);
    if (
      monthRecord?.submittedBy &&
      monthRecord.submittedBy === user &&
      process.env.ALLOW_SELF_APPROVAL !== 'true'
    ) {
      return res.status(403).json({
        error:
          `Attendance for ${req.params.month} was submitted by ${monthRecord.submittedBy}. ` +
          'It must be approved by a different user. Ask another approver to review it, or ' +
          'revert the month and have someone else submit it.',
      });
    }

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
