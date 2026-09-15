import React from 'react';
import {
  CreditCard,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  History,
  Eye,
  Download,
  UploadCloud,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { formatDate, buildStorageFileUrl } from '../../../api/client';
import { ComplianceBadge } from '../../compliance/ComplianceBadge';
import { FileUploadComponent } from '../../common/FileUploadComponent';
import type { Employee, EmployeeCivilId } from '../../../types/index';

interface CivilIdTabProps {
  employee: Employee | null;
  currentCivilId: EmployeeCivilId | null;
  canWrite: boolean;
  onOpenRenewModal: () => void;
  onOpenHistoryModal: () => void;
  onPreviewDocument: (docUrl: string, fileName?: string) => void;
}

export const CivilIdTab: React.FC<CivilIdTabProps> = ({
  employee,
  currentCivilId,
  canWrite,
  onOpenRenewModal,
  onOpenHistoryModal,
  onPreviewDocument,
}) => {
  // Compute days until expiry
  const getDaysUntilExpiry = (expiryDateString?: string) => {
    if (!expiryDateString) return null;
    const expiry = new Date(expiryDateString);
    expiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = currentCivilId ? getDaysUntilExpiry(currentCivilId.expiryDate) : null;

  return (
    <div className="space-y-6">
      {/* SECTION 1: Status & Overview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <CreditCard size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Oman Civil ID / Resident ID Card (ROP)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official Royal Oman Police National Identification Record
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentCivilId && (
              <ComplianceBadge status={currentCivilId.status} size="md" />
            )}
            <button
              type="button"
              onClick={onOpenHistoryModal}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                <span>{currentCivilId ? 'Renew / Replace Card' : 'Add Civil ID'}</span>
              </button>
            )}
          </div>
        </div>

        {currentCivilId ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Civil ID Number */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                Civil ID / Resident ID
              </span>
              <strong className="font-mono text-base font-bold text-blue-700 dark:text-blue-300 tracking-wider">
                {currentCivilId.civilIdNumber}
              </strong>
            </div>

            {/* Expiry Date & Countdown */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                Expiration Date
              </span>
              <div className="flex items-center gap-2">
                <strong className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {formatDate(currentCivilId.expiryDate)}
                </strong>
                {daysLeft !== null && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      daysLeft < 0
                        ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300'
                        : daysLeft <= 30
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {daysLeft < 0
                      ? `${Math.abs(daysLeft)}d overdue`
                      : `${daysLeft}d remaining`}
                  </span>
                )}
              </div>
            </div>

            {/* Issue Date */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                Issue Date
              </span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {currentCivilId.issueDate ? formatDate(currentCivilId.issueDate) : '—'}
              </span>
            </div>

            {/* Issuing Authority */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                Authority &amp; Country
              </span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {currentCivilId.issuingAuthority || 'Royal Oman Police (ROP)'} • {currentCivilId.country || 'Oman'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 space-y-2">
            <CreditCard className="w-8 h-8 mx-auto text-slate-400 dark:text-slate-500" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              No active Civil ID / Resident ID record registered for this employee.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={onOpenRenewModal}
                className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <CreditCard size={14} />
                <span>Register Civil ID Record</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: Document Scans & Attachments */}
      {currentCivilId && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FileCheck className="text-blue-600 dark:text-blue-400" size={18} />
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Civil ID Digital Document Attachments
              </h3>
            </div>
          </div>

          {currentCivilId.documentAttachment ? (
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
                  PDF / IMG
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Civil ID Scan ({currentCivilId.civilIdNumber})
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-md">
                    {currentCivilId.documentAttachment}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onPreviewDocument(
                      currentCivilId.documentAttachment!,
                      `CivilID_${currentCivilId.civilIdNumber}`
                    )
                  }
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Eye size={13} />
                  <span>Preview</span>
                </button>
                <a
                  href={buildStorageFileUrl(currentCivilId.documentAttachment) || undefined}
                  download={`CivilID_${currentCivilId.civilIdNumber}`}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No digital scan attached yet for this Civil ID. Upload a scanned copy or PDF below:
              </p>
              {employee && canWrite && (
                <div className="max-w-md mx-auto pt-2">
                  <FileUploadComponent
                    employeeId={employee.employeeId}
                    category="Civil ID"
                    title="Upload Civil ID Card Scan"
                    autoSyncCompliance={true}
                    onUploadSuccess={() => {
                      // refresh
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
