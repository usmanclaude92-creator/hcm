import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { db, normalizeEmployeeId, inclusiveDayCount, leaveDaysInMonth } from '../db.js';
import {
  verifyAuth,
  requireWritePermission,
  requireRoles,
  AuthRequest,
  companyScopeOf,
  canSeeCompany,
} from '../auth.js';
import type { LeaveType, LeaveRequest, LeaveBalance, LeaveRequestStatus } from '../../src/types/index';

const router = Router();

// A request only affects payroll and balances once it is Approved. Draft, Submitted,
// Rejected and Cancelled requests are visible but never paid.
const COUNTS_AS_TAKEN: LeaveRequestStatus[] = ['Approved'];
const COUNTS_AS_PENDING: LeaveRequestStatus[] = ['Submitted'];

function isValidDate(value: any): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// ==================== Leave types ====================

// GET /api/leave/types
router.get('/types', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const types = db.leaveTypes.getAll()
      .filter(t => includeInactive || t.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch leave types.' });
  }
});

// POST /api/leave/types (Administrator / Payroll Manager)
router.post('/types', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, isPaid, annualEntitlementDays, remarks } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Leave type code and name are required.' });
    }
    const cleanCode = String(code).trim().toUpperCase();
    if (db.leaveTypes.findByCode(cleanCode)) {
      return res.status(400).json({ error: `A leave type with code '${cleanCode}' already exists.` });
    }
    const days = Number(annualEntitlementDays ?? 0);
    if (!Number.isFinite(days) || days < 0) {
      return res.status(400).json({ error: 'Annual entitlement must be a number of days, and cannot be negative.' });
    }

    const timestamp = new Date().toISOString();
    const type: LeaveType = {
      id: crypto.randomUUID(),
      code: cleanCode,
      name: String(name).trim(),
      isPaid: isPaid !== false,
      annualEntitlementDays: Math.round(days),
      isActive: true,
      remarks: remarks ? String(remarks).trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.leaveTypes.create(type);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LEAVE_TYPE_CREATED',
      module: 'Leave',
      recordId: type.id,
      description: `Created leave type ${type.code} — ${type.name} (${type.isPaid ? 'paid' : 'unpaid'}, ${type.annualEntitlementDays} days/year).`,
    });

    res.status(201).json(type);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create leave type.' });
  }
});

// PUT /api/leave/types/:id
router.put('/types/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveTypes.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave type not found.' });

    const { name, isPaid, annualEntitlementDays, remarks, isActive } = req.body;
    const updates: Partial<LeaveType> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (isPaid !== undefined) updates.isPaid = Boolean(isPaid);
    if (remarks !== undefined) updates.remarks = String(remarks).trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (annualEntitlementDays !== undefined) {
      const days = Number(annualEntitlementDays);
      if (!Number.isFinite(days) || days < 0) {
        return res.status(400).json({ error: 'Annual entitlement must be a number of days, and cannot be negative.' });
      }
      updates.annualEntitlementDays = Math.round(days);
    }

    const updated = await db.leaveTypes.update(req.params.id, updates);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LEAVE_TYPE_UPDATED',
      module: 'Leave',
      recordId: req.params.id,
      description: `Updated leave type ${existing.code} — ${existing.name}.`,
      previousValue: { isPaid: existing.isPaid, annualEntitlementDays: existing.annualEntitlementDays, isActive: existing.isActive },
      newValue: updates,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update leave type.' });
  }
});

// ==================== Leave requests ====================

function requestVisibleTo(req: AuthRequest, request: { employeeCompany?: string }): boolean {
  return canSeeCompany(companyScopeOf(req.user), request.employeeCompany);
}

// GET /api/leave/requests
router.get('/requests', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, status, leaveTypeId, month, year, company } = req.query as Record<string, string>;
    let requests = db.leaveRequests.getAll().filter(r => requestVisibleTo(req, r));

    if (employeeId) {
      const norm = normalizeEmployeeId(employeeId);
      requests = requests.filter(r => normalizeEmployeeId(r.employeeId) === norm);
    }
    if (status && status !== 'ALL') requests = requests.filter(r => r.status === status);
    if (leaveTypeId && leaveTypeId !== 'ALL') requests = requests.filter(r => r.leaveTypeId === leaveTypeId);
    if (company && company !== 'ALL') requests = requests.filter(r => r.employeeCompany === company);
    if (month && month !== 'ALL') {
      requests = requests.filter(r => leaveDaysInMonth(r.startDate, r.endDate, month) > 0);
    }
    if (year && year !== 'ALL') {
      requests = requests.filter(r => r.startDate.slice(0, 4) === year || r.endDate.slice(0, 4) === year);
    }

    requests.sort((a, b) => b.startDate.localeCompare(a.startDate) || a.employeeId.localeCompare(b.employeeId));

    const summary = {
      total: requests.length,
      draft: requests.filter(r => r.status === 'Draft').length,
      submitted: requests.filter(r => r.status === 'Submitted').length,
      approved: requests.filter(r => r.status === 'Approved').length,
      rejected: requests.filter(r => r.status === 'Rejected').length,
      cancelled: requests.filter(r => r.status === 'Cancelled').length,
      approvedPaidDays: requests.filter(r => r.status === 'Approved' && r.isPaid).reduce((s, r) => s + r.days, 0),
      approvedUnpaidDays: requests.filter(r => r.status === 'Approved' && !r.isPaid).reduce((s, r) => s + r.days, 0),
    };

    res.json({ summary, requests });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch leave requests.' });
  }
});

// POST /api/leave/requests
router.post('/requests', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, leaveTypeId, startDate, endDate, reason, submit } = req.body;
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Employee, leave type, start date and end date are required.' });
    }
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: 'Start date and end date must be real calendar dates (YYYY-MM-DD).' });
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'End date cannot be before start date.' });
    }

    const normId = normalizeEmployeeId(employeeId);
    const emp = db.employees.findByEmployeeId(normId);
    if (!emp) return res.status(404).json({ error: `Employee '${normId}' not found.` });
    if (!canSeeCompany(companyScopeOf(req.user), emp.employeeCompany)) {
      return res.status(404).json({ error: `Employee '${normId}' not found.` });
    }
    if (!emp.isActive) {
      return res.status(400).json({ error: `${normId} (${emp.employeeName}) is inactive; leave cannot be recorded for an inactive employee.` });
    }

    const leaveType = db.leaveTypes.findById(leaveTypeId);
    if (!leaveType) return res.status(404).json({ error: 'Leave type not found.' });
    if (!leaveType.isActive) return res.status(400).json({ error: `Leave type '${leaveType.name}' is no longer active.` });

    // Overlapping leave would be double-counted by payroll, so it is refused outright.
    const overlapping = db.leaveRequests.getByEmployee(normId).find(r =>
      (r.status === 'Approved' || r.status === 'Submitted') &&
      r.startDate <= endDate &&
      r.endDate >= startDate
    );
    if (overlapping) {
      return res.status(400).json({
        error:
          `${normId} already has ${overlapping.status.toLowerCase()} ${overlapping.leaveTypeName} from ` +
          `${overlapping.startDate} to ${overlapping.endDate}, which overlaps these dates.`,
      });
    }

    const days = inclusiveDayCount(startDate, endDate);
    if (days <= 0) return res.status(400).json({ error: 'The leave period must cover at least one day.' });

    const timestamp = new Date().toISOString();
    const request: LeaveRequest = {
      id: crypto.randomUUID(),
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      employeeCompany: emp.employeeCompany,
      leaveTypeId: leaveType.id,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      isPaid: leaveType.isPaid,
      startDate,
      endDate,
      days,
      reason: reason ? String(reason).trim() : '',
      status: submit ? 'Submitted' : 'Draft',
      submittedBy: submit ? (req.user?.username || 'User') : undefined,
      submittedAt: submit ? timestamp : undefined,
      createdBy: req.user?.username,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.leaveRequests.create(request);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: submit ? 'LEAVE_REQUEST_SUBMITTED' : 'LEAVE_REQUEST_CREATED',
      module: 'Leave',
      recordId: request.id,
      description:
        `${submit ? 'Submitted' : 'Created'} ${request.leaveTypeName} for ${request.employeeId} ` +
        `(${request.employeeName}): ${request.startDate} to ${request.endDate}, ${request.days} day(s).`,
    });

    res.status(201).json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create leave request.' });
  }
});

// PUT /api/leave/requests/:id -- only a Draft may be edited
router.put('/requests/:id', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveRequests.findById(req.params.id);
    if (!existing || !requestVisibleTo(req, existing)) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (existing.status !== 'Draft') {
      return res.status(400).json({
        error: `Only a Draft leave request can be edited. This one is ${existing.status}. Cancel it and raise a new request instead.`,
      });
    }

    const { leaveTypeId, startDate, endDate, reason } = req.body;
    const updates: Partial<LeaveRequest> = {};

    const newStart = startDate !== undefined ? startDate : existing.startDate;
    const newEnd = endDate !== undefined ? endDate : existing.endDate;
    if (!isValidDate(newStart) || !isValidDate(newEnd)) {
      return res.status(400).json({ error: 'Start date and end date must be real calendar dates (YYYY-MM-DD).' });
    }
    if (newEnd < newStart) {
      return res.status(400).json({ error: 'End date cannot be before start date.' });
    }
    updates.startDate = newStart;
    updates.endDate = newEnd;
    updates.days = inclusiveDayCount(newStart, newEnd);

    if (leaveTypeId !== undefined) {
      const leaveType = db.leaveTypes.findById(leaveTypeId);
      if (!leaveType) return res.status(404).json({ error: 'Leave type not found.' });
      updates.leaveTypeId = leaveType.id;
      updates.leaveTypeCode = leaveType.code;
      updates.leaveTypeName = leaveType.name;
      updates.isPaid = leaveType.isPaid;
    }
    if (reason !== undefined) updates.reason = String(reason).trim();

    const updated = await db.leaveRequests.update(req.params.id, updates);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LEAVE_REQUEST_EDITED',
      module: 'Leave',
      recordId: req.params.id,
      description: `Edited draft leave request for ${existing.employeeId} (${existing.employeeName}).`,
      previousValue: { startDate: existing.startDate, endDate: existing.endDate, days: existing.days, leaveTypeName: existing.leaveTypeName },
      newValue: updates,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update leave request.' });
  }
});

// POST /api/leave/requests/:id/submit
router.post('/requests/:id/submit', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveRequests.findById(req.params.id);
    if (!existing || !requestVisibleTo(req, existing)) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (existing.status !== 'Draft') {
      return res.status(400).json({ error: `Only a Draft request can be submitted. This one is ${existing.status}.` });
    }

    const updated = await db.leaveRequests.update(req.params.id, {
      status: 'Submitted',
      submittedBy: req.user?.username || 'User',
      submittedAt: new Date().toISOString(),
    });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LEAVE_REQUEST_SUBMITTED',
      module: 'Leave',
      recordId: req.params.id,
      description: `Submitted ${existing.leaveTypeName} for ${existing.employeeId} (${existing.days} day(s)) for approval.`,
      previousValue: { status: 'Draft' },
      newValue: { status: 'Submitted' },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to submit leave request.' });
  }
});

// POST /api/leave/requests/:id/approve
router.post('/requests/:id/approve', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveRequests.findById(req.params.id);
    if (!existing || !requestVisibleTo(req, existing)) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (existing.status !== 'Submitted') {
      return res.status(400).json({ error: `Only a Submitted request can be approved. This one is ${existing.status}.` });
    }

    const approver = req.user?.username || 'Admin';
    // Separation of duties, matching the attendance workflow: the submitter cannot also
    // approve, because approval is what makes the leave payable.
    if (existing.submittedBy === approver && process.env.ALLOW_SELF_APPROVAL !== 'true') {
      return res.status(403).json({
        error: `This request was submitted by ${existing.submittedBy}. It must be approved by a different user.`,
      });
    }

    // Approving leave inside a finalised payroll month would change pay that is already
    // locked, so it is refused until that month is revised.
    const months = new Set<string>([existing.startDate.slice(0, 7), existing.endDate.slice(0, 7)]);
    for (const m of months) {
      const payroll = db.payroll.getByMonth(m);
      if (payroll?.status === 'Finalized') {
        return res.status(400).json({
          error:
            `Payroll for ${m} is already Finalized, and approving this leave would change pay for that month. ` +
            'Revise the payroll first, then approve.',
        });
      }
    }

    const updated = await db.leaveRequests.update(req.params.id, {
      status: 'Approved',
      decidedBy: approver,
      decidedAt: new Date().toISOString(),
      decisionReason: req.body?.reason ? String(req.body.reason).trim() : '',
    });

    await db.audit.log({
      userId: req.user?.id,
      username: approver,
      userRole: req.user?.role || 'Payroll Manager',
      action: 'LEAVE_REQUEST_APPROVED',
      module: 'Leave',
      recordId: req.params.id,
      description:
        `Approved ${existing.leaveTypeName} for ${existing.employeeId} (${existing.employeeName}): ` +
        `${existing.startDate} to ${existing.endDate}, ${existing.days} day(s), ${existing.isPaid ? 'paid' : 'unpaid'}.`,
      previousValue: { status: 'Submitted' },
      newValue: { status: 'Approved' },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to approve leave request.' });
  }
});

// POST /api/leave/requests/:id/reject
router.post('/requests/:id/reject', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveRequests.findById(req.params.id);
    if (!existing || !requestVisibleTo(req, existing)) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (existing.status !== 'Submitted') {
      return res.status(400).json({ error: `Only a Submitted request can be rejected. This one is ${existing.status}.` });
    }
    const reason = req.body?.reason ? String(req.body.reason).trim() : '';
    if (!reason) {
      return res.status(400).json({ error: 'A rejection reason is required so the employee knows why.' });
    }

    const updated = await db.leaveRequests.update(req.params.id, {
      status: 'Rejected',
      decidedBy: req.user?.username || 'Admin',
      decidedAt: new Date().toISOString(),
      decisionReason: reason,
    });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'Admin',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'LEAVE_REQUEST_REJECTED',
      module: 'Leave',
      recordId: req.params.id,
      description: `Rejected ${existing.leaveTypeName} for ${existing.employeeId}. Reason: ${reason}`,
      previousValue: { status: 'Submitted' },
      newValue: { status: 'Rejected', reason },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reject leave request.' });
  }
});

// POST /api/leave/requests/:id/cancel
router.post('/requests/:id/cancel', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveRequests.findById(req.params.id);
    if (!existing || !requestVisibleTo(req, existing)) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }
    if (existing.status === 'Cancelled' || existing.status === 'Rejected') {
      return res.status(400).json({ error: `This request is already ${existing.status}.` });
    }

    // Cancelling approved leave removes paid days from a month, so the same finalised
    // payroll guard applies as for approval.
    if (existing.status === 'Approved') {
      const months = new Set<string>([existing.startDate.slice(0, 7), existing.endDate.slice(0, 7)]);
      for (const m of months) {
        const payroll = db.payroll.getByMonth(m);
        if (payroll?.status === 'Finalized') {
          return res.status(400).json({
            error:
              `Payroll for ${m} is already Finalized, and cancelling this approved leave would change pay for ` +
              'that month. Revise the payroll first, then cancel.',
          });
        }
      }
    }

    const updated = await db.leaveRequests.update(req.params.id, {
      status: 'Cancelled',
      decidedBy: req.user?.username || 'User',
      decidedAt: new Date().toISOString(),
      decisionReason: req.body?.reason ? String(req.body.reason).trim() : 'Cancelled',
    });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'LEAVE_REQUEST_CANCELLED',
      module: 'Leave',
      recordId: req.params.id,
      description: `Cancelled ${existing.leaveTypeName} for ${existing.employeeId} (${existing.days} day(s)).`,
      previousValue: { status: existing.status },
      newValue: { status: 'Cancelled' },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to cancel leave request.' });
  }
});

// ==================== Balances ====================

// GET /api/leave/balances?year=YYYY&employeeId=
router.get('/balances', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const employeeIdFilter = req.query.employeeId ? normalizeEmployeeId(String(req.query.employeeId)) : null;
    const scope = companyScopeOf(req.user);

    const employees = db.employees
      .getAll()
      .filter(e => e.isActive && canSeeCompany(scope, e.employeeCompany))
      .filter(e => !employeeIdFilter || normalizeEmployeeId(e.employeeId) === employeeIdFilter);

    const types = db.leaveTypes.getAll().filter(t => t.isActive);
    const requests = db.leaveRequests.getAll();

    const balances: LeaveBalance[] = [];
    for (const emp of employees) {
      const empRequests = requests.filter(r => normalizeEmployeeId(r.employeeId) === normalizeEmployeeId(emp.employeeId));
      for (const type of types) {
        // Days are attributed to the calendar year they actually fall in, so a request
        // spanning New Year is split rather than counted twice.
        const daysInYear = (r: LeaveRequest) => {
          let total = 0;
          for (let m = 1; m <= 12; m++) {
            total += leaveDaysInMonth(r.startDate, r.endDate, `${year}-${String(m).padStart(2, '0')}`);
          }
          return total;
        };
        const forType = empRequests.filter(r => r.leaveTypeId === type.id);
        const approvedDays = forType.filter(r => COUNTS_AS_TAKEN.includes(r.status)).reduce((s, r) => s + daysInYear(r), 0);
        const pendingDays = forType.filter(r => COUNTS_AS_PENDING.includes(r.status)).reduce((s, r) => s + daysInYear(r), 0);

        if (approvedDays === 0 && pendingDays === 0 && type.annualEntitlementDays === 0) continue;

        balances.push({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          employeeCompany: emp.employeeCompany,
          year,
          leaveTypeId: type.id,
          leaveTypeCode: type.code,
          leaveTypeName: type.name,
          isPaid: type.isPaid,
          entitlementDays: type.annualEntitlementDays,
          approvedDays,
          pendingDays,
          // A type with no fixed entitlement has no meaningful "remaining" figure, and
          // showing 0 there would read as "none left" rather than "not applicable".
          remainingDays: type.annualEntitlementDays > 0
            ? type.annualEntitlementDays - approvedDays - pendingDays
            : null,
        });
      }
    }

    balances.sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.leaveTypeName.localeCompare(b.leaveTypeName));
    res.json({ year, balances });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute leave balances.' });
  }
});

// GET /api/leave/export?year= -- leave register
router.get('/export', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const scope = companyScopeOf(req.user);
    const requests = db.leaveRequests.getAll().filter(r => canSeeCompany(scope, r.employeeCompany));
    const data = requests.map((r, idx) => ({
      'Sr#': idx + 1,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Company': r.employeeCompany,
      'Leave Type': r.leaveTypeName,
      'Paid': r.isPaid ? 'Yes' : 'No',
      'Start Date': r.startDate,
      'End Date': r.endDate,
      'Days': r.days,
      'Status': r.status,
      'Reason': r.reason || '',
      'Submitted By': r.submittedBy || '',
      'Decided By': r.decidedBy || '',
      'Decision Reason': r.decisionReason || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leave Register');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Leave_Register.xlsx"');
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export the leave register.' });
  }
});

export default router;
