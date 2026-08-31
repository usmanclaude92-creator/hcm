import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { apiRequest, formatOMR, formatDate } from '../../api/client';
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
  if (!docType) return 'employment';
  const lower = docType.toLowerCase();
  if (lower.includes('civil') || lower.includes('id')) return 'civil-id';
  if (lower.includes('licence') || lower.includes('license') || lower.includes('driving')) return 'driving-licence';
  if (lower.includes('visa')) return 'visa';
  if (lower.includes('passport')) return 'personal';
  if (lower.includes('permit') || lower.includes('contract') || lower.includes('govt') || lower.includes('bataqa')) return 'govt-docs';
  return 'employment';
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
  const [recordInitialTab, setRecordInitialTab] = useState<EmployeeRecordTab>('employment');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);

  // Import Wizard
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

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
    setRecordInitialTab('employment');
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
      setRecordInitialTab('employment');
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

  const handleExportData = () => {
    window.location.href = '/api/employees/export/data';
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/employees/export/template';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);

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
        alert(err.message || 'Failed to parse spreadsheet');
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
    return (
      <div className="space-y-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            onClick={() => {
              setIsRecordModalOpen(false);
              setSelectedRecordEmp(null);
            }}
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
          }}
          onUpdated={fetchEmployees}
        />
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
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Import Template
          </button>

          <button
            onClick={handleExportData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
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
                Import Excel
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
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                  <FileSpreadsheet className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-800">Select or Drag & Drop Excel Spreadsheet</p>
                  <p className="text-xs text-slate-500 mt-1">Accepts standard .xlsx and .xls formats</p>

                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="mt-4 text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
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
                      Update Existing Employees (if Employee ID matches an existing record, update designation, salary, etc.)
                    </label>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Row#</th>
                          <th className="px-3 py-2">Employee ID</th>
                          <th className="px-3 py-2">Name</th>
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
                            <td className="px-3 py-2">{r.employeeName}</td>
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
