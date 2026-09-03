import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import type { UserRole } from '../src/types/index';
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
  };
}

export function generateToken(user: { id: string; username: string; role: UserRole; name: string; email: string }): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
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
  };
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
  if (req.user.role === 'Viewer') {
    return res.status(403).json({ error: 'Viewers have read-only access. Write operations are not permitted.' });
  }
  next();
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
