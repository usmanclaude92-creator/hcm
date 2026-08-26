import React from 'react';
import { X, Download, FileText } from 'lucide-react';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptUrl: string | null | undefined;
  fileName?: string | null;
  employeeName?: string;
  amount?: number;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  receiptUrl,
  fileName,
  employeeName,
  amount,
}) => {
  if (!isOpen || !receiptUrl) return null;

  const isPdf = receiptUrl.startsWith('data:application/pdf') || (fileName && fileName.toLowerCase().endsWith('.pdf'));

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = receiptUrl;
    link.download = fileName || 'payment_receipt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-medium">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Payment Receipt Attachment</h3>
              <p className="text-xs text-slate-500">
                {employeeName ? `For ${employeeName}` : ''} {amount ? `• OMR ${amount.toFixed(3)}` : ''} • {fileName || 'Attached Document'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 p-6 overflow-auto bg-slate-100 flex items-center justify-center min-h-[400px]">
          {isPdf ? (
            <iframe
              src={receiptUrl}
              title="PDF Receipt"
              className="w-full h-[550px] rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            <img
              src={receiptUrl}
              alt="Payment Receipt"
              className="max-h-[550px] max-w-full object-contain rounded-lg border border-slate-200 shadow-sm bg-white"
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
