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
    const activeEmployees = (await db.employees.getAll())
      .filter((e) => e.isActive && canSeeCompany(scope, e.employeeCompany));

    const employeeIdByCivilId = new Map<string, string>();
    for (const e of activeEmployees) {
      // Civil ID only: an employee with no genuine Civil ID on file is skipped rather
      // than substituting the internal employeeId, which would query Workforce using an
      // identifier that was never actually registered as that employee's Civil ID there.
      const civilId = db.civilIds.getCurrent(e.employeeId)?.civilIdNumber;
      if (civilId) employeeIdByCivilId.set(civilId, normalizeEmployeeId(e.employeeId));
    }

    const result = await fetchWorkforceShiftStatuses(Array.from(employeeIdByCivilId.keys()));

    // The Workforce Deployment Dashboard's Employee Cards must reflect only real,
    // GPS/selfie-verified attendance from the Workforce Supabase `attendance_shifts`
    // table (via fetchWorkforceShiftStatuses above). This previously back-filled gaps
    // from the legacy, unmigrated `db.attendancePunches` in-memory store -- whose
    // geofence field is validated against a single hardcoded head-office coordinate
    // (see DEFAULT_GEOFENCE in routes/attendance.ts), not the employee's real assigned
    // project, and whose date was a plain UTC/server-local split rather than the
    // business/GPS-derived date the live flow uses. Blending that in made cards
    // silently show unvalidated, mismatched-geofence data as if it were real,
    // GPS-verified attendance. If Workforce has no status for an employee, the card
    // must show its default/grey "not captured" state, never a fabricated stand-in.
    const statuses: Record<string, unknown> = {};
    for (const [civilId, status] of Object.entries(result.statuses)) {
      const employeeId = employeeIdByCivilId.get(civilId);
      if (employeeId) {
        statuses[employeeId] = status;
      }
    }

    res.json({
      configured: result.configured,
      available: result.available,
      reason: result.reason,
      statuses,
    });
  } catch (err: any) {
    res.json({ configured: false, available: false, reason: err.message || 'Failed to fetch Workforce shift status.', statuses: {} });
  }
});

// POST /api/workforce/sync-eligibility
// Pushes active employees into the Artify Workforce app's eligibility list
router.post('/sync-eligibility', verifyAuth, requireRoles('Administrator'), async (req: AuthRequest, res: Response) => {
  try {
    const activeEmployees = (await db.employees.getAll()).filter((e) => e.isActive);

    const records: WorkforceEligibilityRecord[] = [];
    const skippedNoCivilId: string[] = [];
    for (const e of activeEmployees) {
      // Civil ID only -- this was previously falling back to the internal employeeId,
      // which meant an employee with no Civil ID on file was never actually skipped (an
      // employeeId is always truthy) and got pushed into Workforce's eligibility
      // whitelist keyed by a value that isn't really their Civil ID.
      const civilId = db.civilIds.getCurrent(e.employeeId)?.civilIdNumber;
      if (!civilId) {
        skippedNoCivilId.push(e.employeeId);
        continue;
      }

      const personal = db.personalDetails.get(e.employeeId);
      const projectCode = e.assignedProjectCode || personal?.assignedProject || null;
      const project = projectCode ? await db.projects.findByCode(projectCode) : undefined;

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
      description: `Synced ${records.length} employee(s) with the Artify Workforce app.${
        skippedNoCivilId.length ? ` Skipped ${skippedNoCivilId.length} with no Civil ID on file.` : ''
      }`,
      ipAddress: req.ip,
    });

    res.json({ synced: records.length, summary: result.summary, skippedNoCivilId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync with Workforce.' });
  }
});

export default router;
