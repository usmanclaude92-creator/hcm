import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { verifyAuth, requireRoles, AuthRequest } from '../auth';

const router = Router();

// GET /api/audit - List audit logs with filters
router.get('/', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), (req: AuthRequest, res: Response) => {
  try {
    const { module, action, search, user, exportFormat } = req.query;
    let logs = db.audit.getAll();

    if (module && module !== 'ALL') {
      logs = logs.filter(l => l.module === module);
    }
    if (action && action !== 'ALL') {
      logs = logs.filter(l => l.action === action);
    }
    if (user && user !== 'ALL') {
      logs = logs.filter(l => l.username.toLowerCase() === String(user).toLowerCase());
    }
    if (search) {
      const q = String(search).trim().toLowerCase();
      logs = logs.filter(l =>
        l.description.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.username.toLowerCase().includes(q) ||
        (l.module && l.module.toLowerCase().includes(q))
      );
    }

    if (exportFormat === 'excel') {
      const data = logs.map((l, idx) => ({
        'Sr#': idx + 1,
        'Timestamp': l.timestamp,
        'User': l.username,
        'Role': l.userRole,
        'Module': l.module,
        'Action': l.action,
        'Description': l.description,
        'Record ID': l.recordId || '',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 6 }, { wch: 22 }, { wch: 15 }, { wch: 18 },
        { wch: 18 }, { wch: 26 }, { wch: 60 }, { wch: 36 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Audit_Logs');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Audit_Logs_${new Date().toISOString().split('T')[0]}.xlsx"`);
      return res.send(buffer);
    }

    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

export default router;
