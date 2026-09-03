import express, { Response } from 'express';
import { db, calculateExpiryStatus, maskSensitiveId, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, AuthRequest } from '../auth.js';

const router = express.Router();

export interface NotificationItem {
  id: string;
  category: 'visa' | 'payroll' | 'attendance';
  type: 'visa_expiring' | 'visa_expired' | 'payroll_draft' | 'payroll_revision' | 'attendance_approval';
  severity: 'urgent' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  date: string;
  daysRemaining?: number;
  status: string;
  metadata: Record<string, any>;
  action: {
    view: string;
    params?: Record<string, any>;
    label: string;
  };
}

// GET /api/notifications - Real-time alerts for expiring visas & pending payroll approvals
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const notifications: NotificationItem[] = [];

    // ==========================================
    // 1. Expiring & Expired Visas
    // ==========================================
    const employees = db.employees.getAll().filter((e) => e.isActive);
    const visas = db.visas.getAll().filter((v) => v.isCurrent);

    for (const emp of employees) {
      const empNorm = normalizeEmployeeId(emp.employeeId);
      const v = visas.find((vi) => normalizeEmployeeId(vi.employeeId) === empNorm);

      if (v && v.expiryDate) {
        const exp = new Date(v.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const daysRemaining = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = calculateExpiryStatus(v.expiryDate);

        if (status === 'Expired' || status === 'Urgent' || status === 'Expiring Soon' || daysRemaining <= 60) {
          const isExpired = daysRemaining <= 0 || status === 'Expired';
          const isUrgent = isExpired || daysRemaining <= 15 || status === 'Urgent';

          notifications.push({
            id: `visa-${v.id}`,
            category: 'visa',
            type: isExpired ? 'visa_expired' : 'visa_expiring',
            severity: isUrgent ? 'urgent' : 'warning',
            title: isExpired
              ? `Visa Expired: ${emp.employeeName}`
              : `Visa Expiring: ${emp.employeeName} (${daysRemaining}d left)`,
            message: isExpired
              ? `Visa #${maskSensitiveId(v.visaNumber)} for ${emp.employeeName} (${v.tradeOnVisa || emp.designation}) expired on ${v.expiryDate}. Immediate renewal or exit permit required under Oman Labor Law.`
              : `Visa #${maskSensitiveId(v.visaNumber)} for ${emp.employeeName} (${v.tradeOnVisa || emp.designation}) expires in ${daysRemaining} days on ${v.expiryDate} (Sponsor: ${v.sponsor || emp.employeeCompany}).`,
            timestamp: v.updatedAt || v.createdAt || new Date().toISOString(),
            date: v.expiryDate,
            daysRemaining,
            status,
            metadata: {
              employeeId: emp.employeeId,
              employeeName: emp.employeeName,
              designation: emp.designation,
              tradeOnVisa: v.tradeOnVisa,
              company: emp.employeeCompany,
              sponsor: v.sponsor || emp.employeeCompany,
              visaNumberMasked: maskSensitiveId(v.visaNumber),
              expiryDate: v.expiryDate,
            },
            action: {
              view: 'compliance',
              params: { tab: 'alerts', search: emp.employeeName },
              label: 'View Compliance',
            },
          });
        }
      }
    }

    // ==========================================
    // 2. Pending Payroll Approvals
    // ==========================================
    const payrolls = db.payroll.getAll();
    for (const p of payrolls) {
      if (p.status === 'Draft') {
        notifications.push({
          id: `payroll-${p.id || p.payrollMonth}`,
          category: 'payroll',
          type: 'payroll_draft',
          severity: 'warning',
          title: `Payroll Pending Finalization: ${p.payrollMonth}`,
          message: `Payroll calculation for ${p.payrollMonth} (${p.totalEmployees || 0} employees, Net OMR ${roundOMR(p.totalNetSalary || 0).toFixed(3)}) is in Draft and awaiting approval & finalization.`,
          timestamp: p.updatedAt || p.createdAt || new Date().toISOString(),
          date: p.payrollMonth,
          status: p.status,
          metadata: {
            payrollMonth: p.payrollMonth,
            totalEmployees: p.totalEmployees,
            totalNetSalary: p.totalNetSalary,
            totalGrossSalary: p.totalGrossSalary,
            totalWpsSalary: p.totalWpsSalary,
            status: p.status,
          },
          action: {
            view: 'payroll',
            params: { month: p.payrollMonth },
            label: 'Review Payroll',
          },
        });
      } else if (p.status === 'In Revision') {
        notifications.push({
          id: `payroll-${p.id || p.payrollMonth}-revision`,
          category: 'payroll',
          type: 'payroll_revision',
          severity: 'urgent',
          title: `Payroll Revision Pending: ${p.payrollMonth}`,
          message: `Revision #${p.revisionNumber || 1} for ${p.payrollMonth} has been opened and requires approval & finalization before disbursements.`,
          timestamp: p.updatedAt || new Date().toISOString(),
          date: p.payrollMonth,
          status: p.status,
          metadata: {
            payrollMonth: p.payrollMonth,
            revisionNumber: p.revisionNumber,
            status: p.status,
          },
          action: {
            view: 'payroll',
            params: { month: p.payrollMonth },
            label: 'Review Revision',
          },
        });
      }
    }

    // ==========================================
    // 3. Pending Attendance Submissions
    // ==========================================
    const attendanceMonths = db.attendanceMonths.getAll().filter((m) => m.status === 'Submitted');
    for (const m of attendanceMonths) {
      notifications.push({
        id: `attendance-${m.id || m.payrollMonth}`,
        category: 'attendance',
        type: 'attendance_approval',
        severity: 'warning',
        title: `Attendance Approval Pending: ${m.payrollMonth}`,
        message: `Attendance ledger for ${m.payrollMonth} was submitted by ${m.submittedBy || 'HR User'} and requires manager approval before payroll processing.`,
        timestamp: m.submittedAt || m.updatedAt || new Date().toISOString(),
        date: m.payrollMonth,
        status: m.status,
        metadata: {
          payrollMonth: m.payrollMonth,
          submittedBy: m.submittedBy,
          submittedAt: m.submittedAt,
        },
        action: {
          view: 'attendance',
          params: { month: m.payrollMonth },
          label: 'Review Attendance',
        },
      });
    }

    // Sort: Urgent first, then warnings; within urgency, sort expired/lowest days remaining first
    notifications.sort((a, b) => {
      if (a.severity === 'urgent' && b.severity !== 'urgent') return -1;
      if (a.severity !== 'urgent' && b.severity === 'urgent') return 1;
      if (a.daysRemaining !== undefined && b.daysRemaining !== undefined) {
        return a.daysRemaining - b.daysRemaining;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const visaAlertsCount = notifications.filter((n) => n.category === 'visa').length;
    const payrollApprovalsCount = notifications.filter(
      (n) => n.category === 'payroll' || n.category === 'attendance'
    ).length;
    const urgentCount = notifications.filter((n) => n.severity === 'urgent').length;

    res.json({
      summary: {
        total: notifications.length,
        visaAlertsCount,
        payrollApprovalsCount,
        urgentCount,
      },
      notifications,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch notifications' });
  }
});

export default router;
