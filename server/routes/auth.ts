import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.js';
import {
  generateToken,
  verifyAuth,
  requireRoles,
  AuthRequest,
  isLoginThrottled,
  recordFailedLogin,
  clearLoginAttempts,
  validatePasswordStrength,
} from '../auth.js';
import type { User, UserRole } from '../../src/types/index';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const throttleKey = `${req.ip || 'unknown'}:${String(username).trim().toLowerCase()}`;
    if (isLoginThrottled(throttleKey)) {
      return res.status(429).json({
        error: 'Too many failed sign-in attempts. Wait 15 minutes before trying again.',
      });
    }

    const user = db.users.findByUsername(username);
    if (!user) {
      recordFailedLogin(throttleKey);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Your account is deactivated. Please contact your administrator.' });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash || '');
    if (!isMatch) {
      recordFailedLogin(throttleKey);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    clearLoginAttempts(throttleKey);

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
    });

    await db.audit.log({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'USER_LOGIN',
      module: 'Authentication',
      recordId: user.id,
      description: `User ${user.username} (${user.role}) logged in successfully.`,
      ipAddress: req.ip,
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

// GET /api/auth/me
router.get('/me', verifyAuth, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = db.users.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const userData = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
  res.json({
    user: userData,
    ...userData,
  });
});

// GET /api/auth/users (Admin only)
router.get('/users', verifyAuth, requireRoles(['Administrator']), (req: AuthRequest, res: Response) => {
  const users = db.users.getAll().map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json(users);
});

// POST /api/auth/users (Admin only)
router.post('/users', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
  try {
    const { username, name, email, role, password } = req.body;
    if (!username || !name || !email || !role || !password) {
      return res.status(400).json({ error: 'All fields (username, name, email, role, password) are required.' });
    }

    const existing = db.users.findByUsername(username);
    if (existing) {
      return res.status(400).json({ error: `Username '${username}' is already taken.` });
    }

    const policyError = validatePasswordStrength(password);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const timestamp = new Date().toISOString();
    const newUser: User = {
      id: crypto.randomUUID(),
      username: username.trim().toLowerCase(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role as UserRole,
      passwordHash: bcrypt.hashSync(password, 10),
      isActive: true,
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
      description: `Created new user ${newUser.username} with role ${newUser.role}.`,
    });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create user.' });
  }
});

// PUT /api/auth/users/:id (Admin only)
router.put('/users/:id', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, password } = req.body;

    const updates: Partial<User> = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.trim().toLowerCase();
    if (role) updates.role = role as UserRole;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (password) updates.passwordHash = bcrypt.hashSync(password, 10);

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
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update user.' });
  }
});

// PATCH /api/auth/users/:id/toggle-active (Admin only)
router.patch('/users/:id/toggle-active', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
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

// DELETE /api/auth/users/:id (Admin only)
router.delete('/users/:id', verifyAuth, requireRoles(['Administrator']), async (req: AuthRequest, res: Response) => {
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

// POST /api/auth/change-password
router.post('/change-password', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    const policyError = validatePasswordStrength(newPassword);
    if (policyError) {
      return res.status(400).json({ error: policyError });
    }

    const user = db.users.findById(req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isMatch = bcrypt.compareSync(currentPassword, user.passwordHash || '');
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password does not match.' });
    }

    await db.users.update(user.id, {
      passwordHash: bcrypt.hashSync(newPassword, 10),
    });

    await db.audit.log({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: 'PASSWORD_CHANGED',
      module: 'Authentication',
      recordId: user.id,
      description: `User ${user.username} updated their password.`,
    });

    res.json({ message: 'Password changed successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password.' });
  }
});

export default router;
