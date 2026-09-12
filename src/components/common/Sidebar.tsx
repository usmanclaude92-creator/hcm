import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { Permission } from '../../permissions';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarDays,
  Calculator,
  CreditCard,
  RefreshCw,
  Landmark,
  Scale,
  Building2,
  HardHat,
  FileBarChart,
  FileSpreadsheet,
  History,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  UploadCloud,
  IdCard,
  ShieldAlert,
  FolderOpen,
  Search,
  X,
  ChevronsUpDown,
  ChevronsDownUp,
  Layers,
} from 'lucide-react';

export interface SidebarProps {
  currentView: string;
  currentViewParams?: Record<string, any>;
  onSelectView: (view: string, params?: Record<string, any>) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export type NavItemKind = 'view' | 'form' | 'master';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  targetView: string;
  targetParams?: Record<string, any>;
  badge?: string;
  kind?: NavItemKind;
  adminOnly?: boolean;
  managerOnly?: boolean;
  permission?: Permission;
  keywords?: string[];
}

export interface NavCategory {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  items: NavItem[];
}

const STORAGE_KEY = 'hcms_sidebar_expanded_sections_v2';

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  currentViewParams,
  onSelectView,
  isOpen,
  onClose,
}) => {
  const { isAdmin, isManager, hasPermission } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  // Structured Navigation Categories based on function and operational role
  const categories: NavCategory[] = useMemo(
    () => [
      {
        id: 'workforce',
        title: 'WORKFORCE & OPERATIONS',
        icon: Users,
        defaultOpen: true,
        items: [
          {
            id: 'dashboard',
            label: 'Executive Dashboard',
            icon: LayoutDashboard,
            targetView: 'dashboard',
            keywords: ['overview', 'kpi', 'metrics', 'stats', 'home'],
          },
          {
            id: 'employees',
            label: 'Employee Master',
            icon: Users,
            targetView: 'employees',
            badge: 'Directory',
            keywords: ['staff', 'workers', 'directory', 'people', 'personnel'],
          },
          {
            id: 'employee-ledger',
            label: 'Employee Profile & Ledger',
            icon: IdCard,
            targetView: 'employee-ledger',
            keywords: ['ledger', 'profile', 'card', 'statement', 'history'],
          },
          {
            id: 'workforce-deployment',
            label: 'Workforce Deployment',
            icon: HardHat,
            targetView: 'workforce',
            badge: 'Shifts',
            keywords: ['deployment', 'site', 'assignments', 'allocation', 'roster', 'mobile', 'shift status', 'eligibility sync'],
          },
          {
            id: 'attendance',
            label: 'Attendance Register',
            icon: CalendarCheck,
            targetView: 'attendance',
            permission: 'attendance.view',
            keywords: ['timesheet', 'clock', 'biometric', 'present', 'overtime', 'ot'],
          },
          {
            id: 'leave',
            label: 'Leave Management',
            icon: CalendarDays,
            targetView: 'leave',
            keywords: ['vacation', 'annual', 'sick', 'holiday', 'absence', 'leave types', 'leave policy', 'entitlement rules', 'public holidays'],
          },
          {
            id: 'compliance',
            label: 'HR Compliance & Docs',
            icon: ShieldAlert,
            targetView: 'compliance',
            badge: 'Alerts',
            keywords: ['expiry', 'passport', 'visa', 'labour card', 'civil id expiry'],
          },
          {
            id: 'documents',
            label: 'Document Repository',
            icon: FolderOpen,
            targetView: 'documents',
            keywords: ['files', 'storage', 'attachments', 'archives', 'pdfs'],
          },
        ],
      },
      {
        id: 'master-data',
        title: 'ORGANISATION & MASTER DATA',
        icon: Building2,
        defaultOpen: true,
        items: [
          {
            id: 'master-data-hub',
            label: 'Master Data Hub',
            icon: Layers,
            targetView: 'master-data',
            badge: 'Overview',
            kind: 'master',
            keywords: ['masters', 'hub', 'configuration', 'setup'],
          },
        ],
      },
      {
        id: 'payroll',
        title: 'FINANCIAL & PAYROLL',
        icon: Calculator,
        defaultOpen: true,
        items: [
          {
            id: 'payroll',
            label: 'Monthly Payroll',
            icon: Calculator,
            targetView: 'payroll',
            badge: 'OMR',
            keywords: ['wages', 'salaries', 'pay run', 'payslip', 'basic', 'allowances'],
          },
          {
            id: 'payments',
            label: 'Salary Payments',
            icon: CreditCard,
            targetView: 'payments',
            permission: 'salary_payment.view',
            keywords: ['disbursement', 'bank transfer', 'cheque', 'cash', 'vouchers'],
          },
          {
            id: 'payment-planning',
            label: 'Payment Planning',
            icon: ClipboardList,
            targetView: 'payment-planning',
            permission: 'payment_planning.view',
            keywords: ['cashflow', 'schedules', 'batch', 'treasury'],
          },
          {
            id: 'wps',
            label: 'WPS Recovery',
            icon: RefreshCw,
            targetView: 'wps',
            badge: 'SIF',
            keywords: ['wps', 'sif file', 'central bank', 'cbo', 'salary information file'],
          },
          {
            id: 'loans',
            label: 'Loan Management',
            icon: Landmark,
            targetView: 'loans',
            keywords: ['loans', 'advances', 'installments', 'deductions'],
          },
          {
            id: 'gratuity',
            label: 'End-of-Service Gratuity',
            icon: Scale,
            targetView: 'gratuity',
            badge: 'Oman Law',
            keywords: ['eosb', 'gratuity', 'severance', 'final settlement', 'resignation'],
          },
          {
            id: 'cif',
            label: 'CIF Upload & Processing',
            icon: UploadCloud,
            targetView: 'cif',
            permission: 'cif.view',
            keywords: ['cif', 'bank cif', 'bank statements', 'account upload'],
          },
        ],
      },
      {
        id: 'intelligence',
        title: 'INTELLIGENCE & AUDIT',
        icon: FileBarChart,
        defaultOpen: true,
        items: [
          {
            id: 'reports',
            label: 'Reports Center',
            icon: FileBarChart,
            targetView: 'reports',
            keywords: ['analytics', 'charts', 'summary', 'exports', 'pdf reports'],
          },
          {
            id: 'salary-payroll-report',
            label: 'Salary & Payroll Report',
            icon: FileSpreadsheet,
            targetView: 'salary-payroll-report',
            badge: 'Excel',
            keywords: ['salary sheet', 'payroll register', 'reconciliation', 'export'],
          },
          {
            id: 'audit',
            label: 'Audit Trail',
            icon: History,
            targetView: 'audit',
            managerOnly: true,
            keywords: ['activity', 'security logs', 'who changed what', 'audit log'],
          },
        ],
      },
      {
        id: 'system',
        title: 'SYSTEM & ADMINISTRATION',
        icon: ShieldCheck,
        defaultOpen: false,
        items: [
          {
            id: 'users',
            label: 'User Administration',
            icon: ShieldCheck,
            targetView: 'users',
            adminOnly: true,
            badge: 'RBAC',
            keywords: ['users', 'roles', 'permissions', 'passwords', 'access control'],
          },
        ],
      },
    ],
    []
  );

  // Initialize expanded categories from localStorage or defaults
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    const initial: Record<string, boolean> = {};
    categories.forEach((cat) => {
      initial[cat.id] = cat.defaultOpen !== false;
    });
    return initial;
  });

  // Save expanded states
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const updated = { ...prev, [categoryId]: !prev[categoryId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const expandAll = () => {
    const allOpen: Record<string, boolean> = {};
    categories.forEach((c) => (allOpen[c.id] = true));
    setExpandedCategories(allOpen);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allOpen));
    } catch {
      // ignore
    }
  };

  const collapseAll = () => {
    const allClosed: Record<string, boolean> = {};
    categories.forEach((c) => (allClosed[c.id] = false));
    setExpandedCategories(allClosed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allClosed));
    } catch {
      // ignore
    }
  };

  // Helper to determine if an item is currently active
  const isItemActive = (item: NavItem): boolean => {
    if (item.targetView !== currentView) return false;

    // For views with sub-tabs (like master-data or leave)
    if (item.targetParams?.tab) {
      return currentViewParams?.tab === item.targetParams.tab;
    }
    if (item.targetParams?.initialTab) {
      return currentViewParams?.initialTab === item.targetParams.initialTab;
    }
    if (item.targetParams?.openAddModal) {
      return !!currentViewParams?.openAddModal;
    }
    if (item.targetParams?.initialOpenAddModal) {
      return !!currentViewParams?.initialOpenAddModal;
    }
    if (item.targetParams?.initialOpenModal) {
      return !!currentViewParams?.initialOpenModal;
    }
    if (item.targetParams?.initialOpenNewLoan) {
      return !!currentViewParams?.initialOpenNewLoan;
    }

    // Default item for view when no special sub-param is active
    if (!item.targetParams || Object.keys(item.targetParams).length === 0) {
      // If currentView is 'master-data' and currentViewParams has a tab, don't highlight the master hub
      if (currentView === 'master-data' && currentViewParams?.tab) {
        return false;
      }
      return true;
    }

    return false;
  };

  // Auto-expand category containing the active item
  useEffect(() => {
    for (const category of categories) {
      const hasActive = category.items.some((item) => isItemActive(item));
      if (hasActive && !expandedCategories[category.id]) {
        setExpandedCategories((prev) => {
          const updated = { ...prev, [category.id]: true };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
      }
    }
  }, [currentView, currentViewParams]);

  // Filter items based on search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return categories.map((cat) => ({
        ...cat,
        visibleItems: cat.items.filter((item) => {
          if (item.adminOnly && !isAdmin) return false;
          if (item.managerOnly && !isManager) return false;
          if (item.permission && !hasPermission(item.permission)) return false;
          return true;
        }),
      }));
    }

    return categories
      .map((cat) => {
        const matchingItems = cat.items.filter((item) => {
          if (item.adminOnly && !isAdmin) return false;
          if (item.managerOnly && !isManager) return false;
          if (item.permission && !hasPermission(item.permission)) return false;

          const labelMatch = item.label.toLowerCase().includes(q);
          const badgeMatch = item.badge?.toLowerCase().includes(q);
          const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(q));
          return labelMatch || badgeMatch || keywordMatch;
        });

        return {
          ...cat,
          visibleItems: matchingItems,
        };
      })
      .filter((cat) => cat.visibleItems.length > 0);
  }, [categories, searchQuery, isAdmin, isManager, hasPermission]);

  // Total matching items count
  const totalItemCount = useMemo(() => {
    return filteredCategories.reduce((acc, cat) => acc + cat.visibleItems.length, 0);
  }, [filteredCategories]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 print:hidden border-r border-slate-800 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="HCMS Logo" className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-xs" />
            <div className="min-w-0">
              <h2 className="font-bold text-white text-xs tracking-tight uppercase leading-tight truncate">
                Human Capital Management
              </h2>
              <p className="text-[10px] text-slate-400 truncate">Enterprise Operations</p>
            </div>
          </div>
        </div>

        {/* Quick Menu Search & Collapse Controls */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-800/80 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search menus & forms..."
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span className="font-mono text-[10px] text-slate-400">
              {searchQuery ? `${totalItemCount} match${totalItemCount === 1 ? '' : 'es'}` : `${totalItemCount} modules`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={expandAll}
                className="text-[10px] text-slate-400 hover:text-slate-200 hover:underline flex items-center gap-0.5 cursor-pointer"
                title="Expand all categories"
              >
                <ChevronsUpDown className="w-2.5 h-2.5" />
                <span>Expand</span>
              </button>
              <span className="text-slate-700">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[10px] text-slate-400 hover:text-slate-200 hover:underline flex items-center gap-0.5 cursor-pointer"
                title="Collapse all categories"
              >
                <ChevronsDownUp className="w-2.5 h-2.5" />
                <span>Collapse</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto py-3 px-2 space-y-3 custom-scrollbar"
        >
          {filteredCategories.map((category) => {
            if (category.visibleItems.length === 0) return null;

            // When searching, force categories open so search results are instantly visible
            const isExpanded = searchQuery.trim() ? true : !!expandedCategories[category.id];
            const CategoryIcon = category.icon;

            // Check if active item is inside this category (useful when collapsed)
            const hasActiveItem = category.visibleItems.some((item) => isItemActive(item));

            return (
              <div key={category.id} className="rounded-xl overflow-hidden transition-colors">
                {/* Category Header (Expandable/Collapsible Accordion Trigger) */}
                <button
                  type="button"
                  id={`category-btn-${category.id}`}
                  aria-expanded={isExpanded}
                  aria-controls={`category-panel-${category.id}`}
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer group select-none ${
                    hasActiveItem && !isExpanded
                      ? 'bg-blue-950/40 text-blue-300 border border-blue-800/50'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CategoryIcon className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                      hasActiveItem ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`} />
                    <span className="text-[11px] font-bold tracking-wider uppercase truncate">
                      {category.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {hasActiveItem && !isExpanded && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" title="Active module inside" />
                    )}
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-slate-800/80 text-slate-400 group-hover:bg-slate-700">
                      {category.visibleItems.length}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform" />
                    )}
                  </div>
                </button>

                {/* Collapsible Menu Items List */}
                {isExpanded && (
                  <div
                    id={`category-panel-${category.id}`}
                    role="region"
                    aria-labelledby={`category-btn-${category.id}`}
                    className="space-y-0.5 mt-1 pl-1 pr-0.5"
                  >
                    {category.visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = isItemActive(item);
                      const isForm = item.kind === 'form';
                      const isMaster = item.kind === 'master';

                      return (
                        <button
                          key={item.id}
                          type="button"
                          id={`nav-item-${item.id}`}
                          aria-label={item.label}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            onSelectView(item.targetView, item.targetParams);
                            if (onClose) onClose();
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all group cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-xs font-semibold'
                              : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                isActive
                                  ? 'text-white'
                                  : isForm
                                  ? 'text-emerald-400 group-hover:text-emerald-300'
                                  : isMaster
                                  ? 'text-indigo-400 group-hover:text-indigo-300'
                                  : 'text-slate-400 group-hover:text-slate-200'
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>

                          {item.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ml-1.5 transition-colors ${
                                isActive
                                  ? 'bg-blue-700/80 text-blue-100'
                                  : isForm
                                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/50'
                                  : isMaster
                                  ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-700/40'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-3 border-t border-slate-800/90 bg-slate-950/60">
          <div className="rounded-lg bg-slate-800/70 p-2.5 border border-slate-700/60">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-0.5">
              <span className="text-[11px] text-slate-400">Jurisdiction</span>
              <span className="font-semibold text-white">Sultanate of Oman</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="text-[11px] text-slate-400">Currency</span>
              <span className="font-mono font-semibold text-emerald-400">OMR (0.000)</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
