import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Plus,
  Eye,
  Download,
  Trash2,
  Edit2,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  FolderOpen,
  X,
  File,
  Building,
  User,
  Info,
  History,
} from 'lucide-react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { FileUploadComponent } from '../common/FileUploadComponent';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { DocumentHistoryModal, HistoryCategory } from './DocumentHistoryModal';
import { ComplianceBadge } from '../compliance/ComplianceBadge';
import type { Employee, EmployeeDocument, EmployeeDocumentCategory } from '../../types/index';

interface EmployeeDocumentRepositoryProps {
  employee: Employee;
  onDocumentCountChange?: (count: number) => void;
}

export const EmployeeDocumentRepository: React.FC<EmployeeDocumentRepositoryProps> = ({
  employee,
  onDocumentCountChange,
}) => {
  const { canWrite, isAdmin, isManager, hasPermission } = useAuth();
  const canEdit = canWrite || isAdmin || isManager || hasPermission('compliance.edit');

  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Document History Modal State
  const [isDocHistoryOpen, setIsDocHistoryOpen] = useState(false);
  const [historyCategory, setHistoryCategory] = useState<HistoryCategory>('ALL');

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<EmployeeDocumentCategory>('general');
  const [uploadDocType, setUploadDocType] = useState('Employment Contract');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDocNumber, setUploadDocNumber] = useState('');
  const [uploadIssueDate, setUploadIssueDate] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [uploadRemarks, setUploadRemarks] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Edit Metadata Modal State
  const [editingDoc, setEditingDoc] = useState<EmployeeDocument | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest(`/api/storage/employees/${encodeURIComponent(employee.employeeId)}/documents`);
      setDocuments(res.documents || []);
      if (onDocumentCountChange) {
        onDocumentCountChange(res.documents?.length || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load employee documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [employee.employeeId]);

  const categories: { key: string; label: string; count: number }[] = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: documents.length,
      'civil-id': 0,
      'driving-licence': 0,
      visa: 0,
      'govt-docs': 0,
      contract: 0,
      education: 0,
      medical: 0,
      general: 0,
    };

    documents.forEach((d) => {
      if (counts[d.category] !== undefined) {
        counts[d.category]++;
      } else {
        counts.general++;
      }
    });

    return [
      { key: 'ALL', label: 'All Documents', count: counts.ALL },
      { key: 'civil-id', label: 'Civil ID', count: counts['civil-id'] },
      { key: 'driving-licence', label: 'Driving Licence', count: counts['driving-licence'] },
      { key: 'visa', label: 'Visa & Immigration', count: counts.visa },
      { key: 'govt-docs', label: 'Passports & Permits', count: counts['govt-docs'] },
      { key: 'contract', label: 'Employment Contracts', count: counts.contract },
      { key: 'education', label: 'Qualifications', count: counts.education },
      { key: 'medical', label: 'Medical & Fitness', count: counts.medical },
      { key: 'general', label: 'General / Other', count: counts.general },
    ];
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (selectedCategory !== 'ALL' && doc.category !== selectedCategory) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = (doc.title || '').toLowerCase().includes(q);
        const typeMatch = (doc.documentType || '').toLowerCase().includes(q);
        const nameMatch = (doc.fileName || '').toLowerCase().includes(q);
        const numMatch = (doc.documentNumber || '').toLowerCase().includes(q);
        const remarksMatch = (doc.remarks || '').toLowerCase().includes(q);
        return titleMatch || typeMatch || nameMatch || numMatch || remarksMatch;
      }
      return true;
    });
  }, [documents, selectedCategory, searchQuery]);

  const handleDelete = async (docId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await apiRequest(`/api/storage/documents/${docId}`, { method: 'DELETE' });
      await fetchDocuments();
    } catch (err: any) {
      alert(err.message || 'Failed to delete document.');
    }
  };

  const handleOpenEdit = (doc: EmployeeDocument) => {
    setEditingDoc(doc);
    setEditTitle(doc.title || '');
    setEditDocNumber(doc.documentNumber || '');
    setEditIssueDate(doc.issueDate || '');
    setEditExpiryDate(doc.expiryDate || '');
    setEditRemarks(doc.remarks || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    try {
      setEditSaving(true);
      await apiRequest(`/api/storage/documents/${editingDoc.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle,
          documentNumber: editDocNumber,
          issueDate: editIssueDate,
          expiryDate: editExpiryDate,
          remarks: editRemarks,
        }),
      });
      setEditingDoc(null);
      await fetchDocuments();
    } catch (err: any) {
      alert(err.message || 'Failed to update document metadata.');
    } finally {
      setEditSaving(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Header & Metric Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-indigo-600" />
            Document Storage Repository
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Encrypted object-storage file repository for {employee.employeeName} ({employee.employeeId})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setHistoryCategory('ALL');
              setIsDocHistoryOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-2xs transition-colors"
            title="View Document Lifecycle & Audit Trail"
          >
            <History className="w-3.5 h-3.5 text-indigo-600" />
            <span>Document Lifecycle History</span>
          </button>

          <button
            type="button"
            onClick={fetchDocuments}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh documents"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setUploadSuccess(null);
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs & Search Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.key
                  ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedCategory === cat.key
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Field */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Document Grid / Table View */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
          <p className="text-xs font-medium">Fetching documents from storage...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="py-14 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h4 className="font-semibold text-slate-800 text-sm mb-1">No documents found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {searchQuery || selectedCategory !== 'ALL'
              ? 'No documents match your current filter query.'
              : 'No documents have been uploaded to object storage for this employee yet.'}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Upload First Document
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredDocuments.map((doc) => {
            const isPdf = doc.fileName?.toLowerCase().endsWith('.pdf') || doc.mimeType?.includes('pdf');
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isPdf
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        }`}
                      >
                        {isPdf ? 'PDF' : 'DOC'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate" title={doc.title}>
                          {doc.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 truncate">
                          {doc.documentType} • {formatBytes(doc.fileSize)}
                        </p>
                      </div>
                    </div>

                    {doc.status && <ComplianceBadge status={doc.status} size="sm" />}
                  </div>

                  {/* Metadata pills */}
                  <div className="bg-slate-50 rounded-lg p-2 text-[11px] space-y-1 text-slate-600 mb-3 border border-slate-100">
                    {doc.documentNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Doc Number:</span>
                        <span className="font-mono font-medium text-slate-800">{doc.documentNumber}</span>
                      </div>
                    )}
                    {doc.expiryDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Expiry Date:</span>
                        <span className="font-medium text-slate-800">{formatDate(doc.expiryDate)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Uploaded:</span>
                      <span>
                        {formatDate(doc.uploadedAt)} by {doc.uploadedBy}
                      </span>
                    </div>
                    {doc.remarks && (
                      <div className="pt-1 text-[10px] text-slate-500 italic border-t border-slate-200/60">
                        "{doc.remarks}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]" title={doc.fileName}>
                    {doc.fileName}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      title="Preview Document"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        let cat: HistoryCategory = 'ALL';
                        if (doc.category === 'civil-id') cat = 'civil-id';
                        else if (doc.category === 'driving-licence') cat = 'driving-licence';
                        else if (doc.category === 'visa') cat = 'visa';
                        else if (doc.category === 'passport') cat = 'passport';
                        else if (doc.category === 'govt-docs') cat = 'govt-docs';
                        setHistoryCategory(cat);
                        setIsDocHistoryOpen(true);
                      }}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="View Lifecycle & Version History"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>

                    <a
                      href={doc.fileUrl || `/api/storage/file/${encodeURIComponent(doc.storagePath)}`}
                      download={doc.fileName}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Download Document"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>

                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(doc)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Metadata"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.id, doc.title)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* UPLOAD NEW DOCUMENT MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Upload Document to Storage</h3>
                  <p className="text-xs text-slate-500">Associate with {employee.employeeName} ({employee.employeeId})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {uploadSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              {/* Category and Document Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Document Category *</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as EmployeeDocumentCategory)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <option value="civil-id">Civil ID / National Card</option>
                    <option value="driving-licence">Driving Licence / Operator</option>
                    <option value="visa">Visa & Immigration</option>
                    <option value="govt-docs">Passport / Work Permit</option>
                    <option value="contract">Employment Contract</option>
                    <option value="education">Educational Certificate</option>
                    <option value="medical">Medical Fitness / Report</option>
                    <option value="general">General / Other Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Document Classification *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ministry of Labour Contract"
                    value={uploadDocType}
                    onChange={(e) => setUploadDocType(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Title & Document Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Document Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Signed Offer Letter 2026"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Document #</label>
                  <input
                    type="text"
                    placeholder="e.g. CTR-98210"
                    value={uploadDocNumber}
                    onChange={(e) => setUploadDocNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Issue and Expiry Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={uploadIssueDate}
                    onChange={(e) => setUploadIssueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={uploadExpiryDate}
                    onChange={(e) => setUploadExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks & Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes regarding verification or translation..."
                  value={uploadRemarks}
                  onChange={(e) => setUploadRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Reusable File Upload Component with Persistent Object Storage */}
              <div className="pt-2">
                <FileUploadComponent
                  employeeId={employee.employeeId}
                  employeeName={employee.employeeName}
                  category={uploadCategory}
                  documentType={uploadDocType}
                  title={uploadTitle}
                  documentNumber={uploadDocNumber}
                  issueDate={uploadIssueDate}
                  expiryDate={uploadExpiryDate}
                  remarks={uploadRemarks}
                  label="Select Document File"
                  helperText="Files are securely uploaded and linked to this employee's persistent object store."
                  autoUpload={true}
                  syncToModule={true}
                  onUploadSuccess={(result) => {
                    setUploadSuccess(`Document '${result.fileName}' successfully uploaded and associated.`);
                    fetchDocuments();
                  }}
                />
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT METADATA MODAL */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Edit Document Metadata</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Title *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Number</label>
                <input
                  type="text"
                  value={editDocNumber}
                  onChange={(e) => setEditDocNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={editIssueDate}
                    onChange={(e) => setEditIssueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          documentUrl={previewDoc.fileUrl || `/api/storage/file/${encodeURIComponent(previewDoc.storagePath)}`}
          fileName={previewDoc.fileName}
          title={previewDoc.title}
          documentType={previewDoc.documentType}
          documentNumber={previewDoc.documentNumber}
          employeeName={employee.employeeName}
          employeeId={employee.employeeId}
          expiryDate={previewDoc.expiryDate}
          status={previewDoc.status}
          remarks={previewDoc.remarks}
          fileSize={previewDoc.fileSize}
        />
      )}

      {/* DOCUMENT LIFECYCLE & VERSION HISTORY MODAL */}
      {isDocHistoryOpen && (
        <DocumentHistoryModal
          isOpen={isDocHistoryOpen}
          onClose={() => setIsDocHistoryOpen(false)}
          employee={employee}
          initialCategory={historyCategory}
        />
      )}
    </div>
  );
};
