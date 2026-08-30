import React from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const DemoBanner: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="bg-amber-400 text-slate-900 text-xs font-semibold px-4 py-1.5 flex items-center justify-between gap-3 sticky top-0 z-50">
      <span className="flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        DEMO MODE — {user?.name || 'Demo User'} — no data is saved or sent to any server
      </span>
      <button
        onClick={logout}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-900 text-amber-300 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <LogOut className="w-3 h-3" />
        Exit Demo
      </button>
    </div>
  );
};
