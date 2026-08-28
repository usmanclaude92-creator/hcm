import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  // Shown in the closed control when every option is selected, e.g. "All Companies".
  allLabel: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

// Professional checkbox-based multi-select: closed control shows a compact label,
// opens into a checkbox popover with a "Select All" row that stays in sync with the
// individual checkboxes (checked iff every option is selected -- no separate state).
export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  allLabel,
  options,
  selected,
  onChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = options.length > 0 && selected.length === options.length;

  const toggleSelectAll = () => {
    onChange(allSelected ? [] : options.map(o => o.value));
  };

  const toggleOption = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const displayLabel = allSelected
    ? allLabel
    : selected.length === 0
      ? 'None selected'
      : selected.length === 1
        ? (options.find(o => o.value === selected[0])?.label || selected[0])
        : `${selected.length} selected`;

  return (
    <div className={`relative ${className || ''}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 min-w-full w-max max-w-64 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto py-1">
          <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-800 border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            Select All
          </label>
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggleOption(opt.value)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
