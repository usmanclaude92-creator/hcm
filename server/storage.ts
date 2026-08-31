import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { normalizeEmployeeId } from './db.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECEIPTS_BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || 'salary-payment-receipts';
const DOCUMENTS_BUCKET = process.env.SUPABASE_DOCUMENTS_BUCKET || 'employee-documents';

let cachedClient: SupabaseClient | null = null;

// In-memory / local disk cache for persistent storage fallback when Supabase is not configured
interface StoredFileRecord {
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  buffer: Buffer;
  uploadedAt: string;
}

const localFileStore = new Map<string, StoredFileRecord>();
const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.storage_uploads');

// Ensure local storage directory exists
try {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
} catch {
  // Ignored in read-only environments
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Storage is not configured with external credentials: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  }
  return cachedClient;
}

export const ALLOWED_DOC_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

const ALLOWED_RECEIPT_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export const MAX_DOC_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5MB

export function validateReceiptFile(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_RECEIPT_MIMES[mimeType]) {
    throw new Error(`Unsupported receipt file type: '${mimeType}'. Allowed: JPEG, PNG, PDF.`);
  }
  if (sizeBytes > MAX_RECEIPT_BYTES) {
    throw new Error(`Receipt file is too large (max ${MAX_RECEIPT_BYTES / (1024 * 1024)}MB).`);
  }
}

export function validateDocumentFile(mimeType: string, sizeBytes: number, maxBytes: number = MAX_DOC_BYTES): void {
  const normMime = (mimeType || '').toLowerCase().trim();
  if (!ALLOWED_DOC_MIMES[normMime]) {
    throw new Error(
      `Unsupported document format: '${mimeType}'. Allowed types: PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX.`
    );
  }
  if (sizeBytes > maxBytes) {
    throw new Error(`File size (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB) exceeds limit of ${maxBytes / (1024 * 1024)}MB.`);
  }
}

// Decodes a base64 data-URL into a raw buffer + mime type
export function decodeReceiptDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  return decodeDocumentDataUrl(dataUrl);
}

export function decodeDocumentDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) {
    throw new Error('File data is not a valid base64 data URL.');
  }
  const [, mimeType, base64] = match;
  return { buffer: Buffer.from(base64, 'base64'), mimeType };
}

// Helper to sanitize filename
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
}

/**
 * Uploads an employee document to persistent object storage (Supabase or local persistent storage)
 */
export async function uploadEmployeeDocument(
  buffer: Buffer,
  mimeType: string,
  employeeId: string,
  category: string,
  originalFileName?: string
): Promise<{ storagePath: string; fileName: string; fileUrl: string; fileSize: number; mimeType: string }> {
  validateDocumentFile(mimeType, buffer.length);
  const ext = ALLOWED_DOC_MIMES[mimeType] || 'bin';
  const cleanOriginal = sanitizeFileName(originalFileName || `doc_${Date.now()}.${ext}`);
  const uniqueId = crypto.randomUUID();
  const fileName = `${uniqueId}.${ext}`;
  const normEmpId = normalizeEmployeeId(employeeId);
  const cleanCategory = (category || 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const storagePath = `employees/${normEmpId}/${cleanCategory}/${fileName}`;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getClient();
      const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });
      if (error) {
        throw error;
      }
      const signed = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, 3600);
      return {
        storagePath,
        fileName: cleanOriginal,
        fileUrl: signed.data?.signedUrl || `/api/storage/file/${encodeURIComponent(storagePath)}`,
        fileSize: buffer.length,
        mimeType,
      };
    } catch (err: any) {
      console.warn(`Supabase document upload failed, falling back to persistent local storage: ${err?.message}`);
    }
  }

  // Fallback to local persistent store
  localFileStore.set(storagePath, {
    storagePath,
    originalFileName: cleanOriginal,
    mimeType,
    fileSize: buffer.length,
    buffer,
    uploadedAt: new Date().toISOString(),
  });

  try {
    const localDiskPath = path.join(LOCAL_STORAGE_DIR, storagePath.replace(/\//g, '_'));
    fs.writeFileSync(localDiskPath, buffer);
  } catch {
    // Memory store handles it
  }

  return {
    storagePath,
    fileName: cleanOriginal,
    fileUrl: `/api/storage/file/${encodeURIComponent(storagePath)}`,
    fileSize: buffer.length,
    mimeType,
  };
}

/**
 * Uploads salary payment receipt
 */
export async function uploadReceipt(
  buffer: Buffer,
  mimeType: string,
  employeeId: string,
  payrollMonth: string
): Promise<{ path: string; fileName: string }> {
  validateReceiptFile(mimeType, buffer.length);
  const ext = ALLOWED_RECEIPT_MIMES[mimeType] || 'jpg';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `receipts/${payrollMonth}/${normalizeEmployeeId(employeeId)}/${fileName}`;

  if (isSupabaseConfigured()) {
    const supabase = getClient();
    const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) {
      throw new Error(`Failed to upload receipt: ${error.message}`);
    }
    return { path: storagePath, fileName };
  }

  // Fallback to local store
  localFileStore.set(storagePath, {
    storagePath,
    originalFileName: fileName,
    mimeType,
    fileSize: buffer.length,
    buffer,
    uploadedAt: new Date().toISOString(),
  });

  return { path: storagePath, fileName };
}

/**
 * Retrieves short-lived signed URL or direct access URL
 */
export async function getSignedDocumentUrl(
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<{ url: string; expiresIn: number }> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = getClient();
      const bucket = storagePath.startsWith('receipts/') ? RECEIPTS_BUCKET : DOCUMENTS_BUCKET;
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresInSeconds);
      if (!error && data?.signedUrl) {
        return { url: data.signedUrl, expiresIn: expiresInSeconds };
      }
    } catch {
      // Fallback
    }
  }

  return {
    url: `/api/storage/file/${encodeURIComponent(storagePath)}`,
    expiresIn: expiresInSeconds,
  };
}

export async function getSignedReceiptUrl(
  storagePath: string,
  expiresInSeconds: number = 300
): Promise<{ url: string; expiresIn: number }> {
  return getSignedDocumentUrl(storagePath, expiresInSeconds);
}

/**
 * Retrieves raw file buffer for downloading or previewing
 */
export async function getDocumentBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  // Check memory store
  const memRecord = localFileStore.get(storagePath);
  if (memRecord) {
    return { buffer: memRecord.buffer, mimeType: memRecord.mimeType, fileName: memRecord.originalFileName };
  }

  // Check disk store
  const localDiskPath = path.join(LOCAL_STORAGE_DIR, storagePath.replace(/\//g, '_'));
  if (fs.existsSync(localDiskPath)) {
    const buffer = fs.readFileSync(localDiskPath);
    const ext = path.extname(storagePath).toLowerCase();
    const mimeType = Object.keys(ALLOWED_DOC_MIMES).find((k) => `.${ALLOWED_DOC_MIMES[k]}` === ext) || 'application/octet-stream';
    return { buffer, mimeType, fileName: path.basename(storagePath) };
  }

  // Fetch from Supabase
  if (isSupabaseConfigured()) {
    const supabase = getClient();
    const bucket = storagePath.startsWith('receipts/') ? RECEIPTS_BUCKET : DOCUMENTS_BUCKET;
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (error || !data) {
      throw new Error(`Document not found in storage: ${error?.message || storagePath}`);
    }
    const arrayBuffer = await data.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: data.type || 'application/octet-stream',
      fileName: path.basename(storagePath),
    };
  }

  throw new Error(`File '${storagePath}' not found in storage.`);
}

/**
 * Deletes document file from storage
 */
export async function deleteDocumentFile(storagePath: string): Promise<boolean> {
  localFileStore.delete(storagePath);
  try {
    const localDiskPath = path.join(LOCAL_STORAGE_DIR, storagePath.replace(/\//g, '_'));
    if (fs.existsSync(localDiskPath)) {
      fs.unlinkSync(localDiskPath);
    }
  } catch {
    // Ignore
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getClient();
      const bucket = storagePath.startsWith('receipts/') ? RECEIPTS_BUCKET : DOCUMENTS_BUCKET;
      await supabase.storage.from(bucket).remove([storagePath]);
    } catch {
      // Ignore
    }
  }

  return true;
}

