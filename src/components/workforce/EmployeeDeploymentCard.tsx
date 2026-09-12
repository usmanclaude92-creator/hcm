import React, { useState, useEffect } from 'react';
import { UserRound, MapPin, Clock, ZoomIn } from 'lucide-react';
import { type AttendanceStatus } from '../common/AttendanceStatusBadge';
import { SelfieZoomModal } from './SelfieZoomModal';

export interface WorkforceShiftStatus {
  shiftDate?: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  status: 'NOT_LINKED' | 'NO_SHIFT_TODAY' | 'OPEN' | 'CLOSED';
  selfieUrl?: string | null;
  selfie_url?: string | null;
  startSelfieUrl?: string | null;
  endSelfieUrl?: string | null;
  selfieTakenAt?: string | null;
  shiftDurationMinutes?: number | null;
  totalTodayMinutes?: number | null;
  totalWorkedMinutes?: number | null;
  isInsideGeofence?: boolean | null;
  geofenceStatus?: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' | null;
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

function formatTimeOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatMinutesToHours(minutes: number): string {
  if (minutes <= 0) return '0 mins';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} mins`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} mins`;
}

function formatSelfieDateTime(shiftStatus?: WorkforceShiftStatus): string | null {
  if (!shiftStatus) return null;
  let d: Date | null = null;
  if (shiftStatus.selfieTakenAt) {
    const parsed = new Date(shiftStatus.selfieTakenAt);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d && shiftStatus.selfieUrl) {
    const match = shiftStatus.selfieUrl.match(/_(\d{12,14})\./);
    if (match) {
      const ts = Number(match[1]);
      if (!isNaN(ts)) {
        const parsed = new Date(ts);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
    }
  }
  if (!d && shiftStatus.clockInAt) {
    const parsed = new Date(shiftStatus.clockInAt);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  if (!d) return null;

  const day = d.getDate();
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month}, ${time}`;
}

export const EmployeeDeploymentCard: React.FC<Props> = ({
  employeeId,
  employeeName,
  employeeType,
  attendanceStatus,
  shiftStatus,
  onClick,
}) => {
  // Live ticker updating duration every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Click-to-zoom selfie lightbox state
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomPhotoType, setZoomPhotoType] = useState<'start' | 'end'>('start');

  const handleOpenZoom = (e: React.MouseEvent, type: 'start' | 'end' = 'start') => {
    e.stopPropagation();
    setZoomPhotoType(type);
    setZoomModalOpen(true);
  };

  // Check if shift belongs to today
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = !shiftStatus?.shiftDate || shiftStatus.shiftDate === todayStr;

  // 1. Start Time (time of start shift selfie taken time)
  const startTime = isToday ? formatTimeOnly(shiftStatus?.clockInAt) : null;

  // 2. End Time (time of end shift selfie taken, or auto-ends at 23:59:59 if unended after midnight)
  let endTimeDisplay: string | null = null;
  const isOpen = isToday && shiftStatus?.status === 'OPEN';

  if (isToday) {
    if (shiftStatus?.clockOutAt) {
      endTimeDisplay = formatTimeOnly(shiftStatus.clockOutAt);
    } else if (isOpen) {
      endTimeDisplay = 'On Shift';
    } else if (shiftStatus?.clockInAt) {
      endTimeDisplay = '23:59:59';
    }
  }

  // 3. Shift Duration (duration of current shift difference of start time and end time)
  let shiftDurationStr = '-';
  let currentShiftMinutes = 0;

  if (isToday && shiftStatus?.clockInAt) {
    const startMs = new Date(shiftStatus.clockInAt).getTime();
    if (!isNaN(startMs)) {
      let endMs: number;
      if (shiftStatus.clockOutAt) {
        endMs = new Date(shiftStatus.clockOutAt).getTime();
      } else if (isOpen) {
        endMs = Date.now();
      } else {
        const midnight = new Date(shiftStatus.clockInAt);
        midnight.setHours(23, 59, 59, 999);
        endMs = midnight.getTime();
      }
      currentShiftMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
      shiftDurationStr = formatMinutesToHours(currentShiftMinutes);
    }
  }

  // 4. Total Work Today (total of shifts duration in the same date)
  let hoursWorkedTodayStr = '-';
  if (isToday && (startTime || shiftStatus?.totalTodayMinutes)) {
    const priorCompletedMinutes = Number(shiftStatus?.totalTodayMinutes ?? shiftStatus?.totalWorkedMinutes ?? 0);
    const totalMinutes = priorCompletedMinutes > 0 ? (priorCompletedMinutes + (isOpen ? currentShiftMinutes : 0)) : currentShiftMinutes;
    hoursWorkedTodayStr = formatMinutesToHours(totalMinutes);
  }

  // Geofence status: Inside Site Radius (Green) / Outside (Red)
  const isInsideGeofence = shiftStatus?.isInsideGeofence;

  // Selfie timestamp display at top-left corner
  const selfieDateTimeStr = formatSelfieDateTime(shiftStatus);

  // Status Badge Label & Color at bottom-left of photo
  let badgeLabel = 'Absent';
  let badgeStyle = 'bg-rose-600 text-white';

  const isOnLeave = attendanceStatus === 'On Leave' || (attendanceStatus as string)?.toLowerCase().includes('leave');

  if (isOnLeave) {
    badgeLabel = 'On Leave';
    badgeStyle = 'bg-amber-500 text-white';
  } else if (isOpen) {
    badgeLabel = 'Shift Started';
    badgeStyle = 'bg-emerald-600 text-white';
  } else if (isToday && shiftStatus?.status === 'CLOSED') {
    badgeLabel = 'Shift Ended';
    badgeStyle = 'bg-blue-600 text-white';
  } else {
    badgeLabel = 'Absent';
    badgeStyle = 'bg-rose-600 text-white';
  }

  const startPhotoUrl = shiftStatus?.startSelfieUrl || shiftStatus?.selfieUrl || shiftStatus?.selfie_url;
  const endPhotoUrl = shiftStatus?.endSelfieUrl;

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
      title={onClick ? `Click to open Attendance Report for ${employeeName} (${employeeId})` : undefined}
      className={`w-44 shrink-0 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col transition-all text-left ${
        onClick
          ? 'cursor-pointer hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5 group focus:outline-hidden focus:ring-2 focus:ring-blue-500/50'
          : 'hover:shadow-xs hover:border-slate-300'
      }`}
    >
      {/* Photo Area: Displays camera selfie, top-left selfie date/time, top-right geofence location icon */}
      <div className="relative h-56 shrink-0 bg-slate-100 flex items-center justify-center overflow-hidden">
        {/* 2. Top-Left Corner: Date and Time of Selfie Taken */}
        {selfieDateTimeStr ? (
          <div
            className="absolute top-2 left-2 max-w-[calc(100%-2.25rem)] px-1.5 py-1 rounded-md bg-gradient-to-br from-slate-900/90 to-slate-800/80 ring-1 ring-white/10 text-[9px] font-semibold text-white shadow-md z-10 flex items-center gap-1 tracking-tight whitespace-nowrap"
            title={`Selfie taken: ${selfieDateTimeStr}`}
          >
            <Clock className="w-2.5 h-2.5 text-sky-300 shrink-0" />
            <span className="truncate font-mono">{selfieDateTimeStr}</span>
          </div>
        ) : null}

        {/* 3. Top-Right Corner: Location Icon (Green when inside geofence, Red when outside) — a plain
             colored pin with a drop-shadow for legibility against any photo, no circular badge */}
        <div
          className="absolute top-1.5 right-1.5 z-10"
          title={
            isInsideGeofence === true
              ? 'Inside Site Radius (Within Geofence)'
              : isInsideGeofence === false
              ? 'Outside Site Radius (Geofence Exception)'
              : 'Location Not Captured'
          }
        >
          <MapPin
            className={`w-5 h-5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)] ${
              isInsideGeofence === true
                ? 'fill-emerald-500 text-emerald-100'
                : isInsideGeofence === false
                ? 'fill-rose-500 text-rose-100'
                : 'fill-slate-400 text-slate-100'
            }`}
            strokeWidth={1.75}
          />
        </div>

        {/* 4. Photos: Show selfie taken at start and end of shift with click-to-zoom */}
        {startPhotoUrl && endPhotoUrl ? (
          <div className="w-full h-full grid grid-cols-2 divide-x divide-white/60 bg-slate-200">
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => handleOpenZoom(e, 'start')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenZoom(e as any, 'start');
                }
              }}
              className="relative h-full w-full overflow-hidden cursor-zoom-in group/photo"
              title="Click to zoom Shift Start Selfie"
            >
              <img
                src={startPhotoUrl}
                alt="Shift Start Selfie"
                className="w-full h-full object-cover group-hover/photo:scale-105 transition-all duration-200"
              />
              <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-slate-900/75 text-[8px] font-bold text-white z-10">
                Start
              </span>
              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center z-10">
                <span className="p-1 rounded-full bg-slate-900/80 text-white shadow-xs">
                  <ZoomIn className="w-3.5 h-3.5 text-blue-300" />
                </span>
              </div>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => handleOpenZoom(e, 'end')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOpenZoom(e as any, 'end');
                }
              }}
              className="relative h-full w-full overflow-hidden cursor-zoom-in group/photo"
              title="Click to zoom Shift End Selfie"
            >
              <img
                src={endPhotoUrl}
                alt="Shift End Selfie"
                className="w-full h-full object-cover group-hover/photo:scale-105 transition-all duration-200"
              />
              <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-slate-900/75 text-[8px] font-bold text-white z-10">
                End
              </span>
              <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center z-10">
                <span className="p-1 rounded-full bg-slate-900/80 text-white shadow-xs">
                  <ZoomIn className="w-3.5 h-3.5 text-blue-300" />
                </span>
              </div>
            </div>
          </div>
        ) : startPhotoUrl ? (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => handleOpenZoom(e, 'start')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                handleOpenZoom(e as any, 'start');
              }
            }}
            className="relative w-full h-full cursor-zoom-in group/photo"
            title="Click to zoom verification selfie"
          >
            <img
              src={startPhotoUrl}
              alt={employeeName}
              className="w-full h-full object-cover group-hover/photo:scale-105 transition-all duration-200"
            />
            <div className="absolute inset-0 bg-slate-900/25 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center z-10">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/85 text-white text-[10px] font-medium shadow-md backdrop-blur-xs">
                <ZoomIn className="w-3 h-3 text-blue-300" />
                Click to Zoom
              </span>
            </div>
          </div>
        ) : (
          <UserRound className="w-20 h-20 text-slate-400 group-hover:scale-105 group-hover:text-slate-500 transition-all duration-200" />
        )}

        {/* Color-Coded Status Badge on Bottom-Left of Photo */}
        <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs tracking-wide z-10 ${badgeStyle}`}>
          {badgeLabel}
        </div>
      </div>

      {/* Name, then Staff/Worker : Code */}
      <div className="px-2 pt-2 pb-1.5 text-center border-t border-slate-100 shrink-0">
        <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors" title={employeeName}>
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

      {/* Attendance details below photo following user card template */}
      <div className="px-2 pb-2.5 pt-1.5 border-t border-slate-100 space-y-1.5 text-[10px] shrink-0 bg-slate-50/40">
        {/* 1. Start Time */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-emerald-700 font-semibold shrink-0">Start Time:</span>
          {startTime ? (
            <span className="font-mono font-bold text-emerald-700 truncate">{startTime}</span>
          ) : (
            <span className="text-slate-400 italic truncate">-</span>
          )}
        </div>

        {/* 2. End Time */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-blue-700 font-semibold shrink-0">End Time:</span>
          {endTimeDisplay ? (
            <span className={`font-mono font-bold truncate ${isOpen ? 'text-blue-600 italic' : 'text-blue-700'}`}>
              {endTimeDisplay}
            </span>
          ) : (
            <span className="text-slate-400 italic truncate">-</span>
          )}
        </div>

        {/* 3. Shift Duration */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600 font-medium shrink-0">Shift Duration:</span>
          <span className="font-mono font-bold text-slate-800 truncate">{shiftDurationStr}</span>
        </div>

        {/* 4. Total Work Today */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600 font-medium shrink-0">Total Work Today:</span>
          <span className="font-mono font-bold text-indigo-700 truncate">{hoursWorkedTodayStr}</span>
        </div>

        {/* 5. Geofence (Inside Site Radius with Green color and outside with red color) */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600 font-medium shrink-0">Geofence:</span>
          {isInsideGeofence === true ? (
            <span className="font-bold text-emerald-600 truncate" title="Inside Site Radius">
              Inside Site Radius
            </span>
          ) : isInsideGeofence === false ? (
            <span className="font-bold text-rose-600 truncate" title="Outside Site Radius">
              Outside Site Radius
            </span>
          ) : (
            <span className="text-slate-400 italic truncate">-</span>
          )}
        </div>

        {/* 6. Mobility (will setup later) */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-600 font-medium shrink-0">Mobility:</span>
          <span className="text-slate-400 italic truncate">Will setup later</span>
        </div>
      </div>

      {/* Verification Selfie Zoom Modal */}
      <SelfieZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        employeeName={employeeName}
        employeeId={employeeId}
        employeeType={employeeType}
        initialType={zoomPhotoType}
        startPhotoUrl={startPhotoUrl}
        endPhotoUrl={endPhotoUrl}
        startTime={startTime}
        endTime={endTimeDisplay}
        selfieDateTimeStr={selfieDateTimeStr}
        isInsideGeofence={isInsideGeofence}
        onOpenReport={onClick}
      />
    </div>
  );
};

