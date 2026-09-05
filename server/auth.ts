import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import type { UserRole, EmployeeCompany } from '../src/types/index';
import { roleHasPermission, type Permission } from '../src/permissions.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
    name: string;
    email: string;
    // Set when the account signed in with a password that fails the current policy
    // (the seeded development passwords, for example). Such a session may do nothing
    // but change its own password -- see requirePasswordChangeCleared below.
    mustChangePassword?: boolean;
  };
}

export function generateToken(user: {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  email: string;
  mustChangePassword?: boolean;
}): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function decodeToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as {
    id: string;
    username: string;
    role: UserRole;
    name: string;
    email: string;
    mustChangePassword?: boolean;
  };
}

// A session flagged mustChangePassword is confined to changing its own password. The check
// lives inside verifyAuth rather than in a per-route middleware, so no endpoint can be
// added that quietly escapes it. Hiding the rest of the UI is not the access check.
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/change-password',
]);

function passwordChangePending(req: AuthRequest, res: Response): boolean {
  if (!req.user?.mustChangePassword) return false;
  const pathOnly = (req.originalUrl || '').split('?')[0];
  if (PASSWORD_CHANGE_ALLOWED_PATHS.has(pathOnly)) return false;
  res.status(403).json({
    error:
      'Your password does not meet the current security policy. Change it before using the system.',
    mustChangePassword: true,
  });
  return true;
}

// Header-only. A token in the query string is written into server access logs, proxy and
// CDN logs and browser history; see verifyAuthAllowingQueryToken for the single route that
// genuinely cannot send a header.
export function verifyAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    req.user = decodeToken(token);
    if (passwordChangePending(req, res)) return;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

// Narrow exception for document streaming, where the URL is consumed by <img>/<iframe>/
// download and no Authorization header can be attached. Scoped to that one route so the
// exposure is a single endpoint rather than the whole API surface.
export function verifyAuthAllowingQueryToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  if (!token && req.query && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    req.user = decodeToken(token);
    if (passwordChangePending(req, res)) return;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

// --- Login throttling ---------------------------------------------------------------
// In-memory sliding window. On a serverless host this is per-instance rather than global,
// so it raises the cost of credential stuffing without being a complete defence; a shared
// store (or the platform's own WAF rate limiting) is the durable answer.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, number[]>();

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  recent.push(now);
  loginAttempts.set(key, recent);
}

export function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

export function isLoginThrottled(key: string): boolean {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  loginAttempts.set(key, recent);
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

// --- Password policy ----------------------------------------------------------------
const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'admin123', 'manager123', 'user123',
  'viewer123', '12345678', '123456789', 'qwerty123', 'letmein1', 'welcome1',
]);

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Choose something less predictable.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export function requireRoles(...allowedRoles: (UserRole | UserRole[])[]) {
  const flattenedRoles: UserRole[] = allowedRoles.flat() as UserRole[];
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role === 'Administrator') {
      return next(); // Admin has universal access
    }

    if (flattenedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access forbidden. Required role: ${flattenedRoles.join(' or ')}. Your role is ${req.user.role}.`
    });
  };
}

export function requireWritePermission(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  // Allow write operations across all authenticated sessions to support full editability
  next();
}

// --- Company isolation ----------------------------------------------------------------
// Every authenticated user could previously see every company's employees, salaries and
// bank details. An account may now be scoped to a set of companies; an empty or absent
// scope means "all companies", which is what an Administrator or a deliberately unscoped
// account gets. The scope is read from the stored user record on every request rather than
// from the token, so revoking access takes effect immediately instead of at token expiry.
export function companyScopeOf(user?: { id: string; role: UserRole }): EmployeeCompany[] | null {
  if (!user) return [];
  if (user.role === 'Administrator') return null;
  const stored = db.users.findById(user.id);
  const scope = (stored as any)?.companyScope as EmployeeCompany[] | undefined;
  if (!scope || scope.length === 0) return null;
  return scope;
}

// True when `company` is inside the user's scope. An unknown/blank company is treated as
// visible so records that predate the company field are never silently hidden.
export function canSeeCompany(scope: EmployeeCompany[] | null, company?: string | null): boolean {
  if (scope === null) return true;
  if (!company) return true;
  return scope.includes(company as EmployeeCompany);
}

// Guard for write paths: refuses a mutation aimed at a company outside the caller's scope.
export function assertCompanyWritable(
  req: AuthRequest,
  res: Response,
  company?: string | null
): boolean {
  const scope = companyScopeOf(req.user);
  if (canSeeCompany(scope, company)) return true;
  res.status(403).json({
    error: `Your account is limited to ${(scope || []).join(', ')} and cannot act on records belonging to ${company}.`,
  });
  return false;
}

export function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (roleHasPermission(req.user.role, permission)) {
      return next();
    }
    return res.status(403).json({ error: `Access forbidden. Missing permission: ${permission}.` });
  };
}
