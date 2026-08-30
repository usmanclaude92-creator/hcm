import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Building2, Lock, User as UserIcon, AlertCircle, ArrowRight, ShieldCheck, Database, Rocket } from 'lucide-react';
import type { UserRole } from '../../types/index';

// Static class strings, not template-literal-composed -- Tailwind's JIT scanner only
// picks up whole class names it can find verbatim in source, so `text-${color}-400`
// would silently render unstyled.
const DEMO_ROLE_STYLES: Record<string, { border: string; text: string; textHover: string }> = {
  purple: { border: 'hover:border-purple-500/50', text: 'text-purple-400', textHover: 'text-purple-300' },
  blue: { border: 'hover:border-blue-500/50', text: 'text-blue-400', textHover: 'text-blue-300' },
  emerald: { border: 'hover:border-emerald-500/50', text: 'text-emerald-400', textHover: 'text-emerald-300' },
  slate: { border: 'hover:border-slate-500/50', text: 'text-slate-300', textHover: 'text-slate-300' },
};

const DEMO_ROLES: { role: UserRole; label: string; subtitle: string; color: string }[] = [
  { role: 'Administrator', label: 'System Administrator', subtitle: 'Full Demo System', color: 'purple' },
  { role: 'Payroll Manager', label: 'Payroll Manager', subtitle: 'Payroll Processing Demo', color: 'blue' },
  { role: 'Payroll User', label: 'Payroll User', subtitle: 'Payroll Data Entry Demo', color: 'emerald' },
  { role: 'Viewer', label: 'Auditor', subtitle: 'Read-Only Demo Reports', color: 'slate' },
];

export const LoginView: React.FC = () => {
  const { login, loginDemo } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDemoRoles, setShowDemoRoles] = useState(false);

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
          {/* Production Sign In */}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
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
          </form>

          <div className="mt-4 text-center text-[11px] text-slate-500 flex items-center justify-center gap-2">
            <Database className="w-3.5 h-3.5" />
            <span>Production-grade PostgreSQL / Persistent Data Store Enabled</span>
          </div>

          {/* Demo Access -- fully isolated from production, see src/demo/ */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-2.5">Want to explore the system without an account?</p>
              <button
                type="button"
                onClick={() => setShowDemoRoles(v => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                <Rocket className="w-3.5 h-3.5" />
                Demo Access
              </button>
            </div>

            {showDemoRoles && (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {DEMO_ROLES.map(d => {
                    const styles = DEMO_ROLE_STYLES[d.color];
                    return (
                      <button
                        key={d.role}
                        type="button"
                        onClick={() => loginDemo(d.role)}
                        className={`p-2 rounded-lg bg-slate-950 hover:bg-slate-800 ${styles.border} border border-slate-800 text-left transition-all cursor-pointer group`}
                      >
                        <div className={`font-semibold ${styles.text} flex items-center justify-between`}>
                          <span className="flex items-center gap-1">{d.role === 'Administrator' && <ShieldCheck className="w-3 h-3" />} {d.label}</span>
                          <span className={`text-[10px] ${styles.textHover} opacity-0 group-hover:opacity-100 transition-opacity`}>Enter →</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">{d.subtitle}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-3">
                  Demo sessions use sample data only — no connection to live systems.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
