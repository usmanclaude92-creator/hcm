import { Router, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { db, calculateExpiryStatus, checkTradeDiscrepancy, maskSensitiveId, normalizeEmployeeId } from '../db.js';
import { verifyAuth, AuthRequest, requireWritePermission, companyScopeOf, canSeeCompany } from '../auth.js';
import type { DocumentExpiryStatus, DrivingLicenceCategory } from '../../src/types/index.js';

const router = Router();

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

// GET /api/compliance/summary - Global HR & Document Expiry Dashboard
router.get('/summary', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const summaryScope = companyScopeOf(req.user);
    const employees = db.employees.getAll().filter((e) => e.isActive && canSeeCompany(summaryScope, e.employeeCompany));
    const civilIds = db.civilIds.getAll().filter((c) => c.isCurrent);
    const drivingLicences = db.drivingLicences.getAll().filter((d) => d.isCurrent);
    const visas = db.visas.getAll().filter((v) => v.isCurrent);
    const govtDocs = db.governmentDocuments.getAll().filter((g) => g.isCurrent);

    const docCounts: Record<string, Record<DocumentExpiryStatus, number>> = {
      civilId: { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      drivingLicence: { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      visa: { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      passport: { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      workPermit: { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      contract: { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
    };

    const alerts: Array<{
      id: string;
      employeeId: string;
      employeeName: string;
      designation: string;
      employeeCompany: string;
      nationalityType: string;
      documentCategory: string;
      documentType: string;
      documentNumberMasked: string;
      expiryDate: string;
      status: DocumentExpiryStatus;
      daysRemaining: number;
    }> = [];

    const tradeDiscrepancies: Array<{
      employeeId: string;
      employeeName: string;
      designation: string;
      tradeOnVisa: string;
      sponsor: string;
      visaExpiry: string;
      message: string;
    }> = [];

    const dlCategoryDistribution: Record<string, number> = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    employees.forEach((emp) => {
      const empNorm = normalizeEmployeeId(emp.employeeId);

      // 1. Civil ID
      const cid = civilIds.find((c) => normalizeEmployeeId(c.employeeId) === empNorm);
      if (cid) {
        const st = calculateExpiryStatus(cid.expiryDate);
        docCounts.civilId[st] = (docCounts.civilId[st] || 0) + 1;

        const exp = new Date(cid.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon') {
          alerts.push({
            id: `cid-${cid.id}`,
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            designation: emp.designation,
            employeeCompany: emp.employeeCompany,
            nationalityType: emp.nationalityType,
            documentCategory: 'civilId',
            documentType: 'Civil ID',
            documentNumberMasked: maskSensitiveId(cid.civilIdNumber),
            expiryDate: cid.expiryDate,
            status: st,
            daysRemaining: days,
          });
        }
      } else {
        docCounts.civilId.Missing = (docCounts.civilId.Missing || 0) + 1;
      }

      // 2. Visa (Expat only)
      if (emp.nationalityType === 'Expat') {
        const v = visas.find((vi) => normalizeEmployeeId(vi.employeeId) === empNorm);
        if (v) {
          const st = calculateExpiryStatus(v.expiryDate);
          docCounts.visa[st] = (docCounts.visa[st] || 0) + 1;

          const exp = new Date(v.expiryDate);
          exp.setHours(0, 0, 0, 0);
          const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon') {
            alerts.push({
              id: `visa-${v.id}`,
              employeeId: emp.employeeId,
              employeeName: emp.employeeName,
              designation: emp.designation,
              employeeCompany: emp.employeeCompany,
              nationalityType: emp.nationalityType,
              documentCategory: 'visa',
              documentType: 'Visa',
              documentNumberMasked: maskSensitiveId(v.visaNumber),
              expiryDate: v.expiryDate,
              status: st,
              daysRemaining: days,
            });
          }

          // Trade discrepancy check
          const disc = checkTradeDiscrepancy(emp.designation, v.tradeOnVisa);
          if (disc.hasWarning) {
            tradeDiscrepancies.push({
              employeeId: emp.employeeId,
              employeeName: emp.employeeName,
              designation: emp.designation,
              tradeOnVisa: v.tradeOnVisa,
              sponsor: v.sponsor || emp.employeeCompany,
              visaExpiry: v.expiryDate,
              message: disc.message,
            });
          }
        } else {
          docCounts.visa.Missing = (docCounts.visa.Missing || 0) + 1;
        }
      }

      // 3. Driving Licence
      const dl = drivingLicences.find((d) => normalizeEmployeeId(d.employeeId) === empNorm);
      if (dl) {
        const st = calculateExpiryStatus(dl.expiryDate);
        docCounts.drivingLicence[st] = (docCounts.drivingLicence[st] || 0) + 1;

        dlCategoryDistribution[dl.category] = (dlCategoryDistribution[dl.category] || 0) + 1;

        const exp = new Date(dl.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon') {
          alerts.push({
            id: `dl-${dl.id}`,
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            designation: emp.designation,
            employeeCompany: emp.employeeCompany,
            nationalityType: emp.nationalityType,
            documentCategory: 'drivingLicence',
            documentType: `Driving Licence (${dl.category})`,
            documentNumberMasked: maskSensitiveId(dl.licenceNumber),
            expiryDate: dl.expiryDate,
            status: st,
            daysRemaining: days,
          });
        }
      }

      // 4. Passport
      const pass = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === empNorm && g.documentType === 'Passport');
      if (pass) {
        const st = calculateExpiryStatus(pass.expiryDate);
        docCounts.passport[st] = (docCounts.passport[st] || 0) + 1;

        const exp = new Date(pass.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon') {
          alerts.push({
            id: `pass-${pass.id}`,
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            designation: emp.designation,
            employeeCompany: emp.employeeCompany,
            nationalityType: emp.nationalityType,
            documentCategory: 'passport',
            documentType: 'Passport',
            documentNumberMasked: maskSensitiveId(pass.documentNumber),
            expiryDate: pass.expiryDate,
            status: st,
            daysRemaining: days,
          });
        }
      } else {
        docCounts.passport.Missing = (docCounts.passport.Missing || 0) + 1;
      }

      // 5. Work Permit
      const wp = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === empNorm && g.documentType === 'Work Permit');
      if (wp) {
        const st = calculateExpiryStatus(wp.expiryDate);
        docCounts.workPermit[st] = (docCounts.workPermit[st] || 0) + 1;

        const exp = new Date(wp.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon') {
          alerts.push({
            id: `wp-${wp.id}`,
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            designation: emp.designation,
            employeeCompany: emp.employeeCompany,
            nationalityType: emp.nationalityType,
            documentCategory: 'workPermit',
            documentType: 'Work Permit',
            documentNumberMasked: maskSensitiveId(wp.documentNumber),
            expiryDate: wp.expiryDate,
            status: st,
            daysRemaining: days,
          });
        }
      }

      // 6. Employment Contract
      const contract = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === empNorm && ((g.documentType as any) === 'Employment Contract' || (g.documentType as any) === 'Contract'));
      if (contract) {
        const st = calculateExpiryStatus(contract.expiryDate);
        docCounts.contract[st] = (docCounts.contract[st] || 0) + 1;

        const exp = new Date(contract.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (st === 'Expired' || st === 'Urgent' || st === 'Expiring Soon') {
          alerts.push({
            id: `contract-${contract.id}`,
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            designation: emp.designation,
            employeeCompany: emp.employeeCompany,
            nationalityType: emp.nationalityType,
            documentCategory: 'contract',
            documentType: 'Employment Contract',
            documentNumberMasked: maskSensitiveId(contract.documentNumber || 'CONTRACT'),
            expiryDate: contract.expiryDate,
            status: st,
            daysRemaining: days,
          });
        }
      }
    });

    // Sort alerts: Expired first, then lowest days remaining
    alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Calculate totals across all 6 document types
    let totalValid = 0;
    let totalExpiringSoon = 0;
    let totalUrgent = 0;
    let totalExpired = 0;
    let totalMissing = 0;

    Object.values(docCounts).forEach((c) => {
      totalValid += c.Valid || 0;
      totalExpiringSoon += c['Expiring Soon'] || 0;
      totalUrgent += c.Urgent || 0;
      totalExpired += c.Expired || 0;
      totalMissing += c.Missing || 0;
    });

    res.json({
      totalEmployees: employees.length,
      totalActiveEmployees: employees.length,
      totalValid,
      totalExpiringSoon,
      totalUrgent,
      totalExpired,
      totalMissing,
      totalAttention: totalExpired + totalUrgent + totalExpiringSoon,
      docCounts,
      alerts,
      tradeDiscrepancies,
      dlCategoryDistribution,
      drivingLicenceCategories: db.drivingLicenceCategories.getAll(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate compliance summary' });
  }
});

// GET /api/compliance/expiries - List all monitored document expiries with filters
router.get('/expiries', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { docType, status, company, nationality, search } = req.query;

    const expiryScope = companyScopeOf(req.user);
    const employees = db.employees.getAll().filter((e) => e.isActive && canSeeCompany(expiryScope, e.employeeCompany));
    const civilIds = db.civilIds.getAll().filter((c) => c.isCurrent);
    const drivingLicences = db.drivingLicences.getAll().filter((d) => d.isCurrent);
    const visas = db.visas.getAll().filter((v) => v.isCurrent);
    const govtDocs = db.governmentDocuments.getAll().filter((g) => g.isCurrent);

    const items: Array<{
      id: string;
      employeeId: string;
      employeeName: string;
      designation: string;
      employeeCompany: string;
      nationalityType: string;
      salaryPaidBy: string;
      documentCategory: string;
      documentType: string;
      documentNumber: string;
      documentNumberMasked: string;
      issueDate: string;
      expiryDate: string;
      status: DocumentExpiryStatus;
      daysRemaining: number;
      issuingAuthority?: string;
      country?: string;
      remarks?: string;
    }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    employees.forEach((emp) => {
      const empNorm = normalizeEmployeeId(emp.employeeId);

      // 1. Civil ID
      const cid = civilIds.find((c) => normalizeEmployeeId(c.employeeId) === empNorm);
      if (cid) {
        const st = calculateExpiryStatus(cid.expiryDate);
        const exp = new Date(cid.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        items.push({
          id: `cid-${cid.id}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          designation: emp.designation,
          employeeCompany: emp.employeeCompany,
          nationalityType: emp.nationalityType,
          salaryPaidBy: emp.salaryPaidBy,
          documentCategory: 'civilId',
          documentType: 'Civil ID',
          documentNumber: cid.civilIdNumber,
          documentNumberMasked: maskSensitiveId(cid.civilIdNumber),
          issueDate: cid.issueDate,
          expiryDate: cid.expiryDate,
          status: st,
          daysRemaining: days,
          issuingAuthority: cid.issuingAuthority,
          country: cid.country,
          remarks: cid.remarks,
        });
      }

      // 2. Visa
      if (emp.nationalityType === 'Expat') {
        const v = visas.find((vi) => normalizeEmployeeId(vi.employeeId) === empNorm);
        if (v) {
          const st = calculateExpiryStatus(v.expiryDate);
          const exp = new Date(v.expiryDate);
          exp.setHours(0, 0, 0, 0);
          const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          items.push({
            id: `visa-${v.id}`,
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            designation: emp.designation,
            employeeCompany: emp.employeeCompany,
            nationalityType: emp.nationalityType,
            salaryPaidBy: emp.salaryPaidBy,
            documentCategory: 'visa',
            documentType: 'Visa',
            documentNumber: v.visaNumber,
            documentNumberMasked: maskSensitiveId(v.visaNumber),
            issueDate: v.issueDate,
            expiryDate: v.expiryDate,
            status: st,
            daysRemaining: days,
            issuingAuthority: v.issuingAuthority,
            country: v.country,
            remarks: v.tradeOnVisa ? `Trade on Visa: ${v.tradeOnVisa}` : v.remarks,
          });
        }
      }

      // 3. Driving Licence
      const dl = drivingLicences.find((d) => normalizeEmployeeId(d.employeeId) === empNorm);
      if (dl) {
        const st = calculateExpiryStatus(dl.expiryDate);
        const exp = new Date(dl.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        items.push({
          id: `dl-${dl.id}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          designation: emp.designation,
          employeeCompany: emp.employeeCompany,
          nationalityType: emp.nationalityType,
          salaryPaidBy: emp.salaryPaidBy,
          documentCategory: 'drivingLicence',
          documentType: `Driving Licence (${dl.category})`,
          documentNumber: dl.licenceNumber,
          documentNumberMasked: maskSensitiveId(dl.licenceNumber),
          issueDate: dl.issueDate,
          expiryDate: dl.expiryDate,
          status: st,
          daysRemaining: days,
          issuingAuthority: dl.issuingAuthority,
          remarks: dl.vehicleClass ? `Class: ${dl.vehicleClass}` : dl.remarks,
        });
      }

      // 4. Passport
      const pass = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === empNorm && g.documentType === 'Passport');
      if (pass) {
        const st = calculateExpiryStatus(pass.expiryDate);
        const exp = new Date(pass.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        items.push({
          id: `pass-${pass.id}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          designation: emp.designation,
          employeeCompany: emp.employeeCompany,
          nationalityType: emp.nationalityType,
          salaryPaidBy: emp.salaryPaidBy,
          documentCategory: 'passport',
          documentType: 'Passport',
          documentNumber: pass.documentNumber,
          documentNumberMasked: maskSensitiveId(pass.documentNumber),
          issueDate: pass.issueDate,
          expiryDate: pass.expiryDate,
          status: st,
          daysRemaining: days,
          issuingAuthority: pass.issuingAuthority,
          country: pass.country,
          remarks: pass.remarks,
        });
      }

      // 5. Work Permit
      const wp = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === empNorm && g.documentType === 'Work Permit');
      if (wp) {
        const st = calculateExpiryStatus(wp.expiryDate);
        const exp = new Date(wp.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        items.push({
          id: `wp-${wp.id}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          designation: emp.designation,
          employeeCompany: emp.employeeCompany,
          nationalityType: emp.nationalityType,
          salaryPaidBy: emp.salaryPaidBy,
          documentCategory: 'workPermit',
          documentType: 'Work Permit',
          documentNumber: wp.documentNumber,
          documentNumberMasked: maskSensitiveId(wp.documentNumber),
          issueDate: wp.issueDate,
          expiryDate: wp.expiryDate,
          status: st,
          daysRemaining: days,
          issuingAuthority: wp.issuingAuthority || 'Ministry of Labour (MoL)',
          remarks: wp.remarks,
        });
      }

      // 6. Employment Contract
      const contract = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === empNorm && ((g.documentType as any) === 'Employment Contract' || (g.documentType as any) === 'Contract'));
      if (contract) {
        const st = calculateExpiryStatus(contract.expiryDate);
        const exp = new Date(contract.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const days = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        items.push({
          id: `contract-${contract.id}`,
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          designation: emp.designation,
          employeeCompany: emp.employeeCompany,
          nationalityType: emp.nationalityType,
          salaryPaidBy: emp.salaryPaidBy,
          documentCategory: 'contract',
          documentType: 'Employment Contract',
          documentNumber: contract.documentNumber,
          documentNumberMasked: maskSensitiveId(contract.documentNumber || 'CONTRACT'),
          issueDate: contract.issueDate,
          expiryDate: contract.expiryDate,
          status: st,
          daysRemaining: days,
          issuingAuthority: contract.issuingAuthority || 'Ministry of Labour (MoL)',
          remarks: contract.remarks,
        });
      }
    });

    let filtered = items;

    if (docType && docType !== 'ALL') {
      const dtLow = String(docType).toLowerCase().replace(/[\s-_]/g, '');
      filtered = filtered.filter((i) => {
        const catLow = i.documentCategory.toLowerCase().replace(/[\s-_]/g, '');
        const typeLow = i.documentType.toLowerCase().replace(/[\s-_]/g, '');
        return catLow.includes(dtLow) || typeLow.includes(dtLow);
      });
    }

    if (status && status !== 'ALL') {
      if (status === 'Action Needed') {
        filtered = filtered.filter((i) => i.status === 'Expired' || i.status === 'Urgent' || i.status === 'Expiring Soon');
      } else {
        filtered = filtered.filter((i) => i.status === status);
      }
    }

    if (company && company !== 'ALL') {
      filtered = filtered.filter((i) => i.employeeCompany === company);
    }

    if (nationality && nationality !== 'ALL') {
      filtered = filtered.filter((i) => i.nationalityType === nationality);
    }

    if (search) {
      const q = String(search).toLowerCase().trim();
      filtered = filtered.filter(
        (i) =>
          i.employeeId.toLowerCase().includes(q) ||
          i.employeeName.toLowerCase().includes(q) ||
          i.documentNumber.toLowerCase().includes(q) ||
          i.designation.toLowerCase().includes(q) ||
          i.documentType.toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => a.daysRemaining - b.daysRemaining);

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch document expiries' });
  }
});

// GET /api/compliance/driving-licence-categories
router.get('/driving-licence-categories', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const categories = db.drivingLicenceCategories.getAll();
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/driving-licence-categories
router.post('/driving-licence-categories', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.body;
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Valid category name is required' });
    }
    const categories = await db.drivingLicenceCategories.add(category);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'DRIVING_LICENCE_CATEGORY_ADDED',
      module: 'Compliance',
      description: `Added new driving licence category: ${category.trim()}`,
      ipAddress: req.ip,
    });
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/compliance/ai-assistant - Gemini AI Compliance & Expiry Query Assistant
router.post('/ai-assistant', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query prompt is required.' });
    }

    const assistantScope = companyScopeOf(req.user);
    const employees = db.employees.getAll().filter((e) => canSeeCompany(assistantScope, e.employeeCompany));
    const civilIds = db.civilIds.getAll().filter((c) => c.isCurrent);
    const drivingLicences = db.drivingLicences.getAll().filter((d) => d.isCurrent);
    const visas = db.visas.getAll().filter((v) => v.isCurrent);
    const govtDocs = db.governmentDocuments.getAll().filter((g) => g.isCurrent);

    // Build context summary for AI
    const summaryData = {
      totalEmployees: employees.length,
      employees: employees.map((e) => {
        const norm = normalizeEmployeeId(e.employeeId);
        const cid = civilIds.find((c) => normalizeEmployeeId(c.employeeId) === norm);
        const dl = drivingLicences.find((d) => normalizeEmployeeId(d.employeeId) === norm);
        const v = visas.find((vi) => normalizeEmployeeId(vi.employeeId) === norm);
        const passport = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === norm && g.documentType === 'Passport');
        const wp = govtDocs.find((g) => normalizeEmployeeId(g.employeeId) === norm && g.documentType === 'Work Permit');

        return {
          employeeId: e.employeeId,
          name: e.employeeName,
          type: e.employeeType,
          nationality: e.nationalityType,
          designation: e.designation,
          company: e.employeeCompany,
          isActive: e.isActive,
          civilId: cid ? { expiryDate: cid.expiryDate, status: calculateExpiryStatus(cid.expiryDate) } : null,
          drivingLicence: dl ? { category: dl.category, expiryDate: dl.expiryDate, status: calculateExpiryStatus(dl.expiryDate) } : null,
          visa: v ? { tradeOnVisa: v.tradeOnVisa, sponsor: v.sponsor, expiryDate: v.expiryDate, status: calculateExpiryStatus(v.expiryDate) } : null,
          passport: passport ? { expiryDate: passport.expiryDate, status: calculateExpiryStatus(passport.expiryDate) } : null,
          workPermit: wp ? { expiryDate: wp.expiryDate, status: calculateExpiryStatus(wp.expiryDate) } : null,
        };
      }),
    };

    const ai = getGeminiClient();
    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an expert HR Compliance & Government Documents Officer for an Oman-based construction & contracting enterprise operating under Oman Labour Law, ROP (Royal Oman Police) regulations, and Ministry of Labour guidelines.

Here is the current live employee compliance and document records:
\`\`\`json
${JSON.stringify(summaryData, null, 2)}
\`\`\`

User question: "${query.trim()}"

Provide an accurate, professional, and clear answer. Include actionable recommendations for upcoming renewals, trade-designation discrepancies, expired records, and legal compliance under Oman regulations. Format with clear markdown bullet points and bold highlights where appropriate.`,
              },
            ],
          },
        ],
      });

      const reply = response.text || 'Unable to generate compliance analysis at this moment.';
      return res.json({ answer: reply, modelUsed: 'gemini-2.5-flash' });
    } else {
      // Deterministic fallback if API key is not configured
      const qLow = query.toLowerCase();
      let answer = '';

      if (qLow.includes('expired') || qLow.includes('expire')) {
        const expiredCid = summaryData.employees.filter((e) => e.civilId?.status === 'Expired');
        const expiredVisa = summaryData.employees.filter((e) => e.visa?.status === 'Expired');
        const expiredDl = summaryData.employees.filter((e) => e.drivingLicence?.status === 'Expired');

        answer = `### 📋 Document Expiry Audit Summary\n\n` +
          `**Expired Civil IDs / Resident Cards:** ${expiredCid.length}\n` +
          expiredCid.map((e) => `- **${e.employeeId} - ${e.name}**: Civil ID Expired on ${e.civilId?.expiryDate}`).join('\n') + '\n\n' +
          `**Expired Visas:** ${expiredVisa.length}\n` +
          expiredVisa.map((e) => `- **${e.employeeId} - ${e.name}**: Visa expired on ${e.visa?.expiryDate} (Trade: ${e.visa?.tradeOnVisa})`).join('\n') + '\n\n' +
          `**Expired Driving Licences:** ${expiredDl.length}\n` +
          expiredDl.map((e) => `- **${e.employeeId} - ${e.name}**: ${e.drivingLicence?.category} expired on ${e.drivingLicence?.expiryDate}`).join('\n');
      } else if (qLow.includes('trade') || qLow.includes('discrepancy') || qLow.includes('mismatch')) {
        const mismatches = summaryData.employees.filter((e) => {
          if (!e.visa || !e.designation) return false;
          return checkTradeDiscrepancy(e.designation, e.visa.tradeOnVisa).hasWarning;
        });

        answer = `### ⚠️ Trade on Visa vs Internal Designation Audit\n\n` +
          `Identified **${mismatches.length}** employee(s) with trade discrepancies:\n\n` +
          mismatches.map((e) => `- **${e.employeeId} - ${e.name}**: Internal Designation is **${e.designation}**, but Visa Trade is registered as **${e.visa?.tradeOnVisa}** (Sponsor: ${e.visa?.sponsor}). Recommendation: Initiate Labour Ministry trade amendment.`).join('\n');
      } else {
        const expiringSoon = summaryData.employees.filter((e) => e.civilId?.status === 'Expiring Soon' || e.visa?.status === 'Expiring Soon');
        answer = `### 📊 Enterprise HR Compliance Overview\n\n` +
          `- **Total Active Workforce:** ${summaryData.employees.length} employees\n` +
          `- **Expiring Documents (Next 60 Days):** ${expiringSoon.length} employee(s) require renewal attention\n` +
          `- **Legal Framework:** Governed by Oman Labour Law (Royal Decree 53/2023) and ROP Civil Status regulations.\n\n` +
          `*To ask specific queries, inquire about "expired documents", "visa trade mismatches", or "driving licence categories".*`;
      }

      return res.json({
        answer,
        modelUsed: 'deterministic-rule-engine (Set GEMINI_API_KEY for generative insights)',
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error processing AI compliance request' });
  }
});

export default router;
