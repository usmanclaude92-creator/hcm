// Shared Leave Type CRUD logic, used by both server/routes/leave.ts
// (/api/leave/types, the Leave Management screen) and server/routes/masters.ts
// (/api/master(s)/leave-types, the Master Data Management screen).
//
// Both screens edit the exact same underlying db.leaveTypes records, so the
// validation and audit-logging behavior has to be identical regardless of which
// screen made the change -- previously each route file re-implemented this
// independently and had drifted (masters.ts didn't validate a non-numeric
// annualEntitlementDays, and never wrote an audit log entry; leave.ts had no
// delete/toggle-status endpoint at all).
import crypto from 'crypto';
import { db } from '../db.js';
import type { LeaveType } from '../../src/types/index';

export interface LeaveTypeActor {
  id?: string;
  username?: string;
  role?: string;
}

export function listLeaveTypes(includeInactive: boolean): LeaveType[] {
  return db.leaveTypes
    .getAll()
    .filter(t => includeInactive || t.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createLeaveType(
  body: { code?: string; name?: string; isPaid?: boolean; annualEntitlementDays?: number; remarks?: string; isActive?: boolean },
  actor: LeaveTypeActor,
): Promise<LeaveType> {
  const { code, name, isPaid, annualEntitlementDays, remarks, isActive } = body;
  if (!code || !name) {
    throw Object.assign(new Error('Leave type code and name are required.'), { status: 400 });
  }
  const cleanCode = String(code).trim().toUpperCase();
  if (db.leaveTypes.findByCode(cleanCode)) {
    throw Object.assign(new Error(`A leave type with code '${cleanCode}' already exists.`), { status: 400 });
  }
  const days = Number(annualEntitlementDays ?? 0);
  if (!Number.isFinite(days) || days < 0) {
    throw Object.assign(new Error('Annual entitlement must be a number of days, and cannot be negative.'), { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const type: LeaveType = {
    id: crypto.randomUUID(),
    code: cleanCode,
    name: String(name).trim(),
    isPaid: isPaid !== false,
    annualEntitlementDays: Math.round(days),
    isActive: isActive !== false,
    remarks: remarks ? String(remarks).trim() : '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.leaveTypes.create(type);

  await db.audit.log({
    userId: actor.id,
    username: actor.username || 'User',
    userRole: actor.role || 'Payroll User',
    action: 'LEAVE_TYPE_CREATED',
    module: 'Leave',
    recordId: type.id,
    description: `Created leave type ${type.code} — ${type.name} (${type.isPaid ? 'paid' : 'unpaid'}, ${type.annualEntitlementDays} days/year).`,
  });

  return type;
}

export async function updateLeaveType(
  id: string,
  body: { name?: string; isPaid?: boolean; annualEntitlementDays?: number; remarks?: string; isActive?: boolean },
  actor: LeaveTypeActor,
): Promise<LeaveType> {
  const existing = db.leaveTypes.findById(id);
  if (!existing) {
    throw Object.assign(new Error('Leave type not found.'), { status: 404 });
  }

  const { name, isPaid, annualEntitlementDays, remarks, isActive } = body;
  const updates: Partial<LeaveType> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (isPaid !== undefined) updates.isPaid = Boolean(isPaid);
  if (remarks !== undefined) updates.remarks = String(remarks).trim();
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (annualEntitlementDays !== undefined) {
    const days = Number(annualEntitlementDays);
    if (!Number.isFinite(days) || days < 0) {
      throw Object.assign(new Error('Annual entitlement must be a number of days, and cannot be negative.'), { status: 400 });
    }
    updates.annualEntitlementDays = Math.round(days);
  }

  const updated = await db.leaveTypes.update(id, updates);

  await db.audit.log({
    userId: actor.id,
    username: actor.username || 'User',
    userRole: actor.role || 'Payroll User',
    action: 'LEAVE_TYPE_UPDATED',
    module: 'Leave',
    recordId: id,
    description: `Updated leave type ${existing.code} — ${existing.name}.`,
    previousValue: { isPaid: existing.isPaid, annualEntitlementDays: existing.annualEntitlementDays, isActive: existing.isActive },
    newValue: updates,
  });

  return updated as LeaveType;
}

export async function deleteLeaveType(id: string, actor: LeaveTypeActor): Promise<{ name: string }> {
  const existing = db.leaveTypes.findById(id);
  if (!existing) {
    throw Object.assign(new Error('Leave type not found.'), { status: 404 });
  }

  const used = db.leaveRequests.getAll().some(r => r.leaveTypeId === id);
  if (used) {
    throw Object.assign(
      new Error(`Cannot delete leave type '${existing.name}': it is referenced in existing employee leave requests. Consider setting it to Inactive instead.`),
      { status: 400 },
    );
  }

  await db.leaveTypes.delete(id);

  await db.audit.log({
    userId: actor.id,
    username: actor.username || 'User',
    userRole: actor.role || 'Payroll User',
    action: 'LEAVE_TYPE_DELETED',
    module: 'Leave',
    recordId: id,
    description: `Deleted leave type ${existing.code} — ${existing.name}.`,
  });

  return { name: existing.name };
}

export async function toggleLeaveTypeStatus(id: string, actor: LeaveTypeActor): Promise<LeaveType> {
  const existing = db.leaveTypes.findById(id);
  if (!existing) {
    throw Object.assign(new Error('Leave type not found.'), { status: 404 });
  }
  const updated = await db.leaveTypes.update(id, { isActive: !existing.isActive });

  await db.audit.log({
    userId: actor.id,
    username: actor.username || 'User',
    userRole: actor.role || 'Payroll User',
    action: 'LEAVE_TYPE_UPDATED',
    module: 'Leave',
    recordId: id,
    description: `${updated!.isActive ? 'Activated' : 'Deactivated'} leave type ${existing.code} — ${existing.name}.`,
    previousValue: { isActive: existing.isActive },
    newValue: { isActive: updated!.isActive },
  });

  return updated as LeaveType;
}
