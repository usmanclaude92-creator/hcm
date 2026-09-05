// Lazy, fail-soft client for the Artify Workforce app's shift-status Edge Function.
// Populates "Shift Start" / "Shift End" on the Workforce Deployment dashboard's employee
// cards. Configuration is optional: when WORKFORCE_SHIFT_STATUS_URL /
// WORKFORCE_SHIFT_STATUS_SECRET are unset, or the remote call fails, callers simply see
// no data and the cards fall back to their existing "Not Tracked" placeholder.

const REQUEST_TIMEOUT_MS = 5000;
const MAX_BATCH_SIZE = 500;

export type WorkforceShiftState = 'NOT_LINKED' | 'NO_SHIFT_TODAY' | 'OPEN' | 'CLOSED';

export interface WorkforceShiftStatus {
  shiftDate: string;
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

function isConfigured(): boolean {
  return Boolean(process.env.WORKFORCE_SHIFT_STATUS_URL && process.env.WORKFORCE_SHIFT_STATUS_SECRET);
}

export async function fetchWorkforceShiftStatuses(
  employeeIds: string[],
): Promise<WorkforceShiftLookupResult> {
  const statuses: Record<string, WorkforceShiftStatus> = {};

  if (!isConfigured()) {
    return { configured: false, available: false, reason: 'Workforce integration not configured.', statuses };
  }

  const url = process.env.WORKFORCE_SHIFT_STATUS_URL as string;
  const secret = process.env.WORKFORCE_SHIFT_STATUS_SECRET as string;

  const uniqueIds = Array.from(new Set(employeeIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { configured: true, available: true, statuses };
  }

  let anyBatchSucceeded = false;
  let lastFailureReason: string | undefined;

  for (let i = 0; i < uniqueIds.length; i += MAX_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + MAX_BATCH_SIZE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration-Secret': secret,
        },
        body: JSON.stringify({ employee_ids: batch }),
        signal: controller.signal,
      });

      if (!response.ok) {
        lastFailureReason = `Workforce responded ${response.status}.`;
        continue;
      }

      const data = await response.json();
      const batchStatuses = data?.statuses || {};
      for (const [employeeId, raw] of Object.entries<any>(batchStatuses)) {
        statuses[employeeId] = {
          shiftDate: raw.shift_date,
          clockInAt: raw.clock_in_at ?? null,
          clockOutAt: raw.clock_out_at ?? null,
          status: raw.status,
        };
      }
      anyBatchSucceeded = true;
    } catch (err: any) {
      lastFailureReason = err?.name === 'AbortError' ? 'Workforce request timed out.' : (err?.message || 'Workforce request failed.');
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    configured: true,
    available: anyBatchSucceeded,
    reason: anyBatchSucceeded ? undefined : lastFailureReason,
    statuses,
  };
}
