import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  RefreshCw,
  Trash2,
  File,
  Image as ImageIcon,
  Loader2,
  Clipboard,
  Sparkles,
  ArrowUpCircle,
} from 'lucide-react';
import { apiRequest } from '../../api/client';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import type { EmployeeDocumentCategory } from '../../types/index';

export interface FileUploadResult {
  fileData: string; // Base64 data URL
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath?: string;
  fileUrl?: string;
  documentId?: string;
}

export interface FileUploadComponentProps {
  /** Target employee ID to associate the document with in persistent object storage */
  employeeId?: string;
  employeeName?: string;
  /** Document category for object storage path partitioning */
  category?: EmployeeDocumentCategory | string;
  /** Human-readable document classification name (e.g. "Civil ID", "Driving Licence", "Resident Visa") */
  documentType?: string;
  /** Optional document title */
  title?: string;
  /** Optional official document number */
  documentNumber?: string;
  /** Optional issue date string (YYYY-MM-DD) */
  issueDate?: string;
  /** Optional expiry date string (YYYY-MM-DD) */
  expiryDate?: string;
  /** Optional remarks or notes */
  remarks?: string;
  /** Existing file URL or base64 data */
  value?: string | null;
  /** Existing or initial display file name */
  fileName?: string | null;
  /** Existing storage path */
  storagePath?: string | null;
  /** Optional initial file passed from external drag-and-drop */
  initialFile?: File | null;
  /** Callback fired whenever the file is selected, uploaded, or cleared */
  onChange?: (fileResult: FileUploadResult | null) => void;
  /** Callback fired upon successful upload to server object storage */
  onUploadSuccess?: (result: {
    storagePath: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    documentId?: string;
  }) => void;
  /** Callback when user removes an attached file */
  onRemove?: () => void;
  /** If true, automatically uploads to /api/storage/upload upon file selection (default: true) */
  autoUpload?: boolean;
  /** If true, synchronizes the uploaded document with the employee's main compliance record */
  syncToModule?: boolean;
  /** Label for the upload control */
  label?: string;
  /** Descriptive helper text */
  helperText?: string;
  /** Allowed file extensions / MIME types (default: PDF, JPG, PNG, WEBP, DOCX, XLSX) */
  allowedExtensions?: string[];
  /** Maximum allowable file size in megabytes (default: 15MB) */
  maxSizeMB?: number;
  /** Required field flag */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Compact inline presentation instead of full hero card */
  compact?: boolean;
  /** Custom wrapper CSS classes */
  className?: string;
}

export const FileUploadComponent: React.FC<FileUploadComponentProps> = ({
  employeeId,
  employeeName,
  category = 'general',
  documentType = 'General Document',
  title,
  documentNumber,
  issueDate,
  expiryDate,
  remarks,
  value,
  fileName: initialFileName,
  storagePath: initialStoragePath,
  initialFile,
  onChange,
  onUploadSuccess,
  onRemove,
  autoUpload = true,
  syncToModule = true,
  label,
  helperText,
  allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx'],
  maxSizeMB = 15,
  required = false,
  disabled = false,
  compact = false,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef<number>(0);

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastUploadedName, setLastUploadedName] = useState<string | null>(null);

  // Local state tracking current attachment
  const [currentFileUrl, setCurrentFileUrl] = useState<string | null>(value || null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(initialFileName || null);
  const [currentStoragePath, setCurrentStoragePath] = useState<string | null>(initialStoragePath || null);
  const [currentFileSize, setCurrentFileSize] = useState<number | undefined>(undefined);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (value !== undefined) {
      setCurrentFileUrl(value);
    }
  }, [value]);

  useEffect(() => {
    if (initialFileName !== undefined) {
      setCurrentFileName(initialFileName);
    }
  }, [initialFileName]);

  useEffect(() => {
    if (initialStoragePath !== undefined) {
      setCurrentStoragePath(initialStoragePath);
    }
  }, [initialStoragePath]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIcon = (name?: string | null, mime?: string) => {
    const ext = (name || '').split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || mime?.includes('pdf')) {
      return (
        <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
          PDF
        </div>
      );
    }
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '') || mime?.startsWith('image/')) {
      return (
        <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs">
          <ImageIcon className="w-5 h-5" />
        </div>
      );
    }
    if (['doc', 'docx'].includes(ext || '')) {
      return (
        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
          DOC
        </div>
      );
    }
    if (['xls', 'xlsx'].includes(ext || '')) {
      return (
        <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
          XLS
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0 shadow-2xs">
        <File className="w-5 h-5" />
      </div>
    );
  };

  const validateFile = useCallback(
    (file: File): boolean => {
      setError(null);
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${maxSizeMB} MB.`);
        return false;
      }

      const fileName = file.name || '';
      const dotIndex = fileName.lastIndexOf('.');
      const fileExt = dotIndex !== -1 ? fileName.substring(dotIndex).toLowerCase() : '';

      // Check extension or mime
      const isAllowedExt =
        fileExt && allowedExtensions.some((ext) => ext.toLowerCase() === fileExt);
      const isImageMime = file.type.startsWith('image/') && allowedExtensions.some((e) => ['.jpg', '.jpeg', '.png', '.webp'].includes(e.toLowerCase()));
      const isPdfMime = file.type === 'application/pdf' && allowedExtensions.some((e) => e.toLowerCase() === '.pdf');

      if (!isAllowedExt && !isImageMime && !isPdfMime) {
        setError(`Unsupported file format (${fileExt || file.type}). Allowed formats: ${allowedExtensions.join(', ')}.`);
        return false;
      }

      return true;
    },
    [allowedExtensions, maxSizeMB]
  );

  const processFile = useCallback(
    async (file: File) => {
      if (!validateFile(file)) return;

      try {
        setUploading(true);
        setUploadProgress(15);
        setError(null);
        setLastUploadedName(file.name);

        // Read file into Base64 Data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onprogress = (ev) => {
            if (ev.lengthComputable) {
              const p = Math.round((ev.loaded / ev.total) * 40);
              setUploadProgress(15 + p);
            }
          };
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file from disk.'));
          reader.readAsDataURL(file);
        });

        setUploadProgress(60);

        if (autoUpload) {
          // Upload directly to persistent Object Storage API
          const payload = {
            fileData: dataUrl,
            fileName: file.name,
            employeeId: employeeId || undefined,
            category,
            documentType,
            title: title || `${documentType} - ${file.name}`,
            documentNumber: documentNumber || undefined,
            issueDate: issueDate || undefined,
            expiryDate: expiryDate || undefined,
            remarks: remarks || undefined,
            syncToModule,
          };

          setUploadProgress(75);

          const res = await apiRequest('/api/storage/upload', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

          setUploadProgress(100);
          setCurrentFileUrl(res.fileUrl);
          setCurrentFileName(res.fileName);
          setCurrentStoragePath(res.storagePath);
          setCurrentFileSize(res.fileSize || file.size);

          if (onChange) {
            onChange({
              fileData: dataUrl,
              fileName: res.fileName,
              fileType: file.type || 'application/octet-stream',
              fileSize: res.fileSize || file.size,
              storagePath: res.storagePath,
              fileUrl: res.fileUrl,
              documentId: res.document?.id,
            });
          }

          if (onUploadSuccess) {
            onUploadSuccess({
              storagePath: res.storagePath,
              fileName: res.fileName,
              fileUrl: res.fileUrl,
              fileSize: res.fileSize || file.size,
              mimeType: res.mimeType || file.type,
              documentId: res.document?.id,
            });
          }
        } else {
          // Local state handling without immediate remote upload
          setUploadProgress(100);
          setCurrentFileUrl(dataUrl);
          setCurrentFileName(file.name);
          setCurrentFileSize(file.size);

          if (onChange) {
            onChange({
              fileData: dataUrl,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            });
          }
        }
      } catch (err: any) {
        setError(err.message || 'File upload failed. Please try again.');
      } finally {
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [
      validateFile,
      autoUpload,
      category,
      documentNumber,
      documentType,
      employeeId,
      expiryDate,
      issueDate,
      onChange,
      onUploadSuccess,
      remarks,
      syncToModule,
      title,
    ]
  );

  // Process initialFile prop if provided
  useEffect(() => {
    if (initialFile) {
      processFile(initialFile);
    }
  }, [initialFile, processFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Drag & Drop Handlers with drag-counter to avoid child-element flicker
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploading) return;

    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !uploading) {
      e.dataTransfer.dropEffect = 'copy';
      if (!isDragging) {
        setIsDragging(true);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploading) return;

    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (disabled || uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      processFile(file);
    }
  };

  // Support clipboard paste (e.g. Ctrl+V image screenshot of Civil ID)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled || uploading) return;
      // Only process if user is focused inside our component or modal
      if (containerRef.current && containerRef.current.contains(document.activeElement)) {
        const items = e.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
              const file = items[i].getAsFile();
              if (file) {
                // Generate friendly name if unnamed
                const ext = file.type.split('/')[1] || 'png';
                const namedFile = new (window as any).File(
                  [file],
                  `pasted-${documentType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.${ext}`,
                  { type: file.type }
                );
                processFile(namedFile);
                break;
              }
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [disabled, uploading, documentType, processFile]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentFileUrl(null);
    setCurrentFileName(null);
    setCurrentStoragePath(null);
    setCurrentFileSize(undefined);
    setLastUploadedName(null);
    setError(null);
    if (onChange) {
      onChange(null);
    }
    if (onRemove) {
      onRemove();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTriggerBrowse = () => {
    if (!disabled && !uploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const hasAttachedFile = Boolean(currentFileUrl || currentStoragePath || currentFileName);

  return (
    <div ref={containerRef} tabIndex={0} className={`space-y-1.5 focus:outline-hidden ${className}`}>
      {/* Label and Helper Header */}
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          <span className="text-[11px] text-slate-400 font-normal">
            Max {maxSizeMB}MB • {allowedExtensions.map((e) => e.replace('.', '').toUpperCase()).join(', ')}
          </span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={allowedExtensions.join(',')}
        onChange={handleFileSelect}
        disabled={disabled || uploading}
        className="hidden"
      />

      {/* COMPACT MODE */}
      {compact ? (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative transition-all"
        >
          {hasAttachedFile ? (
            <div
              className={`flex-1 flex items-center justify-between p-2 rounded-xl bg-slate-50 border transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(currentFileName)}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {currentFileName || 'Attached Document'}
                  </p>
                  {currentFileSize && (
                    <p className="text-[10px] text-slate-400">{formatFileSize(currentFileSize)}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  title="Preview Document"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleTriggerBrowse}
                  disabled={disabled || uploading}
                  className="p-1 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  title="Replace File"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={disabled || uploading}
                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                  title="Remove File"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={handleTriggerBrowse}
              className={`flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed rounded-xl text-xs font-medium cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/80 text-indigo-700 scale-[1.01] shadow-sm'
                  : 'border-slate-300 text-slate-600 hover:border-indigo-400 hover:bg-indigo-50/30 bg-white'
              } ${disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Uploading {lastUploadedName || 'document'}...</span>
                </>
              ) : isDragging ? (
                <>
                  <ArrowUpCircle className="w-4 h-4 text-indigo-600 animate-bounce" />
                  <span className="font-bold text-indigo-700">Drop file here to attach</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 text-indigo-500" />
                  <span>Click or Drag &amp; Drop to Attach</span>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        /* STANDARD HERO / CARD MODE */
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative"
        >
          {hasAttachedFile ? (
            /* ATTACHED FILE CARD WITH REPLACE DROPZONE SUPPORT */
            <div
              className={`relative rounded-xl border p-3.5 shadow-xs transition-all ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/30'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3 pointer-events-auto">
                <div className="flex items-center gap-3 min-w-0">
                  {getFileIcon(currentFileName)}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {currentFileName || 'Attached Document'}
                      </p>
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Attached
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      {documentType && <span className="font-medium text-slate-600">{documentType}</span>}
                      {currentFileSize && <span>• {formatFileSize(currentFileSize)}</span>}
                      {currentStoragePath && (
                        <span className="text-[10px] text-slate-400 hidden sm:inline">• Persistent Storage</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={handleTriggerBrowse}
                    disabled={disabled || uploading}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Replace Document"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={disabled || uploading}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Remove Document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Drag Replacement Hint if Dragging Over Existing File */}
              {isDragging && (
                <div className="mt-2 pt-2 border-t border-indigo-200 flex items-center justify-center gap-1.5 text-[11px] font-bold text-indigo-700">
                  <ArrowUpCircle className="w-4 h-4 animate-bounce" />
                  <span>Drop here to replace this attached document</span>
                </div>
              )}
            </div>
          ) : (
            /* DRAG AND DROP ZONE */
            <div
              onClick={handleTriggerBrowse}
              className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 select-none ${
                isDragging
                  ? 'border-indigo-600 bg-indigo-50/90 ring-4 ring-indigo-500/20 scale-[1.01] shadow-md'
                  : 'border-slate-300 bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-300'
              } ${disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
            >
              {uploading ? (
                <div className="flex flex-col items-center py-2 text-center pointer-events-none">
                  <div className="relative">
                    <Loader2 className="w-9 h-9 animate-spin text-indigo-600 mb-2" />
                    <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    Uploading {lastUploadedName || 'Document'}...
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Encrypting and archiving to repository storage</p>
                  <div className="w-56 bg-slate-200 rounded-full h-2 mt-3 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-indigo-600 to-blue-500 h-2 rounded-full transition-all duration-300 shadow-sm"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 mt-1 font-semibold">
                    {uploadProgress}% complete
                  </span>
                </div>
              ) : isDragging ? (
                /* ACTIVE DRAGGING HERO STATE */
                <div className="flex flex-col items-center py-3 text-center pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/30 scale-110 transition-transform">
                    <ArrowUpCircle className="w-8 h-8 animate-bounce" />
                  </div>
                  <p className="text-sm font-black text-indigo-950">
                    Release to Drop Document Now
                  </p>
                  <p className="text-xs text-indigo-700 font-medium mt-1">
                    Accepts PDF, JPG, PNG, WEBP up to {maxSizeMB}MB
                  </p>
                </div>
              ) : (
                /* IDLE DRAG & DROP ZONE */
                <div className="flex flex-col items-center text-center pointer-events-none">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center mb-3 shadow-2xs group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900">
                      <span className="text-indigo-600 hover:underline">Click to browse</span> or drag and drop document here
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Supports <span className="font-semibold text-slate-700">PDF, JPG, PNG, WEBP, DOCX</span> up to {maxSizeMB}MB
                  </p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clipboard size={11} className="text-slate-400" />
                      Tip: You can also paste copied images (Ctrl+V)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      {helperText && !error && <p className="text-[11px] text-slate-400 leading-tight">{helperText}</p>}

      {/* Error Alert */}
      {error && (
        <div className="flex items-center justify-between gap-1.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-800 p-0.5 rounded cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Document Preview Lightbox Modal */}
      {isPreviewOpen && (
        <DocumentPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          documentUrl={currentFileUrl}
          fileName={currentFileName}
          title={title || `${documentType} Copy`}
          documentType={documentType}
          documentNumber={documentNumber}
          employeeName={employeeName}
          employeeId={employeeId}
          expiryDate={expiryDate}
          status={expiryDate ? (expiryDate ? 'Valid' : undefined) : undefined}
          remarks={remarks}
          fileSize={currentFileSize}
        />
      )}
    </div>
  );
};
