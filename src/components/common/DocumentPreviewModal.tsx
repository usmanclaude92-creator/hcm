import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Calendar,
  User,
  FileCheck,
  AlertTriangle,
  Printer,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  SunMedium,
  SlidersHorizontal,
  Info,
  Building2,
  Clock,
  CreditCard,
  Globe,
  Car,
  FileBadge,
  Sparkles,
} from 'lucide-react';
import { formatDate } from '../../api/client';
import type { DocumentExpiryStatus } from '../../types/index';

export interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl?: string | null;
  url?: string | null; // For backwards compatibility with DocumentHistoryModal
  fileName?: string | null;
  title?: string;
  documentType?: string;
  category?: string;
  documentNumber?: string;
  employeeName?: string;
  employeeId?: string;
  employeeCompany?: string;
  department?: string;
  designation?: string;
  issueDate?: string;
  expiryDate?: string;
  daysRemaining?: number | null;
  status?: DocumentExpiryStatus | string;
  remarks?: string;
  fileSize?: number;
  mimeType?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  // Multi-document carousel navigation
  documentsList?: any[];
  currentIndex?: number;
  onNavigateIndex?: (index: number) => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  documentUrl,
  url,
  fileName,
  title,
  documentType = 'Official Document',
  category,
  documentNumber,
  employeeName,
  employeeId,
  employeeCompany,
  department,
  designation,
  issueDate,
  expiryDate,
  daysRemaining,
  status,
  remarks,
  fileSize,
  mimeType,
  uploadedAt,
  uploadedBy,
  documentsList,
  currentIndex,
  onNavigateIndex,
}) => {
  // Zoom & Transformation State for Images
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [isScanEnhanced, setIsScanEnhanced] = useState<boolean>(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Pan / Drag State for zoomed images
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Resolve active URL (supports both documentUrl and url)
  const activeUrl = documentUrl || url || null;
  const cleanName = fileName || (activeUrl ? activeUrl.split('/').pop()?.split('?')[0] : '') || `${documentType || 'document'}.pdf`;

  const isPdf =
    Boolean(activeUrl && (
      activeUrl.startsWith('data:application/pdf') ||
      cleanName.toLowerCase().endsWith('.pdf') ||
      activeUrl.includes('.pdf') ||
      mimeType?.includes('pdf')
    ));

  const isImage =
    Boolean(activeUrl && (
      activeUrl.startsWith('data:image/') ||
      /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(cleanName) ||
      /\.(jpg|jpeg|png|webp|gif|svg|bmp)/i.test(activeUrl) ||
      mimeType?.startsWith('image/')
    ));

  // Reset viewport transforms on document change
  useEffect(() => {
    setZoom(100);
    setRotation(0);
    setPanPosition({ x: 0, y: 0 });
    setIsScanEnhanced(false);
  }, [activeUrl, cleanName, currentIndex]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && documentsList && currentIndex !== undefined && currentIndex > 0 && onNavigateIndex) {
        onNavigateIndex(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && documentsList && currentIndex !== undefined && currentIndex < documentsList.length - 1 && onNavigateIndex) {
        onNavigateIndex(currentIndex + 1);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((prev) => Math.min(prev + 25, 350));
      } else if (e.key === '-' || e.key === '_') {
        setZoom((prev) => Math.max(prev - 25, 40));
      } else if (e.key.toLowerCase() === 'r') {
        setRotation((prev) => (prev + 90) % 360);
      } else if (e.key === '0') {
        setZoom(100);
        setRotation(0);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, documentsList, currentIndex, onNavigateIndex, onClose]);

  if (!isOpen) return null;

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownload = () => {
    if (activeUrl) {
      const link = document.createElement('a');
      link.href = activeUrl;
      link.download = cleanName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Print or save as text/dossier
      window.print();
    }
  };

  const handlePrint = () => {
    if (isPdf && activeUrl) {
      const printWindow = window.open(activeUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
        printWindow.print();
      } else {
        window.print();
      }
    } else {
      window.print();
    }
  };

  // Zoom / Rotation handlers
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 350));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 40));
  const handleRotateCw = () => setRotation((prev) => (prev + 90) % 360);
  const handleRotateCcw = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const handleResetTransforms = () => {
    setZoom(100);
    setRotation(0);
    setPanPosition({ x: 0, y: 0 });
    setIsScanEnhanced(false);
  };

  // Drag handlers for zoomed images
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 100) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 100) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Category Icon helper
  const getDocIcon = () => {
    const cat = (category || documentType || '').toLowerCase();
    if (cat.includes('civil') || cat.includes('national')) return <CreditCard className="w-5 h-5 text-blue-600" />;
    if (cat.includes('visa') || cat.includes('passport') || cat.includes('immigration')) return <Globe className="w-5 h-5 text-emerald-600" />;
    if (cat.includes('driving') || cat.includes('license') || cat.includes('licence')) return <Car className="w-5 h-5 text-amber-600" />;
    if (cat.includes('contract') || cat.includes('agreement')) return <FileBadge className="w-5 h-5 text-purple-600" />;
    return <FileText className="w-5 h-5 text-indigo-600" />;
  };

  // Expiry Status Badge helper
  const getStatusBadge = () => {
    if (!status) return null;
    const normalized = String(status).toLowerCase();

    if (normalized.includes('valid')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          Valid
        </span>
      );
    }
    if (normalized.includes('expiring') || normalized.includes('soon')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          Expiring Soon
        </span>
      );
    }
    if (normalized.includes('urgent')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-800 border border-orange-300 shadow-2xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          Urgent Expiry
        </span>
      );
    }
    if (normalized.includes('expired')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          Expired
        </span>
      );
    }
    if (normalized.includes('permanent') || normalized.includes('lifetime')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
          <Sparkles className="w-3.5 h-3.5" />
          Permanent
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        {status}
      </span>
    );
  };

  const hasNavigation = Boolean(
    documentsList &&
    documentsList.length > 1 &&
    currentIndex !== undefined &&
    onNavigateIndex
  );

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 md:p-6 transition-all duration-200 ${
        isFullscreen ? 'p-0!' : ''
      }`}
    >
      <div
        className={`bg-white shadow-2xl flex flex-col border border-slate-200 overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'w-screen h-screen rounded-none border-none'
            : 'w-full max-w-6xl h-[94vh] max-h-[920px] rounded-2xl'
        }`}
      >
        {/* ================= MODAL TOP HEADER ================= */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
          {/* Left: Document Info & Badges */}
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
              {getDocIcon()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-white text-sm sm:text-base truncate max-w-[280px] sm:max-w-md">
                  {title || documentType || 'Official Document'}
                </h3>
                {getStatusBadge()}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                {employeeName && (
                  <span className="flex items-center gap-1 font-medium text-slate-300">
                    <User className="w-3 h-3 text-slate-400" />
                    {employeeName} {employeeId ? `(${employeeId})` : ''}
                  </span>
                )}
                {documentNumber && (
                  <span className="flex items-center gap-1 font-mono text-slate-300">
                    Ref: <strong className="text-white">{documentNumber}</strong>
                  </span>
                )}
                {expiryDate && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    Exp: {formatDate(expiryDate)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quick Toolbar Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Multi-document carousel navigation */}
            {hasNavigation && (
              <div className="hidden sm:flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 mr-1 text-xs">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => onNavigateIndex && onNavigateIndex(currentIndex! - 1)}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 hover:bg-slate-700 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Previous Document (Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-[11px] text-slate-300 select-none">
                  {currentIndex! + 1} / {documentsList!.length}
                </span>
                <button
                  type="button"
                  disabled={currentIndex === documentsList!.length - 1}
                  onClick={() => onNavigateIndex && onNavigateIndex(currentIndex! + 1)}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 hover:bg-slate-700 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Next Document (Right Arrow)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Toggle Metadata Details Panel */}
            <button
              type="button"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                isDetailsOpen
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
              }`}
              title={isDetailsOpen ? 'Hide Document Details' : 'Show Document Details'}
            >
              <Info className="w-4 h-4" />
              <span className="hidden md:inline">{isDetailsOpen ? 'Hide Info' : 'Details'}</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              title="Print Document"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs cursor-pointer"
              title="Download File"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* External Link */}
            {activeUrl && (
              <a
                href={activeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:inline-flex items-center p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
                title="Open in new window"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-rose-600 transition-colors cursor-pointer ml-1"
              title="Close Quick-View (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= SECONDARY VIEWER TOOLBAR (For Images/PDFs) ================= */}
        {isImage && (
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto text-xs text-slate-700 shrink-0">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1.5 py-1 shadow-2xs">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 40}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors disabled:opacity-40"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono font-semibold text-slate-700 px-1.5 min-w-[45px] text-center select-none text-[11px]">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 350}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors disabled:opacity-40"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Rotation Controls */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-1.5 py-1 shadow-2xs">
              <button
                type="button"
                onClick={handleRotateCcw}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                title="Rotate Counter-Clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRotateCw}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                title="Rotate Clockwise (R)"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-slate-500 font-mono pl-1 select-none">{rotation}°</span>
            </div>

            {/* Scan Enhancement Filter Toggle */}
            <button
              type="button"
              onClick={() => setIsScanEnhanced(!isScanEnhanced)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors shadow-2xs cursor-pointer ${
                isScanEnhanced
                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Enhance scan contrast and sharpness for faint text"
            >
              <SunMedium className="w-3.5 h-3.5 text-amber-600" />
              <span>{isScanEnhanced ? 'High Contrast: ON' : 'Enhance Scan'}</span>
            </button>

            {/* Reset Button */}
            {(zoom !== 100 || rotation !== 0 || isScanEnhanced || panPosition.x !== 0 || panPosition.y !== 0) && (
              <button
                type="button"
                onClick={handleResetTransforms}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 shadow-2xs cursor-pointer transition-colors"
              >
                Reset View (0)
              </button>
            )}

            {/* Hint */}
            <span className="hidden xl:inline text-[10px] text-slate-500 italic ml-auto">
              Shortcuts: + / - Zoom • R Rotate • Esc Close • ← / → Next Doc
            </span>
          </div>
        )}

        {/* ================= MAIN CONTENT AREA (STAGE + METADATA SIDEBAR) ================= */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Main Document Preview Stage */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`flex-1 bg-slate-900/95 overflow-auto flex items-center justify-center p-3 sm:p-6 relative select-none ${
              isDragging ? 'cursor-grabbing' : zoom > 100 ? 'cursor-grab' : 'cursor-default'
            }`}
          >
            {/* 1. PDF VIEWER */}
            {isPdf && activeUrl ? (
              <div className="w-full h-full flex flex-col bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden">
                <iframe
                  src={`${activeUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                  title={cleanName}
                  className="w-full h-full border-none"
                />
              </div>
            ) : isImage && activeUrl ? (
              /* 2. INTERACTIVE IMAGE VIEWER */
              <div className="relative flex items-center justify-center w-full h-full overflow-hidden">
                <img
                  ref={imageRef}
                  src={activeUrl}
                  alt={title || cleanName}
                  style={{
                    transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                    filter: isScanEnhanced ? 'contrast(1.6) brightness(0.95) saturate(0.6)' : 'none',
                  }}
                  className="max-h-[82vh] max-w-full object-contain rounded-lg shadow-2xl bg-white border border-slate-700 pointer-events-auto select-none"
                  draggable={false}
                />
              </div>
            ) : (
              /* 3. DIGITAL STATUTORY DOSSIER / CERTIFICATE GENERATOR (When no raw binary is attached or metadata-only record) */
              <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
                {/* Official Top Seal Header */}
                <div className="bg-linear-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 relative overflow-hidden">
                  <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-6 pointer-events-none">
                    <Building2 size={180} />
                  </div>

                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
                        {getDocIcon()}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold tracking-widest uppercase text-blue-300">
                          {employeeCompany || 'SULTANATE OF OMAN HR & COMPLIANCE ARCHIVE'}
                        </div>
                        <h2 className="text-lg font-bold text-white mt-0.5">
                          {documentType || title || 'Official Statutory Record'}
                        </h2>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Official Digital Credential &amp; Identity Dossier
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">{getStatusBadge()}</div>
                  </div>
                </div>

                {/* Body Details & Certificate Matrix */}
                <div className="p-6 space-y-6">
                  {/* Reference & Employee Banner */}
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                        Document Reference Number
                      </div>
                      <div className="text-base font-mono font-bold text-blue-950 flex items-center gap-2 mt-0.5">
                        <span>{documentNumber || 'UNASSIGNED-RECORD-REF'}</span>
                        {documentNumber && (
                          <button
                            type="button"
                            onClick={() => handleCopy(documentNumber, 'docNo')}
                            className="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                            title="Copy Reference Number"
                          >
                            {copiedField === 'docNo' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {employeeId && (
                      <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-blue-200/60 pt-2 sm:pt-0 sm:pl-4">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Employee Identifier
                        </div>
                        <div className="text-sm font-mono font-bold text-slate-800 mt-0.5">
                          {employeeId}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Two-Column Credential Attributes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                      <h4 className="font-bold text-slate-900 text-xs border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        <span>Holder Identity</span>
                      </h4>
                      <dl className="space-y-1.5">
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Employee Name:</dt>
                          <dd className="font-semibold text-slate-900">{employeeName || '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Corporate Entity:</dt>
                          <dd className="font-medium text-slate-800">{employeeCompany || 'All Companies'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Designation:</dt>
                          <dd className="font-medium text-slate-800">{designation || 'Staff'}</dd>
                        </div>
                        {department && (
                          <div className="flex justify-between">
                            <dt className="text-slate-500">Department:</dt>
                            <dd className="font-medium text-slate-800">{department}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                      <h4 className="font-bold text-slate-900 text-xs border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>Validity &amp; Expiry</span>
                      </h4>
                      <dl className="space-y-1.5">
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Issue Date:</dt>
                          <dd className="font-medium text-slate-800">{issueDate ? formatDate(issueDate) : '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Expiry Date:</dt>
                          <dd className="font-bold text-slate-900">{expiryDate ? formatDate(expiryDate) : 'Permanent / Lifetime'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Days Remaining:</dt>
                          <dd className="font-semibold text-slate-800">
                            {daysRemaining !== undefined && daysRemaining !== null
                              ? daysRemaining > 0
                                ? `${daysRemaining} days left`
                                : daysRemaining === 0
                                ? 'Expires today'
                                : `${Math.abs(daysRemaining)} days expired`
                              : 'N/A'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Compliance Status:</dt>
                          <dd className="font-semibold">{getStatusBadge()}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  {/* Remarks Box if any */}
                  {remarks && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                      <span className="font-bold text-slate-700 block mb-0.5">Notes &amp; Remarks:</span>
                      <p className="text-slate-600 italic">"{remarks}"</p>
                    </div>
                  )}

                  {/* Security Verification Bar */}
                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Verified Digital Record • Centralized Employee Repository</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      Print Dossier
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= COLLAPSIBLE METADATA SIDEBAR ================= */}
          {isDetailsOpen && (
            <div className="w-80 lg:w-96 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-lg z-20 animate-fadeIn overflow-y-auto">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Document Specifications</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 transition-colors"
                  title="Hide sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-5 text-xs">
                {/* Holder Identity Card */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {employeeName ? employeeName.charAt(0).toUpperCase() : 'E'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-xs truncate">{employeeName || 'General Record'}</div>
                      <div className="text-[11px] font-mono text-slate-500">{employeeId || 'ID: —'}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Company:</span>
                      <span className="font-medium text-slate-800">{employeeCompany || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Designation:</span>
                      <span className="font-medium text-slate-800">{designation || 'Staff'}</span>
                    </div>
                    {department && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Department:</span>
                        <span className="font-medium text-slate-800">{department}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Document Information */}
                <div className="space-y-2.5">
                  <h5 className="font-bold text-slate-900 text-xs border-b border-slate-200 pb-1 flex items-center justify-between">
                    <span>Document Details</span>
                    <span className="text-[10px] text-slate-400 font-normal">{category || 'General'}</span>
                  </h5>

                  <dl className="space-y-2">
                    <div>
                      <dt className="text-slate-500 text-[11px]">Document Type</dt>
                      <dd className="font-semibold text-slate-900 mt-0.5">{documentType || title}</dd>
                    </div>

                    {documentNumber && (
                      <div>
                        <dt className="text-slate-500 text-[11px]">Document / Reference #</dt>
                        <dd className="font-mono font-bold text-blue-900 mt-0.5 flex items-center justify-between bg-blue-50/70 p-1.5 rounded-md border border-blue-100">
                          <span>{documentNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(documentNumber, 'sideDocNo')}
                            className="text-blue-600 hover:text-blue-800 p-0.5 rounded cursor-pointer"
                            title="Copy number"
                          >
                            {copiedField === 'sideDocNo' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </dd>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <dt className="text-slate-500 text-[11px]">Issue Date</dt>
                        <dd className="font-medium text-slate-800 mt-0.5">{issueDate ? formatDate(issueDate) : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500 text-[11px]">Expiry Date</dt>
                        <dd className="font-bold text-slate-900 mt-0.5">{expiryDate ? formatDate(expiryDate) : 'Permanent'}</dd>
                      </div>
                    </div>

                    <div>
                      <dt className="text-slate-500 text-[11px]">Expiry Compliance Status</dt>
                      <dd className="mt-1 flex items-center justify-between">
                        {getStatusBadge()}
                        {daysRemaining !== undefined && daysRemaining !== null && (
                          <span className="text-[11px] font-semibold text-slate-600">
                            {daysRemaining > 0 ? `${daysRemaining} days` : `${Math.abs(daysRemaining)}d ago`}
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Storage & File Details */}
                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <h5 className="font-bold text-slate-900 text-xs">Storage &amp; File Metadata</h5>
                  <dl className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">File Name:</dt>
                      <dd className="font-mono text-slate-800 truncate max-w-[170px]" title={cleanName}>
                        {cleanName}
                      </dd>
                    </div>
                    {fileSize && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">File Size:</dt>
                        <dd className="font-medium text-slate-800">{formatBytes(fileSize)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Uploaded On:</dt>
                      <dd className="text-slate-700">{uploadedAt ? formatDate(uploadedAt) : '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Uploaded By:</dt>
                      <dd className="text-slate-700">{uploadedBy || 'Admin'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Remarks & Notes */}
                {remarks && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="font-bold text-slate-900 text-xs block mb-1">Remarks:</span>
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 italic">
                      "{remarks}"
                    </p>
                  </div>
                )}
              </div>

              {/* Sidebar Footer Actions */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 mt-auto space-y-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  Print Document
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">Encrypted Object Storage • Verified Document Scanner</span>
            <span className="sm:hidden">Document Quick-View</span>
          </div>

          <div className="flex items-center gap-3">
            {hasNavigation && (
              <span className="text-[11px] text-slate-600 font-medium">
                Doc <strong>{currentIndex! + 1}</strong> of <strong>{documentsList!.length}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
