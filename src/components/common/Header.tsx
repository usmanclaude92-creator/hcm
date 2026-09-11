import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LogOut,
  User,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Menu,
  Timer,
  Sun,
  Moon,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  onToggleSidebar?: () => void;
  onNavigate?: (view: string, params?: Record<string, any>) => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNavigate }) => {
  const { user, logout, isAdmin, isDemoMode } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('artify_theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('artify_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('artify_theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'Administrator':
        return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800';
      case 'Payroll Manager':
        return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
      case 'Payroll User':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 flex items-center justify-between shadow-xs print:hidden transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification Bell */}
        <NotificationBell onNavigate={onNavigate} />

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* User Role Badge */}
        <div className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getRoleBadgeColor(user?.role)}`}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{user?.role}{isDemoMode ? ' (Demo)' : ''}</span>
        </div>

        {/* Profile / Logout Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">{user?.name || user?.username}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{user?.email}</p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Signed in as</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.username}</p>
                <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded font-medium border ${getRoleBadgeColor(user?.role)}`}>
                  {user?.role}
                </span>
              </div>

              <div className="px-2 py-1">
                <button
                  onClick={toggleTheme}
                  className="w-full px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between rounded-md transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-400" />}
                    Theme:
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {isDark ? 'Dark Mode' : 'Light Mode'}
                  </span>
                </button>
                <div className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span>Currency:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">OMR (0.000)</span>
                </div>
                <div className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span>Server Status:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Online
                  </span>
                </div>
                <div className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Timer className="w-3 h-3 text-slate-400" />
                    Idle Timeout:
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">15 min</span>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 transition-colors cursor-pointer"
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
