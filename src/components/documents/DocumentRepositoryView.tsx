import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FolderOpen,
  FileText,
  CreditCard,
  Globe,
  FileCheck,
  Car,
  Search,
  Filter,
  Download,
  Upload,
  RefreshCw,
  Eye,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Building,
  User,
  ShieldCheck,
  HardDrive,
  FileSpreadsheet,
  Plus,
  Layers,
  ChevronRight,
  Sparkles,
  ArrowUpDown,
  LayoutGrid,
  List,
  Check,
  X,
  FileBadge,
  Info,
} from 'lucide-react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ComplianceBadge } from '../compliance/ComplianceBadge';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { FileUploadComponent } from '../common/FileUploadComponent';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';
import type { Employee, EmployeeDocument, EmployeeDocumentCategory, DocumentExpiryStatus } from '../../types/index';

interface EnrichedDocument extends EmployeeDocument {
  employeeName?: string;
  employeeCompany?: string;
  department?: string;
  designation?: string;
  nationalityType?: string;
  employeeStatus?: string;
  daysRemaining?: number | null;
}

interface RepositoryStats {
  totalDocuments: number;
  byType: {
    passport: number;
    visa: number;
    civilId: number;
    drivingLicence: number;
    contract: number;
    other: number;
  };
  byStatus: {
    valid: number;
    expiringSoon: number;
    urgent: number;
    expired: number;
    permanent: number;
  };
  uniqueEmployeesWithDocs: number;
  totalActiveEmployees: number;
}

interface DocumentRepositoryViewProps {
  onNavigateToEmployee?: (employeeId: string) => void;
  initialFilters?: {
    employeeName?: string;
    documentType?: string;
    status?: string;
    company?: string;
  };
}

export const DocumentRepositoryView: React.FC<DocumentRepositoryViewProps> = ({
  onNavigateToEmployee,
  initialFilters,
}) => {
  const { canWrite, isAdmin, isManager, hasPermission } = useAuth();
  const canEdit = canWrite || isAdmin || isManager || hasPermission('compliance.edit');

  // Core Data States
  const [documents, setDocuments] = useState<EnrichedDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<RepositoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search States
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeNameSearch, setEmployeeNameSearch] = useState(initialFilters?.employeeName || '');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('ALL');
  const [selectedDocType, setSelectedDocType] = useState<string>(initialFilters?.documentType || 'ALL');
  const [selectedCompany, setSelectedCompany] = useState<string>(initialFilters?.company || 'ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>(initialFilters?.status || 'ALL');
  const [expiryStartDate, setExpiryStartDate] = useState<string>('');
  const [expiryEndDate, setExpiryEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'uploadedAt' | 'expiryDate' | 'daysRemaining' | 'employeeName' | 'documentType'>('uploadedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);

  // Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<EnrichedDocument | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);

  const handleOpenPreview = (doc: EnrichedDocument, index?: number) => {
    setPreviewDoc(doc);
    if (index !== undefined) {
      setPreviewIndex(index);
    } else {
      const idx = filteredDocuments.findIndex((d) => d.id === doc.id);
      setPreviewIndex(idx);
    }
  };

  // Drag & Drop Quick Upload State
  const [pageIsDragging, setPageIsDragging] = useState(false);
  const [uploadInitialFile, setUploadInitialFile] = useState<File | null>(null);
  const pageDragCounterRef = React.useRef(0);

  // Upload New Document Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadEmployeeId, setUploadEmployeeId] = useState('');
  const [uploadCategory, setUploadCategory] = useState<EmployeeDocumentCategory>('civil-id');
  const [uploadDocType, setUploadDocType] = useState('Civil ID');
  const [uploadDocNumber, setUploadDocNumber] = useState('');
  const [uploadIssueDate, setUploadIssueDate] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');
  const [uploadRemarks, setUploadRemarks] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Edit Metadata Modal State
  const [editingDoc, setEditingDoc] = useState<EnrichedDocument | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete Confirmation State
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Storage Health State
  const [storageEngine, setStorageEngine] = useState<string>('Object Storage');

  // Fetch initial documents and employee list
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [docsRes, empRes, storageRes] = await Promise.all([
        apiRequest('/api/storage/documents'),
        apiRequest('/api/employees'),
        apiRequest('/api/storage/status').catch(() => ({ engine: 'Object Storage' })),
      ]);

      setDocuments(docsRes.documents || []);
      setStats(docsRes.stats || null);
      setEmployees(empRes.employees || []);
      if (storageRes?.engine) {
        setStorageEngine(storageRes.engine);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load centralized document repository.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Distinct company list
  const companies = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.employeeCompany) set.add(e.employeeCompany);
    });
    return Array.from(set).sort();
  }, [employees]);

  // Distinct document types available in repository + standard compliance types
  const availableDocTypes = useMemo(() => {
    const set = new Set<string>();
    [
      'Civil ID',
      'Passport',
      'Employment Visa',
      'Driving Licence',
      'Employment Contract',
      'Labour Card',
      'Degree / Educational Certificate',
      'Medical Fitness Certificate',
      'Health Insurance Card',
      'Police Clearance Certificate',
      'Vehicle Registration (Mulkia)',
      'HSE Certificate',
      'Experience Certificate',
    ].forEach((t) => set.add(t));

    documents.forEach((d) => {
      if (d.documentType) set.add(d.documentType);
    });

    return Array.from(set).sort();
  }, [documents]);

  // Distinct employees with their document counts
  const availableEmployees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; company: string; count: number }>();
    documents.forEach((d) => {
      if (d.employeeId) {
        const existing = map.get(d.employeeId);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(d.employeeId, {
            id: d.employeeId,
            name: d.employeeName || d.employeeId,
            company: d.employeeCompany || '',
            count: 1,
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  // Handle Date Range Presets
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (preset === 'all') {
      setExpiryStartDate('');
      setExpiryEndDate('');
    } else if (preset === 'expired') {
      setExpiryStartDate('');
      setExpiryEndDate(todayStr);
    } else if (preset === 'next-30') {
      const next30 = new Date(today);
      next30.setDate(next30.getDate() + 30);
      setExpiryStartDate(todayStr);
      setExpiryEndDate(next30.toISOString().slice(0, 10));
    } else if (preset === 'next-60') {
      const next60 = new Date(today);
      next60.setDate(next60.getDate() + 60);
      setExpiryStartDate(todayStr);
      setExpiryEndDate(next60.toISOString().slice(0, 10));
    } else if (preset === 'next-90') {
      const next90 = new Date(today);
      next90.setDate(next90.getDate() + 90);
      setExpiryStartDate(todayStr);
      setExpiryEndDate(next90.toISOString().slice(0, 10));
    } else if (preset === 'this-year') {
      const year = today.getFullYear();
      setExpiryStartDate(`${year}-01-01`);
      setExpiryEndDate(`${year}-12-31`);
    }
  };

  // Reset / Clear all filters
  const handleClearAllFilters = () => {
    setSearchQuery('');
    setEmployeeNameSearch('');
    setSelectedEmployeeId('ALL');
    setSelectedDocType('ALL');
    setSelectedCompany('ALL');
    setSelectedStatus('ALL');
    setExpiryStartDate('');
    setExpiryEndDate('');
    setDatePreset('all');
    setActiveCategory('ALL');
  };

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (employeeNameSearch.trim()) count++;
    if (selectedEmployeeId !== 'ALL') count++;
    if (selectedDocType !== 'ALL') count++;
    if (selectedCompany !== 'ALL') count++;
    if (selectedStatus !== 'ALL') count++;
    if (expiryStartDate || expiryEndDate) count++;
    if (activeCategory !== 'ALL') count++;
    return count;
  }, [
    searchQuery,
    employeeNameSearch,
    selectedEmployeeId,
    selectedDocType,
    selectedCompany,
    selectedStatus,
    expiryStartDate,
    expiryEndDate,
    activeCategory,
  ]);

  // Handle category category changes with automatic document type presets
  const handleCategoryTabChange = (cat: string) => {
    setActiveCategory(cat);
  };

  // Filtered and Sorted Documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // 1. Category Filter
      if (activeCategory !== 'ALL') {
        if (activeCategory === 'civil-id') {
          if (doc.category !== 'civil-id' && !doc.documentType?.toLowerCase().includes('civil')) return false;
        } else if (activeCategory === 'passport') {
          if (doc.category !== 'passport' && !doc.documentType?.toLowerCase().includes('passport')) return false;
        } else if (activeCategory === 'visa') {
          if (doc.category !== 'visa' && !doc.documentType?.toLowerCase().includes('visa')) return false;
        } else if (activeCategory === 'driving-licence') {
          if (doc.category !== 'driving-licence' && !doc.documentType?.toLowerCase().includes('driving')) return false;
        } else if (activeCategory === 'contract') {
          if (doc.category !== 'contract' && !doc.documentType?.toLowerCase().includes('contract')) return false;
        } else if (doc.category !== activeCategory) {
          return false;
        }
      }

      // 2. Employee Selection Filter
      if (selectedEmployeeId !== 'ALL' && doc.employeeId !== selectedEmployeeId) {
        return false;
      }

      // 3. Employee Name / ID Search Filter
      if (employeeNameSearch.trim()) {
        const empQ = employeeNameSearch.toLowerCase().trim();
        const matchName = doc.employeeName?.toLowerCase().includes(empQ);
        const matchId = doc.employeeId?.toLowerCase().includes(empQ);
        if (!matchName && !matchId) {
          return false;
        }
      }

      // 4. Document Type Filter
      if (selectedDocType !== 'ALL') {
        const docTypeLower = (doc.documentType || '').toLowerCase();
        const selectedTypeLower = selectedDocType.toLowerCase();
        if (
          docTypeLower !== selectedTypeLower &&
          !docTypeLower.includes(selectedTypeLower) &&
          !selectedTypeLower.includes(docTypeLower)
        ) {
          return false;
        }
      }

      // 5. Expiration Date Range Filter
      if (expiryStartDate) {
        if (!doc.expiryDate) return false;
        // doc.expiryDate is in YYYY-MM-DD format
        const docExpStr = doc.expiryDate.slice(0, 10);
        if (docExpStr < expiryStartDate) return false;
      }
      if (expiryEndDate) {
        if (!doc.expiryDate) return false;
        const docExpStr = doc.expiryDate.slice(0, 10);
        if (docExpStr > expiryEndDate) return false;
      }

      // 6. Company Filter
      if (selectedCompany !== 'ALL' && doc.employeeCompany !== selectedCompany) {
        return false;
      }

      // 7. Status Filter
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'Expiring') {
          if (doc.status !== 'Expiring Soon' && doc.status !== 'Urgent') return false;
        } else if (doc.status !== selectedStatus) {
          return false;
        }
      }

      // 8. General Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = doc.title?.toLowerCase().includes(q);
        const matchDocType = doc.documentType?.toLowerCase().includes(q);
        const matchDocNum = doc.documentNumber?.toLowerCase().includes(q);
        const matchFileName = doc.fileName?.toLowerCase().includes(q);
        const matchEmpId = doc.employeeId?.toLowerCase().includes(q);
        const matchEmpName = doc.employeeName?.toLowerCase().includes(q);
        const matchCompany = doc.employeeCompany?.toLowerCase().includes(q);
        const matchRemarks = doc.remarks?.toLowerCase().includes(q);

        if (
          !matchTitle &&
          !matchDocType &&
          !matchDocNum &&
          !matchFileName &&
          !matchEmpId &&
          !matchEmpName &&
          !matchCompany &&
          !matchRemarks
        ) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'expiryDate') {
        const dateA = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const dateB = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (sortBy === 'daysRemaining') {
        const daysA = a.daysRemaining !== null && a.daysRemaining !== undefined ? a.daysRemaining : 999999;
        const daysB = b.daysRemaining !== null && b.daysRemaining !== undefined ? b.daysRemaining : 999999;
        return sortOrder === 'asc' ? daysA - daysB : daysB - daysA;
      }
      if (sortBy === 'employeeName') {
        return sortOrder === 'asc'
          ? (a.employeeName || '').localeCompare(b.employeeName || '')
          : (b.employeeName || '').localeCompare(a.employeeName || '');
      }
      if (sortBy === 'documentType') {
        return sortOrder === 'asc'
          ? (a.documentType || '').localeCompare(b.documentType || '')
          : (b.documentType || '').localeCompare(a.documentType || '');
      }
      const timeA = new Date(a.uploadedAt || 0).getTime();
      const timeB = new Date(b.uploadedAt || 0).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [
    documents,
    activeCategory,
    selectedEmployeeId,
    employeeNameSearch,
    selectedDocType,
    expiryStartDate,
    expiryEndDate,
    selectedCompany,
    selectedStatus,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  // Category Tabs definitions with live counts
  const categoryTabs = useMemo(() => [
    {
      id: 'ALL',
      label: 'All Documents',
      icon: Layers,
      count: documents.length,
      color: 'text-slate-700 bg-slate-100',
    },
    {
      id: 'civil-id',
      label: 'Civil IDs / Resident Cards',
      icon: CreditCard,
      count: documents.filter((d) => d.category === 'civil-id' || d.documentType?.toLowerCase().includes('civil')).length,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
    },
    {
      id: 'passport',
      label: 'Passports',
      icon: Globe,
      count: documents.filter((d) => d.category === 'passport' || d.documentType?.toLowerCase().includes('passport')).length,
      color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    },
    {
      id: 'visa',
      label: 'Employment Visas',
      icon: FileCheck,
      count: documents.filter((d) => d.category === 'visa' || d.documentType?.toLowerCase().includes('visa')).length,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    },
    {
      id: 'driving-licence',
      label: 'Driving Licences',
      icon: Car,
      count: documents.filter((d) => d.category === 'driving-licence' || d.documentType?.toLowerCase().includes('driving')).length,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
    },
    {
      id: 'contract',
      label: 'Employment Contracts',
      icon: FileText,
      count: documents.filter((d) => d.category === 'contract' || d.documentType?.toLowerCase().includes('contract')).length,
      color: 'text-purple-700 bg-purple-50 border-purple-200',
    },
  ], [documents]);

  // Format File Size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Helper for Expiry Countdown Chip
  const renderExpiryCountdown = (doc: EnrichedDocument) => {
    if (!doc.expiryDate) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
          Permanent / No Expiry
        </span>
      );
    }

    const days = doc.daysRemaining;
    if (days === null || days === undefined) {
      return <ComplianceBadge status={doc.status || 'Valid'} />;
    }

    if (days < 0) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
            <AlertOctagon size={12} /> Expired {Math.abs(days)}d ago
          </span>
        </div>
      );
    }

    if (days <= 30) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-300 px-2 py-0.5 rounded-md animate-pulse">
            <AlertTriangle size={12} /> {days} days left (Urgent)
          </span>
        </div>
      );
    }

    if (days <= 60) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            <Clock size={12} /> {days} days left
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
          <CheckCircle2 size={12} /> Valid ({days}d)
        </span>
      </div>
    );
  };

  // Handle Export to Excel
  const exportToExcel = () => {
    if (filteredDocuments.length === 0) return;

    const data = filteredDocuments.map((doc, idx) => ({
      '#': idx + 1,
      'Employee ID': doc.employeeId,
      'Employee Name': doc.employeeName || '',
      'Company': doc.employeeCompany || '',
      'Department': doc.department || '',
      'Designation': doc.designation || '',
      'Document Category': doc.category,
      'Document Type': doc.documentType,
      'Document / Reference Number': doc.documentNumber || '',
      'File Name': doc.fileName,
      'File Size': formatFileSize(doc.fileSize),
      'Issue Date': doc.issueDate ? formatDate(doc.issueDate) : '',
      'Expiry Date': doc.expiryDate ? formatDate(doc.expiryDate) : 'Permanent / N/A',
      'Days Remaining': doc.daysRemaining !== null && doc.daysRemaining !== undefined ? doc.daysRemaining : 'N/A',
      'Expiry Status': doc.status || (doc.expiryDate ? 'Valid' : 'Permanent'),
      'Uploaded By': doc.uploadedBy || 'Admin',
      'Uploaded Date': doc.uploadedAt ? formatDate(doc.uploadedAt) : '',
      'Remarks': doc.remarks || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Document Repository');
    XLSX.writeFile(
      wb,
      `HCMS_Document_Repository_${activeCategory.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  // Handle Delete Document
  const handleDeleteDocument = async (docId: string) => {
    try {
      setLoading(true);
      await apiRequest(`/api/storage/documents/${docId}`, { method: 'DELETE' });
      setDeletingDocId(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete document.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Edited Metadata
  const handleSaveMetadata = async () => {
    if (!editingDoc) return;
    try {
      setEditSaving(true);
      await apiRequest(`/api/storage/documents/${editingDoc.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle,
          documentNumber: editDocNumber,
          issueDate: editIssueDate || undefined,
          expiryDate: editExpiryDate || undefined,
          remarks: editRemarks,
        }),
      });
      setEditingDoc(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update document metadata.');
    } finally {
      setEditSaving(false);
    }
  };

  // Handle Download File Directly
  const handleDownload = (doc: EnrichedDocument) => {
    if (!doc.fileUrl) return;
    const link = document.createElement('a');
    link.href = doc.fileUrl;
    link.download = doc.fileName || `${doc.documentType}_${doc.employeeId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Icon selector by document category
  const getCategoryIcon = (category: string, docType?: string) => {
    const lower = (docType || category).toLowerCase();
    if (lower.includes('civil')) return <CreditCard className="text-blue-600" size={16} />;
    if (lower.includes('passport')) return <Globe className="text-indigo-600" size={16} />;
    if (lower.includes('visa')) return <FileCheck className="text-emerald-600" size={16} />;
    if (lower.includes('driving')) return <Car className="text-amber-600" size={16} />;
    if (lower.includes('contract')) return <FileText className="text-purple-600" size={16} />;
    return <FileBadge className="text-slate-600" size={16} />;
  };

  // Helper to intelligently detect document category & type from filename
  const detectMetadataFromFileName = (fileName: string) => {
    const nameLower = fileName.toLowerCase();
    let detectedCat: EmployeeDocumentCategory = 'civil-id';
    let detectedType = 'Civil ID';

    if (nameLower.includes('passport')) {
      detectedCat = 'passport';
      detectedType = 'Passport';
    } else if (nameLower.includes('visa') || nameLower.includes('resident')) {
      detectedCat = 'visa';
      detectedType = 'Employment Visa';
    } else if (nameLower.includes('driving') || nameLower.includes('licence') || nameLower.includes('license') || nameLower.includes('mulkia')) {
      detectedCat = 'driving-licence';
      detectedType = 'Driving Licence';
    } else if (nameLower.includes('contract') || nameLower.includes('offer') || nameLower.includes('agreement')) {
      detectedCat = 'contract';
      detectedType = 'Employment Contract';
    } else if (nameLower.includes('civil') || nameLower.includes('id') || nameLower.includes('national')) {
      detectedCat = 'civil-id';
      detectedType = 'Civil ID';
    } else {
      detectedCat = 'general';
      detectedType = 'General Document';
    }

    // Check if filename contains an employee ID (e.g. EMP001, EMP-002, 001)
    const empMatch = employees.find((emp) =>
      nameLower.includes(emp.employeeId.toLowerCase()) ||
      nameLower.includes(emp.employeeName.toLowerCase())
    );

    return {
      category: detectedCat,
      documentType: detectedType,
      employeeId: empMatch ? empMatch.employeeId : (employees[0]?.employeeId || ''),
    };
  };

  // Page-level drag and drop handlers
  const handlePageDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pageDragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setPageIsDragging(true);
    }
  };

  const handlePageDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!pageIsDragging) {
      setPageIsDragging(true);
    }
  };

  const handlePageDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pageDragCounterRef.current -= 1;
    if (pageDragCounterRef.current <= 0) {
      pageDragCounterRef.current = 0;
      setPageIsDragging(false);
    }
  };

  const handlePageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pageDragCounterRef.current = 0;
    setPageIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      const detected = detectMetadataFromFileName(droppedFile.name);
      setUploadEmployeeId(detected.employeeId);
      setUploadCategory(detected.category);
      setUploadDocType(detected.documentType);
      setUploadDocNumber('');
      setUploadIssueDate('');
      setUploadExpiryDate('');
      setUploadRemarks(`Uploaded via drag-and-drop (${droppedFile.name})`);
      setUploadInitialFile(droppedFile);
      setIsUploadModalOpen(true);
    }
  };

  return (
    <div
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
      className="relative space-y-6 pb-12"
    >
      {/* PAGE DRAG & DROP OVERLAY */}
      {pageIsDragging && (
        <div className="fixed inset-0 z-50 bg-indigo-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white animate-in fade-in duration-200">
          <div className="w-24 h-24 rounded-3xl bg-indigo-600/90 border-2 border-indigo-400 text-white flex items-center justify-center mb-5 shadow-2xl shadow-indigo-500/50 scale-110 animate-bounce">
            <Upload size={48} />
          </div>
          <h2 className="text-2xl font-black tracking-tight">Drop Statutory Document to Upload</h2>
          <p className="text-sm text-indigo-200 mt-2 max-w-md text-center">
            Release your file anywhere to automatically detect document classification and upload to the Central Repository.
          </p>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold bg-indigo-900/80 px-4 py-2 rounded-full border border-indigo-700/50">
            <Sparkles size={14} className="text-amber-400" />
            <span>Accepts PDF, JPG, PNG, WEBP, DOCX up to 15MB</span>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER & KPI METRICS BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
              <FolderOpen size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Central Document Repository
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <ShieldCheck size={13} /> {storageEngine}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Unified corporate object repository for Passports, Employment Visas, Civil IDs, Driving Licences &amp; contracts with live expiry tracking and automated compliance alerts.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Refresh Repository"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={exportToExcel}
              disabled={filteredDocuments.length === 0}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" />
              <span>Export ({filteredDocuments.length})</span>
            </button>

            {canEdit && (
              <button
                onClick={() => {
                  setUploadEmployeeId(employees[0]?.employeeId || '');
                  setIsUploadModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Plus size={15} />
                <span>Upload Document</span>
              </button>
            )}
          </div>
        </div>

        {/* STATS HIGHLIGHT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          {/* Card 1: Total Documents */}
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">Total Archive</span>
              <Layers size={15} className="text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-slate-900 font-mono">
                {stats?.totalDocuments ?? documents.length}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {stats?.uniqueEmployeesWithDocs ?? 0} Emps
              </span>
            </div>
          </div>

          {/* Card 2: Civil IDs */}
          <div
            onClick={() => setActiveCategory('civil-id')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeCategory === 'civil-id'
                ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20'
                : 'bg-slate-50/80 border-slate-200/80 hover:border-blue-200 hover:bg-blue-50/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-900">Civil IDs</span>
              <CreditCard size={15} className="text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-blue-950 font-mono">
                {stats?.byType.civilId ?? 0}
              </span>
              <span className="text-[10px] text-blue-700 font-medium">ROP Cards</span>
            </div>
          </div>

          {/* Card 3: Passports */}
          <div
            onClick={() => setActiveCategory('passport')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeCategory === 'passport'
                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20'
                : 'bg-slate-50/80 border-slate-200/80 hover:border-indigo-200 hover:bg-indigo-50/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-indigo-900">Passports</span>
              <Globe size={15} className="text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-indigo-950 font-mono">
                {stats?.byType.passport ?? 0}
              </span>
              <span className="text-[10px] text-indigo-700 font-medium">Bio-Data</span>
            </div>
          </div>

          {/* Card 4: Employment Visas */}
          <div
            onClick={() => setActiveCategory('visa')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeCategory === 'visa'
                ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20'
                : 'bg-slate-50/80 border-slate-200/80 hover:border-emerald-200 hover:bg-emerald-50/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-900">Employment Visas</span>
              <FileCheck size={15} className="text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-emerald-950 font-mono">
                {stats?.byType.visa ?? 0}
              </span>
              <span className="text-[10px] text-emerald-700 font-medium">ROP Visas</span>
            </div>
          </div>

          {/* Card 5: Driving Licences */}
          <div
            onClick={() => setActiveCategory('driving-licence')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeCategory === 'driving-licence'
                ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/20'
                : 'bg-slate-50/80 border-slate-200/80 hover:border-amber-200 hover:bg-amber-50/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-900">Driving Licences</span>
              <Car size={15} className="text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-amber-950 font-mono">
                {stats?.byType.drivingLicence ?? 0}
              </span>
              <span className="text-[10px] text-amber-700 font-medium">Fleet Operators</span>
            </div>
          </div>

          {/* Card 6: Expiry Attention Required */}
          <div
            onClick={() => {
              setSelectedStatus('Expiring');
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              selectedStatus === 'Expiring'
                ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/20'
                : 'bg-slate-50/80 border-slate-200/80 hover:border-rose-200 hover:bg-rose-50/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-900">Expiry Action</span>
              <AlertTriangle size={15} className="text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-rose-700 font-mono">
                {(stats?.byStatus.expired ?? 0) + (stats?.byStatus.urgent ?? 0)}
              </span>
              <span className="text-[10px] text-rose-600 font-medium font-bold">
                {stats?.byStatus.expired ?? 0} Expired
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. QUICK DRAG-AND-DROP INGESTION BAR & CATEGORY TABS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        {/* Quick Drop Zone Banner */}
        {canEdit && (
          <div
            onClick={() => {
              setUploadEmployeeId(employees[0]?.employeeId || '');
              setUploadInitialFile(null);
              setIsUploadModalOpen(true);
            }}
            className="group relative flex items-center justify-between p-3.5 bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-slate-50 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl cursor-pointer transition-all hover:shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <Upload size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <span>Quick Document Ingestion &amp; Drag-and-Drop</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    Live Dropzone
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Drag any employee Civil ID, Passport, Visa, Licence, or Contract onto this screen to auto-classify and archive.
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-[11px] font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 shadow-2xs group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                Upload Document
              </span>
            </div>
          </div>
        )}

        {/* Category Navigation Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-100 scrollbar-none">
          {categoryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleCategoryTabChange(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-white' : 'text-slate-500'} />
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-slate-800 text-slate-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* FILTER BAR CONTAINER */}
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-4 space-y-3.5">
          {/* Filter Bar Header & Quick Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/60">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
                <Filter size={15} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">Filter Bar &amp; Deep Search</span>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-600 text-white animate-pulse">
                      {activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Search by employee name, filter document types, or isolate expiration date ranges
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                <ArrowUpDown size={12} className="text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="text-xs font-medium text-slate-700 bg-transparent border-none focus:outline-hidden pr-2 cursor-pointer"
                >
                  <option value="uploadedAt">Upload Date</option>
                  <option value="expiryDate">Expiry Date</option>
                  <option value="daysRemaining">Days Remaining</option>
                  <option value="employeeName">Employee Name</option>
                  <option value="documentType">Document Type</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-900 px-1 transition-colors"
                  title="Toggle Ascending/Descending"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-white shadow-2xs">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'table' ? 'bg-indigo-50 text-indigo-700 shadow-2xs font-semibold' : 'text-slate-400 hover:text-slate-700'
                  }`}
                  title="Table View"
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'grid' ? 'bg-indigo-50 text-indigo-700 shadow-2xs font-semibold' : 'text-slate-400 hover:text-slate-700'
                  }`}
                  title="Grid / Card View"
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Core Filter Inputs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {/* Filter 1: Employee Name Search */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <User size={12} className="text-indigo-600" />
                <span>Search by Employee Name / ID</span>
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="e.g. Ahmed, Salim, EMP001..."
                  value={employeeNameSearch}
                  onChange={(e) => setEmployeeNameSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-hidden"
                />
                {employeeNameSearch && (
                  <button
                    onClick={() => setEmployeeNameSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {/* Optional Quick Select Employee Dropdown */}
              {availableEmployees.length > 0 && (
                <div className="pt-0.5">
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg py-1 px-2 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="ALL">Select from Employee List ({availableEmployees.length})</option>
                    {availableEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.id}) — {emp.count} doc{emp.count > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Filter 2: Document Type Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText size={12} className="text-indigo-600" />
                <span>Document Type</span>
              </label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Document Types</option>
                {availableDocTypes.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>

              {/* Company Filter Secondary */}
              <div className="pt-0.5">
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="w-full text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg py-1 px-2 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">All Companies / Business Units</option>
                  {companies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter 3: Expiration Date Range */}
            <div className="space-y-1 lg:col-span-2 xl:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar size={12} className="text-indigo-600" />
                  <span>Expiration Date Range</span>
                </label>
                {(expiryStartDate || expiryEndDate) && (
                  <button
                    onClick={() => {
                      setExpiryStartDate('');
                      setExpiryEndDate('');
                      setDatePreset('all');
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                  >
                    Reset Dates
                  </button>
                )}
              </div>

              {/* Date Inputs: From Date to To Date */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">From:</span>
                  <input
                    type="date"
                    value={expiryStartDate}
                    onChange={(e) => {
                      setExpiryStartDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="w-full pl-11 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">To:</span>
                  <input
                    type="date"
                    value={expiryEndDate}
                    onChange={(e) => {
                      setExpiryEndDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Quick Date Range Preset Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-400 font-medium mr-0.5">Presets:</span>
                {[
                  { id: 'all', label: 'All Dates' },
                  { id: 'next-30', label: '≤30 Days (Urgent)' },
                  { id: 'next-60', label: '≤60 Days' },
                  { id: 'next-90', label: '≤90 Days' },
                  { id: 'expired', label: 'Expired' },
                  { id: 'this-year', label: 'This Year' },
                ].map((p) => {
                  const isSelected = datePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleDatePresetChange(p.id)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Secondary Controls: Universal Keyword Search & Expiry Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-200/50">
            {/* Universal Keyword Search */}
            <div className="md:col-span-2 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Universal keyword search (doc number, filename, remarks, metadata)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Expiry Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Expiry Statuses</option>
                <option value="Valid">Valid &amp; Compliant</option>
                <option value="Expiring Soon">Expiring Soon (31-60d)</option>
                <option value="Urgent">Urgent (≤30d)</option>
                <option value="Expired">Expired</option>
                <option value="Permanent">Permanent / Lifetime</option>
              </select>
            </div>
          </div>

          {/* Active Filter Badges & Results Feedback Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 mr-1">Active Criteria:</span>

              {activeFilterCount === 0 && (
                <span className="text-[11px] text-slate-400 italic">No filters active (Showing all records)</span>
              )}

              {/* Employee Name Filter Chip */}
              {employeeNameSearch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  <User size={10} /> Name: "{employeeNameSearch}"
                  <button onClick={() => setEmployeeNameSearch('')} className="hover:text-indigo-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Selected Employee ID Chip */}
              {selectedEmployeeId !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  <User size={10} /> Emp: {selectedEmployeeId}
                  <button onClick={() => setSelectedEmployeeId('ALL')} className="hover:text-indigo-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Document Type Chip */}
              {selectedDocType !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                  <FileText size={10} /> Type: {selectedDocType}
                  <button onClick={() => setSelectedDocType('ALL')} className="hover:text-blue-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Expiration Date Range Chip */}
              {(expiryStartDate || expiryEndDate) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  <Calendar size={10} /> Expiry: {expiryStartDate ? formatDate(expiryStartDate) : 'Start'} → {expiryEndDate ? formatDate(expiryEndDate) : 'Future'}
                  <button
                    onClick={() => {
                      setExpiryStartDate('');
                      setExpiryEndDate('');
                      setDatePreset('all');
                    }}
                    className="hover:text-amber-950 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Company Chip */}
              {selectedCompany !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-800">
                  <Building size={10} /> Company: {selectedCompany}
                  <button onClick={() => setSelectedCompany('ALL')} className="hover:text-slate-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Status Chip */}
              {selectedStatus !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                  <Clock size={10} /> Status: {selectedStatus}
                  <button onClick={() => setSelectedStatus('ALL')} className="hover:text-orange-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Category Tab Chip */}
              {activeCategory !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  <Layers size={10} /> Category: {activeCategory}
                  <button onClick={() => setActiveCategory('ALL')} className="hover:text-purple-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Universal Search Chip */}
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Search size={10} /> "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="hover:text-emerald-950 cursor-pointer">
                    <X size={11} />
                  </button>
                </span>
              )}

              {/* Reset All Button */}
              {activeFilterCount > 0 && (
                <button
                  onClick={handleClearAllFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 px-2 py-0.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors cursor-pointer ml-1"
                >
                  <Trash2 size={11} /> Clear All Filters
                </button>
              )}
            </div>

            {/* Results Counter Pill */}
            <div className="text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
              Showing <span className="font-bold text-indigo-600">{filteredDocuments.length}</span> of <span className="font-bold text-slate-900">{documents.length}</span> documents
            </div>
          </div>
        </div>
      </div>

      {/* 3. MAIN DOCUMENTS LISTING */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Loading Central Document Archive...</p>
          <p className="text-xs text-slate-400 mt-1">Retrieving file records, signatures &amp; expiry states</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <FolderOpen size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Documents Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            {activeFilterCount > 0
              ? 'No documents matched your filter criteria (Employee Name, Document Type, or Expiration Date Range). Try clearing or adjusting the filters.'
              : 'No statutory documents or file copies have been uploaded to the repository yet.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {activeFilterCount > 0 && (
              <button
                onClick={handleClearAllFilters}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={13} /> Reset Filter Bar
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => {
                  setUploadEmployeeId(employees[0]?.employeeId || '');
                  setIsUploadModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus size={14} /> Upload New Document
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Document Type &amp; Reference</th>
                  <th className="py-3 px-4">File Name &amp; Size</th>
                  <th className="py-3 px-4">Issue / Expiry Date</th>
                  <th className="py-3 px-4">Expiry Status</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredDocuments.map((doc, index) => {
                  const isExpired = doc.status === 'Expired';
                  const isUrgent = doc.status === 'Urgent';

                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isExpired ? 'bg-rose-50/20' : isUrgent ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Employee Column */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-slate-200">
                            {doc.employeeName ? doc.employeeName.charAt(0) : 'E'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenPreview(doc, index)}
                                className="font-bold text-slate-900 hover:text-indigo-600 transition-colors text-left cursor-pointer"
                                title="Quick View Document"
                              >
                                {doc.employeeName}
                              </button>
                              <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md">
                                {doc.employeeId}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {doc.employeeCompany} • {doc.designation || 'Staff'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Document Type & Reference */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(doc, index)}
                            className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 hover:bg-indigo-50 hover:border-indigo-300 transition-colors cursor-pointer"
                            title="Quick View Document"
                          >
                            {getCategoryIcon(doc.category, doc.documentType)}
                          </button>
                          <div>
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(doc, index)}
                              className="font-bold text-slate-800 block text-left hover:text-indigo-600 transition-colors cursor-pointer"
                              title="Quick View Document"
                            >
                              {doc.documentType || doc.title}
                            </button>
                            {doc.documentNumber ? (
                              <span className="text-[11px] font-mono font-semibold text-slate-600">
                                Ref: {doc.documentNumber}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">No ref #</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* File Name & Format */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(doc, index)}
                          className="flex items-center gap-1.5 text-left group cursor-pointer"
                          title="Quick View Document"
                        >
                          <FileText size={13} className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                          <span className="font-medium text-slate-700 group-hover:text-indigo-600 transition-colors truncate max-w-[160px]" title={doc.fileName}>
                            {doc.fileName}
                          </span>
                        </button>
                        <span className="text-[10px] text-slate-400">
                          {formatFileSize(doc.fileSize)}
                        </span>
                      </td>

                      {/* Issue & Expiry Dates */}
                      <td className="py-3 px-4">
                        {doc.expiryDate ? (
                          <div>
                            <span className="font-semibold text-slate-800 block">
                              {formatDate(doc.expiryDate)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Issued: {doc.issueDate ? formatDate(doc.issueDate) : '—'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-medium text-[11px]">
                            Permanent / Lifetime
                          </span>
                        )}
                      </td>

                      {/* Expiry Status Indicator */}
                      <td className="py-3 px-4">
                        {renderExpiryCountdown(doc)}
                      </td>

                      {/* Upload Date & User */}
                      <td className="py-3 px-4 text-[11px] text-slate-500">
                        <span>{doc.uploadedAt ? formatDate(doc.uploadedAt) : '—'}</span>
                        <span className="block text-[10px] text-slate-400 truncate max-w-[100px]">
                          by {doc.uploadedBy || 'admin'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenPreview(doc, index)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Quick-View Document"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Download File"
                          >
                            <Download size={15} />
                          </button>

                          {canEdit && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingDoc(doc);
                                  setEditTitle(doc.title || '');
                                  setEditDocNumber(doc.documentNumber || '');
                                  setEditIssueDate(doc.issueDate || '');
                                  setEditExpiryDate(doc.expiryDate || '');
                                  setEditRemarks(doc.remarks || '');
                                }}
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Metadata"
                              >
                                <Edit2 size={15} />
                              </button>

                              {!doc.id.startsWith('cid_') &&
                                !doc.id.startsWith('visa_') &&
                                !doc.id.startsWith('gov_') &&
                                !doc.id.startsWith('dl_') && (
                                  <button
                                    onClick={() => setDeletingDocId(doc.id)}
                                    className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Delete Document"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50/60 border-t border-slate-100 px-4 py-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing <strong>{filteredDocuments.length}</strong> of <strong>{documents.length}</strong> archived records
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Valid
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Expiring Soon (&lt;60d)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Expired
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* GRID / CARD VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDocuments.map((doc, index) => {
            const isExpired = doc.status === 'Expired';
            const isUrgent = doc.status === 'Urgent';

            return (
              <div
                key={doc.id}
                className={`bg-white rounded-2xl border transition-all hover:shadow-md p-4 flex flex-col justify-between ${
                  isExpired
                    ? 'border-rose-200 bg-rose-50/10 ring-1 ring-rose-500/20'
                    : isUrgent
                    ? 'border-amber-200 bg-amber-50/10'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  {/* Top Header Card */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(doc, index)}
                        className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 hover:bg-indigo-50 hover:border-indigo-300 transition-colors cursor-pointer"
                        title="Quick View Document"
                      >
                        {getCategoryIcon(doc.category, doc.documentType)}
                      </button>
                      <div>
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(doc, index)}
                          className="text-xs font-bold text-slate-900 truncate max-w-[140px] block text-left hover:text-indigo-600 transition-colors cursor-pointer"
                          title={doc.documentType || doc.title}
                        >
                          {doc.documentType || doc.title}
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {doc.documentNumber ? `Ref: ${doc.documentNumber}` : 'No ref #'}
                        </span>
                      </div>
                    </div>
                    {renderExpiryCountdown(doc)}
                  </div>

                  {/* Employee Details */}
                  <div className="space-y-1.5 mb-3 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100 text-[11px]">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(doc, index)}
                        className="font-bold text-slate-800 truncate max-w-[130px] text-left hover:text-indigo-600 cursor-pointer"
                        title={doc.employeeName}
                      >
                        {doc.employeeName}
                      </button>
                      <span className="font-mono font-semibold text-slate-500">
                        {doc.employeeId}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">
                      {doc.employeeCompany} • {doc.designation || 'Staff'}
                    </p>
                  </div>

                  {/* Dates & File Meta */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Issue Date</span>
                      <span className="font-medium text-slate-700">
                        {doc.issueDate ? formatDate(doc.issueDate) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Expiry Date</span>
                      <span className="font-bold text-slate-900">
                        {doc.expiryDate ? formatDate(doc.expiryDate) : 'Permanent'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(doc, index)}
                      className="truncate max-w-[140px] text-left hover:text-indigo-600 cursor-pointer"
                      title={doc.fileName}
                    >
                      {doc.fileName}
                    </button>
                    <span>{formatFileSize(doc.fileSize)}</span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    {doc.uploadedAt ? formatDate(doc.uploadedAt) : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenPreview(doc, index)}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Quick View Document"
                    >
                      <Eye size={13} /> View
                    </button>

                    <button
                      onClick={() => handleDownload(doc)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>

                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingDoc(doc);
                          setEditTitle(doc.title || '');
                          setEditDocNumber(doc.documentNumber || '');
                          setEditIssueDate(doc.issueDate || '');
                          setEditExpiryDate(doc.expiryDate || '');
                          setEditRemarks(doc.remarks || '');
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Metadata"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MODALS & DIALOGS */}

      {/* A) PREVIEW MODAL */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => {
            setPreviewDoc(null);
            setPreviewIndex(-1);
          }}
          documentUrl={
            previewDoc.fileUrl ||
            (previewDoc.storagePath ? `/api/storage/file/${encodeURIComponent(previewDoc.storagePath)}` : null)
          }
          fileName={previewDoc.fileName}
          title={previewDoc.title || `${previewDoc.documentType} - ${previewDoc.employeeName}`}
          documentType={previewDoc.documentType}
          category={previewDoc.category}
          documentNumber={previewDoc.documentNumber}
          employeeName={previewDoc.employeeName}
          employeeId={previewDoc.employeeId}
          employeeCompany={previewDoc.employeeCompany}
          department={previewDoc.department}
          designation={previewDoc.designation}
          issueDate={previewDoc.issueDate}
          expiryDate={previewDoc.expiryDate}
          daysRemaining={previewDoc.daysRemaining}
          status={previewDoc.status as DocumentExpiryStatus}
          remarks={previewDoc.remarks}
          fileSize={previewDoc.fileSize}
          mimeType={previewDoc.mimeType}
          uploadedAt={previewDoc.uploadedAt}
          uploadedBy={previewDoc.uploadedBy}
          documentsList={filteredDocuments}
          currentIndex={
            previewIndex >= 0
              ? previewIndex
              : filteredDocuments.findIndex((d) => d.id === previewDoc.id)
          }
          onNavigateIndex={(newIdx) => {
            if (newIdx >= 0 && newIdx < filteredDocuments.length) {
              setPreviewIndex(newIdx);
              setPreviewDoc(filteredDocuments[newIdx]);
            }
          }}
        />
      )}

      {/* B) UPLOAD NEW DOCUMENT MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Upload size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Upload to Document Repository</h3>
                  <p className="text-[11px] text-slate-500">Encrypt and store official employee statutory document</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadInitialFile(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Employee Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Select Employee <span className="text-rose-500">*</span>
                </label>
                <SearchableEmployeeSelect
                  employees={employees}
                  value={uploadEmployeeId}
                  onChange={(empId) => setUploadEmployeeId(empId)}
                  placeholder="Search & Select Employee..."
                  width="w-full"
                  required
                />
              </div>

              {/* Category & Document Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Document Category
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => {
                      const cat = e.target.value as EmployeeDocumentCategory;
                      setUploadCategory(cat);
                      if (cat === 'civil-id') setUploadDocType('Civil ID');
                      else if (cat === 'passport') setUploadDocType('Passport');
                      else if (cat === 'visa') setUploadDocType('Employment Visa');
                      else if (cat === 'driving-licence') setUploadDocType('Driving Licence');
                      else if (cat === 'contract') setUploadDocType('Employment Contract');
                      else setUploadDocType('General Document');
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white"
                  >
                    <option value="civil-id">Civil ID / Resident Card</option>
                    <option value="passport">Passport Copy</option>
                    <option value="visa">Employment Visa</option>
                    <option value="driving-licence">Driving Licence</option>
                    <option value="contract">Employment Contract</option>
                    <option value="general">General / Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Document Reference #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 12345678 or DL-99"
                    value={uploadDocNumber}
                    onChange={(e) => setUploadDocNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50 font-mono"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={uploadIssueDate}
                    onChange={(e) => setUploadIssueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={uploadExpiryDate}
                    onChange={(e) => setUploadExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Notes &amp; Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Renewed copy, Royal Oman Police clearance"
                  value={uploadRemarks}
                  onChange={(e) => setUploadRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                />
              </div>

              {/* Upload Dropzone */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Attach File (PDF, JPG, PNG) <span className="text-rose-500">*</span>
                </label>
                <FileUploadComponent
                  employeeId={uploadEmployeeId}
                  employeeName={employees.find((e) => e.employeeId === uploadEmployeeId)?.employeeName || ''}
                  category={uploadCategory}
                  documentType={uploadDocType}
                  title={`${uploadDocType} - ${employees.find((e) => e.employeeId === uploadEmployeeId)?.employeeName || uploadEmployeeId}`}
                  documentNumber={uploadDocNumber}
                  issueDate={uploadIssueDate}
                  expiryDate={uploadExpiryDate}
                  remarks={uploadRemarks}
                  initialFile={uploadInitialFile}
                  syncToModule={true}
                  autoUpload={true}
                  onUploadSuccess={() => {
                    setUploadSuccess('Document successfully uploaded and synchronized with employee record!');
                    setTimeout(() => {
                      setIsUploadModalOpen(false);
                      setUploadInitialFile(null);
                      setUploadSuccess(null);
                      fetchData();
                    }, 1200);
                  }}
                />
              </div>

              {uploadSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* C) EDIT METADATA MODAL */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Edit2 size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Edit Document Metadata</h3>
                  <p className="text-[11px] text-slate-500">{editingDoc.fileName}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingDoc(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Document Number
                </label>
                <input
                  type="text"
                  value={editDocNumber}
                  onChange={(e) => setEditDocNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl bg-slate-50/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={editIssueDate}
                    onChange={(e) => setEditIssueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={editExpiryDate}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50/50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMetadata}
                disabled={editSaving}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Check size={14} />
                <span>{editSaving ? 'Saving...' : 'Save Metadata'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D) DELETE CONFIRMATION DIALOG */}
      {deletingDocId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertOctagon size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Delete Document Copy?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete this file from encrypted object storage? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingDocId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDocument(deletingDocId)}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
