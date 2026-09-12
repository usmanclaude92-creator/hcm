// Lazy, fail-soft client for the Artify Workforce app's HCM integration Edge Functions
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BATCH_SIZE = 500;

export type WorkforceShiftState = 'NOT_LINKED' | 'NO_SHIFT_TODAY' | 'OPEN' | 'CLOSED';

export interface WorkforceShiftStatus {
  shiftDate: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  status: WorkforceShiftState;
  selfieUrl?: string | null;
  startSelfieUrl?: string | null;
  endSelfieUrl?: string | null;
  selfieTakenAt?: string | null;
  totalTodayMinutes?: number | null;
  totalWorkedMinutes?: number | null;
  isInsideGeofence?: boolean | null;
  geofenceStatus?: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' | null;
}

export interface WorkforceShiftLookupResult {
  configured: boolean;
  available: boolean;
  reason?: string;
  statuses: Record<string, WorkforceShiftStatus>;
}

export interface WorkforceEligibilityRecord {
  civilId: string;
  employeeCode: string;
  fullName: string;
  role?: string;
  department?: string | null;
  phone?: string | null;
  companyCode: string;
  companyName: string;
  projectCode?: string | null;
  projectName?: string | null;
}

export interface WorkforceSyncResult {
  configured: boolean;
  available: boolean;
  reason?: string;
  summary?: {
    companies: number;
    projectsCreated: number;
    lookupUpserted: number;
    employeesRefreshed: number;
    skipped: number;
  };
}

// Configured only when every credential the integration needs is actually present.
// This previously always returned true, and the calls below silently fell back to a
// hardcoded project URL, anon key and integration secret whenever the env vars were
// unset -- so the "integration is disabled without these" behavior the README documents
// never actually happened, and the fallback secret ('artify-secret') plus a live anon key
// were sitting in source. It fails closed now: missing configuration, no calls at all.
function isConfigured(): boolean {
  return Boolean(process.env.WORKFORCE_FUNCTIONS_URL && process.env.SUPABASE_ANON_KEY && process.env.WORKFORCE_INTEGRATION_SECRET);
}

function functionsBaseUrl(): string {
  return (process.env.WORKFORCE_FUNCTIONS_URL || '').replace(/\/+$/, '');
}

function storagePublicBaseUrl(): string {
  // The Workforce Supabase project's storage endpoint, derived from the same functions
  // URL rather than hardcoded a second time.
  try {
    const origin = new URL(functionsBaseUrl()).origin;
    return `${origin}/storage/v1/object/public/attendance-selfies`;
  } catch {
    return '';
  }
}

interface FunctionCallResult {
  ok: boolean;
  data?: any;
  reason?: string;
}

async function callFunction(path: string, body: unknown): Promise<FunctionCallResult> {
  if (!isConfigured()) {
    return { ok: false, reason: 'Workforce integration not configured (WORKFORCE_FUNCTIONS_URL / SUPABASE_ANON_KEY / WORKFORCE_INTEGRATION_SECRET).' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${functionsBaseUrl()}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
        'X-Integration-Secret': process.env.WORKFORCE_INTEGRATION_SECRET!,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `Workforce responded ${response.status}.` };
    }
    return { ok: true, data: await response.json() };
  } catch (err: any) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'Workforce request timed out.' : (err?.message || 'Workforce request failed.') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWorkforceShiftStatuses(
  civilIds: string[],
): Promise<WorkforceShiftLookupResult> {
  const statuses: Record<string, WorkforceShiftStatus> = {};

  if (!isConfigured()) {
    return { configured: false, available: false, reason: 'Workforce integration not configured.', statuses };
  }

  const uniqueIds = Array.from(new Set(civilIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { configured: true, available: true, statuses };
  }

  let anyBatchSucceeded = false;
  let lastFailureReason: string | undefined;

  for (let i = 0; i < uniqueIds.length; i += MAX_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + MAX_BATCH_SIZE);
    const result = await callFunction('shift-status', { civil_ids: batch });
    if (!result.ok) {
      lastFailureReason = result.reason;
      continue;
    }
    const batchStatuses = result.data?.statuses || {};
    for (const [civilId, raw] of Object.entries<any>(batchStatuses)) {
      let photoUrl = raw.selfie_url || raw.selfieUrl || null;
      if (!photoUrl && raw.selfie_storage_path) {
        const cleanPath = raw.selfie_storage_path.replace(/^attendance-selfies\//, '');
        photoUrl = `${storagePublicBaseUrl()}/${cleanPath}`;
      }

      let startPhoto = raw.start_selfie_url || raw.clock_in_selfie_url || photoUrl;
      let endPhoto = raw.end_selfie_url || raw.clock_out_selfie_url || null;
      if (!endPhoto && raw.clock_out_selfie_storage_path) {
        const cleanEndPath = raw.clock_out_selfie_storage_path.replace(/^attendance-selfies\//, '');
        endPhoto = `${storagePublicBaseUrl()}/${cleanEndPath}`;
      }

      // Geofence status
      let isInside: boolean | null = null;
      if (raw.is_inside_geofence !== undefined && raw.is_inside_geofence !== null) {
        isInside = Boolean(raw.is_inside_geofence);
      } else if (raw.within_geofence !== undefined && raw.within_geofence !== null) {
        isInside = Boolean(raw.within_geofence);
      } else if (raw.geofence_status) {
        isInside = String(raw.geofence_status).toUpperCase() === 'INSIDE';
      } else if (raw.is_geofence_exception !== undefined && raw.is_geofence_exception !== null) {
        isInside = !raw.is_geofence_exception;
      } else if (raw.status === 'OPEN' || raw.status === 'CLOSED') {
        isInside = true;
      }

      statuses[civilId] = {
        shiftDate: raw.shift_date ?? null,
        clockInAt: raw.clock_in_at ?? null,
        clockOutAt: raw.clock_out_at ?? null,
        status: raw.status,
        selfieUrl: photoUrl,
        startSelfieUrl: startPhoto,
        endSelfieUrl: endPhoto,
        selfieTakenAt: raw.selfie_taken_at || raw.clock_in_at || null,
        totalTodayMinutes: raw.total_today_minutes ?? raw.total_worked_minutes ?? null,
        totalWorkedMinutes: raw.total_worked_minutes ?? null,
        isInsideGeofence: isInside,
        geofenceStatus: isInside === true ? 'INSIDE' : isInside === false ? 'OUTSIDE' : null,
      };
    }
    anyBatchSucceeded = true;
  }

  return {
    configured: true,
    available: anyBatchSucceeded,
    reason: anyBatchSucceeded ? undefined : lastFailureReason,
    statuses,
  };
}

export async function syncEmployeesWithWorkforce(
  records: WorkforceEligibilityRecord[],
): Promise<WorkforceSyncResult> {
  if (!isConfigured()) {
    return { configured: false, available: false, reason: 'Workforce integration not configured.' };
  }
  if (records.length === 0) {
    return { configured: true, available: true, summary: { companies: 0, projectsCreated: 0, lookupUpserted: 0, employeesRefreshed: 0, skipped: 0 } };
  }

  const payload = records.map((r) => ({
    civil_id: r.civilId,
    employee_code: r.employeeCode,
    full_name: r.fullName,
    role: r.role,
    department: r.department ?? null,
    phone: r.phone ?? null,
    company_code: r.companyCode,
    company_name: r.companyName,
    project_code: r.projectCode ?? null,
    project_name: r.projectName ?? null,
  }));

  const result = await callFunction('sync-eligibility', { employees: payload });
  if (!result.ok) {
    return { configured: true, available: false, reason: result.reason };
  }
  const d = result.data || {};
  return {
    configured: true,
    available: true,
    summary: {
      companies: d.companies ?? 0,
      projectsCreated: d.projects_created ?? 0,
      lookupUpserted: d.lookup_upserted ?? 0,
      employeesRefreshed: d.employees_refreshed ?? 0,
      skipped: d.skipped ?? 0,
    },
  };
}
