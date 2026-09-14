import { Router, Response } from 'express';
import { db, normalizeEmployeeId } from '../db.js';
import { verifyAuth, requireRoles, AuthRequest, companyScopeOf, canSeeCompany } from '../auth.js';
import {
  fetchWorkforceShiftStatuses,
  syncEmployeesWithWorkforce,
  type WorkforceEligibilityRecord,
} from '../integrations/workforceClient.js';

const router = Router();

// GET /api/workforce/shift-status
// Populates "Shift Start"/"Shift End" on the Workforce Deployment dashboard.
router.get('/shift-status', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const scope = companyScopeOf(req.user);
    const activeEmployees = db.employees
      .getAll()
      .filter((e) => e.isActive && canSeeCompany(scope, e.employeeCompany));

    // Only a GENUINE Civil ID may be sent to Workforce. Substituting the HCMS
    // employeeId when an employee has no Civil ID on file is what made one employee's
    // shift appear on another's card: HCMS employee 12345678 has no Civil ID, so its
    // employeeId was sent as a Civil ID -- and 12345678 really is the Civil ID of a
    // DIFFERENT person (employee_code EMP-001) in the Workforce database. Workforce
    // resolved it correctly, to the wrong human, and HCMS then rendered that person's
    // selfie, GPS and shift times on the 12345678 card.
    //
    // An employee with no Civil ID is simply not linked to Workforce yet. It is
    // reported as such (see `unlinkedEmployeeIds` below) rather than guessed at.
    const employeeIdByCivilId = new Map<string, string>();
    const unlinkedEmployeeIds: string[] = [];
    for (const e of activeEmployees) {
      const civilId = db.civilIds.getCurrent(e.employeeId)?.civilIdNumber?.trim();
      if (civilId) {
        employeeIdByCivilId.set(civilId, normalizeEmployeeId(e.employeeId));
      } else {
        unlinkedEmployeeIds.push(normalizeEmployeeId(e.employeeId));
      }
    }

    const result = await fetchWorkforceShiftStatuses(Array.from(employeeIdByCivilId.keys()));

    const statuses: Record<string, unknown> = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const [civilId, status] of Object.entries(result.statuses)) {
      const employeeId = employeeIdByCivilId.get(civilId);
      if (employeeId) {
        const s = { ...(status as any) };
        const punch = db.attendancePunches.getTodayPunch(employeeId, todayStr);
        if (punch) {
          if ((s.isInsideGeofence === null || s.isInsideGeofence === undefined) && punch.isGeofenceException !== undefined) {
            s.isInsideGeofence = !punch.isGeofenceException;
            s.geofenceStatus = punch.isGeofenceException ? 'OUTSIDE' : 'INSIDE';
          }
          if (!s.clockInAt && punch.checkInTime) s.clockInAt = punch.checkInTime;
          if (!s.clockOutAt && punch.checkOutTime) s.clockOutAt = punch.checkOutTime;
          if (!s.selfieTakenAt && punch.checkInTime) s.selfieTakenAt = punch.checkInTime;
        }
        statuses[employeeId] = s;
      }
    }

    // Also include any active employees with today's local punches not yet returned by Workforce
    for (const e of activeEmployees) {
      const normId = normalizeEmployeeId(e.employeeId);
      if (!statuses[normId]) {
        const punch = db.attendancePunches.getTodayPunch(e.employeeId, todayStr);
        if (punch) {
          statuses[normId] = {
            shiftDate: punch.punchDate,
            clockInAt: punch.checkInTime,
            clockOutAt: punch.checkOutTime || null,
            status: punch.checkOutTime ? 'CLOSED' : 'OPEN',
            selfieUrl: null,
            startSelfieUrl: null,
            endSelfieUrl: null,
            selfieTakenAt: punch.checkInTime,
            totalTodayMinutes: punch.hoursWorked ? Math.round(punch.hoursWorked * 60) : null,
            totalWorkedMinutes: punch.hoursWorked ? Math.round(punch.hoursWorked * 60) : null,
            isInsideGeofence: punch.isGeofenceException === false,
            geofenceStatus: punch.isGeofenceException ? 'OUTSIDE' : 'INSIDE',
          };
        }
      }
    }

    res.json({
      configured: result.configured,
      available: result.available,
      reason: result.reason,
      statuses,
      // Active employees with no Civil ID on file. They cannot be matched to a
      // Workforce registration at all, so their cards legitimately show no shift.
      unlinkedEmployeeIds,
    });
  } catch (err: any) {
    res.json({ configured: false, available: false, reason: err.message || 'Failed to fetch Workforce shift status.', statuses: {} });
  }
});

// POST /api/workforce/sync-eligibility
// Pushes active employees into the Artify Workforce app's eligibility list
router.post('/sync-eligibility', verifyAuth, requireRoles('Administrator'), async (req: AuthRequest, res: Response) => {
  try {
    const activeEmployees = db.employees.getAll().filter((e) => e.isActive);

    const records: WorkforceEligibilityRecord[] = [];
    const skippedNoCivilId: string[] = [];
    for (const e of activeEmployees) {
      // Genuine Civil ID only -- never the employeeId as a stand-in. Pushing an
      // employeeId into Workforce's civil_id_lookup would let an unrelated employee
      // register against this record (see the shift-status handler above).
      const civilId = db.civilIds.getCurrent(e.employeeId)?.civilIdNumber?.trim();
      if (!civilId) {
        skippedNoCivilId.push(normalizeEmployeeId(e.employeeId));
        continue;
      }

      const personal = db.personalDetails.get(e.employeeId);
      const projectCode = e.assignedProjectCode || personal?.assignedProject || null;
      const project = projectCode ? db.projects.findByCode(projectCode) : undefined;

      records.push({
        civilId,
        employeeCode: normalizeEmployeeId(e.employeeId),
        fullName: e.employeeName,
        role: e.employeeType ? e.employeeType.toUpperCase() : 'STAFF',
        department: e.designation || null,
        phone: personal?.mobile || personal?.mobileNumber || null,
        companyCode: e.employeeCompany,
        companyName: e.employeeCompany,
        projectCode: project?.projectCode || null,
        projectName: project?.projectName || null,
      });
    }

    const result = await syncEmployeesWithWorkforce(records);

    if (!result.configured) {
      return res.status(400).json({ error: 'Workforce integration is not configured (WORKFORCE_FUNCTIONS_URL / WORKFORCE_INTEGRATION_SECRET).' });
    }
    if (!result.available) {
      return res.status(502).json({ error: result.reason || 'Workforce sync failed.' });
    }

    await db.audit.log({
      userId: req.user!.id,
      username: req.user!.username,
      userRole: req.user!.role,
      action: 'WORKFORCE_ELIGIBILITY_SYNC',
      module: 'Workforce Integration',
      recordId: 'sync-eligibility',
      description: `Synced ${records.length} employee(s) with the Artify Workforce app.${skippedNoCivilId.length ? ` Skipped ${skippedNoCivilId.length} without a Civil ID: ${skippedNoCivilId.join(', ')}.` : ''}`,
      ipAddress: req.ip,
    });

    res.json({ synced: records.length, summary: result.summary, skippedNoCivilId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync with Workforce.' });
  }
});

export default router;
