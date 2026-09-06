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
// Populates "Shift Start"/"Shift End" on the Workforce Deployment dashboard. Linking is by
// Civil ID (see workforceClient.ts) -- an employee with no current Civil ID on file simply
// gets no entry here, same as if the Workforce lookup were unavailable.
router.get('/shift-status', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const scope = companyScopeOf(req.user);
    const activeEmployees = db.employees
      .getAll()
      .filter((e) => e.isActive && canSeeCompany(scope, e.employeeCompany));

    const employeeIdByCivilId = new Map<string, string>();
    for (const e of activeEmployees) {
      const civilId = db.civilIds.getCurrent(e.employeeId)?.civilIdNumber;
      if (civilId) employeeIdByCivilId.set(civilId, normalizeEmployeeId(e.employeeId));
    }

    const result = await fetchWorkforceShiftStatuses(Array.from(employeeIdByCivilId.keys()));

    // Re-key the Civil-ID-keyed response back onto HCMS Employee ID, which is what the
    // dashboard/cards already key off of -- keeps the frontend contract unchanged.
    const statuses: Record<string, unknown> = {};
    for (const [civilId, status] of Object.entries(result.statuses)) {
      const employeeId = employeeIdByCivilId.get(civilId);
      if (employeeId) statuses[employeeId] = status;
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
// Pushes active employees who have a current Civil ID on file into the Artify Workforce
// app's eligibility list, so they can register there with that same Civil ID. Administrator
// only: this sends names, phone numbers and Civil ID numbers to an external system.
router.post('/sync-eligibility', verifyAuth, requireRoles('Administrator'), async (req: AuthRequest, res: Response) => {
  try {
    const activeEmployees = db.employees.getAll().filter((e) => e.isActive);

    const records: WorkforceEligibilityRecord[] = [];
    for (const e of activeEmployees) {
      const civilId = db.civilIds.getCurrent(e.employeeId)?.civilIdNumber;
      if (!civilId) continue;

      const personal = db.personalDetails.get(e.employeeId);
      // Employment Details' linked Assigned Project (Project Master Data) is the
      // authoritative source; the free-text personalDetails.assignedProject is a legacy
      // fallback for records imported before that link existed.
      const projectCode = e.assignedProjectCode || personal?.assignedProject || null;
      const project = projectCode ? db.projects.findByCode(projectCode) : undefined;

      records.push({
        civilId,
        employeeCode: normalizeEmployeeId(e.employeeId),
        fullName: e.employeeName,
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
      description: `Synced ${records.length} employee(s) with the Artify Workforce app (${result.summary?.lookupUpserted ?? 0} eligibility rows upserted, ${result.summary?.employeesRefreshed ?? 0} already-registered profiles refreshed, ${result.summary?.projectsCreated ?? 0} new site(s) created there).`,
      ipAddress: req.ip,
    });

    res.json({ synced: records.length, summary: result.summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync with Workforce.' });
  }
});

export default router;
