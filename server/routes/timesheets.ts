import { Router, Response } from 'express';
import crypto from 'crypto';
import { db, normalizeEmployeeId } from '../db.js';
import {
  verifyAuth,
  requireWritePermission,
  requireRoles,
  AuthRequest,
} from '../auth.js';
import type { TimesheetRecord } from '../../src/types/index';

const router = Router();

// GET /api/timesheets - List timesheets with optional filters
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const employeeIdFilter = req.query.employeeId
      ? normalizeEmployeeId(String(req.query.employeeId))
      : req.user?.role === 'Viewer' || (req.user?.role === 'Payroll User' && req.user?.employeeId)
      ? normalizeEmployeeId(String(req.user.employeeId))
      : null;

    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const month = req.query.month ? String(req.query.month) : null;

    let list = db.timesheets.getAll();

    if (employeeIdFilter) {
      list = list.filter(t => normalizeEmployeeId(t.employeeId) === employeeIdFilter);
    }
    if (projectId) {
      list = list.filter(t => t.projectId === projectId || t.projectCode === projectId);
    }
    if (status && status !== 'ALL') {
      list = list.filter(t => t.status === status);
    }
    if (month) {
      list = list.filter(t => t.workDate.startsWith(month));
    }

    list.sort((a, b) => b.workDate.localeCompare(a.workDate) || b.createdAt.localeCompare(a.createdAt));
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch timesheets.' });
  }
});

// GET /api/timesheets/:id - Get timesheet by ID
router.get('/:id', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const item = db.timesheets.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Timesheet record not found.' });
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get timesheet record.' });
  }
});

// POST /api/timesheets - Create timesheet entry
router.post('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = String(req.body.employeeId || req.user?.employeeId || '').trim();
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    const emp = db.employees.findByEmployeeId(employeeId);
    if (!emp) {
      return res.status(404).json({ error: `Employee '${employeeId}' not found.` });
    }

    const workDate = String(req.body.workDate || '').trim();
    if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return res.status(400).json({ error: 'Work Date is required and must be in YYYY-MM-DD format.' });
    }

    const hoursWorked = Number(req.body.hoursWorked);
    if (isNaN(hoursWorked) || hoursWorked <= 0 || hoursWorked > 24) {
      return res.status(400).json({ error: 'Hours worked must be a positive number up to 24.' });
    }

    const projectId = req.body.projectId || 'proj-hq';
    const project = db.projects.findById(projectId) || db.projects.findByCode(req.body.projectCode || '');
    const projectCode = project?.projectCode || req.body.projectCode || emp.assignedProjectCode || 'HQ-GEN';
    const projectName = project?.projectName || req.body.projectName || 'General Operations';

    const timestamp = new Date().toISOString();
    const record: TimesheetRecord = {
      id: crypto.randomUUID(),
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      workDate,
      projectId: project?.id || projectId,
      projectCode,
      projectName,
      hoursWorked: Number(hoursWorked.toFixed(2)),
      description: String(req.body.description || '').trim() || 'Daily duties and project work',
      status: req.body.submit ? 'Submitted' : 'Draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const saved = await db.timesheets.create(record);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || emp.employeeId,
      userRole: req.user?.role || 'Payroll User',
      action: 'TIMESHEET_CREATED',
      module: 'Attendance',
      recordId: record.id,
      description: `Timesheet entry created for ${emp.employeeName} on ${workDate} (${hoursWorked}h for ${projectCode})`,
      newValue: record,
    });

    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create timesheet.' });
  }
});

// PUT /api/timesheets/:id - Update draft timesheet
router.put('/:id', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.timesheets.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Timesheet record not found.' });
    }
    if (existing.status === 'Approved') {
      return res.status(400).json({ error: 'Cannot modify an approved timesheet.' });
    }

    const updates: Partial<TimesheetRecord> = {};
    if (req.body.hoursWorked != null) {
      const h = Number(req.body.hoursWorked);
      if (isNaN(h) || h <= 0 || h > 24) return res.status(400).json({ error: 'Invalid hours.' });
      updates.hoursWorked = Number(h.toFixed(2));
    }
    if (req.body.workDate) updates.workDate = req.body.workDate;
    if (req.body.description != null) updates.description = String(req.body.description).trim();
    if (req.body.projectCode) {
      const p = db.projects.findByCode(req.body.projectCode);
      if (p) {
        updates.projectId = p.id;
        updates.projectCode = p.projectCode;
        updates.projectName = p.projectName;
      }
    }
    if (req.body.status) updates.status = req.body.status;

    const updated = await db.timesheets.update(req.params.id, updates);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update timesheet.' });
  }
});

// POST /api/timesheets/:id/submit
router.post('/:id/submit', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.timesheets.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Timesheet record not found.' });
    if (existing.status === 'Approved') return res.status(400).json({ error: 'Already approved.' });

    const updated = await db.timesheets.update(req.params.id, { status: 'Submitted' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit timesheet.' });
  }
});

// POST /api/timesheets/:id/approve
router.post('/:id/approve', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user?.username || 'Manager';
    const approved = await db.timesheets.approve(req.params.id, user);

    await db.audit.log({
      userId: req.user?.id,
      username: user,
      userRole: req.user?.role || 'Payroll Manager',
      action: 'TIMESHEET_APPROVED',
      module: 'Attendance',
      recordId: req.params.id,
      description: `Approved timesheet for ${approved.employeeName} (${approved.workDate}, ${approved.hoursWorked}h)`,
    });

    res.json(approved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to approve timesheet.' });
  }
});

// POST /api/timesheets/:id/reject
router.post('/:id/reject', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is mandatory.' });
    }
    const user = req.user?.username || 'Manager';
    const rejected = await db.timesheets.reject(req.params.id, reason, user);

    await db.audit.log({
      userId: req.user?.id,
      username: user,
      userRole: req.user?.role || 'Payroll Manager',
      action: 'TIMESHEET_REJECTED',
      module: 'Attendance',
      recordId: req.params.id,
      description: `Rejected timesheet for ${rejected.employeeName} (${rejected.workDate}). Reason: ${reason}`,
    });

    res.json(rejected);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reject timesheet.' });
  }
});

export default router;
