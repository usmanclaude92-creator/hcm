// Shared helpers for the Workforce Deployment Dashboard's Employee Cards.
//
// The business this app serves operates out of Oman. Displaying a shift's clock-in/
// clock-out/selfie time in the viewing browser's own local timezone (the previous
// behavior, via toLocaleTimeString with no explicit timeZone) shows the wrong wall-clock
// time to anyone opening the dashboard from outside that timezone. Pin every displayed
// time to Oman local time so it always reads as the true business-local time of the
// event, independent of the viewer.
export const WORKFORCE_BUSINESS_TIMEZONE = 'Asia/Muscat';

// The Workforce-App Edge Functions (`attendance`, `shift-status`) stamp `shift_date`
// using each employee's own assigned project GPS coordinates (a 15-degrees-of-longitude
// solar-time approximation), falling back to Oman's fixed UTC+4 offset when a project has
// no coordinates configured yet -- see `localDateFromGps` in those functions. Comparing
// that business-local shift_date against the VIEWER's browser-local "today", or against a
// plain UTC "today", is wrong for part of every night: Oman is UTC+4, so from Oman
// midnight to ~04:00 Oman time, UTC is still on the previous calendar date, and a shift
// that genuinely just started would incorrectly read as "not today" and the card would
// fall back to its default/grey state. Comparing against "today" in the Oman business
// timezone (the same fallback offset the Edge Functions use, and a close approximation of
// the true per-project GPS date for any project near Oman) removes that mismatch,
// independent of the viewer's own timezone.
export function businessDateStr(d: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD directly.
  return d.toLocaleDateString('en-CA', { timeZone: WORKFORCE_BUSINESS_TIMEZONE });
}

// Kept for compatibility with any existing caller that genuinely wants the raw UTC
// calendar date -- but NOT what "today" should mean for shift/geofence/selfie gating
// below, since the source of truth no longer stamps shift_date in plain UTC.
export function utcDateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// A shift/selfie/geofence result belongs on today's card only when its shift_date
// matches "today" as defined above. No shift_date at all (NOT_LINKED / NO_SHIFT_TODAY)
// is treated as "today" (there's nothing stale to exclude).
export function isShiftDateToday(shiftDate: string | null | undefined): boolean {
  return !shiftDate || shiftDate === businessDateStr();
}

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
