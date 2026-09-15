import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, AlertOctagon, HelpCircle, FileWarning } from 'lucide-react';
import type { DocumentExpiryStatus } from '../../types/index';

interface ComplianceBadgeProps {
  status: DocumentExpiryStatus | string;
  daysRemaining?: number;
  showDays?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({
  status,
  daysRemaining,
  showDays = false,
  className = '',
  size = 'md',
}) => {
  let bgClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600';
  let Icon = HelpCircle;

  switch (status) {
    case 'Valid':
      bgClass = 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
      Icon = CheckCircle2;
      break;
    case 'Expiring Soon':
      bgClass = 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60';
      Icon = Clock;
      break;
    case 'Urgent':
      bgClass = 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700 animate-pulse';
      Icon = AlertTriangle;
      break;
    case 'Expired':
      bgClass = 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 font-semibold';
      Icon = AlertOctagon;
      break;
    case 'Missing':
      bgClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 border-dashed';
      Icon = HelpCircle;
      break;
    case 'Trade Mismatch':
    case 'Discrepancy':
      bgClass = 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60';
      Icon = FileWarning;
      break;
    default:
      bgClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600';
      Icon = HelpCircle;
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5 font-medium',
    lg: 'px-3 py-1.5 text-sm gap-2 font-medium',
  };

  const iconSizes迷 = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeClasses[size]} ${bgClass} ${className} whitespace-nowrap`}
    >
      <Icon size={iconSizes迷[size]} className="shrink-0" />
      <span>{status}</span>
      {showDays && daysRemaining !== undefined && (
        <span className="opacity-80 text-[10px] ml-0.5">
          {daysRemaining < 0
            ? `(${Math.abs(daysRemaining)}d ago)`
            : daysRemaining === 0
            ? '(Today)'
            : `(${daysRemaining}d)`}
        </span>
      )}
    </span>
  );
};
