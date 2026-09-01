import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check, User, Building, Briefcase } from 'lucide-react';
import type { Employee } from '../../types/index';

export interface SearchableEmployeeSelectProps {
  employees: Employee[];
  value: string;
  onChange: (employeeId: string, employee?: Employee) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
  showDetails?: boolean;
  required?: boolean;
  id?: string;
  width?: string;
}

export const SearchableEmployeeSelect: React.FC<SearchableEmployeeSelectProps> = ({
  employees = [],
  value,
  onChange,
  placeholder = 'Select Employee...',
  className = '',
  disabled = false,
  allowClear = true,
  showDetails = true,
  required = false,
  id,
  width = 'w-72',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find currently selected employee object
  const selectedEmployee = useMemo(() => {
    if (!value) return null;
    return employees.find(
      (e) =>
        e.employeeId === value ||
        e.id === value ||
        e.employeeId?.toLowerCase() === value?.toLowerCase()
    ) || null;
  }, [employees, value]);

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) {
      return employees;
    }
    const q = searchQuery.toLowerCase().trim();
    return employees.filter((emp) => {
      const idMatch = emp.employeeId?.toLowerCase().includes(q);
      const nameMatch = emp.employeeName?.toLowerCase().includes(q);
      const desigMatch = emp.designation?.toLowerCase().includes(q);
      const compMatch = emp.employeeCompany?.toLowerCase().includes(q);
      const natMatch = emp.nationalityType?.toLowerCase().includes(q);
      return idMatch || nameMatch || desigMatch || compMatch || natMatch;
    });
  }, [employees, searchQuery]);

  // Reset highlighted index when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredEmployees]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle select employee
  const handleSelect = (emp: Employee) => {
    onChange(emp.employeeId, emp);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Handle clear selection
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', undefined);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredEmployees.length - 1 ? prev + 1 : prev
      );
      // Scroll into view
      scrollItemIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      // Scroll into view
      scrollItemIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredEmployees[highlightedIndex]) {
        handleSelect(filteredEmployees[highlightedIndex]);
      }
    }
  };

  const scrollItemIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-employee-item]');
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${width} ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <div
        id={id}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-3 py-2 bg-white border rounded-lg text-xs font-medium cursor-pointer transition-all shadow-2xs select-none ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20 text-slate-900'
            : 'border-slate-300 hover:border-slate-400 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedEmployee ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold shrink-0 border border-blue-200">
                {selectedEmployee.employeeId}
              </span>
              <span className="truncate font-semibold text-slate-900">
                {selectedEmployee.employeeName}
              </span>
              {showDetails && selectedEmployee.employeeCompany && (
                <span className="text-[10px] text-slate-400 font-normal shrink-0">
                  ({selectedEmployee.employeeCompany})
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 truncate">
              {placeholder}
              {required && <span className="text-rose-500 ml-0.5">*</span>}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {allowClear && selectedEmployee && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-700 rounded-sm hover:bg-slate-100 transition-colors"
              title="Clear selection"
            >
              <X size={13} />
            </button>
          )}
          <ChevronDown
            size={14}
            className={`text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100 min-w-[280px]">
          {/* Search Box Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, ID, trade, company..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-800 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-slate-500 font-medium">
              <span>
                {filteredEmployees.length} employee{filteredEmployees.length !== 1 ? 's' : ''} found
              </span>
              {searchQuery && (
                <span className="text-blue-600 font-semibold">Filtered by search</span>
              )}
            </div>
          </div>

          {/* Employee List Items */}
          <div
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-y-auto p-1 divide-y divide-slate-50 scrollbar-thin scrollbar-thumb-slate-200"
          >
            {filteredEmployees.length === 0 ? (
              <div className="py-6 px-4 text-center">
                <p className="text-xs font-semibold text-slate-600">No employees found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Try searching for a different name, employee ID, or trade
                </p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    Clear search query
                  </button>
                )}
              </div>
            ) : (
              filteredEmployees.map((emp, index) => {
                const isSelected =
                  emp.employeeId === value || emp.id === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <div
                    key={emp.id || emp.employeeId}
                    data-employee-item
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(emp)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/80 text-blue-950 font-medium'
                        : isHighlighted
                        ? 'bg-slate-100/80 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Employee Initial Avatar */}
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {emp.employeeName?.slice(0, 2).toUpperCase() || 'EM'}
                      </div>

                      {/* Info & Metadata */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-semibold text-slate-900 truncate">
                            {emp.employeeName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 shrink-0 border border-slate-200">
                            {emp.employeeId}
                          </span>
                        </div>

                        {showDetails && (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate mt-0.5">
                            {emp.designation && (
                              <span className="flex items-center gap-1 truncate">
                                <Briefcase size={10} className="text-slate-400 shrink-0" />
                                <span className="truncate">{emp.designation}</span>
                              </span>
                            )}
                            {emp.employeeCompany && (
                              <span className="flex items-center gap-1 shrink-0 text-slate-400">
                                <span>•</span>
                                <Building size={10} className="text-slate-400" />
                                <span>{emp.employeeCompany}</span>
                              </span>
                            )}
                            {emp.nationalityType && (
                              <span className="text-[10px] text-slate-400 shrink-0">
                                ({emp.nationalityType})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selection Checkmark */}
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
