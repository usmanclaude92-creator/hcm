import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, Lock, ArrowRight, LogOut } from 'lucide-react';
import type { User } from '../../types/index';

// Shown instead of the whole application when the signed-in account's password fails the
// security policy -- typically a seeded development password that reached a live install.
// This screen is a mirror of the server-side restriction, not the restriction itself: the
// API refuses every endpoint except /api/auth/change-password for such a session.
export const ForcePasswordChangeView: React.FC = () => {
  const { user, token, passwordChangeReason, completePasswordChange, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('The new password must be different from the current one.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not change the password.');
        return;
      }
      completePasswordChange(data.token as string, data.user as User);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-sm placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-transparent';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-7 shadow-2xl">
          <div className="flex items-start gap-3 mb-5">
            <span className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <ShieldAlert className="w-4.5 h-4.5 text-amber-400" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-slate-100 leading-tight">Choose a new password</h1>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {passwordChangeReason
                  ? `${passwordChangeReason} Until it is changed, this account can do nothing else.`
                  : 'This account is using a password that does not meet the security policy. Until it is changed, this account can do nothing else.'}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mb-5 pb-4 border-b border-slate-800">
            Signed in as <span className="text-slate-300 font-medium">{user?.username}</span> · {user?.role}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label htmlFor="fpc-current" className="block text-xs font-medium text-slate-400 mb-1.5">
                Current password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="fpc-current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="fpc-new" className="block text-xs font-medium text-slate-400 mb-1.5">
                New password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="fpc-new"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                  aria-describedby="fpc-policy"
                />
              </div>
              <p id="fpc-policy" className="text-[11px] text-slate-500 mt-1.5">
                At least 8 characters, with a letter and a number. Common passwords are rejected.
              </p>
            </div>

            <div>
              <label htmlFor="fpc-confirm" className="block text-xs font-medium text-slate-400 mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="fpc-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 text-sm font-semibold transition-colors cursor-pointer"
            >
              {saving ? <span>Updating…</span> : (
                <>
                  <span>Update password</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={logout}
            className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
};
