import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId } from '../db.js';
import { verifyAuth, requireWritePermission, AuthRequest } from '../auth.js';
import type { AttendanceRecord, EmployeeType } from '../../src/types/index';

const router = Router();

// GET /api/attendance - Fetch attendance records for a month
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'Payroll month is required (YYYY-MM).' });
    }

    const attendanceRecords = db.attendance.getByMonth(String(month));
    const employees = db.employees.getAll().filter(e => e.isActive);
    const projects = db.projects.getAll();

    // Group attendance by employee for easier UI rendering and project allocation
    const grouped = employees.map(emp => {
      const records = attendanceRecords.filter(a => normalizeEmployeeId(a.employeeId) === normalizeEmployeeId(emp.employeeId));
      const totalDays = records.reduce((sum, r) => sum + (Number(r.daysWorked) || 0), 0);
      const totalHours = records.reduce((sum, r) => sum + (Number(r.hoursWorked) || 0), 0);

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
        records: records.map(r => ({
          id: r.id,
          projectId: r.projectId,
          projectCode: r.projectCode,
          projectName: r.projectName,
          daysWorked: r.daysWorked,
          hoursWorked: r.hoursWorked,
        })),
      };
    });

    res.json({
      month: String(month),
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

      // Only add if employee worked some days or hours
      if (days === 0 && hours === 0) continue;

      if (emp.employeeType === 'Staff') {
        const currentDays = staffDaysMap.get(normEmpId) || 0;
        if (currentDays + days > 30) {
          return res.status(400).json({
            error: `Total days worked for Staff ${emp.employeeId} (${emp.employeeName}) cannot exceed 30 days. Currently entered: ${(currentDays + days)} days.`
          });
        }
        staffDaysMap.set(normEmpId, currentDays + days);
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
router.get('/export/template', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query;
    const payrollMonth = String(month || new Date().toISOString().slice(0, 7));

    const activeEmployees = db.employees.getAll().filter(e => e.isActive);
    const activeProjects = db.projects.getAll().filter(p => p.status === 'Active');

    // Pre-fill active employees with blank Project, Days Worked, Hours Worked
    const rows = activeEmployees.map(e => ({
      'Employee ID': e.employeeId,
      'Employee Name': e.employeeName,
      'Employee Type': e.employeeType,
      'Project Code': '',
      'Days Worked': '',
      'Hours Worked': '',
    }));

    const instructions = [
      ['INSTRUCTION GUIDELINES FOR ATTENDANCE IMPORT'],
      ['1. Staff Employees: Enter Days Worked (maximum 30 days standard total across projects). Leave Hours Worked blank or 0.'],
      ['2. Worker Employees: Enter Hours Worked. Leave Days Worked blank or 0.'],
      ['3. Multi-Project: If an employee worked on multiple projects, duplicate their row with the secondary Project Code and split days/hours.'],
      ['4. Project Code must match one of the active project codes below.'],
      [''],
      ['ACTIVE PROJECTS REFERENCE'],
      ['Project Code', 'Project Name'],
      ...activeProjects.map(p => [p.projectCode, p.projectName])
    ];

    const wb = XLSX.utils.book_new();

    const wsData = XLSX.utils.json_to_sheet(rows);
    wsData['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsData, `Attendance_${payrollMonth}`);

    const wsInst = XLSX.utils.aoa_to_sheet(instructions);
    wsInst['!cols'] = [{ wch: 20 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Projects & Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_Template_${payrollMonth}.xlsx"`);
    res.send(buffer);
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

      const normEmpId = normalizeEmployeeId(rawId);
      const emp = db.employees.findByEmployeeId(normEmpId);
      const proj = db.projects.findByCode(rawProj);

      let status: 'Valid' | 'Invalid' = 'Valid';
      let reason = 'Ready';

      const numDays = Number(rawDays) || 0;
      const numHours = Number(rawHours) || 0;

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
      } else if (numDays < 0 || numHours < 0) {
        status = 'Invalid';
        reason = 'Days or Hours cannot be negative';
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
            if (accumulatedDays > 30) {
              status = 'Invalid';
              reason = `Total days worked for Staff (${accumulatedDays}) exceeds 30-day monthly limit`;
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
        projectCode: rawProj,
        projectName: proj ? proj.projectName : '—',
        projectId: proj ? proj.id : '',
        daysWorked: numDays,
        hoursWorked: numHours,
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

    const validRows = rows.filter(r => r.status === 'Valid');
    if (validRows.length === 0) {
      return res.status(400).json({ error: 'No valid rows to import.' });
    }

    const timestamp = new Date().toISOString();
    const attendanceRecords: AttendanceRecord[] = validRows.map(r => {
      const emp = db.employees.findByEmployeeId(r.employeeId)!;
      return {
        id: crypto.randomUUID(),
        employeeId: r.employeeId,
        employeeInternalId: emp.id,
        payrollMonth: month,
        projectId: r.projectId,
        projectCode: r.projectCode,
        projectName: r.projectName,
        daysWorked: emp.employeeType === 'Staff' ? (Number(r.daysWorked) || 0) : 0,
        hoursWorked: emp.employeeType === 'Worker' ? (Number(r.hoursWorked) || 0) : 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });

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
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit attendance import.' });
  }
});

export default router;
