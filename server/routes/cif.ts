import { Router, Response } from 'express';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { db, normalizeEmployeeId, roundOMR } from '../db.js';
import { verifyAuth, requirePermission, AuthRequest } from '../auth.js';
import type { CifBatch, CifRecord, EmployeeCompany } from '../../src/types/index';

const router = Router();

const PAYROLL_TYPE = 'Monthly';
const EMPLOYEE_COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];
const CIF_FILE_TYPES = ['Standard CIF', 'Bank Transfer File', 'WPS File'];
const VARIANCE_TOLERANCE = 0.001;

// GET /api/cif/export/template - Modeled directly on Attendance's own template pattern,
// not a specific bank's regulatory column spec (explicit product decision).
router.get('/export/template', verifyAuth, requirePermission('cif.upload'), async (req: AuthRequest, res: Response) => {
  try {
    const { company, month } = req.query;
    const payrollMonth = String(month || new Date().toISOString().slice(0, 7));

    const payroll = db.payroll.getByMonth(payrollMonth);
    let lines = (payroll?.lines || []);
    if (company) lines = lines.filter(l => l.employeeCompany === company);

    const headers = ['Employee ID', 'Employee Name', 'Account Reference', 'Amount', 'Reference'];
    const colWidths = [14, 24, 24, 14, 20];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`CIF_${payrollMonth}`);
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));
    sheet.getRow(1).font = { bold: true };

    lines.forEach(l => {
      sheet.addRow([l.employeeId, l.employeeName, '', roundOMR(l.netSalary).toFixed(3), '']);
    });

    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [
      { header: 'FIELD', width: 25 }, { header: 'ACCEPTED VALUES / FORMAT', width: 55 },
    ];
    instructionsSheet.getRow(1).font = { bold: true };
    instructionsSheet.addRows([
      ['Employee ID', 'Must match an employee on that payroll month\'s Finalized payroll.'],
      ['Account Reference', 'Bank/account reference text -- generic field, not a specific bank\'s IBAN/routing spec.'],
      ['Amount', 'OMR amount, must be greater than zero. Pre-filled from that month\'s net salary as a starting point -- adjust as needed.'],
      ['Reference', 'Optional free-text reference/note.'],
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="CIF_Template_${payrollMonth}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate CIF template' });
  }
});

// POST /api/cif/import/validate - Parse + validate uploaded CIF file (no writes)
router.post('/import/validate', verifyAuth, requirePermission('cif.upload'), (req: AuthRequest, res: Response) => {
  try {
    const { fileData, payrollMonth, company } = req.body;
    if (!fileData || !payrollMonth) {
      return res.status(400).json({ error: 'Excel file data and payroll month are required.' });
    }

    const payroll = db.payroll.getByMonth(payrollMonth);
    if (!payroll || payroll.status !== 'Finalized') {
      return res.status(400).json({ error: `Payroll for ${payrollMonth} must be Finalized before uploading a CIF batch.` });
    }

    const buffer = Buffer.from(fileData.replace(/^data:.*?;base64,/, ''), 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    if (rawRows.length === 0) {
      return res.status(400).json({ error: 'The uploaded file has no data rows.' });
    }

    const previewRows: any[] = [];
    const seenEmp = new Set<string>();
    let validCount = 0, invalidCount = 0, duplicateCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const r = rawRows[i];
      const rowNum = i + 2;

      const rawId = String(r['Employee ID'] || '').trim();
      const rawAccountRef = String(r['Account Reference'] || '').trim();
      const rawAmount = r['Amount'] || 0;
      const rawReference = String(r['Reference'] || '').trim();

      const normEmpId = normalizeEmployeeId(rawId);
      const emp = db.employees.findByEmployeeId(normEmpId);
      const line = payroll.lines?.find(l => normalizeEmployeeId(l.employeeId) === normEmpId
        && (!company || l.employeeCompany === company));
      const numAmount = Number(rawAmount) || 0;

      let status: 'Valid' | 'Invalid' | 'Duplicate' = 'Valid';
      let reason = 'Ready';

      if (!normEmpId) {
        status = 'Invalid'; reason = 'Employee ID is missing';
      } else if (!emp) {
        status = 'Invalid'; reason = `Employee '${normEmpId}' not found in system`;
      } else if (!line) {
        status = 'Invalid'; reason = `Employee '${normEmpId}' is not on the ${payrollMonth} Finalized payroll`;
      } else if (numAmount <= 0) {
        status = 'Invalid'; reason = 'Amount must be greater than zero';
      } else if (!rawAccountRef) {
        status = 'Invalid'; reason = 'Account Reference is required';
      } else if (seenEmp.has(normEmpId)) {
        status = 'Duplicate'; reason = `Duplicate CIF row for employee ${normEmpId}`;
      } else {
        seenEmp.add(normEmpId);
      }

      if (status === 'Valid') validCount++;
      else if (status === 'Duplicate') duplicateCount++;
      else invalidCount++;

      previewRows.push({
        rowNumber: rowNum,
        employeeId: normEmpId,
        employeeName: emp ? emp.employeeName : (r['Employee Name'] || '—'),
        accountReference: rawAccountRef,
        amount: numAmount,
        reference: rawReference,
        status,
        reason,
      });
    }

    const payrollTotal = roundOMR((payroll.lines || [])
      .filter(l => !company || l.employeeCompany === company)
      .reduce((s, l) => s + l.netSalary, 0));
    const cifTotal = roundOMR(previewRows.filter(r => r.status !== 'Invalid').reduce((s, r) => s + r.amount, 0));
    const variance = roundOMR(cifTotal - payrollTotal);

    res.json({
      payrollMonth,
      summary: { totalRows: rawRows.length, validCount, invalidCount, duplicateCount },
      reconciliation: { payrollTotal, cifTotal, variance },
      rows: previewRows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to parse CIF file.' });
  }
});

// POST /api/cif - Create a batch from validated rows (Upload -> Validated/Previewed)
router.post('/', verifyAuth, requirePermission('cif.upload'), async (req: AuthRequest, res: Response) => {
  try {
    const { company, payrollMonth, payrollType, cifFileType, rows } = req.body;
    if (!company || !payrollMonth || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Company, payroll month and rows are required.' });
    }

    const validRows = rows.filter((r: any) => r.status !== 'Invalid');
    if (validRows.length === 0) {
      return res.status(400).json({ error: 'No valid or duplicate-flagged rows to upload.' });
    }

    const payroll = db.payroll.getByMonth(payrollMonth);
    const payrollTotal = roundOMR((payroll?.lines || [])
      .filter(l => l.employeeCompany === company)
      .reduce((s, l) => s + l.netSalary, 0));

    const timestamp = new Date().toISOString();
    const batchId = crypto.randomUUID();
    const validCount = rows.filter((r: any) => r.status === 'Valid').length;
    const invalidCount = rows.filter((r: any) => r.status === 'Invalid').length;
    const duplicateCount = rows.filter((r: any) => r.status === 'Duplicate').length;
    const cifTotal = roundOMR(validRows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0));

    const batch: CifBatch = {
      id: batchId,
      company,
      payrollMonth,
      payrollType: payrollType || PAYROLL_TYPE,
      cifFileType: cifFileType || CIF_FILE_TYPES[0],
      status: 'Validated',
      uploadedBy: req.user?.username || 'Admin',
      uploadedAt: timestamp,
      validatedAt: timestamp,
      payrollTotal,
      cifTotal,
      variance: roundOMR(cifTotal - payrollTotal),
      validCount,
      invalidCount,
      duplicateCount,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const records: CifRecord[] = validRows.map((r: any) => ({
      id: crypto.randomUUID(),
      batchId,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      accountReference: r.accountReference,
      amount: Number(r.amount) || 0,
      reference: r.reference,
      status: r.status,
      reason: r.reason,
      createdAt: timestamp,
    }));

    await db.cif.createBatch(batch, records);

    await db.audit.log({
      userId: req.user?.id, username: req.user?.username || 'User', userRole: req.user?.role || 'Payroll User',
      action: 'CIF_UPLOADED', module: 'CIF', recordId: batchId,
      description: `Uploaded CIF batch for ${company} / ${payrollMonth}: ${validCount} valid, ${invalidCount} invalid, ${duplicateCount} duplicate rows.`,
    });

    res.status(201).json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create CIF batch' });
  }
});

// GET /api/cif/history - Processing history
router.get('/history', verifyAuth, requirePermission('cif.view'), (req: AuthRequest, res: Response) => {
  try {
    const { company, payrollMonth } = req.query;
    const batches = db.cif.getBatches({ company: company as string, payrollMonth: payrollMonth as string });
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch CIF processing history' });
  }
});

// GET /api/cif/:id - Batch detail + records
router.get('/:id', verifyAuth, requirePermission('cif.view'), (req: AuthRequest, res: Response) => {
  try {
    const batch = db.cif.getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: 'CIF batch not found.' });
    const records = db.cif.getRecordsByBatch(batch.id);
    res.json({ ...batch, records });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch CIF batch' });
  }
});

// POST /api/cif/:id/preview - Recompute reconciliation, mark Previewed
router.post('/:id/preview', verifyAuth, requirePermission('cif.upload'), async (req: AuthRequest, res: Response) => {
  try {
    const batch = db.cif.getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: 'CIF batch not found.' });

    const payroll = db.payroll.getByMonth(batch.payrollMonth);
    const payrollTotal = roundOMR((payroll?.lines || []).filter(l => l.employeeCompany === batch.company).reduce((s, l) => s + l.netSalary, 0));
    const records = db.cif.getRecordsByBatch(batch.id);
    const cifTotal = roundOMR(records.filter(r => r.status !== 'Invalid').reduce((s, r) => s + r.amount, 0));
    const variance = roundOMR(cifTotal - payrollTotal);

    const updated = await db.cif.updateBatch(batch.id, { status: 'Previewed', payrollTotal, cifTotal, variance });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to preview CIF batch' });
  }
});

// POST /api/cif/:id/reconcile
router.post('/:id/reconcile', verifyAuth, requirePermission('cif.view'), async (req: AuthRequest, res: Response) => {
  try {
    const batch = db.cif.getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: 'CIF batch not found.' });

    const payroll = db.payroll.getByMonth(batch.payrollMonth);
    const payrollTotal = roundOMR((payroll?.lines || []).filter(l => l.employeeCompany === batch.company).reduce((s, l) => s + l.netSalary, 0));
    const records = db.cif.getRecordsByBatch(batch.id);
    const cifTotal = roundOMR(records.filter(r => r.status !== 'Invalid').reduce((s, r) => s + r.amount, 0));
    const variance = roundOMR(cifTotal - payrollTotal);

    const updated = await db.cif.updateBatch(batch.id, { status: 'Reconciled', payrollTotal, cifTotal, variance });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reconcile CIF batch' });
  }
});

// POST /api/cif/:id/process - Requires an override reason if critical errors/variance exist
router.post('/:id/process', verifyAuth, requirePermission('cif.process'), async (req: AuthRequest, res: Response) => {
  try {
    const { overrideReason } = req.body;
    const user = req.user?.username || 'Admin';
    const before = db.cif.getBatch(req.params.id);
    const updated = await db.cif.process(req.params.id, user, overrideReason ? { reason: String(overrideReason).trim() } : undefined);
    if (!updated) return res.status(404).json({ error: 'CIF batch not found.' });

    await db.audit.log({
      userId: req.user?.id, username: user, userRole: req.user?.role || 'Payroll User',
      action: 'CIF_PROCESSED', module: 'CIF', recordId: updated.id,
      description: `Processed CIF batch for ${updated.company} / ${updated.payrollMonth}.${overrideReason ? ` Override reason: ${overrideReason}` : ''}`,
      previousValue: { status: before?.status }, newValue: { status: 'Processed', overrideUsed: !!overrideReason },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to process CIF batch' });
  }
});

export default router;
