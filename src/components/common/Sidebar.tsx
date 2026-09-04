import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { Permission } from '../../permissions';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  CalendarCheck,
  CalendarDays,
  Calculator,
  CreditCard,
  RefreshCw,
  Landmark,
  Scale,
  Building2,
  FileBarChart,
  History,
  ShieldCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  UploadCloud,
  FileSpreadsheet,
  IdCard,
  ShieldAlert,
  FolderOpen,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: string;
  adminOnly?: boolean;
  managerOnly?: boolean;
  permission?: Permission;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  isOpen,
  onClose,
}) => {
  const { user, isAdmin, isManager, hasPermission } = useAuth();

  const navigationSections: NavSection[] = [
    {
      title: 'CORE MODULES',
      items: [
        { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
        { id: 'employees', label: 'Employee Master', icon: Users },
        { id: 'compliance', label: 'HR Compliance & Docs', icon: ShieldAlert },
        { id: 'documents', label: 'Document Repository', icon: FolderOpen },
        { id: 'projects', label: 'Project Master', icon: FolderKanban },
        { id: 'master-data', label: 'Organisation Master Data', icon: Building2 },
        { id: 'attendance', label: 'Attendance Ledger', icon: CalendarCheck, permission: 'attendance.view' },
        { id: 'timesheets', label: 'Timesheet Management', icon: Clock, permission: 'timesheet.view' },
        { id: 'leave', label: 'Leave Management', icon: CalendarDays },
      ],
    },
    {
      title: 'FINANCIAL & PAYROLL',
      items: [
        { id: 'payroll', label: 'Monthly Payroll', icon: Calculator },
        { id: 'payments', label: 'Salary Payments', icon: CreditCard, permission: 'salary_payment.view' },
        { id: 'payment-planning', label: 'Payment Planning', icon: ClipboardList, permission: 'payment_planning.view' },
        { id: 'wps', label: 'WPS Recovery', icon: RefreshCw },
        { id: 'loans', label: 'Loan Management', icon: Landmark },
        { id: 'gratuity', label: 'End-of-Service Gratuity', icon: Scale },
        { id: 'cif', label: 'CIF Upload & Processing', icon: UploadCloud, permission: 'cif.view' },
        { id: 'employee-ledger', label: 'Employee Profile & Ledger', icon: IdCard },
      ],
    },
    {
      title: 'INTELLIGENCE & AUDIT',
      items: [
        { id: 'reports', label: 'Reports Center', icon: FileBarChart },
        { id: 'salary-payroll-report', label: 'Salary & Payroll Report', icon: FileSpreadsheet },
        { id: 'audit', label: 'Audit Trail', icon: History, managerOnly: true },
        { id: 'users', label: 'User Administration', icon: ShieldCheck, adminOnly: true },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 print:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="HCMS Logo" className="w-10 h-10 rounded-xl object-cover shrink-0" />
            <div>
              <h2 className="font-bold text-white text-sm tracking-tight leading-tight">HUMAN CAPITAL MANAGEMENT SYSTEM</h2>
            </div>
          </div>
        </div>

        {/* Navigation Items. Marked up as a real landmark with an explicit name on every
            control: assistive technology previously found 18 unlabelled buttons here. */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
          {navigationSections.map((section, idx) => {
            const visibleItems = section.items.filter(item => {
              if (item.adminOnly && !isAdmin) return false;
              if (item.managerOnly && !isManager) return false;
              if (item.permission && !hasPermission(item.permission)) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={idx} className="space-y-1">
                <p className="px-3 text-[10px] font-bold text-slate-400 tracking-wider">
                  {section.title}
                </p>
                <div className="space-y-0.5 mt-1">
                  {visibleItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => {
                          onSelectView(item.id);
                          if (onClose) onClose();
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs font-semibold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                            isActive ? 'bg-blue-700/60 text-blue-100' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Financial Currency</span>
              <span className="font-semibold text-emerald-400">OMR</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Precision Rule</span>
              <span className="font-mono text-slate-300">0.000 (3-Dec)</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
