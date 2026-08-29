import React from 'react';
import { UserRound } from 'lucide-react';

interface Props {
  employeeId: string;
  employeeName: string;
  employeeType: string;
  overtimeHours: number;
}

// Photo, Start Time, End Time, Geofence, and Mobility have no real data source
// anywhere in this ERP yet (confirmed by codebase search -- no photo field, no
// GPS/geofence infrastructure, no clock-in/out timestamps, no mobility field).
// Rather than fabricate values, this card shows honest placeholders for those
// fields; only Name, ID, and OT (from real Attendance data) are live.
export const EmployeeDeploymentCard: React.FC<Props> = ({ employeeId, employeeName, employeeType, overtimeHours }) => {
  return (
    <div className="w-44 shrink-0 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col hover:shadow-sm hover:border-slate-300 transition-all">
      {/* Photo -- primary visual focus of the tile */}
      <div className="h-56 shrink-0 bg-slate-100 flex items-center justify-center">
        <UserRound className="w-20 h-20 text-slate-400" />
      </div>

      {/* Name, then Staff/Worker : Code */}
      <div className="px-2 pt-2 pb-1.5 text-center border-t border-slate-100 shrink-0">
        <p className="text-xs font-semibold text-slate-900 truncate" title={employeeName}>{employeeName}</p>
        <p className="text-[10px] mt-0.5 truncate">
          <span className={employeeType === 'Staff' ? 'text-blue-700 font-semibold' : 'text-indigo-700 font-semibold'}>
            {employeeType}
          </span>
          <span className="text-slate-400"> : </span>
          <span className="font-mono font-bold text-blue-600">{employeeId}</span>
        </p>
      </div>

      {/* Attendance details, below a line break from the identity block */}
      <div className="px-2 pb-2 pt-1.5 border-t border-slate-100 space-y-1 text-[10px] shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">Start Time:</span>
          <span className="text-slate-400 italic truncate">Not Tracked</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 shrink-0">End Time:</span>
          <span className="text-slate-400 italic truncate">Not Tracked</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 font-medium shrink-0">OT:</span>
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
