import React from 'react';
import { UserRound, IdCard } from 'lucide-react';
import { AttendanceStatusBadge, type AttendanceStatus } from '../common/AttendanceStatusBadge';

interface Props {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  overtimeHours: number;
  attendanceStatus: AttendanceStatus;
  onClick?: () => void;
}

// Photo, Start Time, End Time, Geofence, and Mobility have no real data source
// anywhere in this ERP yet (confirmed by codebase search -- no photo field, no
// GPS/geofence infrastructure, no clock-in/out timestamps, no mobility field).
// Rather than fabricate values, this card shows honest placeholders for those
// fields; only Name, ID, and OT (from real Attendance data) are live.
export const EmployeeDeploymentCard: React.FC<Props> = ({
  employeeId,
  employeeName,
  employeeType,
  overtimeHours,
  attendanceStatus,
  onClick,
}) => {
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
      {/* Photo -- primary visual focus of the tile */}
      <div className="relative h-56 shrink-0 bg-slate-100 flex items-center justify-center overflow-hidden">
        <UserRound className="w-20 h-20 text-slate-400 group-hover:scale-105 group-hover:text-slate-500 transition-all duration-200" />
        <AttendanceStatusBadge status={attendanceStatus} />

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

      {/* Attendance details, below a line break from the identity block */}
      <div className="px-2 pb-2 pt-1.5 border-t border-slate-100 space-y-1 text-[10px] shrink-0 bg-slate-50/40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">Start Time:</span>
          <span className="text-slate-400 italic truncate">Not Tracked</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">End Time:</span>
          <span className="text-slate-400 italic truncate">Not Tracked</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 font-medium shrink-0">Over-time:</span>
          <span className={`font-mono font-bold ${overtimeHours > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {overtimeHours.toFixed(1)} Hrs
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">Geofence:</span>
          <span className="text-slate-400 truncate">Not Available</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">Mobility:</span>
          <span className="text-slate-400 truncate">Not Configured</span>
        </div>
      </div>
    </div>
  );
};
