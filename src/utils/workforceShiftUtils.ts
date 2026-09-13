// Shared helpers for the Workforce Deployment Dashboard's Employee Cards.
//
// Both this app's `/api/workforce/shift-status` passthrough and the Workforce-App
// Edge Functions it calls (`attendance`, `shift-status`) stamp `shift_date` using the
// UTC calendar date (`new Date().toISOString().split('T')[0]`), not the viewer's
// browser-local date. Comparing `shiftStatus.shiftDate` against a browser-local "today"
// string is wrong for ~4 hours every night (Oman midnight to ~04:00 Oman time, while
// UTC is still on the previous calendar date): a shift that genuinely just started
// reads as "not today" and the card falls back to its default/grey state. Computing
// "today" the same way the source of truth stamps it removes that mismatch, for any
// viewer regardless of their own timezone.
export function utcDateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// A shift/selfie/geofence result belongs on today's card only when its shift_date
// matches "today" as defined above. No shift_date at all (NOT_LINKED / NO_SHIFT_TODAY)
// is treated as "today" (there's nothing stale to exclude).
export function isShiftDateToday(shiftDate: string | null | undefined): boolean {
  return !shiftDate || shiftDate === utcDateStr();
}

// The business this app serves operates out of Oman. Displaying a shift's clock-in/
// clock-out/selfie time in the viewing browser's own local timezone (the previous
// behavior, via toLocaleTimeString with no explicit timeZone) shows the wrong wall-clock
// time to anyone opening the dashboard from outside that timezone. Pin every displayed
// time to Oman local time so it always reads as the true business-local time of the
// event, independent of the viewer.
export const WORKFORCE_BUSINESS_TIMEZONE = 'Asia/Muscat';

export function formatBusinessTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: WORKFORCE_BUSINESS_TIMEZONE });
}

export function formatBusinessDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const day = d.toLocaleString('en-GB', { day: 'numeric', timeZone: WORKFORCE_BUSINESS_TIMEZONE });
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: WORKFORCE_BUSINESS_TIMEZONE });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: WORKFORCE_BUSINESS_TIMEZONE });
  return `${day} ${month}, ${time}`;
}
