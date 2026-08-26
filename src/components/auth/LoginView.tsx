import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Building2, Lock, User as UserIcon, AlertCircle, ArrowRight, ShieldCheck, Database } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login({ username, password });
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRole = async (u: string, p: string, autoSubmit = false) => {
    setUsername(u);
    setPassword(p);
    if (autoSubmit) {
      setError(null);
      setLoading(true);
      try {
        await login({ username: u, password: p });
      } catch (err: any) {
        setError(err.message || 'Login failed. Please verify credentials.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleInstantSkip = () => {
    handleQuickRole('admin', 'admin123', true);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Building2 className="w-7 h-7" />
          </div>
        </div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-white">
          Employee & Payroll Management
        </h2>
        <p className="mt-1.5 text-center text-xs text-slate-400">
          Enterprise Cloud Payroll System • OMR 3-Decimal Accounting
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 flex items-start justify-between gap-2.5 text-rose-400 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-rose-400 hover:text-rose-300 font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Username or Business ID
              </label>
              <div className="relative rounded-lg shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="e.g. admin"
                  className="block w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative rounded-lg shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  className="block w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleInstantSkip}
                disabled={loading}
                className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                title="Skip login and enter as Administrator"
              >
                <span>⚡ Instant Access</span>
              </button>
            </div>
          </form>

          {/* Quick Demo Roles Access */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                1-Click Instant Sign In
              </p>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                Click any card to enter
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickRole('admin', 'admin123', true)}
                className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 hover:border-purple-500/50 border border-slate-800 text-left transition-all cursor-pointer group"
              >
                <div className="font-semibold text-purple-400 flex items-center justify-between">
                  <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Admin</span>
                  <span className="text-[10px] text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity">Sign in →</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Full System Access</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRole('manager', 'manager123', true)}
                className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 hover:border-blue-500/50 border border-slate-800 text-left transition-all cursor-pointer group"
              >
                <div className="font-semibold text-blue-400 flex items-center justify-between">
                  <span>Payroll Manager</span>
                  <span className="text-[10px] text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity">Sign in →</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Approve & Finalize</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRole('user', 'user123', true)}
                className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 hover:border-emerald-500/50 border border-slate-800 text-left transition-all cursor-pointer group"
              >
                <div className="font-semibold text-emerald-400 flex items-center justify-between">
                  <span>Payroll User</span>
                  <span className="text-[10px] text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity">Sign in →</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Data Entry & Payments</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRole('viewer', 'viewer123', true)}
                className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 hover:border-slate-500/50 border border-slate-800 text-left transition-all cursor-pointer group"
              >
                <div className="font-semibold text-slate-300 flex items-center justify-between">
                  <span>Auditor / Viewer</span>
                  <span className="text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">Sign in →</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Read-Only Reports</div>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Database className="w-3.5 h-3.5" />
          <span>Production-grade PostgreSQL / Persistent Data Store Enabled</span>
        </div>
      </div>
    </div>
  );
};
