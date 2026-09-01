import { Router, Response } from 'express';
import crypto from 'crypto';
import { db, normalizeEmployeeId, maskSensitiveId, calculateExpiryStatus } from '../db.js';
import { verifyAuth, requirePermission, AuthRequest } from '../auth.js';
import {
  decodeDocumentDataUrl,
  validateDocumentFile,
  uploadEmployeeDocument,
  getSignedDocumentUrl,
  getDocumentBuffer,
  deleteDocumentFile,
  isSupabaseConfigured,
} from '../storage.js';
import type { EmployeeDocument, EmployeeDocumentCategory } from '../../src/types/index';

const router = Router();

// Middleware: Require write permission for HR/Compliance actions
const requireHrPermission = (req: AuthRequest, res: Response, next: () => void) => {
  if (req.user?.role === 'Viewer') {
    return res.status(403).json({ error: 'Viewer accounts have read-only access.' });
  }
  next();
};

/**
 * GET /api/storage/status - Get storage engine status
 */
router.get('/status', verifyAuth, (req: AuthRequest, res: Response) => {
  res.json({
    supabaseConfigured: isSupabaseConfigured(),
    engine: isSupabaseConfigured() ? 'Supabase Object Storage' : 'Persistent Storage Fallback',
    maxSizeBytes: 15 * 1024 * 1024,
    allowedFormats: ['PDF', 'JPEG', 'PNG', 'WEBP', 'DOC', 'DOCX', 'XLS', 'XLSX'],
  });
});

/**
 * POST /api/storage/upload - Upload and associate document with employee
 */
router.post('/upload', verifyAuth, requireHrPermission, async (req: AuthRequest, res: Response) => {
  try {
    const {
      fileData,
      fileName,
      employeeId,
      category = 'general',
      documentType = 'General Document',
      title,
      documentNumber,
      issueDate,
      expiryDate,
      remarks,
      syncToModule = true,
    } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided.' });
    }

    const normId = employeeId ? normalizeEmployeeId(employeeId) : '';
    let emp = null;
    if (normId) {
      emp = db.employees.findByEmployeeId(normId);
      if (!emp) {
        return res.status(404).json({ error: `Employee ${normId} not found.` });
      }
    }

    // Decode and validate file
    const { buffer, mimeType } = decodeDocumentDataUrl(fileData);
    validateDocumentFile(mimeType, buffer.length);

    // Upload to object storage abstraction
    const uploadResult = await uploadEmployeeDocument(
      buffer,
      mimeType,
      normId || 'GENERAL',
      category,
      fileName || 'document.pdf'
    );

    const docTitle = title || `${emp ? emp.employeeName + ' - ' : ''}${documentType}`;

    // Create document registry record
    const newDoc: EmployeeDocument = {
      id: crypto.randomUUID(),
      employeeId: normId || 'GENERAL',
      documentType,
      category: category as EmployeeDocumentCategory,
      title: docTitle,
      documentNumber: documentNumber ? String(documentNumber).trim() : undefined,
      fileName: uploadResult.fileName,
      storagePath: uploadResult.storagePath,
      fileUrl: uploadResult.fileUrl,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      issueDate: issueDate || undefined,
      expiryDate: expiryDate || undefined,
      status: expiryDate ? calculateExpiryStatus(expiryDate) : undefined,
      remarks: remarks ? String(remarks).trim() : undefined,
      uploadedBy: req.user?.username || 'admin',
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedDoc = await db.documents.create(newDoc);

    // If requested, synchronize with corresponding compliance module
    if (syncToModule && normId && emp) {
      if (category === 'civil-id' || documentType.toLowerCase().includes('civil id')) {
        const currentCid = db.civilIds.getCurrent(normId);
        if (currentCid) {
          await db.civilIds.update(currentCid.id, {
            documentAttachment: uploadResult.fileUrl,
            fileName: uploadResult.fileName,
            storagePath: uploadResult.storagePath,
          });
        }
      } else if (category === 'driving-licence' || documentType.toLowerCase().includes('driving')) {
        const currentDl = db.drivingLicences.getCurrent(normId);
        if (currentDl) {
          await db.drivingLicences.update(currentDl.id, {
            documentAttachment: uploadResult.fileUrl,
            fileName: uploadResult.fileName,
            storagePath: uploadResult.storagePath,
          });
        }
      } else if (category === 'visa' || documentType.toLowerCase().includes('visa')) {
        const currentVisa = db.visas.getCurrent(normId);
        if (currentVisa) {
          await db.visas.update(currentVisa.id, {
            documentAttachment: uploadResult.fileUrl,
            fileName: uploadResult.fileName,
            storagePath: uploadResult.storagePath,
          });
        }
      }
    }

    // Log compliance audit trail
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'EMPLOYEE_DOCUMENT_UPLOADED',
      module: 'Object Storage & Compliance',
      recordId: savedDoc.id,
      description: `Uploaded ${documentType} (${savedDoc.fileName}) for ${emp ? `${emp.employeeName} (${normId})` : normId}. Path: ${savedDoc.storagePath}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      document: savedDoc,
      storagePath: uploadResult.storagePath,
      fileName: uploadResult.fileName,
      fileUrl: uploadResult.fileUrl,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to upload document to storage.' });
  }
});

/**
 * GET /api/storage/file/:encodedPath - Serve file stream directly or redirect
 */
router.get('/file/:encodedPath', async (req: AuthRequest, res: Response) => {
  try {
    const rawPath = decodeURIComponent(req.params.encodedPath);
    // Security: Prevent directory traversal
    if (rawPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid storage path.' });
    }

    const { buffer, mimeType, fileName } = await getDocumentBuffer(rawPath);

    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'File not found in storage.' });
  }
});

/**
 * GET /api/storage/signed-url - Get short-lived signed access URL
 */
router.get('/signed-url', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const storagePath = req.query.path as string;
    if (!storagePath) {
      return res.status(400).json({ error: 'Storage path is required.' });
    }

    const { url, expiresIn } = await getSignedDocumentUrl(storagePath, 3600);
    res.json({ url, expiresIn });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate signed URL.' });
  }
});

function computeDaysRemaining(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  if (isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * GET /api/storage/documents - Centralized repository query for all uploaded employee documents
 */
router.get('/documents', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const {
      category,
      documentType,
      status,
      search,
      company,
      employeeId,
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const allEmployees = db.employees.getAll();
    const empMap = new Map(allEmployees.map((e) => [normalizeEmployeeId(e.employeeId), e]));

    // 1. Gather all documents from explicit documents table
    const explicitDocs = db.documents.getAll();
    const docList: any[] = [];
    const seenSignatures = new Set<string>();

    for (const doc of explicitDocs) {
      const normEmpId = normalizeEmployeeId(doc.employeeId);
      const emp = empMap.get(normEmpId);
      const days = computeDaysRemaining(doc.expiryDate);
      const docStatus = doc.expiryDate ? calculateExpiryStatus(doc.expiryDate) : 'Permanent';

      // Record signature to avoid duplicates with statutory tables
      const sig = `${normEmpId}_${doc.category}_${doc.documentNumber || doc.fileName}`;
      seenSignatures.add(sig);

      docList.push({
        ...doc,
        employeeName: emp?.employeeName || 'General / Organization',
        employeeCompany: emp?.employeeCompany || 'All Companies',
        department: (emp as any)?.department || '',
        designation: emp?.designation || '',
        nationalityType: emp?.nationalityType || 'Expat',
        employeeStatus: emp ? (emp.isActive ? 'Active' : 'Inactive') : 'Active',
        status: docStatus,
        daysRemaining: days,
      });
    }

    // 2. Synthesize statutory documents with attachments if not in explicit table
    // A) Civil IDs
    const civilIds = db.civilIds.getAll();
    for (const cid of civilIds) {
      if (cid.documentAttachment || cid.storagePath) {
        const normEmpId = normalizeEmployeeId(cid.employeeId);
        const sig = `${normEmpId}_civil-id_${cid.civilIdNumber || cid.fileName}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          const emp = empMap.get(normEmpId);
          const days = computeDaysRemaining(cid.expiryDate);
          docList.push({
            id: `cid_${cid.id}`,
            employeeId: normEmpId,
            employeeName: emp?.employeeName || 'Unknown Employee',
            employeeCompany: emp?.employeeCompany || 'General',
            department: (emp as any)?.department || '',
            designation: emp?.designation || '',
            nationalityType: emp?.nationalityType || 'Expat',
            employeeStatus: emp ? (emp.isActive ? 'Active' : 'Inactive') : 'Active',
            documentType: 'Civil ID',
            category: 'civil-id',
            title: `Civil ID Card - ${emp?.employeeName || normEmpId}`,
            documentNumber: cid.civilIdNumber,
            fileName: cid.fileName || 'civil_id_scan.pdf',
            storagePath: cid.storagePath || '',
            fileUrl: cid.documentAttachment,
            issueDate: cid.issueDate,
            expiryDate: cid.expiryDate,
            status: calculateExpiryStatus(cid.expiryDate),
            daysRemaining: days,
            remarks: cid.remarks || 'Royal Oman Police Resident Card',
            uploadedBy: cid.createdBy || 'system',
            uploadedAt: cid.createdAt || cid.updatedAt || new Date().toISOString(),
          });
        }
      }
    }

    // B) Visas
    const visas = db.visas.getAll();
    for (const v of visas) {
      if (v.documentAttachment || v.storagePath) {
        const normEmpId = normalizeEmployeeId(v.employeeId);
        const sig = `${normEmpId}_visa_${v.visaNumber || v.fileName}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          const emp = empMap.get(normEmpId);
          const days = computeDaysRemaining(v.expiryDate);
          docList.push({
            id: `visa_${v.id}`,
            employeeId: normEmpId,
            employeeName: emp?.employeeName || 'Unknown Employee',
            employeeCompany: emp?.employeeCompany || 'General',
            department: (emp as any)?.department || '',
            designation: emp?.designation || '',
            nationalityType: emp?.nationalityType || 'Expat',
            employeeStatus: emp ? (emp.isActive ? 'Active' : 'Inactive') : 'Active',
            documentType: 'Employment Visa',
            category: 'visa',
            title: `Employment Visa - ${emp?.employeeName || normEmpId}`,
            documentNumber: v.visaNumber,
            fileName: v.fileName || 'employment_visa_scan.pdf',
            storagePath: v.storagePath || '',
            fileUrl: v.documentAttachment,
            issueDate: v.issueDate,
            expiryDate: v.expiryDate,
            status: calculateExpiryStatus(v.expiryDate),
            daysRemaining: days,
            remarks: v.remarks || `Trade on Visa: ${v.tradeOnVisa || 'General'}`,
            uploadedBy: v.createdBy || 'system',
            uploadedAt: v.createdAt || v.updatedAt || new Date().toISOString(),
          });
        }
      }
    }

    // C) Passports & Government Documents
    const govDocs = db.governmentDocuments.getAll();
    for (const g of govDocs) {
      if (g.documentAttachment || g.storagePath) {
        const normEmpId = normalizeEmployeeId(g.employeeId);
        const cat = g.documentType.toLowerCase().includes('passport') ? 'passport' : 'general';
        const sig = `${normEmpId}_${cat}_${g.documentNumber || g.fileName}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          const emp = empMap.get(normEmpId);
          const days = computeDaysRemaining(g.expiryDate);
          docList.push({
            id: `gov_${g.id}`,
            employeeId: normEmpId,
            employeeName: emp?.employeeName || 'Unknown Employee',
            employeeCompany: emp?.employeeCompany || 'General',
            department: (emp as any)?.department || '',
            designation: emp?.designation || '',
            nationalityType: emp?.nationalityType || 'Expat',
            employeeStatus: emp ? (emp.isActive ? 'Active' : 'Inactive') : 'Active',
            documentType: g.documentType || 'Passport',
            category: cat,
            title: `${g.documentType} - ${emp?.employeeName || normEmpId}`,
            documentNumber: g.documentNumber,
            fileName: g.fileName || `${g.documentType.toLowerCase()}_scan.pdf`,
            storagePath: g.storagePath || '',
            fileUrl: g.documentAttachment,
            issueDate: g.issueDate,
            expiryDate: g.expiryDate,
            status: calculateExpiryStatus(g.expiryDate),
            daysRemaining: days,
            remarks: g.remarks || `${g.issuingAuthority || 'Immigration'} (${g.country || 'Oman'})`,
            uploadedBy: g.createdBy || 'system',
            uploadedAt: g.createdAt || g.updatedAt || new Date().toISOString(),
          });
        }
      }
    }

    // D) Driving Licences
    const drivingLicences = db.drivingLicences.getAll();
    for (const dl of drivingLicences) {
      if (dl.documentAttachment || dl.storagePath) {
        const normEmpId = normalizeEmployeeId(dl.employeeId);
        const sig = `${normEmpId}_driving-licence_${dl.licenceNumber || dl.fileName}`;
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          const emp = empMap.get(normEmpId);
          const days = computeDaysRemaining(dl.expiryDate);
          docList.push({
            id: `dl_${dl.id}`,
            employeeId: normEmpId,
            employeeName: emp?.employeeName || 'Unknown Employee',
            employeeCompany: emp?.employeeCompany || 'General',
            department: (emp as any)?.department || '',
            designation: emp?.designation || '',
            nationalityType: emp?.nationalityType || 'Expat',
            employeeStatus: emp ? (emp.isActive ? 'Active' : 'Inactive') : 'Active',
            documentType: 'Driving Licence',
            category: 'driving-licence',
            title: `Driving Licence - ${emp?.employeeName || normEmpId}`,
            documentNumber: dl.licenceNumber,
            fileName: dl.fileName || 'driving_licence_scan.pdf',
            storagePath: dl.storagePath || '',
            fileUrl: dl.documentAttachment,
            issueDate: dl.issueDate,
            expiryDate: dl.expiryDate,
            status: calculateExpiryStatus(dl.expiryDate),
            daysRemaining: days,
            remarks: dl.remarks || `Category: ${dl.category || 'Light Vehicle'}`,
            uploadedBy: dl.createdBy || 'system',
            uploadedAt: dl.createdAt || dl.updatedAt || new Date().toISOString(),
          });
        }
      }
    }

    // Calculate Comprehensive Summary Statistics before user query filtering
    const stats = {
      totalDocuments: docList.length,
      byType: {
        passport: docList.filter((d) => d.category === 'passport' || d.documentType?.toLowerCase().includes('passport')).length,
        visa: docList.filter((d) => d.category === 'visa' || d.documentType?.toLowerCase().includes('visa')).length,
        civilId: docList.filter((d) => d.category === 'civil-id' || d.documentType?.toLowerCase().includes('civil')).length,
        drivingLicence: docList.filter((d) => d.category === 'driving-licence' || d.documentType?.toLowerCase().includes('driving')).length,
        contract: docList.filter((d) => d.category === 'contract' || d.documentType?.toLowerCase().includes('contract')).length,
        other: docList.filter((d) => !['passport', 'visa', 'civil-id', 'driving-licence', 'contract'].includes(d.category) && !d.documentType?.toLowerCase().includes('passport') && !d.documentType?.toLowerCase().includes('visa') && !d.documentType?.toLowerCase().includes('civil')).length,
      },
      byStatus: {
        valid: docList.filter((d) => d.status === 'Valid').length,
        expiringSoon: docList.filter((d) => d.status === 'Expiring Soon').length,
        urgent: docList.filter((d) => d.status === 'Urgent').length,
        expired: docList.filter((d) => d.status === 'Expired').length,
        permanent: docList.filter((d) => !d.expiryDate || d.status === 'Permanent').length,
      },
      uniqueEmployeesWithDocs: new Set(docList.map((d) => d.employeeId)).size,
      totalActiveEmployees: allEmployees.filter((e) => e.isActive).length,
    };

    // Filter documents based on query params
    let filtered = [...docList];

    if (employeeId) {
      const normQueryEmpId = normalizeEmployeeId(employeeId);
      filtered = filtered.filter((d) => normalizeEmployeeId(d.employeeId) === normQueryEmpId);
    }

    if (company && company !== 'ALL') {
      filtered = filtered.filter((d) => d.employeeCompany === company);
    }

    if (category && category !== 'ALL') {
      if (category === 'passport') {
        filtered = filtered.filter((d) => d.category === 'passport' || d.documentType?.toLowerCase().includes('passport'));
      } else if (category === 'visa') {
        filtered = filtered.filter((d) => d.category === 'visa' || d.documentType?.toLowerCase().includes('visa'));
      } else if (category === 'civil-id') {
        filtered = filtered.filter((d) => d.category === 'civil-id' || d.documentType?.toLowerCase().includes('civil'));
      } else if (category === 'driving-licence') {
        filtered = filtered.filter((d) => d.category === 'driving-licence' || d.documentType?.toLowerCase().includes('driving'));
      } else if (category === 'contract') {
        filtered = filtered.filter((d) => d.category === 'contract' || d.documentType?.toLowerCase().includes('contract'));
      } else {
        filtered = filtered.filter((d) => d.category === category);
      }
    }

    if (documentType && documentType !== 'ALL') {
      filtered = filtered.filter((d) => d.documentType === documentType);
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter((d) => d.status === status);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter((d) =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.documentType && d.documentType.toLowerCase().includes(q)) ||
        (d.documentNumber && d.documentNumber.toLowerCase().includes(q)) ||
        (d.fileName && d.fileName.toLowerCase().includes(q)) ||
        (d.employeeId && d.employeeId.toLowerCase().includes(q)) ||
        (d.employeeName && d.employeeName.toLowerCase().includes(q)) ||
        (d.remarks && d.remarks.toLowerCase().includes(q))
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'expiryDate') {
        const dateA = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const dateB = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (sortBy === 'daysRemaining') {
        const daysA = a.daysRemaining !== null ? a.daysRemaining : 999999;
        const daysB = b.daysRemaining !== null ? b.daysRemaining : 999999;
        return sortOrder === 'asc' ? daysA - daysB : daysB - daysA;
      }
      if (sortBy === 'employeeName') {
        return sortOrder === 'asc'
          ? (a.employeeName || '').localeCompare(b.employeeName || '')
          : (b.employeeName || '').localeCompare(a.employeeName || '');
      }
      if (sortBy === 'documentType') {
        return sortOrder === 'asc'
          ? (a.documentType || '').localeCompare(b.documentType || '')
          : (b.documentType || '').localeCompare(a.documentType || '');
      }
      const timeA = new Date(a.uploadedAt || 0).getTime();
      const timeB = new Date(b.uploadedAt || 0).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    res.json({
      documents: filtered,
      stats,
      totalCount: filtered.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch centralized documents repository.' });
  }
});

/**
 * GET /api/storage/employees/:employeeId/documents - Get all documents for an employee
 */
router.get('/employees/:employeeId/documents', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const category = req.query.category as string;
    const normId = normalizeEmployeeId(employeeId);

    const docs = db.documents.getByEmployeeId(normId, category);
    res.json({ documents: docs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch employee documents.' });
  }
});

/**
 * GET /api/storage/documents/:id - Get single document details
 */
router.get('/documents/:id', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const doc = db.documents.getById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    res.json({ document: doc });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch document.' });
  }
});

/**
 * PUT /api/storage/documents/:id - Update document metadata
 */
router.put('/documents/:id', verifyAuth, requireHrPermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, documentNumber, issueDate, expiryDate, remarks, category, documentType } = req.body;

    const existing = db.documents.getById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Document record not found.' });
    }

    const updated = await db.documents.update(id, {
      title: title !== undefined ? String(title).trim() : existing.title,
      documentNumber: documentNumber !== undefined ? String(documentNumber).trim() : existing.documentNumber,
      issueDate: issueDate !== undefined ? issueDate : existing.issueDate,
      expiryDate: expiryDate !== undefined ? expiryDate : existing.expiryDate,
      remarks: remarks !== undefined ? String(remarks).trim() : existing.remarks,
      category: category !== undefined ? category : existing.category,
      documentType: documentType !== undefined ? documentType : existing.documentType,
    });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'EMPLOYEE_DOCUMENT_UPDATED',
      module: 'Object Storage & Compliance',
      recordId: id,
      description: `Updated metadata for document ${existing.fileName} (${existing.employeeId}).`,
      ipAddress: req.ip,
    });

    res.json({ document: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update document.' });
  }
});

/**
 * DELETE /api/storage/documents/:id - Delete document record and stored object
 */
router.delete('/documents/:id', verifyAuth, requireHrPermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const doc = db.documents.getById(id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    if (doc.storagePath) {
      await deleteDocumentFile(doc.storagePath);
    }

    await db.documents.delete(id);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'admin',
      userRole: req.user?.role || 'Administrator',
      action: 'EMPLOYEE_DOCUMENT_DELETED',
      module: 'Object Storage & Compliance',
      recordId: id,
      description: `Deleted document ${doc.title} (${doc.fileName}) from employee ${doc.employeeId}.`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Document successfully deleted.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete document.' });
  }
});

export default router;
