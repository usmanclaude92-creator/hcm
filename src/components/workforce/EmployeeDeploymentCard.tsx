import React, { useState, useEffect } from 'react';
import { UserRound, IdCard } from 'lucide-react';
import { type AttendanceStatus } from '../common/AttendanceStatusBadge';

export interface WorkforceShiftStatus {
  shiftDate?: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  status: 'NOT_LINKED' | 'NO_SHIFT_TODAY' | 'OPEN' | 'CLOSED';
  selfieUrl?: string | null;
  selfie_url?: string | null;
}

interface Props {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  overtimeHours: number;
  attendanceStatus: AttendanceStatus;
  shiftStatus?: WorkforceShiftStatus;
  onClick?: () => void;
}

function formatShiftTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatHoursWorked(
  clockIn: string | null | undefined,
  clockOut: string | null | undefined,
  isOpen: boolean
): string {
  if (!clockIn) return '-';
  const start = new Date(clockIn).getTime();
  if (isNaN(start)) return '-';
  const end = clockOut ? new Date(clockOut).getTime() : (isOpen ? Date.now() : null);
  if (!end || isNaN(end) || end < start) return '-';
  const diffMinutes = Math.floor((end - start) / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours === 0 && mins === 0) return '0 mins';
  if (hours === 0) return `${mins} mins`;
  return `${hours} hrs ${mins} mins`;
}

export const EmployeeDeploymentCard: React.FC<Props> = ({
  employeeId,
  employeeName,
  employeeType,
  overtimeHours,
  attendanceStatus,
  shiftStatus,
  onClick,
}) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const isOpenShift = shiftStatus?.status === 'OPEN';
  const isClosedShift = shiftStatus?.status === 'CLOSED';

  const startTime = formatShiftTime(shiftStatus?.clockInAt);
  const endTime = formatShiftTime(shiftStatus?.clockOutAt);
  const hoursWorked = formatHoursWorked(shiftStatus?.clockInAt, shiftStatus?.clockOutAt, isOpenShift);

  // Photo URL support (handles both camelCase and snake_case)
  const selfiePhotoUrl = shiftStatus?.selfieUrl || shiftStatus?.selfie_url;

  // Determine Badge Label & Color
  let badgeLabel = 'Absent';
  let badgeStyle = 'bg-rose-600 text-white'; // Red

  const isOnLeave = attendanceStatus === 'On Leave' || (attendanceStatus as string)?.toLowerCase().includes('leave');

  if (isOnLeave) {
    badgeLabel = 'On Leave';
    badgeStyle = 'bg-amber-500 text-white'; // Orange
  } else if (isOpenShift) {
    badgeLabel = 'Shift Started';
    badgeStyle = 'bg-emerald-600 text-white'; // Green
  } else if (isClosedShift) {
    badgeLabel = 'Shift Ended';
    badgeStyle = 'bg-blue-600 text-white'; // Blue
  } else {
    badgeLabel = 'Absent';
    badgeStyle = 'bg-rose-600 text-white'; // Red
  }

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      title={onClick ? `Click to view Profile & Ledger for ${employeeName} (${employeeId})` : undefined}
      className={`w-44 shrink-0 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col transition-all text-left ${
        onClick
          ? 'cursor-pointer hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5 group focus:outline-hidden focus:ring-2 focus:ring-blue-500/50'
          : 'hover:shadow-xs hover:border-slate-300'
      }`}
    >
      {/* Photo Area: Displays Selfie Photo whenever available */}
      <div className="relative h-56 shrink-0 bg-slate-100 flex items-center justify-center overflow-hidden">
        {selfiePhotoUrl ? (
          <img
            src={selfiePhotoUrl}
            alt={employeeName}
            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-200"
          />
        ) : (
          <UserRound className="w-20 h-20 text-slate-400 group-hover:scale-105 group-hover:text-slate-500 transition-all duration-200" />
        )}

        {/* Color-Coded Status Badge on Photo */}
        <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs tracking-wide z-10 ${badgeStyle}`}>
          {badgeLabel}
        </div>

        {onClick && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/60 via-slate-900/30 to-transparent py-2 px-2 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <span className="text-[10px] font-bold text-white tracking-wide flex items-center gap-1 drop-shadow-xs">
              <IdCard className="w-3 h-3 text-blue-300" />
              View Profile &amp; Ledger
            </span>
          </div>
        )}
      </div>

      {/* Name, then Staff/Worker : Code */}
      <div className="px-2 pt-2 pb-1.5 text-center border-t border-slate-100 shrink-0">
        <p
          className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors"
          title={employeeName}
        >
          {employeeName}
        </p>
        <p className="text-[10px] mt-0.5 truncate">
          <span className={employeeType === 'Staff' ? 'text-blue-700 font-semibold' : 'text-indigo-700 font-semibold'}>
            {employeeType}
          </span>
          <span className="text-slate-400"> : </span>
          <span className="font-mono font-bold text-blue-600 group-hover:underline">{employeeId}</span>
        </p>
      </div>

      {/* Attendance details below photo */}
      <div className="px-2 pb-2 pt-1.5 border-t border-slate-100 space-y-1.5 text-[10px] shrink-0 bg-slate-50/40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-700 font-semibold shrink-0">Shift Start Time:</span>
          {startTime ? (
            <span className="font-mono font-bold text-emerald-700 truncate">{startTime}</span>
          ) : (
            <span className="text-slate-400 italic truncate">-</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-blue-700 font-semibold shrink-0">Shift End Time:</span>
          {endTime ? (
            <span className="font-mono font-bold text-blue-700 truncate">{endTime}</span>
          ) : isOpenShift ? (
            <span className="text-blue-600 font-bold italic truncate">On Shift</span>
          ) : (
            <span className="text-slate-400 italic truncate">-</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600 font-medium shrink-0">Hours Worked:</span>
          <span className="font-mono font-bold text-slate-800 truncate">{hoursWorked}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">Over-time:</span>
          <span className={`font-mono font-bold ${overtimeHours > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {overtimeHours.toFixed(1)} Hrs
          </span>
        </div>
      </div>
    </div>
  );
};
