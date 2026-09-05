import React, { useEffect } from 'react';
import { ShieldAlert, Clock, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';

interface IdleTimeoutModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  totalWarningSeconds?: number;
  onStayLoggedIn: () => void;
  onLogoutNow: () => void;
}

export const IdleTimeoutModal: React.FC<IdleTimeoutModalProps> = ({
  isOpen,
  remainingSeconds,
  totalWarningSeconds = 60,
  onStayLoggedIn,
  onLogoutNow,
}) => {
  // Listen for Enter or Escape to stay logged in
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onStayLoggedIn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onStayLoggedIn]);

  if (!isOpen) return null;

  // Calculate percentage of warning period remaining
  const percentageRemaining = Math.max(
    0,
    Math.min(100, (remainingSeconds / totalWarningSeconds) * 100)
  );

  const formattedTime = `00:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header Strip with Security Accent */}
        <div className="bg-amber-500 px-6 py-4 flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 id="idle-modal-title" className="text-base font-bold leading-tight">
              Session Inactivity Warning
            </h3>
            <p className="text-xs text-amber-100 mt-0.5">
              Automatic logout for enhanced data security
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center font-mono font-bold text-sm text-white shrink-0">
            {remainingSeconds}s
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {/* Circular / Large Countdown Card */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 block">
                Session Ending In
              </span>
              <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                {formattedTime}
              </span>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                15m Inactive
              </span>
            </div>
          </div>

          {/* Animated Countdown Progress Bar */}
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                remainingSeconds <= 15
                  ? 'bg-rose-500'
                  : remainingSeconds <= 30
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${percentageRemaining}%` }}
            />
          </div>

          {/* Explanation Text */}
          <p className="text-xs text-slate-600 leading-relaxed">
            You have been inactive for nearly <strong>15 minutes</strong>. Under banking and payroll
            compliance standards, sessions are automatically locked to safeguard employee salaries,
            civil IDs, and corporate bank files.
          </p>

          <p className="text-[11px] text-slate-500 mt-2 italic">
            Press any key, move your cursor, or click below to continue working.
          </p>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={onStayLoggedIn}
              autoFocus
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Stay Logged In</span>
            </button>

            <button
              type="button"
              onClick={onLogoutNow}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
