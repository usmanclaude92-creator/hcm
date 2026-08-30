import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LogOut,
  User,
  ShieldCheck,
  Building2,
  Bell,
  CheckCircle2,
  Menu,
} from 'lucide-react';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { user, logout, isAdmin, isDemoMode } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'Administrator':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Payroll Manager':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Payroll User':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-xs print:hidden">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* User Role Badge */}
        <div className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getRoleBadgeColor(user?.role)}`}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{user?.role}{isDemoMode ? ' (Demo)' : ''}</span>
        </div>

        {/* Profile / Logout Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-900 leading-tight">{user?.name || user?.username}</p>
              <p className="text-[11px] text-slate-500 leading-tight">{user?.email}</p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-500">Signed in as</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.username}</p>
                <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded font-medium border ${getRoleBadgeColor(user?.role)}`}>
                  {user?.role}
                </span>
              </div>

              <div className="px-2 py-1">
                <div className="px-3 py-1.5 text-xs text-slate-600 flex items-center justify-between">
                  <span>Currency:</span>
                  <span className="font-semibold text-slate-900">OMR (0.000)</span>
                </div>
                <div className="px-3 py-1.5 text-xs text-slate-600 flex items-center justify-between">
                  <span>Server Status:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Online
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out of System
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
