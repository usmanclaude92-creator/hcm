import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import { verifyAuth, requireRoles, AuthRequest, validatePasswordStrength } from '../auth.js';
import type { User, UserRole, EmployeeCompany } from '../../src/types/index';

const router = Router();

const EMPLOYEE_COMPANIES: EmployeeCompany[] = ['DGO', 'SMI', 'NC', 'Supplier', 'Azad'];

// An account can be limited to a set of companies. An empty list means "all companies".
// Administrators are always unscoped -- a scope on an Administrator would be a false
// sense of restriction, since the role bypasses every other check by design.
function validateCompanyScope(value: any, role: string): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return 'Company access must be a list of companies.';
  const invalid = value.filter((c: any) => !EMPLOYEE_COMPANIES.includes(c));
  if (invalid.length > 0) {
    return `Unknown company in company access: ${invalid.join(', ')}. Valid companies are ${EMPLOYEE_COMPANIES.join(', ')}.`;
  }
  if (role === 'Administrator' && value.length > 0) {
    return 'Administrators always have access to every company; leave company access empty for this role.';
  }
  return null;
}

function normalizeCompanyScope(value: any, role: string): EmployeeCompany[] {
  if (role === 'Administrator') return [];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((c: any) => EMPLOYEE_COMPANIES.includes(c)))) as EmployeeCompany[];
}

// GET /api/users (Admin only)
router.get('/', verifyAuth, requireRoles(['Administrator']), (req: AuthRequest, res: Response) => {
  try {
    const { search, role } = req.query;
    let users = db.users.getAll();

    if (search) {
      const q = String(search).trim().toLowerCase();
      users = users.filter(u =>
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    }

    if (role && role !== 'ALL') {
      users = users.filter(u => u.role === role);
    }

    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      companyScope: (u as any).companyScope || [],
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    res.json(safeUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch users.' });
  }
});

// POST /api/users (Admin only)
router.post('/', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
  try {
    const { username, name, email, role, password, companyScope } = req.body;
    if (!username || !name || !email || !role || !password) {
      return res.status(400).json({ error: 'All fields (username, name, email, role, password) are required.' });
    }

    const scopeError = validateCompanyScope(companyScope, role);
    if (scopeError) return res.status(400).json({ error: scopeError });

    const cleanUsername = username.trim().toLowerCase();
    const existing = db.users.findByUsername(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: `Username '${cleanUsername}' is already registered.` });
    }

    const policyError = validatePasswordStrength(password);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const timestamp = new Date().toISOString();
    const newUser: User = {
      id: crypto.randomUUID(),
      username: cleanUsername,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role as UserRole,
      passwordHash: bcrypt.hashSync(password, 10),
      isActive: true,
      companyScope: normalizeCompanyScope(companyScope, role),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.users.create(newUser);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'Admin',
      userRole: req.user?.role || 'Administrator',
      action: 'USER_CREATED',
      module: 'Users',
      recordId: newUser.id,
      description: `Created new user ${newUser.username} (${newUser.role}).`,
    });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create user.' });
  }
});

// PUT /api/users/:id (Admin only)
router.put('/:id', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, password, companyScope } = req.body;

    const existingUser = db.users.findById(id);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const effectiveRole = (role as UserRole) || existingUser.role;
    if (companyScope !== undefined) {
      const scopeError = validateCompanyScope(companyScope, effectiveRole);
      if (scopeError) return res.status(400).json({ error: scopeError });
    }

    const updates: Partial<User> = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.trim().toLowerCase();
    if (role) updates.role = role as UserRole;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    // Promoting an account to Administrator clears any scope, so the stored record can
    // never disagree with the effective permission.
    if (companyScope !== undefined || role === 'Administrator') {
      updates.companyScope = normalizeCompanyScope(
        companyScope !== undefined ? companyScope : (existingUser as any).companyScope,
        effectiveRole
      );
    }
    if (password && password.trim()) {
      const policyError = validatePasswordStrength(password);
      if (policyError) {
        return res.status(400).json({ error: policyError });
      }
      updates.passwordHash = bcrypt.hashSync(password, 10);
    }

    const updated = await db.users.update(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'Admin',
      userRole: req.user?.role || 'Administrator',
      action: 'USER_UPDATED',
      module: 'Users',
      recordId: id,
      description: `Updated user account ${updated.username}.`,
    });

    res.json({
      id: updated.id,
      username: updated.username,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      companyScope: (updated as any).companyScope || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update user.' });
  }
});

// PATCH /api/users/:id/toggle-active (Admin only)
router.patch('/:id/toggle-active', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const targetUser = db.users.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }

    const updated = await db.users.update(id, { isActive: !targetUser.isActive });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'Admin',
      userRole: req.user?.role || 'Administrator',
      action: 'USER_STATUS_TOGGLED',
      module: 'Users',
      recordId: id,
      description: `Toggled user ${targetUser.username} active status to ${updated?.isActive}.`,
    });

    res.json({
      id: updated?.id,
      username: updated?.username,
      name: updated?.name,
      email: updated?.email,
      role: updated?.role,
      isActive: updated?.isActive,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle user status.' });
  }
});

// DELETE /api/users/:id (Admin only)
router.delete('/:id', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const targetUser = db.users.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (id === req.user?.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    await db.users.delete(id);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'Admin',
      userRole: req.user?.role || 'Administrator',
      action: 'USER_DELETED',
      module: 'Users',
      recordId: id,
      description: `Deleted user account ${targetUser.username}.`,
    });

    res.json({ message: 'User deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete user.' });
  }
});

export default router;
