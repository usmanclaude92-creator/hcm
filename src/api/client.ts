// API client with JWT token management and 3-decimal formatting helpers
import { isDemoSessionActive } from '../demo/demoStore';

const TOKEN_KEY = 'payroll_auth_token';
const USER_KEY = 'payroll_auth_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string, user: any): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): any | null {
  const user = localStorage.getItem(USER_KEY);
  if (!user) return null;
  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (isDemoSessionActive()) {
    // Dynamic import keeps the demo module (seed data + all handlers) out of the initial
    // bundle for the vast majority of users who never touch Demo Access.
    const { dispatchDemoRequest } = await import('../demo/demoApi');
    return dispatchDemoRequest<T>(endpoint, options);
  }

  const isAuthLogin = endpoint.includes('/api/auth/login');
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !isAuthLogin) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (response.status === 401) {
    if (!isAuthLogin) {
      removeStoredToken();
      window.dispatchEvent(new Event('auth:unauthorized'));
      throw new Error((data && data.error) || 'Session expired or unauthorized. Please sign in again.');
    } else {
      throw new Error((data && data.error) || 'Invalid username or password.');
    }
  }

  if (!response.ok) {
    if (data && data.error) {
      throw new Error(data.error);
    }
    const text = typeof data === 'string' ? data : await response.text().catch(() => '');
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return (data !== null ? data : ((response as unknown) as T));
}

// Format OMR Currency helper
export function formatOMR(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '0.000';
  }
  return Number(amount).toFixed(3);
}

// Format Date helper
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}
