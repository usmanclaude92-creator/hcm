import React from 'react';

export type AttendanceStatus = 'Present' | 'Absent' | 'Leave' | 'Resigned';

// One reusable render path for this presentation, so "Resigned" always looks the same
// (red background + white text) wherever a resigned employee is ever shown, per product
// requirement -- not just on the Workforce Deployment cards that use this today.
const STYLES: Record<AttendanceStatus, string> = {
  Present: 'bg-emerald-500 text-white',
  Absent: 'bg-rose-500 text-white',
  Leave: 'bg-amber-400 text-slate-900',
  Resigned: 'bg-rose-600 text-white',
};

export const AttendanceStatusBadge: React.FC<{ status: AttendanceStatus }> = ({ status }) => (
  <span className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold shadow-sm ${STYLES[status]}`}>
    {status}
  </span>
);
