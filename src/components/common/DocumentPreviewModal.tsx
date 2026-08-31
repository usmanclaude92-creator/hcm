import React, { useState } from 'react';
import {
  X,
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  Calendar,
  User,
  FileCheck,
  AlertTriangle,
} from 'lucide-react';
import { formatDate } from '../../api/client';
import type { DocumentExpiryStatus } from '../../types/index';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl?: string | null;
  fileName?: string | null;
  title?: string;
  documentType?: string;
  documentNumber?: string;
  employeeName?: string;
  employeeId?: string;
  expiryDate?: string;
  status?: DocumentExpiryStatus;
  remarks?: string;
  fileSize?: number;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  documentUrl,
  fileName,
  title,
  documentType = 'Official Document',
  documentNumber,
  employeeName,
  employeeId,
  expiryDate,
  status,
  remarks,
  fileSize,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);

  if (!isOpen || !documentUrl) return null;

  const cleanName = fileName || 'document.pdf';
  const isPdf =
    documentUrl.startsWith('data:application/pdf') ||
    cleanName.toLowerCase().endsWith('.pdf') ||
    documentUrl.includes('.pdf');

  const isImage =
    documentUrl.startsWith('data:image/') ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(cleanName) ||
    /\.(jpg|jpeg|png|webp|gif)/i.test(documentUrl);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = documentUrl;
    link.download = cleanName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(100);
    setRotation(0);
  };

  const getStatusBadge = () => {
    if (!status) return null;
    switch (status) {
      case 'Valid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Valid
          </span>
        );
      case 'Expiring Soon':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Expiring Soon
          </span>
        );
      case 'Urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Urgent Expiry
          </span>
        );
      case 'Expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            Expired
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-xs p-3 md:p-6 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[92vh] max-h-[900px] border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base truncate">
                  {title || documentType || 'Document Attachment'}
                </h3>
                {getStatusBadge()}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                {employeeName && (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <User className="w-3 h-3 text-slate-400" />
                    {employeeName} {employeeId ? `(${employeeId})` : ''}
                  </span>
                )}
                {documentNumber && <span>Doc #: <strong className="text-slate-700">{documentNumber}</strong></span>}
                {expiryDate && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <Calendar className="w-3 h-3" />
                    Exp: {formatDate(expiryDate)}
                  </span>
                )}
                <span>{cleanName}</span>
                {fileSize && <span>({formatBytes(fileSize)})</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isImage && (
              <div className="hidden sm:flex items-center bg-white border border-slate-200 rounded-lg p-1 mr-2 shadow-xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-slate-600 px-2 select-none">{zoom}%</span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={handleRotate}
                  title="Rotate Clockwise"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                {(zoom !== 100 || rotation !== 0) && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 px-2"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Download
            </button>

            <a
              href={documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
              title="Open in new window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Remarks Banner if present */}
        {remarks && (
          <div className="px-6 py-2 bg-indigo-50/70 border-b border-indigo-100 text-xs text-indigo-900 flex items-center gap-2">
            <span className="font-semibold text-indigo-800">Remarks:</span>
            <span>{remarks}</span>
          </div>
        )}

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center select-none relative">
          {isPdf ? (
            <iframe
              src={documentUrl}
              title={cleanName}
              className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-sm"
            />
          ) : isImage ? (
            <div className="overflow-auto max-h-full max-w-full flex items-center justify-center p-2">
              <img
                src={documentUrl}
                alt={title || cleanName}
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-h-[600px] max-w-full object-contain rounded-xl border border-slate-300 shadow-md bg-white"
              />
            </div>
          ) : (
            <div className="text-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-900 text-base mb-1">{cleanName}</h4>
              <p className="text-xs text-slate-500 mb-6">
                This document format can be downloaded and opened with its respective application.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors w-full"
              >
                <Download className="w-4 h-4" />
                Download Document
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>Secure Object Storage • Authenticated Document Link</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
