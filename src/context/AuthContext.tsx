import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStoredToken, getStoredUser, setStoredToken, removeStoredToken, apiRequest } from '../api/client';
import type { User, UserRole } from '../types/index';
import { roleHasPermission, type Permission } from '../permissions';
import { isDemoSessionActive, hasLiveDemoStore, getDemoUser, startDemoSession, endDemoSession } from '../demo/demoStore';

const DEMO_TOKEN = 'demo-token';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  // True while the signed-in account's password fails the security policy. The server
  // confines such a session to /api/auth/change-password; the UI mirrors that by showing
  // nothing but the change-password screen.
  mustChangePassword: boolean;
  passwordChangeReason: string | null;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  loginDemo: (role: UserRole) => void;
  completePasswordChange: (token: string, user: User) => void;
  logout: () => void;
  isAdmin: boolean;
  isManager: boolean;
  canWrite: boolean;
  isViewer: boolean;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => (isDemoSessionActive() ? getDemoUser() : getStoredUser()));
  const [token, setToken] = useState<string | null>(() => (isDemoSessionActive() ? DEMO_TOKEN : getStoredToken()));
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => Boolean(getStoredUser()?.mustChangePassword));
  const [passwordChangeReason, setPasswordChangeReason] = useState<string | null>(null);

  useEffect(() => {
    // A demo marker can survive a hard refresh (sessionStorage) even though the in-memory
    // DemoStore cannot -- treat that combination as an expired demo and drop back to
    // LoginView cleanly, rather than letting the first data fetch throw mid-screen.
    if (isDemoSessionActive()) {
      if (!hasLiveDemoStore()) {
        endDemoSession();
        setUser(null);
        setToken(null);
      }
      setIsLoading(false);
      return;
    }

    // Validate session on mount
    async function checkAuth() {
      const storedTok = getStoredToken();
      if (!storedTok) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${storedTok}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user || data);
        } else {
          removeStoredToken();
          setUser(null);
          setToken(null);
        }
      } catch {
        removeStoredToken();
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();

    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (credentials: { username: string; password: string }) => {
    // Defensive: a demo session should never be active when a real login is attempted
    // (LoginView only renders while unauthenticated, and ending a demo always clears its
    // marker first) -- but clearing it here makes that impossible-by-construction rather
    // than merely "shouldn't happen", so a real login can never get routed into the demo
    // dispatcher by apiRequest's isDemoSessionActive() check.
    endDemoSession();

    const data = await apiRequest<{
      token: string;
      user: User;
      mustChangePassword?: boolean;
      passwordChangeReason?: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    setStoredToken(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    setMustChangePassword(Boolean(data.mustChangePassword));
    setPasswordChangeReason(data.passwordChangeReason || null);
  };

  // Called after a successful forced password change. The server returns a fresh,
  // unrestricted token, so the session continues without a sign-out round trip.
  const completePasswordChange = (newToken: string, newUser: User) => {
    setStoredToken(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
    setMustChangePassword(false);
    setPasswordChangeReason(null);
  };

  const loginDemo = (role: UserRole) => {
    const demoUser = startDemoSession(role);
    setToken(DEMO_TOKEN);
    setUser(demoUser);
  };

  const logout = () => {
    if (isDemoSessionActive()) {
      // Never falls through to removeStoredToken() -- a demo session's cleanup and a real
      // session's cleanup are fully disjoint paths, so ending one can never touch the other.
      endDemoSession();
      setToken(null);
      setUser(null);
      return;
    }
    removeStoredToken();
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
    setPasswordChangeReason(null);
  };

  const role: UserRole = user?.role || 'Viewer';
  const isAdmin = role === 'Administrator';
  const isManager = role === 'Administrator' || role === 'Payroll Manager';
  const canWrite = role === 'Administrator' || role === 'Payroll Manager' || role === 'Payroll User';
  const isViewer = role === 'Viewer';
  const hasPermission = (permission: Permission) => roleHasPermission(role, permission);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        isDemoMode: isDemoSessionActive(),
        mustChangePassword,
        passwordChangeReason,
        login,
        loginDemo,
        completePasswordChange,
        logout,
        isAdmin,
        isManager,
        canWrite,
        isViewer,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
