import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Check, Move, Crop } from 'lucide-react';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
  title?: string;
}

const CROP_BOX_SIZE = 260; // preview crop square size in px
const OUTPUT_SIZE = 400;   // exported square canvas dimension in px

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
  title = 'Adjust Profile Photo',
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialPan, setInitialPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load natural image dimensions when imageSrc changes
  useEffect(() => {
    if (!imageSrc || !isOpen) return;

    const img = new Image();
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc, isOpen]);

  // Calculate base scale so image at 1x completely fills the crop box
  const baseScale = naturalSize
    ? Math.max(CROP_BOX_SIZE / naturalSize.width, CROP_BOX_SIZE / naturalSize.height)
    : 1;

  const currentScale = baseScale * zoom;
  const displayedWidth = naturalSize ? naturalSize.width * currentScale : CROP_BOX_SIZE;
  const displayedHeight = naturalSize ? naturalSize.height * currentScale : CROP_BOX_SIZE;

  // Max pan limits to prevent empty white gaps inside crop area
  const maxOffsetX = Math.max(0, (displayedWidth - CROP_BOX_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - CROP_BOX_SIZE) / 2);

  // Clamped pan offsets
  const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, pan.x));
  const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, pan.y));

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialPan({ x: clampedX, y: clampedY });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      setPan({
        x: initialPan.x + deltaX,
        y: initialPan.y + deltaY,
      });
    },
    [isDragging, dragStart, initialPan]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle Touch Dragging
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setInitialPan({ x: clampedX, y: clampedY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - dragStart.x;
    const deltaY = e.touches[0].clientY - dragStart.y;
    setPan({
      x: initialPan.x + deltaX,
      y: initialPan.y + deltaY,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.002;
    setZoom((prev) => Math.min(3, Math.max(1, +(prev + delta).toFixed(2))));
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Execute Canvas Crop
  const handleSave = () => {
    if (!imageSrc || !naturalSize) return;

    setIsSaving(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          setIsSaving(false);
          return;
        }

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

        // High quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const factor = OUTPUT_SIZE / CROP_BOX_SIZE;
        const outW = displayedWidth * factor;
        const outH = displayedHeight * factor;
        const outX = OUTPUT_SIZE / 2 - outW / 2 + clampedX * factor;
        const outY = OUTPUT_SIZE / 2 - outH / 2 + clampedY * factor;

        ctx.drawImage(img, outX, outY, outW, outH);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        onCropComplete(dataUrl);
        setIsSaving(false);
      };

      img.onerror = () => {
        setIsSaving(false);
      };

      img.src = imageSrc;
    } catch (err) {
      console.error('Failed to crop image', err);
      setIsSaving(false);
    }
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <Crop size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 leading-tight">{title}</h3>
              <p className="text-[11px] text-slate-500">Drag to center and zoom to frame your picture</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: Crop Viewport */}
        <div className="p-6 flex flex-col items-center bg-slate-900/95 select-none">
          {/* Viewport Frame */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            style={{ width: `${CROP_BOX_SIZE}px`, height: `${CROP_BOX_SIZE}px` }}
            className={`relative overflow-hidden rounded-2xl bg-black shadow-2xl ring-2 ring-blue-500/80 cursor-grab ${
              isDragging ? 'cursor-grabbing ring-blue-400' : ''
            }`}
          >
            {/* The Image */}
            <img
              src={imageSrc}
              alt="Crop target"
              draggable={false}
              style={{
                width: `${displayedWidth}px`,
                height: `${displayedHeight}px`,
                transform: `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`,
                maxWidth: 'none',
              }}
              className="pointer-events-none select-none absolute left-1/2 top-1/2 will-change-transform"
            />

            {/* Grid Guide Overlay */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20">
              <div className="border-r border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-b border-white/10" />
              <div className="border-r border-white/10" />
              <div className="border-r border-white/10" />
              <div />
            </div>

            {/* Drag helper hint badge */}
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white/90 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 pointer-events-none">
              <Move size={10} />
              <span>Drag to position</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="w-full max-w-[280px] mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-300">
                <ZoomIn size={13} className="text-blue-400" />
                <span>Zoom Level</span>
              </span>
              <span className="font-mono text-[11px] text-slate-300">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(1, +(prev - 0.15).toFixed(2)))}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Zoom out"
              >
                <ZoomOut size={15} />
              </button>

              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                aria-label="Zoom slider"
              />

              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(3, +(prev + 0.15).toFixed(2)))}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Zoom in"
              >
                <ZoomIn size={15} />
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
                title="Reset zoom and position"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RotateCcw size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>Save &amp; Apply</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
