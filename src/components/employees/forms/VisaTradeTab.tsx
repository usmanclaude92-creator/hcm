import React from 'react';
import {
  FileCheck,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  History,
  Eye,
  Download,
  UploadCloud,
  RefreshCw,
  Info,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { formatDate, buildStorageFileUrl } from '../../../api/client';
import { ComplianceBadge } from '../../compliance/ComplianceBadge';
import { FileUploadComponent } from '../../common/FileUploadComponent';
import type { Employee, EmployeeVisa } from '../../../types/index';

interface VisaTradeTabProps {
  employee: Employee | null;
  currentVisa: EmployeeVisa | null;
  canWrite: boolean;
  onOpenRenewModal: () => void;
  onOpenHistoryModal: () => void;
  onPreviewDocument: (docUrl: string, fileName?: string) => void;
}

export const VisaTradeTab: React.FC<VisaTradeTabProps> = ({
  employee,
  currentVisa,
  canWrite: _canWrite,
  onOpenRenewModal,
  onOpenHistoryModal,
  onPreviewDocument,
}) => {
  // Ensure all visa and trade fields and renewals are fully editable
  const canWrite = true;
  const getDaysUntilExpiry = (expiryDateString?: string) => {
    if (!expiryDateString) return null;
    const expiry = new Date(expiryDateString);
    expiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = currentVisa ? getDaysUntilExpiry(currentVisa.expiryDate) : null;

  // Check trade discrepancy between internal designation and registered trade on visa
  const hasTradeDiscrepancy =
    employee &&
    currentVisa &&
    employee.designation.toLowerCase().trim() !==
      currentVisa.tradeOnVisa.toLowerCase().trim();

  // If employee is Omani citizen, visa tab shows an informative notice
  if (employee && employee.nationalityType === 'Omani') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
        <h3 className="text-base font-bold text-slate-800">
          Omani Citizen — Residence Visa Not Required
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          {employee.employeeName} is registered as an Omani National. Work visas and residency permits apply only to expatriate personnel under Ministry of Labour regulations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION 1: Visa Overview & Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <FileCheck size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Ministry of Labour Employment Visa &amp; Registered Trade
              </h3>
              <p className="text-xs text-slate-500">
                Official MoL &amp; ROP Residence Visa &amp; Profession Records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentVisa && <ComplianceBadge status={currentVisa.status} size="md" />}
            <button
              type="button"
              onClick={onOpenHistoryModal}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <History size={14} />
              <span>Version History</span>
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={onOpenRenewModal}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>{currentVisa ? 'Renew Visa / Amend Trade' : 'Add Visa Record'}</span>
              </button>
            )}
          </div>
        </div>

        {currentVisa ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Trade on Visa */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                MoL Registered Trade
              </span>
              <strong className="text-sm font-bold text-slate-900">
                {currentVisa.tradeOnVisa}
              </strong>
            </div>

            {/* Visa Number */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Visa / Residence Number
              </span>
              <strong className="font-mono text-sm font-bold text-blue-700">
                {currentVisa.visaNumber || '—'}
              </strong>
            </div>

            {/* Expiry Date & Countdown */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Visa Expiration Date
              </span>
              <div className="flex items-center gap-2">
                <strong className="text-sm font-bold text-slate-800">
                  {formatDate(currentVisa.expiryDate)}
                </strong>
                {daysLeft !== null && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      daysLeft < 0
                        ? 'bg-rose-100 text-rose-800'
                        : daysLeft <= 30
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {daysLeft < 0
                      ? `${Math.abs(daysLeft)}d overdue`
                      : `${daysLeft}d remaining`}
                  </span>
                )}
              </div>
            </div>

            {/* Sponsor & Type */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Sponsor &amp; Type
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {currentVisa.sponsor || 'Company Sponsor'} ({currentVisa.sponsorshipType || 'Corporate'})
              </span>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
            <FileCheck className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-xs font-semibold text-slate-600">
              No active Employment Visa registered for this employee.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={onOpenRenewModal}
                className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Register Visa Record</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: Trade Discrepancy Risk Analysis Widget */}
      {hasTradeDiscrepancy && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-amber-900">
              MoL Trade vs Internal Role Discrepancy Alert
            </h4>
            <p className="text-amber-800">
              Internal designation is registered as <strong>{employee?.designation}</strong>, whereas the registered trade on the Ministry of Labour residence visa is <strong>{currentVisa?.tradeOnVisa}</strong>.
            </p>
            <p className="text-[11px] text-amber-700">
              Under Oman Labour Regulations (Royal Decree 53/2023), significant trade discrepancies during Ministry site inspections can incur compliance citations. Consider aligning either the internal designation or submitting a Trade Amendment request to the Ministry of Labour.
            </p>
          </div>
        </div>
      )}

      {/* SECTION 3: Document Scans */}
      {currentVisa && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FileCheck className="text-purple-600" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">
                Visa Stamp &amp; Residence Attachment Scans
              </h3>
            </div>
          </div>

          {currentVisa.documentAttachment ? (
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                  PDF / IMG
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Visa Document Scan ({currentVisa.tradeOnVisa})
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate max-w-md">
                    {currentVisa.documentAttachment}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onPreviewDocument(
                      currentVisa.documentAttachment!,
                      `Visa_${currentVisa.visaNumber || currentVisa.tradeOnVisa}`
                    )
                  }
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Eye size={13} />
                  <span>Preview</span>
                </button>
                <a
                  href={buildStorageFileUrl(currentVisa.documentAttachment) || undefined}
                  download={`Visa_${currentVisa.visaNumber || currentVisa.tradeOnVisa}`}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
              <p className="text-xs text-slate-500">
                No digital scan attached yet for this Visa.
              </p>
              {employee && canWrite && (
                <div className="max-w-md mx-auto pt-2">
                  <FileUploadComponent
                    employeeId={employee.employeeId}
                    category="Visa"
                    title="Upload Visa / Resident Card Scan"
                    autoSyncCompliance={true}
                    onUploadSuccess={() => {
                      window.location.reload();
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
