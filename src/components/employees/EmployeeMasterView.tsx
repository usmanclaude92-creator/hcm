import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR, formatDate, downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Search,
  Filter,
  Edit2,
  History,
  CheckCircle,
  XCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  X,
  RefreshCw,
  Building,
  Info,
  CreditCard,
  Globe,
  FileCheck,
  Car,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Clock,
  CheckCircle2,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  HelpCircle,
} from 'lucide-react';
import type { Employee, EmployeeType, NationalityType, WageType, EmployeeCompany, SalaryPaidBy, WPSStatus } from '../../types/index';
import { EmployeeIdentificationModal, type EmployeeRecordTab } from './EmployeeIdentificationModal';

export interface EmployeeMasterViewProps {
  initialFilters?: {
    docType?: string;
    docStatus?: string;
    search?: string;
    status?: string;
    company?: string;
    employeeType?: string;
    nationalityType?: string;
  };
  onClearInitialFilters?: () => void;
}

function getTabForDocType(docType?: string): EmployeeRecordTab {
  if (!docType) return 'personal';
  const lower = docType.toLowerCase();
  if (lower.includes('civil') || lower.includes('id')) return 'civil-id';
  if (lower.includes('licence') || lower.includes('license') || lower.includes('driving')) return 'driving-licence';
  if (lower.includes('visa')) return 'visa';
  if (lower.includes('passport')) return 'govt-docs';
  if (lower.includes('permit') || lower.includes('contract') || lower.includes('govt') || lower.includes('bataqa')) return 'govt-docs';
  return 'personal';
}

export const EmployeeMasterView: React.FC<EmployeeMasterViewProps> = ({
  initialFilters,
  onClearInitialFilters,
}) => {
  const { canWrite } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState(initialFilters?.search || '');
  const [typeFilter, setTypeFilter] = useState(initialFilters?.employeeType || 'ALL');
  const [nationalityFilter, setNationalityFilter] = useState(initialFilters?.nationalityType || 'ALL');
  const [companyFilter, setCompanyFilter] = useState(initialFilters?.company || 'ALL');
  const [paidByFilter, setPaidByFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState(initialFilters?.status || 'ALL');
  const [docTypeFilter, setDocTypeFilter] = useState(initialFilters?.docType || 'ALL');
  const [docStatusFilter, setDocStatusFilter] = useState(initialFilters?.docStatus || 'ALL');

  // Sync initialFilters if they change from parent navigation
  useEffect(() => {
    if (initialFilters) {
      if (initialFilters.search !== undefined) setSearch(initialFilters.search);
      if (initialFilters.docType !== undefined) setDocTypeFilter(initialFilters.docType);
      if (initialFilters.docStatus !== undefined) setDocStatusFilter(initialFilters.docStatus);
      if (initialFilters.company !== undefined) setCompanyFilter(initialFilters.company);
      if (initialFilters.status !== undefined) setStatusFilter(initialFilters.status);
    }
  }, [initialFilters]);

  // Unified Employee Record Form Modal
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedRecordEmp, setSelectedRecordEmp] = useState<Employee | null>(null);
  const [recordInitialTab, setRecordInitialTab] = useState<EmployeeRecordTab>('personal');
  const [isRecordDirty, setIsRecordDirty] = useState(false);
  const [showBreadcrumbDiscardModal, setShowBreadcrumbDiscardModal] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);

  // Import Wizard
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (typeFilter !== 'ALL') params.append('employeeType', typeFilter);
      if (nationalityFilter !== 'ALL') params.append('nationalityType', nationalityFilter);
      if (companyFilter !== 'ALL') params.append('employeeCompany', companyFilter);
      if (paidByFilter !== 'ALL') params.append('salaryPaidBy', paidByFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (docTypeFilter !== 'ALL') params.append('docType', docTypeFilter);
      if (docStatusFilter !== 'ALL') params.append('docStatus', docStatusFilter);

      const data = await apiRequest(`/api/employees?${params.toString()}`);
      setEmployees(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [search, typeFilter, nationalityFilter, companyFilter, paidByFilter, statusFilter, docTypeFilter, docStatusFilter]);

  const handleOpenAdd = () => {
    setSelectedRecordEmp(null);
    setRecordInitialTab('personal');
    setIsRecordModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setSelectedRecordEmp(emp);
    const matchedDoc = (emp as any)._matchedDoc;
    if (matchedDoc?.documentType) {
      setRecordInitialTab(getTabForDocType(matchedDoc.documentType));
    } else if (docTypeFilter !== 'ALL') {
      setRecordInitialTab(getTabForDocType(docTypeFilter));
    } else {
      setRecordInitialTab('personal');
    }
    setIsRecordModalOpen(true);
  };

  const handleClearDocFilters = () => {
    setDocTypeFilter('ALL');
    setDocStatusFilter('ALL');
    if (onClearInitialFilters) {
      onClearInitialFilters();
    }
  };

  const handleToggleActive = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to ${emp.isActive ? 'deactivate' : 'activate'} ${emp.employeeId} (${emp.employeeName})?`)) {
      return;
    }
    try {
      await apiRequest(`/api/employees/${emp.id}/toggle-active`, {
        method: 'PATCH',
      });
      fetchEmployees();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewHistory = async (emp: Employee) => {
    try {
      const data = await apiRequest(`/api/employees/${emp.id}`);
      setHistoryData(data);
      setIsHistoryModalOpen(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const handleExportData = async () => {
    try {
      setIsDownloading(true);
      await downloadAuthenticatedFile('/api/employees/export/data', 'Employees_Export.xlsx');
    } catch (err: any) {
      alert(err.message || 'Failed to export employee data.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloading(true);
      await downloadAuthenticatedFile('/api/employees/export/template', 'Employee_Import_Template.xlsx');
    } catch (err: any) {
      alert(err.message || 'Failed to download import template.');
    } finally {
      setIsDownloading(false);
      setShowTemplateDropdown(false);
    }
  };

  const handleDownloadCsvTemplate = async () => {
    try {
      setIsDownloadingCsv(true);
      await downloadAuthenticatedFile('/api/employees/export/template?format=csv', 'Employee_Import_Template.csv');
    } catch (err: any) {
      alert(err.message || 'Failed to download CSV template.');
    } finally {
      setIsDownloadingCsv(false);
      setShowTemplateDropdown(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const base64 = evt.target?.result as string;
        const res = await apiRequest('/api/employees/import/validate', {
          method: 'POST',
          body: JSON.stringify({ fileData: base64 }),
        });
        setImportPreview(res);
      } catch (err: any) {
        setUploadError(err.message || 'Failed to parse file. Please verify the template headers.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const res = await apiRequest('/api/employees/import/confirm', {
        method: 'POST',
        body: JSON.stringify({
          rows: importPreview.rows,
          updateExisting,
        }),
      });
      setImportResult(res);
      fetchEmployees();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
    setImportPreview(null);
    setImportFile(null);
    setImportResult(null);
    setUpdateExisting(false);
    setShowTemplateGuide(false);
    setUploadError(null);
  };

  // Row order: Company -> Pay By -> WPS -> Type -> Nationality (Omani ranked first) ->
  // Employee Name (final tie-breaker) -- everything else in this cascade is plain ascending.
  const sortedEmployees = useMemo(() => {
    const nationalityRank = (n?: string) => (n === 'Omani' ? 0 : 1);
    return [...employees].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return (
        (a.employeeCompany || '').localeCompare(b.employeeCompany || '') ||
        (a.salaryPaidBy || '').localeCompare(b.salaryPaidBy || '') ||
        (a.wpsEmployee || '').localeCompare(b.wpsEmployee || '') ||
        (a.employeeType || '').localeCompare(b.employeeType || '') ||
        (nationalityRank(a.nationalityType) - nationalityRank(b.nationalityType)) ||
        (a.employeeName || '').localeCompare(b.employeeName || '')
      );
    });
  }, [employees]);

  const handleDownloadErrorReport = () => {
    if (!importPreview?.rows) return;
    const errorMap = new Map<string, string>();
    (importResult?.errors || []).forEach((e: any) => {
      errorMap.set(String(e.rowNumber), e.description);
    });

    const skippedRows = importPreview.rows.filter((r: any) => {
      if (r.status === 'Invalid' || r.status === 'Duplicate') return true;
      if (r.status === 'Existing' && !updateExisting) return true;
      return errorMap.has(String(r.rowNumber));
    });

    if (skippedRows.length === 0) {
      alert('No errors to report — every row was imported or updated successfully.');
      return;
    }

    const data = skippedRows.map((r: any) => ({
      'Row #': r.rowNumber,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Error Type': r.status,
      'Description': errorMap.get(String(r.rowNumber)) || r.reason,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
    XLSX.writeFile(wb, `Employee_Import_Errors_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // If viewing or creating employee record, render full page inline form (avoiding popups)
  if (isRecordModalOpen) {
    const handleBreadcrumbBack = () => {
      if (isRecordDirty) {
        setShowBreadcrumbDiscardModal(true);
      } else {
        setIsRecordModalOpen(false);
        setSelectedRecordEmp(null);
        setIsRecordDirty(false);
      }
    };

    return (
      <div className="space-y-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            onClick={handleBreadcrumbBack}
            className="hover:text-blue-600 font-semibold flex items-center gap-1 cursor-pointer transition-colors text-slate-600"
          >
            <ArrowLeft size={13} />
            <span>Employee Master</span>
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-800">
            {selectedRecordEmp
              ? `${selectedRecordEmp.employeeName} (${selectedRecordEmp.employeeId})`
              : 'Register New Employee'}
          </span>
        </div>

        <EmployeeIdentificationModal
          employee={selectedRecordEmp}
          isOpen={true}
          mode="inline"
          backLabel="Back to Employee Master"
          initialTab={recordInitialTab}
          onClose={() => {
            setIsRecordModalOpen(false);
            setSelectedRecordEmp(null);
            setIsRecordDirty(false);
          }}
          onDirtyChange={setIsRecordDirty}
          onUpdated={fetchEmployees}
        />

        {/* Confirmation Modal when clicking breadcrumb back with unsaved edits */}
        {showBreadcrumbDiscardModal && (
          <div
            id="breadcrumb-discard-modal"
            className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Discard Unsaved Changes?
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You have unsaved edits in this employee record. If you return to Employee Master now, your unsaved changes will be lost.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  id="btn-breadcrumb-keep-editing"
                  onClick={() => setShowBreadcrumbDiscardModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  id="btn-breadcrumb-discard-confirm"
                  onClick={() => {
                    setShowBreadcrumbDiscardModal(false);
                    setIsRecordDirty(false);
                    setIsRecordModalOpen(false);
                    setSelectedRecordEmp(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors cursor-pointer"
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Employee Master
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Import Template Dropdown */}
          <div className="relative">
            <div className="inline-flex rounded-lg shadow-2xs">
              <button
                onClick={handleDownloadTemplate}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-l-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                title="Download standard Excel template with dropdown validations"
              >
                {isDownloading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                )}
                Template (.xlsx)
              </button>
              <button
                onClick={() => setShowTemplateDropdown(prev => !prev)}
                className="px-2 py-2 text-slate-700 bg-white border-y border-r border-slate-300 rounded-r-lg hover:bg-slate-50 transition-colors cursor-pointer"
                title="Choose template format (.xlsx or .csv)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {showTemplateDropdown && (
              <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 text-xs divide-y divide-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowTemplateDropdown(false); handleDownloadTemplate(); }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <strong className="block text-slate-800 font-semibold">Excel Template</strong>
                    <span className="text-[10px] text-slate-500">Includes data validation dropdowns</span>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded-sm">.xlsx</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  disabled={isDownloadingCsv}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <strong className="block text-slate-800 font-semibold">CSV Template</strong>
                    <span className="text-[10px] text-slate-500">Universal plain text standard</span>
                  </div>
                  <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded-sm">.csv</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleExportData}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export Excel
          </button>

          {canWrite && (
            <>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Employees
              </button>

              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Employee
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active Document Compliance Filter Banner */}
      {(docTypeFilter !== 'ALL' || docStatusFilter !== 'ALL') && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">
                  Document Expiry Engine Filter Active:
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-white text-blue-700 border border-blue-200 shadow-2xs">
                  {docTypeFilter === 'ALL' ? 'All Document Types' : docTypeFilter}
                </span>
                {docStatusFilter !== 'ALL' && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                    docStatusFilter === 'Expired'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : docStatusFilter === 'Urgent'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : docStatusFilter === 'Expiring Soon'
                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {docStatusFilter}
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium ml-1">
                  ({employees.length} matching employee{employees.length === 1 ? '' : 's'})
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Clicking the edit pencil icon on any employee will automatically open the corresponding document tab for instant renewal.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-end md:self-auto">
            {/* Quick document switcher buttons */}
            {['Civil ID', 'Passport', 'Visa', 'Driving Licence', 'Work Permit', 'Contract'].map((d) => (
              <button
                key={d}
                onClick={() => setDocTypeFilter(docTypeFilter === d ? 'ALL' : d)}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                  docTypeFilter === d
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {d}
              </button>
            ))}
            <button
              onClick={handleClearDocFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              Clear Filter
            </button>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by ID, name, designation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Types (Worker/Staff)</option>
              <option value="Staff">Staff</option>
              <option value="Worker">Worker</option>
            </select>
          </div>

          {/* Nationality Filter */}
          <div>
            <select
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Nationalities</option>
              <option value="Omani">Omani</option>
              <option value="Expat">Expat</option>
            </select>
          </div>

          {/* Company Filter */}
          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Companies</option>
              <option value="DGO">DGO</option>
              <option value="SMI">SMI</option>
              <option value="NC">NC</option>
              <option value="Supplier">Supplier</option>
              <option value="Azad">Azad</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive / Terminated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3">Sr#</th>
                <th className="px-3 py-3">Company</th>
                <th className="px-3 py-3">Salary Paid By</th>
                <th className="px-3 py-3 text-center">WPS</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Nationality</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-4 py-3 text-right">Monthly Salary / Rate</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-10 text-center text-slate-400">
                    No employees matching the current filters found.
                  </td>
                </tr>
              ) : (
                sortedEmployees.map((emp, idx) => {
                  const matchedDoc = (emp as any)._matchedDoc;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-3 font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-600">
                        {emp.employeeCompany}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {emp.salaryPaidBy}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          emp.wpsEmployee === 'Yes' ? 'text-emerald-600' : 'text-slate-400'
                        }`}>
                          {emp.wpsEmployee === 'Yes' ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          emp.employeeType === 'Staff' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {emp.employeeType}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          emp.nationalityType === 'Omani' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {emp.nationalityType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-blue-600 block">{emp.employeeId}</span>
                        <span className="font-semibold text-slate-900">{emp.employeeName}</span>
                        {matchedDoc && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {matchedDoc.documentType}: {matchedDoc.documentNumberMasked || 'N/A'}
                            </span>
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              matchedDoc.status === 'Expired'
                                ? 'bg-rose-100 text-rose-800'
                                : matchedDoc.status === 'Urgent'
                                ? 'bg-amber-100 text-amber-800'
                                : matchedDoc.status === 'Expiring Soon'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {matchedDoc.status} {matchedDoc.expiryDate ? `(${matchedDoc.expiryDate})` : ''}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-800">
                        {emp.designation}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        OMR {formatOMR(emp.monthlySalaryOrRate)}
                        <span className="block text-[10px] font-normal text-slate-400">
                          {emp.employeeType === 'Worker' ? 'per hour' : 'fixed/mo'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          emp.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {emp.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewHistory(emp)}
                            title="View Designation & Salary History"
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          {canWrite && (
                            <>
                              <button
                                onClick={() => handleOpenEdit(emp)}
                                title="Edit Employee Record (Personal, Compliance & Documents)"
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleActive(emp)}
                                title={emp.isActive ? 'Deactivate Employee' : 'Activate Employee'}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                  emp.isActive ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                {emp.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Designation & Salary History Modal */}
      {isHistoryModalOpen && historyData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-600" />
                  Audit History: {historyData.employeeId} - {historyData.employeeName}
                </h3>
                <p className="text-xs text-slate-500">
                  Current Designation: {historyData.designation} • Current Rate: OMR {formatOMR(historyData.monthlySalaryOrRate)}
                </p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Designation History */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-indigo-600" />
                  Designation Track Record
                </h4>
                {historyData.designationHistory?.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold">
                        <tr>
                          <th className="px-3 py-2">Effective Date</th>
                          <th className="px-3 py-2">Previous Title</th>
                          <th className="px-3 py-2">Promoted / New Title</th>
                          <th className="px-3 py-2">Modified By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyData.designationHistory.map((h: any) => (
                          <tr key={h.id}>
                            <td className="px-3 py-2">{formatDate(h.effectiveDate)}</td>
                            <td className="px-3 py-2 text-slate-500 line-through">{h.previousDesignation}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{h.newDesignation}</td>
                            <td className="px-3 py-2 text-slate-600">{h.changedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No previous designation changes recorded.</p>
                )}
              </div>

              {/* Salary History */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-emerald-600" />
                  Salary Revision History
                </h4>
                {historyData.salaryHistory?.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold">
                        <tr>
                          <th className="px-3 py-2">Effective Date</th>
                          <th className="px-3 py-2">Previous Salary (OMR)</th>
                          <th className="px-3 py-2">New Salary (OMR)</th>
                          <th className="px-3 py-2">Wage Type</th>
                          <th className="px-3 py-2">Modified By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyData.salaryHistory.map((s: any) => (
                          <tr key={s.id}>
                            <td className="px-3 py-2">{formatDate(s.effectiveDate)}</td>
                            <td className="px-3 py-2 text-slate-500 line-through">OMR {formatOMR(s.previousSalary)}</td>
                            <td className="px-3 py-2 font-bold text-emerald-700 font-mono">OMR {formatOMR(s.newSalary)}</td>
                            <td className="px-3 py-2">{s.wageType}</td>
                            <td className="px-3 py-2 text-slate-600">{s.changedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No salary rate modifications recorded yet.</p>
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Wizard Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Bulk Employee Excel Import Wizard</h3>
              </div>
              <button
                onClick={handleCloseImportModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {importResult ? (
                <div className="text-center py-6 space-y-4">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h4 className="text-base font-bold text-slate-900">Employee Import Completed</h4>
                  <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                      <span className="text-xs text-emerald-600 font-medium">Created</span>
                      <strong className="block text-lg text-emerald-900">{importResult.importedCount}</strong>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                      <span className="text-xs text-blue-600 font-medium">Updated</span>
                      <strong className="block text-lg text-blue-900">{importResult.updatedCount}</strong>
                    </div>
                    <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-center">
                      <span className="text-xs text-slate-600 font-medium">Skipped</span>
                      <strong className="block text-lg text-slate-900">{importResult.skippedCount}</strong>
                    </div>
                  </div>
                  {importResult.skippedCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadErrorReport}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Import Error Report
                    </button>
                  )}
                </div>
              ) : !importPreview ? (
                <div className="space-y-4">
                  {/* Template download & guide quick strip */}
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h5 className="text-xs font-bold text-indigo-950">Need the official import template?</h5>
                      <p className="text-[11px] text-indigo-700 mt-0.5">
                        Download the structured template with standardized columns (supports both .xlsx and .csv).
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        disabled={isDownloading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg text-xs font-semibold shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-600" />
                        Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCsvTemplate}
                        disabled={isDownloadingCsv}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg text-xs font-semibold shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        CSV (.csv)
                      </button>
                    </div>
                  </div>

                  {/* Template Specifications Collapsible */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowTemplateGuide(prev => !prev)}
                      className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-blue-600" />
                        Template Structure & Required Columns (15 Columns)
                      </span>
                      {showTemplateGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                    {showTemplateGuide && (
                      <div className="p-4 bg-white text-xs space-y-3 max-h-64 overflow-y-auto border-t border-slate-200">
                        <p className="text-slate-600 text-[11px] mb-2">
                          The import template supports complete employee records across profile, banking, statutory documents, and ledger balances. Columns marked <strong>Mandatory</strong> must be filled; all other columns will safely default or populate extended records.
                        </p>
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                            <tr>
                              <th className="px-2.5 py-1.5">Section</th>
                              <th className="px-2.5 py-1.5">Column Header</th>
                              <th className="px-2.5 py-1.5">Required?</th>
                              <th className="px-2.5 py-1.5">Valid Values / Format</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-sans">
                            {/* 1. Employment Profile */}
                            <tr className="bg-slate-50/60 font-semibold text-slate-700"><td colSpan={4} className="px-2.5 py-1">1. Employment Profile</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">1</td><td className="px-2.5 py-1 font-bold">Employee ID</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600 font-mono">Unique ID (e.g. EMP001)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">2</td><td className="px-2.5 py-1 font-bold">Employee Name</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600">Full Legal Name</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">3</td><td className="px-2.5 py-1 font-bold">Father Name</td><td className="px-2.5 py-1 text-blue-600 font-medium">Recommended</td><td className="px-2.5 py-1 text-slate-600">Father's Name (for passport/ROP verification)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">4</td><td className="px-2.5 py-1 font-bold">Employee Type</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600 font-semibold">Worker, Staff</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">5</td><td className="px-2.5 py-1 font-bold">Nationality Type</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600 font-semibold">Omani, Expat</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">6</td><td className="px-2.5 py-1 font-bold">Designation</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600">Job Title (e.g. Site Engineer, Mason)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">7</td><td className="px-2.5 py-1 font-bold">Employee Company</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600 font-semibold">DGO, SMI, NC, Supplier, Azad</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">8</td><td className="px-2.5 py-1 font-bold">Salary Paid By</td><td className="px-2.5 py-1 text-emerald-600 font-medium">Auto-defaults</td><td className="px-2.5 py-1 text-slate-600 font-semibold">DGO, SMI, NC, Supplier (defaults to Company)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">9</td><td className="px-2.5 py-1 font-bold">Date of Joining</td><td className="px-2.5 py-1 text-emerald-600 font-medium">Auto-defaults</td><td className="px-2.5 py-1 text-slate-600 font-mono">YYYY-MM-DD (defaults to today if empty)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">10</td><td className="px-2.5 py-1 font-bold">Date of Leaving</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-mono">YYYY-MM-DD (leave empty if active)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">11</td><td className="px-2.5 py-1 font-bold">Employment Status</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-semibold">Active, Inactive (defaults to Active)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">12</td><td className="px-2.5 py-1 font-bold">Assigned Project</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600">Project / Site Name (e.g. Ghala Commercial Hub)</td></tr>

                            {/* 2. Compensation & WPS */}
                            <tr className="bg-slate-50/60 font-semibold text-slate-700"><td colSpan={4} className="px-2.5 py-1">2. Compensation & WPS</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">13</td><td className="px-2.5 py-1 font-bold">Wage Type</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600 font-semibold">Per Hour, Fixed Monthly</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">14</td><td className="px-2.5 py-1 font-bold">Monthly Salary / Wage Rate</td><td className="px-2.5 py-1 text-rose-600 font-bold">Mandatory</td><td className="px-2.5 py-1 text-slate-600 font-mono">Number (OMR amount, e.g. 650.000 or 2.500)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">15</td><td className="px-2.5 py-1 font-bold">WPS Employee</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-semibold">Yes, No (defaults to No)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">16</td><td className="px-2.5 py-1 font-bold">WPS Salary</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-mono">Number (defaults to Monthly Salary if WPS is Yes)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">17</td><td className="px-2.5 py-1 font-bold">Actual Salary</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-mono">Number (defaults to Monthly Salary)</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">18</td><td className="px-2.5 py-1 font-bold">Recover From</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-semibold">DGO, SMI, NC, Supplier (for excess WPS recovery)</td></tr>

                            {/* 3. Banking */}
                            <tr className="bg-slate-50/60 font-semibold text-slate-700"><td colSpan={4} className="px-2.5 py-1">3. Banking Details</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">19-21</td><td className="px-2.5 py-1 font-bold">Bank Name, Account, IBAN</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600">Bank Muscat, Dhofar, NBO, etc. & IBAN (OM...)</td></tr>

                            {/* 4. Personal & Demographics */}
                            <tr className="bg-slate-50/60 font-semibold text-slate-700"><td colSpan={4} className="px-2.5 py-1">4. Personal & Demographics</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">22-33</td><td className="px-2.5 py-1 font-bold">DOB, Gender, Marital, Blood, Phone, Address, Emergency</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600">Full demographics, local address, emergency contacts</td></tr>

                            {/* 5. Statutory Documents */}
                            <tr className="bg-slate-50/60 font-semibold text-slate-700"><td colSpan={4} className="px-2.5 py-1">5. Statutory & Government Documents</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">34-43</td><td className="px-2.5 py-1 font-bold">Civil ID, Passport, Visa, Driving Licence + Expiries</td><td className="px-2.5 py-1 text-blue-600 font-medium">Recommended</td><td className="px-2.5 py-1 text-slate-600">Document numbers & YYYY-MM-DD expiry dates for HR compliance</td></tr>

                            {/* 6. Ledger & Balances */}
                            <tr className="bg-slate-50/60 font-semibold text-slate-700"><td colSpan={4} className="px-2.5 py-1">6. Ledger & Opening Balances</td></tr>
                            <tr><td className="px-2.5 py-1 text-slate-400 font-mono">44-46</td><td className="px-2.5 py-1 font-bold">Opening Loan Balance, Loan Recovery, Opening Salary</td><td className="px-2.5 py-1 text-slate-500">Optional</td><td className="px-2.5 py-1 text-slate-600 font-mono">OMR amounts (e.g. 200.000, 25.000). Auto-generates active loan in ledger.</td></tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {uploadError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-semibold">File Upload Error</strong>
                        <span>{uploadError}</span>
                      </div>
                    </div>
                  )}

                  {/* Dropzone */}
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors bg-slate-50/50">
                    <FileSpreadsheet className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-800">Select or Drag & Drop Employee Spreadsheet</p>
                    <p className="text-xs text-slate-500 mt-1">Accepts standard Excel (.xlsx, .xls) and Comma-Separated Values (.csv)</p>

                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={handleFileChange}
                      className="mt-4 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                      <span className="text-xs text-blue-600 font-medium">New Ready to Import</span>
                      <strong className="block text-lg text-blue-900">{importPreview.summary.newCount}</strong>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                      <span className="text-xs text-amber-600 font-medium">Existing in DB</span>
                      <strong className="block text-lg text-amber-900">{importPreview.summary.existingCount}</strong>
                    </div>
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-center">
                      <span className="text-xs text-purple-600 font-medium">Duplicate in File</span>
                      <strong className="block text-lg text-purple-900">{importPreview.summary.duplicateCount}</strong>
                    </div>
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-center">
                      <span className="text-xs text-rose-600 font-medium">Invalid Rows</span>
                      <strong className="block text-lg text-rose-900">{importPreview.summary.invalidCount}</strong>
                    </div>
                  </div>

                  {/* Overwrite Existing Toggle */}
                  <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <input
                      type="checkbox"
                      id="updateExistingToggle"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500"
                    />
                    <label htmlFor="updateExistingToggle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Update Existing Employees (if Employee ID matches an existing record, update designation, salary, father name, banking, documents, etc.)
                    </label>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row#</th>
                          <th className="px-3 py-2">Employee ID</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Father Name</th>
                          <th className="px-3 py-2">Company / Project</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Designation</th>
                          <th className="px-3 py-2">Salary (OMR)</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Validation Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.rows.map((r: any, idx: number) => (
                          <tr key={idx} className={r.status === 'Invalid' ? 'bg-rose-50/50' : r.status === 'Existing' ? 'bg-amber-50/30' : ''}>
                            <td className="px-3 py-2 font-mono text-slate-400">{r.rowNumber}</td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-900">{r.employeeId}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{r.employeeName}</td>
                            <td className="px-3 py-2 text-slate-600">{r.fatherName || '-'}</td>
                            <td className="px-3 py-2 text-slate-600">
                              <span className="font-semibold">{r.employeeCompany}</span>
                              {r.assignedProject && <span className="block text-[10px] text-slate-400">{r.assignedProject}</span>}
                            </td>
                            <td className="px-3 py-2">{r.employeeType}</td>
                            <td className="px-3 py-2">{r.designation}</td>
                            <td className="px-3 py-2 font-mono">OMR {formatOMR(r.monthlySalaryOrRate)}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                r.status === 'New' ? 'bg-emerald-100 text-emerald-800' :
                                r.status === 'Existing' ? 'bg-amber-100 text-amber-800' :
                                r.status === 'Duplicate' ? 'bg-purple-100 text-purple-800' :
                                'bg-rose-100 text-rose-800'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[11px]">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              {importResult ? (
                <span className="text-xs text-slate-500">{importResult.message}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setImportPreview(null);
                    setImportFile(null);
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Reset Selection
                </button>
              )}

              <div className="flex items-center gap-2.5">
                {importResult ? (
                  <button
                    type="button"
                    onClick={handleCloseImportModal}
                    className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCloseImportModal}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    {importPreview && (
                      <button
                        type="button"
                        disabled={importing || (importPreview.summary.newCount === 0 && !updateExisting)}
                        onClick={handleConfirmImport}
                        className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {importing ? 'Committing Import...' : 'Confirm & Commit Import'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
