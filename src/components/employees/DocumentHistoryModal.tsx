import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  FileText,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Eye,
  EyeOff,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  X,
  Plus,
  Layers,
  ArrowLeftRight,
  Printer,
  ChevronDown,
  ChevronRight,
  Award,
  Building,
  User,
  Info,
  Check,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { ComplianceBadge } from '../compliance/ComplianceBadge';
import type {
  Employee,
  EmployeeCivilId,
  EmployeeDrivingLicence,
  EmployeeVisa,
  EmployeeGovernmentDocument,
  EmployeeDocument,
  DocumentExpiryStatus,
} from '../../types/index';

export type HistoryCategory =
  | 'ALL'
  | 'civil-id'
  | 'driving-licence'
  | 'visa'
  | 'passport'
  | 'work-permit'
  | 'govt-docs';

interface DocumentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  initialCategory?: HistoryCategory;
  onRenewRequested?: (category: 'civilId' | 'drivingLicence' | 'visa' | 'govtDoc', initialData?: any) => void;
}

interface UnifiedHistoryItem {
  id: string;
  category: 'civil-id' | 'driving-licence' | 'visa' | 'passport' | 'work-permit' | 'govt-docs';
  categoryLabel: string;
  documentType: string;
  documentNumber: string;
  isCurrent: boolean;
  versionNumber?: number;
  issueDate?: string;
  expiryDate?: string;
  status: DocumentExpiryStatus;
  issuingAuthority?: string;
  country?: string;
  // Specific attributes
  tradeOnVisa?: string;
  sponsor?: string;
  licenceCategory?: string;
  vehicleClass?: string;
  bloodGroup?: string;
  restrictions?: string;
  // Lifecycle & Audit
  replaceReason?: string | null;
  replacedDate?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  // Attachment
  fileName?: string | null;
  storagePath?: string | null;
  documentAttachment?: string | null;
  remarks?: string;
  rawRecord: any;
}

export const DocumentHistoryModal: React.FC<DocumentHistoryModalProps> = ({
  isOpen,
  onClose,
  employee,
  initialCategory = 'ALL',
  onRenewRequested,
}) => {
  const { canWrite, isAdmin, isManager, hasPermission } = useAuth();
  const canEdit = canWrite || isAdmin || isManager || hasPermission('compliance.edit');

  const [activeCategory, setActiveCategory] = useState<HistoryCategory>(initialCategory);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Raw data from API
  const [civilIdHistory, setCivilIdHistory] = useState<EmployeeCivilId[]>([]);
  const [drivingLicenceHistory, setDrivingLicenceHistory] = useState<EmployeeDrivingLicence[]>([]);
  const [visaHistory, setVisaHistory] = useState<EmployeeVisa[]>([]);
  const [governmentDocumentsHistory, setGovernmentDocumentsHistory] = useState<EmployeeGovernmentDocument[]>([]);
  const [repositoryDocuments, setRepositoryDocuments] = useState<EmployeeDocument[]>([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED'>('ALL');
  const [showMasked, setShowMasked] = useState<boolean>(false);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<{
    isOpen: boolean;
    url?: string | null;
    fileName?: string | null;
    title?: string;
    documentType?: string;
    documentNumber?: string;
    expiryDate?: string;
    status?: any;
    remarks?: string;
  }>({ isOpen: false });

  // Update initial category if prop changes
  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory]);

  const fetchHistoryData = async () => {
    if (!employee || !employee.employeeId) return;
    try {
      setLoading(true);
      setError(null);

      // Attempt unified endpoint first, with fallbacks to compliance endpoint
      try {
        const res = await apiRequest(`/api/employees/${encodeURIComponent(employee.employeeId)}/document-history`);
        setCivilIdHistory(res.civilIdHistory || []);
        setDrivingLicenceHistory(res.drivingLicenceHistory || []);
        setVisaHistory(res.visaHistory || []);
        setGovernmentDocumentsHistory(res.governmentDocumentsHistory || []);
        setRepositoryDocuments(res.repositoryDocuments || []);
      } catch (e) {
        // Fallback to compliance endpoint
        const compRes = await apiRequest(`/api/employees/${encodeURIComponent(employee.employeeId)}/compliance`);
        setCivilIdHistory(compRes.civilIdHistory || (compRes.currentCivilId ? [compRes.currentCivilId] : []));
        setDrivingLicenceHistory(compRes.drivingLicenceHistory || (compRes.currentDrivingLicence ? [compRes.currentDrivingLicence] : []));
        setVisaHistory(compRes.visaHistory || (compRes.currentVisa ? [compRes.currentVisa] : []));
        setGovernmentDocumentsHistory(compRes.governmentDocuments || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch document history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistoryData();
      setCompareMode(false);
      setSelectedForCompare([]);
    }
  }, [isOpen, employee?.employeeId]);

  // Mask sensitive ID helper
  const maskValue = (val?: string) => {
    if (!val) return '—';
    if (showMasked) return val;
    if (val.length <= 4) return '****';
    return `${val.slice(0, 2)}****${val.slice(-2)}`;
  };

  // Convert raw records into a unified chronological lifecycle representation
  const unifiedItems: UnifiedHistoryItem[] = useMemo(() => {
    const items: UnifiedHistoryItem[] = [];

    // 1. Civil ID
    const sortedCid = [...civilIdHistory].sort(
      (a, b) => new Date(b.issueDate || b.createdAt || 0).getTime() - new Date(a.issueDate || a.createdAt || 0).getTime()
    );
    sortedCid.forEach((cid, idx) => {
      const versionNum = sortedCid.length - idx;
      items.push({
        id: `cid-${cid.id}`,
        category: 'civil-id',
        categoryLabel: 'Civil ID / Resident Card',
        documentType: 'Civil ID',
        documentNumber: cid.civilIdNumber || '',
        isCurrent: Boolean(cid.isCurrent),
        versionNumber: versionNum,
        issueDate: cid.issueDate,
        expiryDate: cid.expiryDate,
        status: cid.status || 'Valid',
        issuingAuthority: cid.issuingAuthority || 'Royal Oman Police (ROP)',
        country: cid.country || 'Oman',
        replaceReason: cid.replaceReason,
        replacedDate: cid.replacedDate,
        createdBy: cid.createdBy,
        createdAt: cid.createdAt,
        updatedAt: cid.updatedAt,
        fileName: cid.fileName,
        storagePath: cid.storagePath,
        documentAttachment: cid.documentAttachment,
        remarks: cid.remarks,
        rawRecord: cid,
      });
    });

    // 2. Driving Licence
    const sortedDl = [...drivingLicenceHistory].sort(
      (a, b) => new Date(b.issueDate || b.createdAt || 0).getTime() - new Date(a.issueDate || a.createdAt || 0).getTime()
    );
    sortedDl.forEach((dl, idx) => {
      const versionNum = sortedDl.length - idx;
      items.push({
        id: `dl-${dl.id}`,
        category: 'driving-licence',
        categoryLabel: 'ROP Driving Licence',
        documentType: 'Driving Licence',
        documentNumber: dl.licenceNumber || '',
        isCurrent: Boolean(dl.isCurrent),
        versionNumber: versionNum,
        issueDate: dl.issueDate,
        expiryDate: dl.expiryDate,
        status: dl.status || 'Valid',
        issuingAuthority: dl.issuingAuthority || 'ROP Directorate General of Traffic',
        country: dl.issuingCountry || 'Oman',
        licenceCategory: dl.category,
        vehicleClass: dl.vehicleClass,
        bloodGroup: dl.bloodGroupOnLicence,
        restrictions: dl.restrictions,
        replaceReason: dl.remarks && dl.remarks.includes('Renewed:') ? dl.remarks : dl.renewalDate ? `Renewed on ${dl.renewalDate}` : null,
        replacedDate: dl.renewalDate,
        createdBy: dl.createdBy,
        createdAt: dl.createdAt,
        updatedAt: dl.updatedAt,
        fileName: dl.fileName,
        storagePath: dl.storagePath,
        documentAttachment: dl.documentAttachment,
        remarks: dl.remarks,
        rawRecord: dl,
      });
    });

    // 3. Visa
    const sortedVisa = [...visaHistory].sort(
      (a, b) => new Date(b.effectiveFrom || b.issueDate || b.createdAt || 0).getTime() - new Date(a.effectiveFrom || a.issueDate || a.createdAt || 0).getTime()
    );
    sortedVisa.forEach((v, idx) => {
      const versionNum = sortedVisa.length - idx;
      items.push({
        id: `visa-${v.id}`,
        category: 'visa',
        categoryLabel: 'Employment Visa & Trade',
        documentType: v.visaType || 'Employment Visa',
        documentNumber: v.visaNumber || '',
        isCurrent: Boolean(v.isCurrent),
        versionNumber: versionNum,
        issueDate: v.issueDate,
        expiryDate: v.expiryDate,
        status: v.status || 'Valid',
        issuingAuthority: v.issuingAuthority || 'ROP Passports & Residence',
        country: v.country || 'Oman',
        tradeOnVisa: v.tradeOnVisa,
        sponsor: v.sponsor,
        effectiveFrom: v.effectiveFrom,
        effectiveTo: v.effectiveTo,
        replaceReason: v.reasonForChange || (v.effectiveTo ? `Superseded effective ${v.effectiveTo}` : null),
        createdBy: v.createdBy,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        fileName: v.fileName,
        storagePath: v.storagePath,
        documentAttachment: v.documentAttachment,
        remarks: v.remarks,
        rawRecord: v,
      });
    });

    // 4. Government Documents (Passports, Work Permits, Contracts, etc.)
    const sortedGovt = [...governmentDocumentsHistory].sort(
      (a, b) => new Date(b.issueDate || b.createdAt || 0).getTime() - new Date(a.issueDate || a.createdAt || 0).getTime()
    );
    sortedGovt.forEach((g, idx) => {
      let cat: UnifiedHistoryItem['category'] = 'govt-docs';
      if (g.documentType === 'Passport') cat = 'passport';
      else if (g.documentType === 'Work Permit') cat = 'work-permit';

      items.push({
        id: `govt-${g.id}`,
        category: cat,
        categoryLabel: g.documentType,
        documentType: g.documentType,
        documentNumber: g.documentNumber || '',
        isCurrent: Boolean(g.isCurrent),
        issueDate: g.issueDate,
        expiryDate: g.expiryDate,
        status: g.status || 'Valid',
        issuingAuthority: g.issuingAuthority,
        country: g.country,
        replaceReason: g.replaceReason,
        replacedDate: g.replacedDate,
        createdBy: g.createdBy,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        fileName: g.fileName,
        storagePath: g.storagePath,
        documentAttachment: g.documentAttachment,
        remarks: g.remarks,
        rawRecord: g,
      });
    });

    return items;
  }, [civilIdHistory, drivingLicenceHistory, visaHistory, governmentDocumentsHistory]);

  // Filtering
  const filteredItems = useMemo(() => {
    let result = unifiedItems;

    // Filter by category
    if (activeCategory !== 'ALL') {
      result = result.filter((item) => item.category === activeCategory);
    }

    // Filter by status
    if (statusFilter === 'ACTIVE') {
      result = result.filter((item) => item.isCurrent);
    } else if (statusFilter === 'SUPERSEDED') {
      result = result.filter((item) => !item.isCurrent);
    } else if (statusFilter === 'EXPIRED') {
      result = result.filter((item) => item.status === 'Expired');
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.documentNumber.toLowerCase().includes(q) ||
          item.documentType.toLowerCase().includes(q) ||
          item.categoryLabel.toLowerCase().includes(q) ||
          (item.tradeOnVisa && item.tradeOnVisa.toLowerCase().includes(q)) ||
          (item.licenceCategory && item.licenceCategory.toLowerCase().includes(q)) ||
          (item.replaceReason && item.replaceReason.toLowerCase().includes(q)) ||
          (item.remarks && item.remarks.toLowerCase().includes(q)) ||
          (item.issuingAuthority && item.issuingAuthority.toLowerCase().includes(q))
      );
    }

    return result;
  }, [unifiedItems, activeCategory, statusFilter, searchQuery]);

  // Category summary counts
  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: unifiedItems.length,
      'civil-id': unifiedItems.filter((i) => i.category === 'civil-id').length,
      'driving-licence': unifiedItems.filter((i) => i.category === 'driving-licence').length,
      visa: unifiedItems.filter((i) => i.category === 'visa').length,
      passport: unifiedItems.filter((i) => i.category === 'passport').length,
      'work-permit': unifiedItems.filter((i) => i.category === 'work-permit').length,
      'govt-docs': unifiedItems.filter((i) => i.category === 'govt-docs').length,
    };
    return counts;
  }, [unifiedItems]);

  // Metric highlights for active category
  const metrics = useMemo(() => {
    const inCategory = activeCategory === 'ALL' ? unifiedItems : unifiedItems.filter((i) => i.category === activeCategory);
    const activeDoc = inCategory.find((i) => i.isCurrent);
    const totalVersions = inCategory.length;
    const historicalCount = inCategory.filter((i) => !i.isCurrent).length;

    // Calculate days remaining on active doc
    let daysRemaining: number | null = null;
    if (activeDoc?.expiryDate) {
      const exp = new Date(activeDoc.expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      daysRemaining = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      activeDoc,
      totalVersions,
      historicalCount,
      daysRemaining,
    };
  }, [unifiedItems, activeCategory]);

  // Compare selection toggle
  const toggleCompareSelect = (id: string) => {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare(selectedForCompare.filter((item) => item !== id));
    } else {
      if (selectedForCompare.length >= 2) {
        setSelectedForCompare([selectedForCompare[1], id]);
      } else {
        setSelectedForCompare([...selectedForCompare, id]);
      }
    }
  };

  const compareItems = useMemo(() => {
    return unifiedItems.filter((i) => selectedForCompare.includes(i.id));
  }, [unifiedItems, selectedForCompare]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      id="document-history-modal-overlay"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        id="document-history-modal-container"
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden"
      >
        {/* Modal Header */}
        <div
          id="document-history-modal-header"
          className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4 shrink-0 border-b border-slate-700"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Government Document Lifecycle & History</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Audit Trail
                </span>
              </div>
              <p className="text-xs text-slate-300 flex items-center gap-2 mt-0.5">
                <span>Employee: <strong className="text-white">{employee.employeeName}</strong> ({employee.employeeId})</span>
                <span>•</span>
                <span>{employee.designation || 'Staff'}</span>
                <span>•</span>
                <span>{employee.employeeCompany}</span>
                <span>•</span>
                <span className="text-emerald-300">{employee.nationalityType}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="doc-history-mask-toggle"
              type="button"
              onClick={() => setShowMasked(!showMasked)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-600 flex items-center gap-1.5 transition-colors"
              title={showMasked ? 'Mask Sensitive Numbers' : 'Reveal Sensitive Numbers'}
            >
              {showMasked ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
              <span>{showMasked ? 'Mask IDs' : 'Reveal IDs'}</span>
            </button>

            <button
              id="doc-history-print-btn"
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-600 flex items-center gap-1.5 transition-colors"
              title="Print Audit Trail"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">Print Audit</span>
            </button>

            <button
              id="doc-history-refresh-btn"
              type="button"
              onClick={fetchHistoryData}
              disabled={loading}
              className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors"
              title="Refresh History"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              id="doc-history-close-btn"
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Tabs Bar */}
        <div
          id="document-history-category-tabs"
          className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-thin"
        >
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 shrink-0">Document Type:</span>
          {(
            [
              { key: 'ALL', label: 'All Government IDs' },
              { key: 'civil-id', label: 'Civil ID' },
              { key: 'driving-licence', label: 'Driving Licence' },
              { key: 'visa', label: 'Visa & Trade' },
              { key: 'passport', label: 'Passports' },
              { key: 'work-permit', label: 'Work Permits' },
              { key: 'govt-docs', label: 'Other Documents' },
            ] as { key: HistoryCategory; label: string }[]
          ).map((tab) => {
            const count = categoryCounts[tab.key] || 0;
            const isActive = activeCategory === tab.key;
            return (
              <button
                key={tab.key}
                id={`doc-history-tab-${tab.key}`}
                type="button"
                onClick={() => {
                  setActiveCategory(tab.key);
                  setCompareMode(false);
                  setSelectedForCompare([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter & Toolbar Strip */}
        <div
          id="document-history-toolbar"
          className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0"
        >
          {/* Search and Status filter */}
          <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-lg">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="doc-history-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search document number, category, authority, remarks..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              id="doc-history-status-select"
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="ALL">All Versions</option>
              <option value="ACTIVE">Current Active Only</option>
              <option value="SUPERSEDED">Archived / Superseded</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              id="doc-history-compare-toggle-btn"
              type="button"
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode && filteredItems.length >= 2) {
                  // Auto-select first two for convenience
                  setSelectedForCompare([filteredItems[0].id, filteredItems[1].id]);
                } else {
                  setSelectedForCompare([]);
                }
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-all ${
                compareMode
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{compareMode ? 'Exit Comparison' : 'Compare Versions'}</span>
              {compareMode && (
                <span className="px-1.5 py-0.2 bg-indigo-200 text-indigo-800 rounded-full text-[10px]">
                  {selectedForCompare.length}/2
                </span>
              )}
            </button>

            {canEdit && onRenewRequested && (
              <button
                id="doc-history-renew-quick-btn"
                type="button"
                onClick={() => {
                  let targetCat: 'civilId' | 'drivingLicence' | 'visa' | 'govtDoc' = 'civilId';
                  if (activeCategory === 'driving-licence') targetCat = 'drivingLicence';
                  else if (activeCategory === 'visa') targetCat = 'visa';
                  else if (activeCategory === 'passport' || activeCategory === 'work-permit' || activeCategory === 'govt-docs') targetCat = 'govtDoc';
                  onRenewRequested(targetCat, metrics.activeDoc?.rawRecord);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Renew / Issue Version</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body / Scrollable Content Area */}
        <div id="document-history-body" className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="flex-1">
                <strong>Error loading document history:</strong> {error}
              </div>
              <button
                type="button"
                onClick={fetchHistoryData}
                className="px-2 py-1 bg-rose-100 hover:bg-rose-200 rounded font-semibold text-rose-900 text-xs"
              >
                Retry
              </button>
            </div>
          )}

          {/* Lifecycle Summary Banner */}
          {!loading && (
            <div
              id="document-history-summary-card"
              className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-4"
            >
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Total Versions Tracked
                </span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">{metrics.totalVersions}</span>
                  <span className="text-xs text-slate-500">
                    ({metrics.historicalCount} superseded)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Active Document Status
                </span>
                <div className="mt-1.5">
                  {metrics.activeDoc ? (
                    <ComplianceBadge status={metrics.activeDoc.status} size="sm" showIcon={true} />
                  ) : (
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      No Active Version
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Active Expiry Window
                </span>
                <div className="mt-1">
                  <span className="text-xs font-bold text-slate-800">
                    {metrics.activeDoc?.expiryDate ? formatDate(metrics.activeDoc.expiryDate) : '—'}
                  </span>
                  {metrics.daysRemaining !== null && (
                    <span
                      className={`block text-[11px] font-semibold mt-0.5 ${
                        metrics.daysRemaining < 0
                          ? 'text-rose-600'
                          : metrics.daysRemaining <= 30
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {metrics.daysRemaining < 0
                        ? `Expired ${Math.abs(metrics.daysRemaining)} days ago`
                        : `${metrics.daysRemaining} days remaining`}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Latest Replacement / Audit
                </span>
                <div className="mt-1 text-xs text-slate-700">
                  <span className="font-semibold block truncate">
                    {metrics.activeDoc?.replaceReason || 'Initial registration'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {metrics.activeDoc?.updatedAt ? formatDate(metrics.activeDoc.updatedAt) : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Compare Mode Side-by-Side Diff Section */}
          {compareMode && (
            <div
              id="document-history-compare-section"
              className="bg-indigo-50/70 border-2 border-indigo-200 rounded-xl p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-indigo-950">
                    Version Comparison (Side-by-Side Diff)
                  </h3>
                </div>
                <span className="text-xs text-indigo-700 font-medium">
                  {selectedForCompare.length === 2
                    ? 'Comparing 2 selected records below:'
                    : 'Select 2 versions from the history list below to compare.'}
                </span>
              </div>

              {selectedForCompare.length === 2 && compareItems.length === 2 ? (
                <div className="bg-white rounded-lg border border-indigo-200 overflow-hidden shadow-xs">
                  <div className="grid grid-cols-3 bg-indigo-900 text-white text-xs font-bold py-2.5 px-4">
                    <span>Field Name</span>
                    <span>Version A ({compareItems[0].isCurrent ? 'Current Active' : `v${compareItems[0].versionNumber || 'Historic'}`})</span>
                    <span>Version B ({compareItems[1].isCurrent ? 'Current Active' : `v${compareItems[1].versionNumber || 'Historic'}`})</span>
                  </div>

                  <div className="divide-y divide-slate-100 text-xs">
                    {/* Document Number */}
                    <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                      <span className="font-semibold text-slate-500">Document Number</span>
                      <span className="font-mono font-medium text-slate-900">{maskValue(compareItems[0].documentNumber)}</span>
                      <span className="font-mono font-medium text-slate-900">{maskValue(compareItems[1].documentNumber)}</span>
                    </div>

                    {/* Status */}
                    <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                      <span className="font-semibold text-slate-500">Lifecycle Status</span>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${compareItems[0].isCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                          {compareItems[0].isCurrent ? 'Current Active' : 'Superseded'}
                        </span>
                      </div>
                      <div>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${compareItems[1].isCurrent ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                          {compareItems[1].isCurrent ? 'Current Active' : 'Superseded'}
                        </span>
                      </div>
                    </div>

                    {/* Expiry Date */}
                    <div className={`grid grid-cols-3 p-3 ${compareItems[0].expiryDate !== compareItems[1].expiryDate ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}>
                      <span className="font-semibold text-slate-500 flex items-center gap-1.5">
                        Expiry Date
                        {compareItems[0].expiryDate !== compareItems[1].expiryDate && (
                          <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 rounded font-bold">Modified</span>
                        )}
                      </span>
                      <span className="font-medium text-slate-800">{formatDate(compareItems[0].expiryDate)}</span>
                      <span className="font-medium text-slate-800">{formatDate(compareItems[1].expiryDate)}</span>
                    </div>

                    {/* Issue Date */}
                    <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                      <span className="font-semibold text-slate-500">Issue Date</span>
                      <span className="text-slate-800">{formatDate(compareItems[0].issueDate)}</span>
                      <span className="text-slate-800">{formatDate(compareItems[1].issueDate)}</span>
                    </div>

                    {/* Authority */}
                    <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                      <span className="font-semibold text-slate-500">Issuing Authority</span>
                      <span className="text-slate-800">{compareItems[0].issuingAuthority || '—'}</span>
                      <span className="text-slate-800">{compareItems[1].issuingAuthority || '—'}</span>
                    </div>

                    {/* Special fields (Trade / Category) */}
                    {(compareItems[0].tradeOnVisa || compareItems[1].tradeOnVisa) && (
                      <div className={`grid grid-cols-3 p-3 ${compareItems[0].tradeOnVisa !== compareItems[1].tradeOnVisa ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}>
                        <span className="font-semibold text-slate-500">Trade on Visa</span>
                        <span className="font-semibold text-slate-800">{compareItems[0].tradeOnVisa || '—'}</span>
                        <span className="font-semibold text-slate-800">{compareItems[1].tradeOnVisa || '—'}</span>
                      </div>
                    )}

                    {(compareItems[0].licenceCategory || compareItems[1].licenceCategory) && (
                      <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                        <span className="font-semibold text-slate-500">Licence Category</span>
                        <span className="font-semibold text-slate-800">{compareItems[0].licenceCategory || '—'}</span>
                        <span className="font-semibold text-slate-800">{compareItems[1].licenceCategory || '—'}</span>
                      </div>
                    )}

                    {/* Replacement Reason */}
                    <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                      <span className="font-semibold text-slate-500">Renewal / Change Reason</span>
                      <span className="text-slate-700 italic">{compareItems[0].replaceReason || 'Initial registration'}</span>
                      <span className="text-slate-700 italic">{compareItems[1].replaceReason || 'Initial registration'}</span>
                    </div>

                    {/* Attachment comparison */}
                    <div className="grid grid-cols-3 p-3 hover:bg-slate-50">
                      <span className="font-semibold text-slate-500">Attachment Copy</span>
                      <div>
                        {compareItems[0].fileName || compareItems[0].documentAttachment ? (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {compareItems[0].fileName || 'Document Attached'}
                          </span>
                        ) : (
                          <span className="text-slate-400">No file</span>
                        )}
                      </div>
                      <div>
                        {compareItems[1].fileName || compareItems[1].documentAttachment ? (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {compareItems[1].fileName || 'Document Attached'}
                          </span>
                        ) : (
                          <span className="text-slate-400">No file</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/80 p-6 text-center rounded-lg border border-dashed border-indigo-200 text-xs text-indigo-700">
                  Please click the checkbox on any 2 cards below to view the side-by-side comparison.
                </div>
              )}
            </div>
          )}

          {/* Chronological Version Cards Stack */}
          {loading ? (
            <div className="space-y-4 py-10">
              <div className="flex flex-col items-center justify-center text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-slate-600" />
                <span className="text-xs font-semibold">Loading document audit trail...</span>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center border border-slate-200 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Document Records Found</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchQuery
                  ? `No document history matching "${searchQuery}". Try clearing search filters.`
                  : 'No historical document versions recorded for this category yet.'}
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div id="document-history-timeline" className="space-y-4 relative">
              {/* Vertical connector line */}
              <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-200 hidden sm:block -z-0" />

              {filteredItems.map((item, index) => {
                const isSelectedForDiff = selectedForCompare.includes(item.id);
                return (
                  <div
                    key={item.id}
                    id={`doc-history-item-${item.id}`}
                    className={`relative rounded-xl transition-all border ${
                      item.isCurrent
                        ? 'bg-white border-emerald-300 ring-2 ring-emerald-500/20 shadow-md'
                        : 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                    } ${isSelectedForDiff ? 'ring-2 ring-indigo-500 bg-indigo-50/20' : ''}`}
                  >
                    {/* Header bar */}
                    <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100">
                      <div className="flex items-start gap-3.5">
                        {/* Compare checkbox in compare mode */}
                        {compareMode && (
                          <button
                            type="button"
                            onClick={() => toggleCompareSelect(item.id)}
                            className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                              isSelectedForDiff
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {isSelectedForDiff && <Check className="w-3.5 h-3.5" />}
                          </button>
                        )}

                        {/* Version indicator circle */}
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs shadow-xs ${
                            item.isCurrent
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {item.versionNumber ? `v${item.versionNumber}` : index + 1}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">
                              {item.categoryLabel}
                            </h4>

                            {item.isCurrent ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Current Active Version
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Superseded / Historic Version
                              </span>
                            )}

                            <ComplianceBadge status={item.status} size="sm" showIcon={true} />
                          </div>

                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-600">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                              No. {maskValue(item.documentNumber)}
                            </span>
                            {item.issuingAuthority && (
                              <span>Authority: <strong>{item.issuingAuthority}</strong></span>
                            )}
                            {item.country && (
                              <span>Country: <strong>{item.country}</strong></span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right actions: Preview & Download */}
                      <div className="flex items-center gap-2">
                        {(item.fileName || item.documentAttachment) && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewDoc({
                                  isOpen: true,
                                  url: item.documentAttachment,
                                  fileName: item.fileName || `${item.documentType}_Copy`,
                                  title: `${item.documentType} (v${item.versionNumber || '1'})`,
                                  documentType: item.documentType,
                                  documentNumber: maskValue(item.documentNumber),
                                  expiryDate: item.expiryDate,
                                  status: item.status,
                                  remarks: item.remarks || item.replaceReason || undefined,
                                });
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"
                              title="Preview Document Scan"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-600" />
                              <span>View Scan</span>
                            </button>

                            {item.documentAttachment && (
                              <a
                                href={item.documentAttachment}
                                download={item.fileName || `${item.documentType}_${item.documentNumber}.pdf`}
                                className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
                                title="Download File"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Card Body - Metadata & Lifecycle Grid */}
                    <div className="p-4 sm:p-5 space-y-4">
                      {/* Key dates & specific fields */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Issue Date</span>
                          <span className="font-semibold text-slate-800">{formatDate(item.issueDate)}</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[11px]">Expiry Date</span>
                          <span className="font-semibold text-slate-800">{formatDate(item.expiryDate)}</span>
                        </div>

                        {item.tradeOnVisa && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Trade on Visa</span>
                            <span className="font-bold text-slate-900">{item.tradeOnVisa}</span>
                          </div>
                        )}

                        {item.sponsor && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Visa Sponsor</span>
                            <span className="font-semibold text-slate-800">{item.sponsor}</span>
                          </div>
                        )}

                        {item.licenceCategory && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Licence Category</span>
                            <span className="font-bold text-slate-900">{item.licenceCategory}</span>
                          </div>
                        )}

                        {item.vehicleClass && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Vehicle Class</span>
                            <span className="font-semibold text-slate-800">{item.vehicleClass}</span>
                          </div>
                        )}

                        {item.bloodGroup && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Blood Group</span>
                            <span className="font-bold text-rose-700">{item.bloodGroup}</span>
                          </div>
                        )}

                        {item.effectiveFrom && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Effective Window</span>
                            <span className="font-semibold text-slate-800">
                              {formatDate(item.effectiveFrom)} → {item.effectiveTo ? formatDate(item.effectiveTo) : 'Present'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Replacement / Reason banner */}
                      {(item.replaceReason || item.replacedDate) && (
                        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs flex items-start gap-2.5">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold text-amber-900">
                              Lifecycle Note / Reason for Change:
                            </span>
                            <p className="text-amber-800 font-medium">
                              {item.replaceReason || 'Renewed with updated card / permit copy.'}
                            </p>
                            {item.replacedDate && (
                              <span className="text-[11px] text-amber-700 block">
                                Replaced on: <strong>{formatDate(item.replacedDate)}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Audit stamp footer */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                          {item.createdBy && (
                            <span>Recorded by: <strong className="text-slate-600">{item.createdBy}</strong></span>
                          )}
                          {item.createdAt && (
                            <span>Created: <strong className="text-slate-600">{formatDate(item.createdAt)}</strong></span>
                          )}
                          {item.updatedAt && (
                            <span>Last audit: <strong className="text-slate-600">{formatDate(item.updatedAt)}</strong></span>
                          )}
                        </div>

                        {item.fileName && (
                          <div className="flex items-center gap-1 text-slate-500 font-medium">
                            <FileText className="w-3 h-3 text-slate-400" />
                            <span>{item.fileName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          id="document-history-modal-footer"
          className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0"
        >
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              All document versions are permanently archived with immutable audit trails for Ministry compliance.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="doc-history-footer-close-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Document Scan Lightbox Preview */}
      {previewDoc.isOpen && (
        <DocumentPreviewModal
          isOpen={previewDoc.isOpen}
          onClose={() => setPreviewDoc({ isOpen: false })}
          url={previewDoc.url}
          fileName={previewDoc.fileName}
          title={previewDoc.title}
          documentType={previewDoc.documentType}
          documentNumber={previewDoc.documentNumber}
          expiryDate={previewDoc.expiryDate}
          status={previewDoc.status}
          remarks={previewDoc.remarks}
        />
      )}
    </div>
  );
};
