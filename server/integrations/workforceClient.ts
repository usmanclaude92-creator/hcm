// Lazy, fail-soft client for the Artify Workforce app's HCM integration Edge Functions
const REQUEST_TIMEOUT_MS = 8000;
const MAX_BATCH_SIZE = 500;

export type WorkforceShiftState = 'NOT_LINKED' | 'NO_SHIFT_TODAY' | 'OPEN' | 'CLOSED';

export interface WorkforceShiftStatus {
  shiftDate: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  status: WorkforceShiftState;
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

function isConfigured(): boolean {
  return true;
}

function functionsBaseUrl(): string {
  const url = process.env.WORKFORCE_FUNCTIONS_URL || 'https://jpsiafvbyupofnbqonkq.supabase.co/functions/v1';
  return url.replace(/\/+$/, '');
}

interface FunctionCallResult {
  ok: boolean;
  data?: any;
  reason?: string;
}

async function callFunction(path: string, body: unknown): Promise<FunctionCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const secret = process.env.WORKFORCE_INTEGRATION_SECRET || 'artify-secret';
    const response = await fetch(`${functionsBaseUrl()}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Secret': secret,
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
      statuses[civilId] = {
        shiftDate: raw.shift_date ?? null,
        clockInAt: raw.clock_in_at ?? null,
        clockOutAt: raw.clock_out_at ?? null,
        status: raw.status,
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
