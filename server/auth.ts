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

export function verifyAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      username: string;
      role: UserRole;
      name: string;
      email: string;
    };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
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
