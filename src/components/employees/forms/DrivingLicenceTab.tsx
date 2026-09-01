import React from 'react';
import {
  Car,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  History,
  Eye,
  Download,
  UploadCloud,
  FileCheck,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { formatDate } from '../../../api/client';
import { ComplianceBadge } from '../../compliance/ComplianceBadge';
import { FileUploadComponent } from '../../common/FileUploadComponent';
import type { Employee, EmployeeDrivingLicence } from '../../../types/index';

interface DrivingLicenceTabProps {
  employee: Employee | null;
  currentDrivingLicence: EmployeeDrivingLicence | null;
  canWrite: boolean;
  onOpenRenewModal: () => void;
  onOpenHistoryModal: () => void;
  onPreviewDocument: (docUrl: string, fileName?: string) => void;
}

export const DrivingLicenceTab: React.FC<DrivingLicenceTabProps> = ({
  employee,
  currentDrivingLicence,
  canWrite,
  onOpenRenewModal,
  onOpenHistoryModal,
  onPreviewDocument,
}) => {
  const getDaysUntilExpiry = (expiryDateString?: string) => {
    if (!expiryDateString) return null;
    const expiry = new Date(expiryDateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysLeft = currentDrivingLicence
    ? getDaysUntilExpiry(currentDrivingLicence.expiryDate)
    : null;

  return (
    <div className="space-y-6">
      {/* SECTION 1: Overview & Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Car size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Oman Driving Licence &amp; Equipment Operator Authorization
              </h3>
              <p className="text-xs text-slate-500">
                ROP Directorate General of Traffic Authorization Records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentDrivingLicence && (
              <ComplianceBadge status={currentDrivingLicence.status} size="md" />
            )}
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
                <span>
                  {currentDrivingLicence ? 'Renew Driving Licence' : 'Add Driving Licence'}
                </span>
              </button>
            )}
          </div>
        </div>

        {currentDrivingLicence ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Licence Number */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Licence Number
              </span>
              <strong className="font-mono text-base font-bold text-blue-700 tracking-wider">
                {currentDrivingLicence.licenceNumber}
              </strong>
            </div>

            {/* Category */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Licence Category
              </span>
              <strong className="text-sm font-bold text-slate-800">
                {currentDrivingLicence.category}
              </strong>
            </div>

            {/* Expiry Date & Countdown */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Expiration Date
              </span>
              <div className="flex items-center gap-2">
                <strong className="text-sm font-bold text-slate-800">
                  {formatDate(currentDrivingLicence.expiryDate)}
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

            {/* Vehicle Class & Restrictions */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                Class / Restrictions
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {currentDrivingLicence.vehicleClass || 'Light Vehicle'}
                {currentDrivingLicence.restrictions ? ` (${currentDrivingLicence.restrictions})` : ''}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
            <Car className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-xs font-semibold text-slate-600">
              No active Driving Licence record registered for this employee.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={onOpenRenewModal}
                className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Register Driving Licence</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: Document Scans */}
      {currentDrivingLicence && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FileCheck className="text-amber-600" size={18} />
              <h3 className="font-bold text-slate-800 text-sm">
                Driving Licence Digital Scans
              </h3>
            </div>
          </div>

          {currentDrivingLicence.documentAttachment ? (
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                  PDF / IMG
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Driving Licence Scan ({currentDrivingLicence.licenceNumber})
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 truncate max-w-md">
                    {currentDrivingLicence.documentAttachment}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onPreviewDocument(
                      currentDrivingLicence.documentAttachment!,
                      `Licence_${currentDrivingLicence.licenceNumber}`
                    )
                  }
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Eye size={13} />
                  <span>Preview</span>
                </button>
                <a
                  href={currentDrivingLicence.documentAttachment}
                  download={`Licence_${currentDrivingLicence.licenceNumber}`}
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
                No digital scan attached yet for this Driving Licence.
              </p>
              {employee && canWrite && (
                <div className="max-w-md mx-auto pt-2">
                  <FileUploadComponent
                    employeeId={employee.employeeId}
                    category="Driving Licence"
                    title="Upload Driving Licence Card Scan"
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
