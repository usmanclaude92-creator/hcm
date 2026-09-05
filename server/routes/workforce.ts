import { Router, Response } from 'express';
import { db, normalizeEmployeeId } from '../db.js';
import { verifyAuth, AuthRequest, companyScopeOf, canSeeCompany } from '../auth.js';
import { fetchWorkforceShiftStatuses } from '../integrations/workforceClient.js';

const router = Router();

router.get('/shift-status', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const scope = companyScopeOf(req.user);
    const employeeIds = db.employees
      .getAll()
      .filter((e) => e.isActive && canSeeCompany(scope, e.employeeCompany))
      .map((e) => normalizeEmployeeId(e.employeeId));

    const result = await fetchWorkforceShiftStatuses(employeeIds);

    res.json({
      configured: result.configured,
      available: result.available,
      reason: result.reason,
      statuses: result.statuses,
    });
  } catch (err: any) {
    res.json({ configured: false, available: false, reason: err.message || 'Failed to fetch Workforce shift status.', statuses: {} });
  }
});

export default router;
