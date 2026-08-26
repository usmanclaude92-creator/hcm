import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStoredToken, getStoredUser, setStoredToken, removeStoredToken, apiRequest } from '../api/client';
import type { User, UserRole } from '../types/index';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isManager: boolean;
  canWrite: boolean;
  isViewer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
    const data = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    setStoredToken(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    removeStoredToken();
    setToken(null);
    setUser(null);
  };

  const role: UserRole = user?.role || 'Viewer';
  const isAdmin = role === 'Administrator';
  const isManager = role === 'Administrator' || role === 'Payroll Manager';
  const canWrite = role === 'Administrator' || role === 'Payroll Manager' || role === 'Payroll User';
  const isViewer = role === 'Viewer';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        isAdmin,
        isManager,
        canWrite,
        isViewer,
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
