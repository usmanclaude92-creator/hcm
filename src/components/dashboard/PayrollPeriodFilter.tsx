import React from 'react';
import { Calendar } from 'lucide-react';

export type PeriodMode = 'month' | 'range' | 'all';

interface Props {
  mode: PeriodMode;
  onModeChange: (mode: PeriodMode) => void;
  selectedMonth: string;
  onSelectedMonthChange: (month: string) => void;
  fromMonth: string;
  onFromChange: (month: string) => void;
  toMonth: string;
  onToChange: (month: string) => void;
  availableMonths: string[];
}

function formatMonthOption(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function monthSelectOptions(availableMonths: string[], mustInclude: string[]): string[] {
  const set = new Set(availableMonths);
  mustInclude.forEach((m) => {
    if (m) set.add(m);
  });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

export const PayrollPeriodFilter: React.FC<Props> = ({
  mode,
  onModeChange,
  selectedMonth,
  onSelectedMonthChange,
  fromMonth,
  onFromChange,
  toMonth,
  onToChange,
  availableMonths,
}) => {
  const monthOptions = monthSelectOptions(availableMonths, [selectedMonth]);
  const rangeOptions = monthSelectOptions(availableMonths, [fromMonth, toMonth]);

  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        Period:
      </div>
      <select
        value={mode}
        onChange={(e) => onModeChange(e.target.value as PeriodMode)}
        className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        <option value="month">Payroll Month</option>
        <option value="range">Payroll Months Range</option>
        <option value="all">All Time</option>
      </select>

      {mode === 'month' && (
        <select
          value={selectedMonth}
          onChange={(e) => onSelectedMonthChange(e.target.value)}
          className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {formatMonthOption(m)}
            </option>
          ))}
        </select>
      )}

      {mode === 'range' && (
        <>
          <span className="text-[11px] text-slate-500 font-medium">From</span>
          <select
            value={fromMonth}
            onChange={(e) => onFromChange(e.target.value)}
            className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {rangeOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthOption(m)}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500 font-medium">To</span>
          <select
            value={toMonth}
            onChange={(e) => onToChange(e.target.value)}
            className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {rangeOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthOption(m)}
              </option>
            ))}
          </select>
        </>
      )}

      {mode === 'all' && (
        <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          All Payroll History
        </span>
      )}
    </div>
  );
};
