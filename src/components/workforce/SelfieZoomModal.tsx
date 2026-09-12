import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Maximize2,
  Sparkles,
} from 'lucide-react';

export interface SelfieZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  employeeId: string;
  employeeType: string;
  initialType?: 'start' | 'end';
  startPhotoUrl?: string | null;
  endPhotoUrl?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  selfieDateTimeStr?: string | null;
  isInsideGeofence?: boolean | null;
  onOpenReport?: () => void;
}

export const SelfieZoomModal: React.FC<SelfieZoomModalProps> = ({
  isOpen,
  onClose,
  employeeName,
  employeeId,
  employeeType,
  initialType = 'start',
  startPhotoUrl,
  endPhotoUrl,
  startTime,
  endTime,
  selfieDateTimeStr,
  isInsideGeofence,
  onOpenReport,
}) => {
  // Determine available photos
  const hasStart = Boolean(startPhotoUrl);
  const hasEnd = Boolean(endPhotoUrl);

  const [activeType, setActiveType] = useState<'start' | 'end'>(
    initialType === 'end' && hasEnd ? 'end' : hasStart ? 'start' : hasEnd ? 'end' : 'start'
  );

  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset transforms whenever active photo changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType === 'end' && hasEnd ? 'end' : hasStart ? 'start' : hasEnd ? 'end' : 'start');
      setZoom(100);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialType, hasStart, hasEnd]);

  const handleSwitchType = useCallback((type: 'start' | 'end') => {
    setActiveType(type);
    setZoom(100);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 25, 400));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(prev - 25, 50);
      if (next <= 100) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setZoom(100);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleReset();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRotate();
      } else if (e.key === 'ArrowLeft' && hasStart && hasEnd && activeType === 'end') {
        e.preventDefault();
        handleSwitchType('start');
      } else if (e.key === 'ArrowRight' && hasStart && hasEnd && activeType === 'start') {
        e.preventDefault();
        handleSwitchType('end');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleReset, handleRotate, hasStart, hasEnd, activeType, handleSwitchType]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Mouse drag handlers for panning zoomed image
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 100) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: posStartRef.current.x + dx,
      y: posStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Double click toggles between 100% and 180%
  const handleDoubleClick = () => {
    if (zoom > 100) {
      handleReset();
    } else {
      setZoom(180);
    }
  };

  if (!isOpen) return null;

  const currentPhotoUrl = activeType === 'end' ? endPhotoUrl : startPhotoUrl || endPhotoUrl;
  const currentPhotoLabel = activeType === 'end' ? 'Shift End Verification Selfie' : 'Shift Start Verification Selfie';
  const currentTimestamp = activeType === 'end' ? endTime : startTime || selfieDateTimeStr;

  // Rendered via a portal straight into document.body: this modal is opened from a
  // card that applies a hover transform (hover:-translate-y-0.5) and overflow-hidden,
  // both of which create a new containing/clipping context for `position: fixed`
  // descendants. Without the portal, this "fullscreen" overlay was being clipped to
  // and sized against that small card instead of the viewport.
  return createPortal(
    <div
      id="selfie-zoom-backdrop"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Top Header Bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-white z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white truncate">{employeeName}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-slate-800 text-blue-400 border border-slate-700">
                {employeeId}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-800 text-slate-300">
                {employeeType}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
              <span className="text-slate-200 font-medium">{currentPhotoLabel}</span>
              {currentTimestamp && (
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{currentTimestamp}</span>
                </span>
              )}
              {isInsideGeofence !== null && isInsideGeofence !== undefined && (
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isInsideGeofence
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  {isInsideGeofence ? 'Inside Site Radius' : 'Outside Site Radius'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Start / End Switcher if both exist */}
        <div className="flex items-center gap-2">
          {hasStart && hasEnd && (
            <div className="flex items-center bg-slate-800/90 rounded-lg p-1 border border-slate-700">
              <button
                type="button"
                id="btn-switch-start-photo"
                onClick={() => handleSwitchType('start')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeType === 'start'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                Start Selfie
              </button>
              <button
                type="button"
                id="btn-switch-end-photo"
                onClick={() => handleSwitchType('end')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeType === 'end'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                End Selfie
              </button>
            </div>
          )}

          {/* Close button */}
          <button
            type="button"
            id="btn-close-selfie-zoom"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 relative flex items-center justify-center p-4 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoom > 100 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {/* Previous / Next Arrow buttons on sides if both start and end exist */}
        {hasStart && hasEnd && (
          <>
            <button
              type="button"
              id="btn-prev-selfie"
              onClick={() => handleSwitchType(activeType === 'start' ? 'end' : 'start')}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-xl transition-all z-20 hover:scale-105"
              title="Switch to other selfie (Left/Right Arrow)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              id="btn-next-selfie"
              onClick={() => handleSwitchType(activeType === 'start' ? 'end' : 'start')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-xl transition-all z-20 hover:scale-105"
              title="Switch to other selfie (Left/Right Arrow)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Verification Image */}
        {currentPhotoUrl ? (
          <div
            className="transition-transform duration-100 ease-out inline-block max-w-full max-h-full"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={currentPhotoUrl}
              alt={currentPhotoLabel}
              onDoubleClick={handleDoubleClick}
              className="max-h-[78vh] max-w-[85vw] object-contain rounded-xl shadow-2xl border border-slate-800 pointer-events-auto"
              draggable={false}
            />
          </div>
        ) : (
          <div className="text-center text-slate-400 p-8">
            <p className="text-sm font-medium">No verification photo recorded for this shift.</p>
          </div>
        )}

        {/* Floating Zoom & Control Toolbar at bottom of stage */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 shadow-2xl backdrop-blur-md text-white z-20">
          <button
            type="button"
            id="btn-zoom-out"
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs font-semibold px-2 text-slate-200 min-w-[50px] text-center">
            {zoom}%
          </span>

          <button
            type="button"
            id="btn-zoom-in"
            onClick={handleZoomIn}
            disabled={zoom >= 400}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-slate-700 mx-1" />

          <button
            type="button"
            id="btn-zoom-reset"
            onClick={handleReset}
            className="px-2 py-1 text-xs font-medium rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Reset Zoom & Position (0)"
          >
            Reset
          </button>

          <button
            type="button"
            id="btn-rotate"
            onClick={handleRotate}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Rotate 90° (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {onOpenReport && (
            <>
              <div className="w-px h-4 bg-slate-700 mx-1" />
              <button
                type="button"
                id="btn-open-report-from-zoom"
                onClick={() => {
                  onClose();
                  onOpenReport();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs"
                title="Open Monthly Attendance Report for this employee"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Attendance Report</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Footer shortcut hints */}
      <div className="shrink-0 py-2 px-4 bg-slate-950 text-center text-[11px] text-slate-500 border-t border-slate-900 flex items-center justify-center gap-4 flex-wrap">
        <span>Click or Drag to pan when zoomed</span>
        <span>•</span>
        <span>Double-click to toggle zoom</span>
        <span>•</span>
        <span>Wheel to zoom</span>
        <span>•</span>
        <span>Keys: <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">+</kbd> / <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">-</kbd> Zoom, <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">R</kbd> Rotate, <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">Esc</kbd> Close</span>
      </div>
    </div>,
    document.body
  );
};
