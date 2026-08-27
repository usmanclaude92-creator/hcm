import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { normalizeEmployeeId } from './db.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_RECEIPTS_BUCKET || 'salary-payment-receipts';

let cachedClient: SupabaseClient | null = null;

// No base64/local fallback by design: receipt storage must be configured even in
// local dev, so this throws a clear, actionable error instead of degrading silently.
function getClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Receipt storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return cachedClient;
}

const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5MB

export function validateReceiptFile(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_MIME_EXT[mimeType]) {
    throw new Error(`Unsupported receipt file type: '${mimeType}'. Allowed: JPEG, PNG, PDF.`);
  }
  if (sizeBytes > MAX_RECEIPT_BYTES) {
    throw new Error(`Receipt file is too large (max ${MAX_RECEIPT_BYTES / (1024 * 1024)}MB).`);
  }
}

// Decodes a base64 data-URL (e.g. "data:image/jpeg;base64,....") into a raw buffer + mime type.
export function decodeReceiptDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) {
    throw new Error('Receipt file data is not a valid base64 data URL.');
  }
  const [, mimeType, base64] = match;
  return { buffer: Buffer.from(base64, 'base64'), mimeType };
}

// Uploads to a server-generated path/filename -- the client's original filename is never
// used for storage, only kept separately for display (path-traversal prevention).
export async function uploadReceipt(
  buffer: Buffer,
  mimeType: string,
  employeeId: string,
  payrollMonth: string
): Promise<{ path: string; fileName: string }> {
  const ext = ALLOWED_MIME_EXT[mimeType];
  if (!ext) {
    throw new Error(`Unsupported receipt file type: '${mimeType}'.`);
  }
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `receipts/${payrollMonth}/${normalizeEmployeeId(employeeId)}/${fileName}`;

  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Failed to upload receipt: ${error.message}`);
  }
  return { path: storagePath, fileName };
}

// Bucket is fully private; callers get a short-lived signed URL rather than a
// permanent public link, so access is only ever handed out through an authenticated route.
export async function getSignedReceiptUrl(
  storagePath: string,
  expiresInSeconds: number = 300
): Promise<{ url: string; expiresIn: number }> {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate receipt access link: ${error?.message || 'unknown error'}`);
  }
  return { url: data.signedUrl, expiresIn: expiresInSeconds };
}
