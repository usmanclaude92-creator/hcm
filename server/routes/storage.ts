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
