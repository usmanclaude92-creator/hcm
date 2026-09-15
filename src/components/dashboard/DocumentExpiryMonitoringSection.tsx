import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import {
  CreditCard,
  Globe,
  FileCheck,
  Car,
  ShieldCheck,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  ExternalLink,
  ShieldAlert,
  Users,
  RefreshCw,
  Search,
  FolderOpen,
} from 'lucide-react';
import type { DocumentExpiryStatus } from '../../types/index';

export interface DocumentExpiryMonitoringSectionProps {
  onNavigateToEmployees: (filters: { docType?: string; docStatus?: string; search?: string }) => void;
  onNavigateToCompliance?: () => void;
  onNavigateToDocuments?: () => void;
}

interface DocCountItem {
  Valid: number;
  'Expiring Soon': number;
  Urgent: number;
  Expired: number;
  Missing: number;
}

interface ComplianceSummaryResponse {
  totalEmployees: number;
  totalActiveEmployees: number;
  totalValid: number;
  totalExpiringSoon: number;
  totalUrgent: number;
  totalExpired: number;
  totalMissing: number;
  totalAttention: number;
  docCounts: {
    civilId: DocCountItem;
    drivingLicence: DocCountItem;
    visa: DocCountItem;
    passport: DocCountItem;
    workPermit: DocCountItem;
    contract: DocCountItem;
  };
  alerts: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    designation: string;
    employeeCompany: string;
    nationalityType: string;
    documentCategory: string;
    documentType: string;
    documentNumberMasked: string;
    expiryDate: string;
    status: DocumentExpiryStatus;
    daysRemaining: number;
  }>;
  tradeDiscrepancies: any[];
  dlCategoryDistribution: Record<string, number>;
}

export const DocumentExpiryMonitoringSection: React.FC<DocumentExpiryMonitoringSectionProps> = ({
  onNavigateToEmployees,
  onNavigateToCompliance,
  onNavigateToDocuments,
}) => {
  const [data, setData] = useState<ComplianceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('ALL');

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/api/compliance/summary');
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load document compliance metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const docWidgets = [
    {
      id: 'civilId',
      name: 'Civil ID / Resident Card',
      shortName: 'Civil ID',
      icon: CreditCard,
      color: 'blue',
      counts: data?.docCounts?.civilId || { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      description: 'ROP National ID & Resident cards',
    },
    {
      id: 'passport',
      name: 'Passport',
      shortName: 'Passport',
      icon: Globe,
      color: 'indigo',
      counts: data?.docCounts?.passport || { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      description: 'International travel & nationality passports',
    },
    {
      id: 'visa',
      name: 'Employment Visa',
      shortName: 'Visa',
      icon: FileCheck,
      color: 'emerald',
      counts: data?.docCounts?.visa || { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      description: 'Expatriate workforce work & residency visas',
    },
    {
      id: 'drivingLicence',
      name: 'Driving Licence',
      shortName: 'Driving Licence',
      icon: Car,
      color: 'amber',
      counts: data?.docCounts?.drivingLicence || { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      description: 'ROP light & heavy equipment licences',
    },
    {
      id: 'workPermit',
      name: 'Work Permit (Bataqa)',
      shortName: 'Work Permit',
      icon: ShieldCheck,
      color: 'teal',
      counts: data?.docCounts?.workPermit || { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      description: 'Ministry of Labour (MoL) labour cards',
    },
    {
      id: 'contract',
      name: 'Employment Contract',
      shortName: 'Contract',
      icon: FileText,
      color: 'purple',
      counts: data?.docCounts?.contract || { Valid: 0, 'Expiring Soon': 0, Urgent: 0, Expired: 0, Missing: 0 },
      description: 'MoL Registered Oman Labour Contracts (RD 53/2023)',
    },
  ];

  const filteredAlerts = (data?.alerts || []).filter((a) => {
    if (selectedCategoryTab === 'ALL') return true;
    return a.documentCategory.toLowerCase() === selectedCategoryTab.toLowerCase();
  });

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base tracking-tight flex items-center gap-2">
                  Document Expiry Monitoring Engine
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                    Live Feed
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automated Oman compliance tracking for Civil IDs, Passports, Visas, Driving Licences, Work Permits &amp; Contracts
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchSummary}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Refresh Expiry Engine"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {onNavigateToDocuments && (
              <button
                onClick={onNavigateToDocuments}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Document Repository
              </button>
            )}

            {onNavigateToCompliance && (
              <button
                onClick={onNavigateToCompliance}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Compliance 360° Hub
              </button>
            )}
          </div>
        </div>

        {/* Global Compliance Rollup Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => onNavigateToEmployees({ docStatus: 'Expired' })}
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/60 text-left hover:border-rose-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-300 text-xs font-medium mb-1">
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Expired
              </span>
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-xl font-bold text-rose-900 dark:text-rose-300">{data?.totalExpired ?? 0}</div>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">Click to filter employee list</span>
          </button>

          <button
            onClick={() => onNavigateToEmployees({ docStatus: 'Urgent' })}
            className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/60 text-left hover:border-amber-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-xs font-medium mb-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Urgent (≤30 Days)
              </span>
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-xl font-bold text-amber-900 dark:text-amber-300">{data?.totalUrgent ?? 0}</div>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Click to filter employee list</span>
          </button>

          <button
            onClick={() => onNavigateToEmployees({ docStatus: 'Expiring Soon' })}
            className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-100 dark:border-yellow-800/60 text-left hover:border-yellow-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-yellow-700 dark:text-yellow-300 text-xs font-medium mb-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Expiring (31–60d)
              </span>
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-xl font-bold text-yellow-900 dark:text-yellow-300">{data?.totalExpiringSoon ?? 0}</div>
            <span className="text-[10px] text-yellow-700 dark:text-yellow-300 font-medium">Click to filter employee list</span>
          </button>

          <button
            onClick={() => onNavigateToEmployees({ docStatus: 'Valid' })}
            className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/60 text-left hover:border-emerald-300 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active Valid
              </span>
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-xl font-bold text-emerald-900 dark:text-emerald-300">{data?.totalValid ?? 0}</div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Compliant documents</span>
          </button>

          <button
            onClick={() => onNavigateToEmployees({ docStatus: 'Action Needed' })}
            className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left hover:border-slate-400 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 text-xs font-medium mb-1">
              <span className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Total Action Items
              </span>
              <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data?.totalAttention ?? 0}</div>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">All attention required</span>
          </button>
        </div>
      </div>

      {/* The 6 Dedicated Document Expiry Monitoring Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {docWidgets.map((widget) => {
          const Icon = widget.icon;
          const totalDocs =
            (widget.counts.Valid || 0) +
            (widget.counts['Expiring Soon'] || 0) +
            (widget.counts.Urgent || 0) +
            (widget.counts.Expired || 0);

          const validPct = totalDocs > 0 ? Math.round(((widget.counts.Valid || 0) / totalDocs) * 100) : 100;
          const hasAttention = (widget.counts.Expired || 0) > 0 || (widget.counts.Urgent || 0) > 0 || (widget.counts['Expiring Soon'] || 0) > 0;

          return (
            <div
              key={widget.id}
              className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-xs hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight">{widget.name}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{widget.description}</p>
                    </div>
                  </div>

                  {hasAttention ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                      <AlertTriangle className="w-3 h-3" />
                      Action Req.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      <CheckCircle2 className="w-3 h-3" />
                      Healthy
                    </span>
                  )}
                </div>

                {/* Health / Validity Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    <span>Compliance Rate</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{validPct}% Valid</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        validPct >= 80 ? 'bg-emerald-500' : validPct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${validPct}%` }}
                    />
                  </div>
                </div>

                {/* Interactive Status Chips (Direct Linking) */}
                <div className="grid grid-cols-4 gap-1.5 mb-4 text-center">
                  <button
                    onClick={() => onNavigateToEmployees({ docType: widget.shortName, docStatus: 'Expired' })}
                    title={`Filter by expired ${widget.name}`}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      widget.counts.Expired > 0
                        ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-900 dark:text-rose-300'
                        : 'bg-slate-50/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="block text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300">Expired</span>
                    <span className="text-base font-bold">{widget.counts.Expired || 0}</span>
                  </button>

                  <button
                    onClick={() => onNavigateToEmployees({ docType: widget.shortName, docStatus: 'Urgent' })}
                    title={`Filter by urgent ${widget.name} (≤30 days)`}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      widget.counts.Urgent > 0
                        ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-300'
                        : 'bg-slate-50/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="block text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">≤30d</span>
                    <span className="text-base font-bold">{widget.counts.Urgent || 0}</span>
                  </button>

                  <button
                    onClick={() => onNavigateToEmployees({ docType: widget.shortName, docStatus: 'Expiring Soon' })}
                    title={`Filter by expiring ${widget.name} (31-60 days)`}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      widget.counts['Expiring Soon'] > 0
                        ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800/60 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 text-yellow-900 dark:text-yellow-300'
                        : 'bg-slate-50/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="block text-[10px] font-semibold uppercase text-yellow-700 dark:text-yellow-300">31-60d</span>
                    <span className="text-base font-bold">{widget.counts['Expiring Soon'] || 0}</span>
                  </button>

                  <button
                    onClick={() => onNavigateToEmployees({ docType: widget.shortName, docStatus: 'Valid' })}
                    title={`Filter by valid ${widget.name}`}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      widget.counts.Valid > 0
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-900 dark:text-emerald-300'
                        : 'bg-slate-50/50 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="block text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">Valid</span>
                    <span className="text-base font-bold">{widget.counts.Valid || 0}</span>
                  </button>
                </div>
              </div>

              {/* Direct Link to Filtered Employee Master View */}
              <button
                onClick={() => onNavigateToEmployees({ docType: widget.shortName })}
                className="w-full mt-2 py-2 px-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-blue-900/40 border border-slate-200 dark:border-slate-700 hover:border-blue-200 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-700 transition-all flex items-center justify-between group cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-blue-600" />
                  View All {widget.shortName}s in Employee Master
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Immediate Attention & Expiry Alert Stream */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Immediate Document Expiry Action Stream
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                ({filteredAlerts.length} item{filteredAlerts.length === 1 ? '' : 's'} pending renewal)
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any record to inspect or renew the document directly inside the Employee Master
            </p>
          </div>

          {/* Quick Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {[
              { key: 'ALL', label: 'All Expiring' },
              { key: 'civilId', label: 'Civil ID' },
              { key: 'passport', label: 'Passport' },
              { key: 'visa', label: 'Visa' },
              { key: 'drivingLicence', label: 'Licence' },
              { key: 'workPermit', label: 'Work Permit' },
              { key: 'contract', label: 'Contract' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedCategoryTab(tab.key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  selectedCategoryTab === tab.key
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredAlerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Company / Desig</th>
                  <th className="py-2.5 px-3">Document Category</th>
                  <th className="py-2.5 px-3">Doc #</th>
                  <th className="py-2.5 px-3">Expiry Date</th>
                  <th className="py-2.5 px-3 text-center">Status / Urgency</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAlerts.map((alert) => {
                  const isExpired = alert.status === 'Expired';
                  const isUrgent = alert.status === 'Urgent';

                  return (
                    <tr key={alert.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{alert.employeeName}</div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{alert.employeeId}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">{alert.designation}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{alert.employeeCompany}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          {alert.documentType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {alert.documentNumberMasked}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                        {alert.expiryDate}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300">
                            <AlertTriangle className="w-3 h-3" />
                            Expired ({Math.abs(alert.daysRemaining)}d ago)
                          </span>
                        ) : isUrgent ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            <Clock className="w-3 h-3" />
                            Urgent ({alert.daysRemaining}d left)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">
                            <Clock className="w-3 h-3" />
                            {alert.daysRemaining}d left
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() =>
                            onNavigateToEmployees({
                              search: alert.employeeId,
                              docType: alert.documentType,
                              docStatus: alert.status,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                          Inspect &amp; Renew
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">All Monitored Documents Up to Date</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              No expired or critically urgent documents found in the active workforce.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
