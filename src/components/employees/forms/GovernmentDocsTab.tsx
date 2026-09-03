import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Eye,
  Download,
  Trash2,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import { formatDate, buildStorageFileUrl } from '../../../api/client';
import { ComplianceBadge } from '../../compliance/ComplianceBadge';
import type {
  Employee,
  EmployeeGovernmentDocument,
} from '../../../types/index';

interface GovernmentDocsTabProps {
  employee: Employee | null;
  governmentDocuments: EmployeeGovernmentDocument[];
  canWrite: boolean;
  onOpenAddDocModal: () => void;
  onDeleteDoc: (docId: string) => Promise<void>;
  onPreviewDocument: (docUrl: string, fileName?: string) => void;
}

export const GovernmentDocsTab: React.FC<GovernmentDocsTabProps> = ({
  employee,
  governmentDocuments = [],
  canWrite,
  onOpenAddDocModal,
  onDeleteDoc,
  onPreviewDocument,
}) => {
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  const getDaysUntilExpiry = (expiryDateString?: string) => {
    if (!expiryDateString) return null;
    const expiry = new Date(expiryDateString);
    expiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filteredDocs = governmentDocuments.filter((doc) => {
    if (selectedTypeFilter === 'ALL') return true;
    return doc.documentType === selectedTypeFilter;
  });

  return (
    <div className="space-y-6">
      {/* SECTION 1: Header + Filter + Add Button */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Government Passports, Permits &amp; Regulatory Cards
              </h3>
              <p className="text-xs text-slate-500">
                Passports, MoL Work Permits, Medical Cards &amp; Contracts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canWrite && (
              <button
                type="button"
                onClick={onOpenAddDocModal}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Document / Passport</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'Passport', 'Work Permit', 'Medical Certificate', 'Employment Contract', 'Other'].map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedTypeFilter(type)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedTypeFilter === type
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {type === 'ALL' ? `All (${governmentDocuments.length})` : type}
              </button>
            )
          )}
        </div>
      </div>

      {/* SECTION 2: Document Cards Grid */}
      {filteredDocs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocs.map((doc) => {
            const daysLeft = getDaysUntilExpiry(doc.expiryDate);
            return (
              <div
                key={doc.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      {doc.documentType}
                    </span>
                    <h4 className="font-mono text-sm font-bold text-slate-900">
                      {doc.documentNumber}
                    </h4>
                    {doc.country && (
                      <p className="text-[11px] text-slate-500">
                        {doc.country} {doc.issuingAuthority ? `• ${doc.issuingAuthority}` : ''}
                      </p>
                    )}
                  </div>
                  <ComplianceBadge status={doc.status} size="sm" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Issue Date</span>
                    <span className="font-medium text-slate-700">
                      {doc.issueDate ? formatDate(doc.issueDate) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Expiry Date</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800">
                        {formatDate(doc.expiryDate)}
                      </span>
                      {daysLeft !== null && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-sm ${
                            daysLeft < 0
                              ? 'bg-rose-100 text-rose-800'
                              : daysLeft <= 30
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {doc.remarks && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg italic">
                    {doc.remarks}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    {doc.documentAttachment && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewDocument(
                              doc.documentAttachment!,
                              `${doc.documentType}_${doc.documentNumber}`
                            )
                          }
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>Preview</span>
                        </button>
                        <a
                          href={buildStorageFileUrl(doc.documentAttachment) || undefined}
                          download={`${doc.documentType}_${doc.documentNumber}`}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Download size={12} />
                          <span>Download</span>
                        </a>
                      </>
                    )}
                  </div>

                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => onDeleteDoc(doc.id)}
                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete document record"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-10 text-center bg-white rounded-xl border border-dashed border-slate-300 space-y-2">
          <FileText className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-xs font-semibold text-slate-600">
            No government documents recorded under this filter category.
          </p>
          {canWrite && (
            <button
              type="button"
              onClick={onOpenAddDocModal}
              className="mt-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Document</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
