import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ShieldAlert,
  ShieldCheck,
  CreditCard,
  Car,
  FileCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertOctagon,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileDown,
  RefreshCw,
  Sparkles,
  Bot,
  Send,
  Building,
  User,
  Eye,
  ChevronRight,
  HelpCircle,
  Wrench,
  Truck,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { apiRequest, formatDate } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ComplianceBadge } from './ComplianceBadge';
import { EmployeeIdentificationModal } from '../employees/EmployeeIdentificationModal';
import type { Employee } from '../../types/index';

interface ComplianceSummary {
  totalEmployees: number;
  totalValid: number;
  totalExpiringSoon: number;
  totalUrgent: number;
  totalExpired: number;
  totalTradeDiscrepancies: number;
  civilIds: { valid: number; expiringSoon: number; urgent: number; expired: number; missing: number };
  visas: { valid: number; expiringSoon: number; urgent: number; expired: number; missing: number };
  drivingLicences: { valid: number; expiringSoon: number; urgent: number; expired: number };
}

export const ComplianceDashboardView: React.FC = () => {
  const { canWrite, isAdmin, isManager } = useAuth();

  const [activeTab, setActiveTab] = useState<'alerts' | 'trade-matrix' | 'fleet' | 'ai-assistant'>('alerts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Raw Data
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [expiries, setExpiries] = useState<any[]>([]);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [drivingOperators, setDrivingOperators] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Filtering
  const [search, setSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [nationalityFilter, setNationalityFilter] = useState('ALL');

  // Modal State for Inspect / Renew
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<any>('civil-id');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // AI Assistant State
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; text: string; structuredData?: any; timestamp: string }>
  >([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Marhaba! I am your Oman HR Compliance & Identification Assistant. Ask me anything about document expiries, Civil ID renewals, Trade-on-Visa discrepancies, ROP driving licences, or Ministry of Labour regulatory rules.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, expiriesRes, empRes] = await Promise.all([
        apiRequest('/api/compliance/summary'),
        apiRequest('/api/compliance/expiries'),
        apiRequest('/api/employees'),
      ]);

      setSummary(summaryRes.summary);
      setDiscrepancies(summaryRes.tradeDiscrepancies || []);
      setDrivingOperators(summaryRes.drivingLicences || []);
      setExpiries(expiriesRes || []);
      setEmployees(Array.isArray(empRes) ? empRes : empRes.employees || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch compliance dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Expiries Feed
  const filteredExpiries = useMemo(() => {
    return expiries.filter((item) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        item.employeeName?.toLowerCase().includes(q) ||
        item.employeeId?.toLowerCase().includes(q) ||
        item.documentNumber?.toLowerCase().includes(q) ||
        item.documentType?.toLowerCase().includes(q) ||
        item.designation?.toLowerCase().includes(q);

      const matchDocType = docTypeFilter === 'ALL' || item.documentType === docTypeFilter;
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchCompany = companyFilter === 'ALL' || item.company === companyFilter;
      const matchNat =
        nationalityFilter === 'ALL' ||
        (nationalityFilter === 'Omani' ? item.nationality === 'Omani' : item.nationality !== 'Omani');

      return matchSearch && matchDocType && matchStatus && matchCompany && matchNat;
    });
  }, [expiries, search, docTypeFilter, statusFilter, companyFilter, nationalityFilter]);

  // Open modal helper
  const handleOpenInspect = (employeeId: string, docType: string) => {
    const emp = employees.find((e) => e.employeeId === employeeId);
    if (!emp) return;

    let tab: any = 'civil-id';
    if (docType.includes('Civil ID') || docType.includes('Resident')) tab = 'civil-id';
    else if (docType.includes('Licence')) tab = 'driving-licence';
    else if (docType.includes('Visa')) tab = 'visa';
    else tab = 'govt-docs';

    setSelectedEmployee(emp);
    setModalInitialTab(tab);
    setIsModalOpen(true);
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredExpiries.map((item) => ({
      'Employee ID': item.employeeId,
      'Employee Name': item.employeeName,
      Company: item.company,
      Designation: item.designation,
      Nationality: item.nationality,
      'Document Type': item.documentType,
      'Document Number': item.documentNumber,
      'Expiry Date': item.expiryDate,
      'Days Remaining': item.daysRemaining,
      'Compliance Status': item.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Compliance Expiries');
    XLSX.writeFile(workbook, `Oman_Compliance_Expiries_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.text('Oman HR Compliance & Document Expiry Audit Report', 14, 15);
    doc.setFontSize(9);
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Filtered Items: ${filteredExpiries.length}`,
      14,
      22
    );

    const tableData = filteredExpiries.map((item) => [
      item.employeeId,
      item.employeeName,
      item.company,
      item.documentType,
      item.documentNumber,
      item.expiryDate,
      item.daysRemaining !== undefined ? `${item.daysRemaining} days` : '—',
      item.status,
    ]);

    autoTable(doc, {
      startY: 26,
      head: [['Emp ID', 'Name', 'Company', 'Document', 'Doc Number', 'Expiry Date', 'Remaining', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8 },
    });

    doc.save(`Oman_Compliance_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // AI Query Handler
  const handleSendAiQuery = async (queryText?: string) => {
    const textToSend = queryText || aiQuery;
    if (!textToSend.trim()) return;

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!queryText) setAiQuery('');
    setAiLoading(true);

    try {
      const response = await apiRequest('/api/compliance/ai-assistant', {
        method: 'POST',
        body: JSON.stringify({ query: textToSend }),
      });

      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        text: response.answer || response.message || 'No response provided.',
        structuredData: response.structuredData,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setAiMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        text: `Error contacting compliance AI: ${err.message || 'Service unavailable'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setAiMessages((prev) => [...prev, errorMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  // If inspecting or editing an employee's compliance record, render inline full page form
  if (isModalOpen && selectedEmployee) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            onClick={() => {
              setIsModalOpen(false);
              setSelectedEmployee(null);
            }}
            className="hover:text-blue-600 font-semibold flex items-center gap-1 cursor-pointer transition-colors text-slate-600"
          >
            <ArrowLeft size={13} />
            <span>Compliance 360° Hub</span>
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-800">
            {selectedEmployee.employeeName} ({selectedEmployee.employeeId})
          </span>
        </div>

        <EmployeeIdentificationModal
          employee={selectedEmployee}
          isOpen={true}
          mode="inline"
          backLabel="Back to Compliance Hub"
          initialTab={modalInitialTab}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedEmployee(null);
          }}
          onUpdated={fetchData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <ShieldAlert size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Oman HR Compliance & Documents 360°
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                MoL & ROP Rules
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Deterministic monitoring of Civil IDs, Expat Visas, Trade Professions, Driving Licences & Government Documents.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={exportToExcel}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileSpreadsheet size={14} />
            <span>Export Excel</span>
          </button>
          <button
            onClick={exportToPDF}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <FileDown size={14} />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Total Employees */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Active</span>
              <User size={15} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{summary.totalEmployees}</div>
            <span className="text-[10px] text-slate-500">Tracked in Workforce</span>
          </div>

          {/* Valid */}
          <div className="bg-white rounded-xl border border-emerald-200 bg-emerald-50/20 p-4 shadow-xs">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Fully Valid</span>
              <CheckCircle2 size={15} />
            </div>
            <div className="text-2xl font-bold text-emerald-700">{summary.totalValid}</div>
            <span className="text-[10px] text-emerald-600">All docs compliant</span>
          </div>

          {/* Expiring Soon (30-60d) */}
          <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/20 p-4 shadow-xs">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Expiring (30-60d)</span>
              <Clock size={15} />
            </div>
            <div className="text-2xl font-bold text-amber-700">{summary.totalExpiringSoon}</div>
            <span className="text-[10px] text-amber-600">Renewal scheduled</span>
          </div>

          {/* Urgent (<30d) */}
          <div className="bg-white rounded-xl border border-orange-200 bg-orange-50/20 p-4 shadow-xs">
            <div className="flex items-center justify-between text-orange-700 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Urgent (&lt;30d)</span>
              <AlertTriangle size={15} />
            </div>
            <div className="text-2xl font-bold text-orange-800">{summary.totalUrgent}</div>
            <span className="text-[10px] text-orange-700 font-medium">Critical attention</span>
          </div>

          {/* Expired */}
          <div className="bg-white rounded-xl border border-rose-200 bg-rose-50/20 p-4 shadow-xs">
            <div className="flex items-center justify-between text-rose-700 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Expired</span>
              <AlertOctagon size={15} />
            </div>
            <div className="text-2xl font-bold text-rose-700">{summary.totalExpired}</div>
            <span className="text-[10px] text-rose-600 font-semibold">Immediate penalty risk</span>
          </div>

          {/* Trade Discrepancies */}
          <div className="bg-white rounded-xl border border-purple-200 bg-purple-50/20 p-4 shadow-xs">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Trade Mismatch</span>
              <ShieldAlert size={15} />
            </div>
            <div className="text-2xl font-bold text-purple-800">{summary.totalTradeDiscrepancies}</div>
            <span className="text-[10px] text-purple-700">Visa vs Designation</span>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 gap-2 shadow-xs">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'alerts'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock size={16} />
          <span>Expiry Alert Feed & Records</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-semibold">
            {filteredExpiries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('trade-matrix')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'trade-matrix'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileCheck size={16} />
          <span>Visa Trade Discrepancy Matrix</span>
          {discrepancies.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 font-bold">
              {discrepancies.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('fleet')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'fleet'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck size={16} />
          <span>Driving Licences & Plant Operators</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-semibold">
            {drivingOperators.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ai-assistant')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'ai-assistant'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles size={16} className="text-amber-500" />
          <span>AI Oman Compliance Intelligence</span>
        </button>
      </div>

      {/* TAB CONTENT 1: EXPIRY ALERTS FEED */}
      {activeTab === 'alerts' && (
        <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-5 shadow-xs space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Search employee, ID, designation, document number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            <div>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All Document Types</option>
                <option value="Civil ID">Civil ID / Resident ID</option>
                <option value="Visa">Employment Visa</option>
                <option value="Driving Licence">Driving Licence</option>
                <option value="Passport">Passport</option>
                <option value="Work Permit">Work Permit / Labour Card</option>
              </select>
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All Expiry Statuses</option>
                <option value="Expired">Expired</option>
                <option value="Urgent">Urgent (&lt;30d)</option>
                <option value="Expiring Soon">Expiring Soon (30-60d)</option>
                <option value="Valid">Valid (&gt;60d)</option>
              </select>
            </div>

            <div>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All Companies</option>
                <option value="Artify Solutions LLC">Artify Solutions LLC</option>
                <option value="Artify Construction LLC">Artify Construction LLC</option>
                <option value="DGO">DGO</option>
                <option value="ARD">ARD</option>
                <option value="ART">ART</option>
              </select>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Company & Role</th>
                  <th className="py-3 px-4">Document Type</th>
                  <th className="py-3 px-4">Document Number</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Days Left</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredExpiries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No documents match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredExpiries.map((item, idx) => (
                    <tr
                      key={`${item.employeeId}-${item.documentType}-${idx}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.employeeName}</div>
                        <div className="text-[10px] font-mono text-slate-500">{item.employeeId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{item.company}</div>
                        <div className="text-[10px] text-slate-500">{item.designation}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-700">{item.documentType}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold text-slate-900">
                          {item.documentNumber || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {formatDate(item.expiryDate)}
                      </td>
                      <td className="py-3 px-4">
                        {item.daysRemaining !== undefined ? (
                          <span
                            className={`font-semibold ${
                              item.daysRemaining < 0
                                ? 'text-rose-600'
                                : item.daysRemaining <= 30
                                ? 'text-orange-600'
                                : item.daysRemaining <= 60
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {item.daysRemaining < 0
                              ? `${Math.abs(item.daysRemaining)}d ago`
                              : `${item.daysRemaining} days`}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <ComplianceBadge status={item.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenInspect(item.employeeId, item.documentType)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold text-xs inline-flex items-center gap-1 transition-colors border border-blue-200"
                        >
                          <span>Inspect / Renew</span>
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: VISA TRADE DISCREPANCY MATRIX */}
      {activeTab === 'trade-matrix' && (
        <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-5 shadow-xs space-y-4">
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 flex items-start gap-3">
            <ShieldAlert className="text-purple-600 shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-purple-900">
              <h3 className="font-bold text-sm text-purple-950 mb-0.5">
                Ministry of Labour (MoL) & Royal Oman Police Trade Discrepancy Matrix
              </h3>
              <p>
                Oman Labour Law prohibits employing expatriate personnel in trades differing from their registered
                visa occupation without an approved MoL trade amendment. Below is the live discrepancy ledger between
                internal job designations and official Trade-on-Visa records.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Internal Job Designation</th>
                  <th className="py-3 px-4">Trade on Visa (MoL/ROP)</th>
                  <th className="py-3 px-4">Sponsor</th>
                  <th className="py-3 px-4">Risk Severity</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {discrepancies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                      <p className="text-xs font-semibold text-slate-700">No trade discrepancies detected.</p>
                      <p className="text-[11px] text-slate-500">All expat designations match their registered visa trade records.</p>
                    </td>
                  </tr>
                ) : (
                  discrepancies.map((disc) => (
                    <tr key={disc.employeeId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{disc.employeeName}</div>
                        <div className="text-[10px] font-mono text-slate-500">{disc.employeeId}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{disc.company}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold border border-slate-300">
                          {disc.designation}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-bold border border-purple-300">
                          {disc.tradeOnVisa}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{disc.sponsor || disc.company}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            disc.severity === 'High'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {disc.severity} Risk
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenInspect(disc.employeeId, 'Visa')}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-xs inline-flex items-center gap-1 transition-colors shadow-xs"
                        >
                          <span>Amend Trade</span>
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: FLEET & PLANT OPERATORS */}
      {activeTab === 'fleet' && (
        <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Oman Traffic ROP Driving Licences & Heavy Equipment Operators
              </h3>
              <p className="text-xs text-slate-500">
                Verified operators for construction vehicles, mobile cranes, light fleets, and site machinery.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drivingOperators.length === 0 ? (
              <div className="col-span-full py-8 text-center text-slate-400">
                <Car size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs">No registered driving licences found.</p>
              </div>
            ) : (
              drivingOperators.map((op) => (
                <div
                  key={op.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        {op.category}
                      </span>
                      <ComplianceBadge status={op.status} size="sm" />
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{op.employeeName}</h4>
                      <p className="text-[11px] text-slate-500">
                        {op.designation} • {op.company}
                      </p>
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="flex justify-between">
                        <span>Licence No:</span>
                        <span className="font-mono font-bold text-slate-800">{op.licenceNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Vehicle Class:</span>
                        <span className="font-medium text-slate-800">{op.vehicleClass || 'Light Vehicle'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Expires:</span>
                        <span className="font-semibold text-slate-900">{formatDate(op.expiryDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-end">
                    <button
                      onClick={() => handleOpenInspect(op.employeeId, 'Driving Licence')}
                      className="px-2 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                    >
                      <span>Inspect Operator Licence</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: AI COMPLIANCE ASSISTANT */}
      {activeTab === 'ai-assistant' && (
        <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 p-5 shadow-xs space-y-4">
          <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <Bot size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold">Oman HR Compliance & Regulatory AI Assistant</h3>
                <p className="text-xs text-blue-200">
                  Powered by Gemini 2.5 • Inspect document expiries, trade alignments, ROP and MoL regulatory requirements.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Prompt Suggestions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                handleSendAiQuery('Which employee visas or Civil IDs are expiring in the next 45 days?')
              }
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              Expiries in next 45 days
            </button>
            <button
              onClick={() =>
                handleSendAiQuery('Are there any trade discrepancies between visa titles and job roles?')
              }
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              Inspect trade discrepancies
            </button>
            <button
              onClick={() =>
                handleSendAiQuery('Summarize all driving licences and equipment operators')
              }
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              Fleet & operator licences
            </button>
            <button
              onClick={() =>
                handleSendAiQuery('What are the legal compliance steps for renewing an Omani resident card under ROP guidelines?')
              }
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
            >
              Resident Card Renewal Rules
            </button>
          </div>

          {/* Chat Messages */}
          <div className="h-96 overflow-y-auto rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-4">
            {aiMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Bot size={16} />
                  </div>
                )}
                <div
                  className={`max-w-2xl rounded-xl p-3.5 text-xs shadow-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span
                    className={`block text-[10px] mt-1.5 text-right ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {aiLoading && (
              <div className="flex gap-3 justify-start items-center text-xs text-slate-500">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Bot size={16} />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>Analyzing compliance records with Gemini...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask compliance AI about Oman labour regulations, expiring documents, or employee verification..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendAiQuery()}
              className="flex-1 px-4 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
            <button
              onClick={() => handleSendAiQuery()}
              disabled={aiLoading || !aiQuery.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Send size={14} />
              <span>Ask AI</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
