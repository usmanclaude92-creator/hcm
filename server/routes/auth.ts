import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import {
  generateToken,
  verifyAuth,
  AuthRequest,
  isLoginThrottled,
  recordFailedLogin,
  clearLoginAttempts,
  validatePasswordStrength,
} from '../auth.js';

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

    // The seeded development accounts (admin/admin123 and friends) were reaching
    // production instances intact: the production guard only checked whether the users
    // table was EMPTY, so a database seeded in development kept them once promoted, and
    // the password policy only ever ran on passwords set through the UI. The plaintext is
    // in hand here, so it is checked against the same policy on every sign-in. The session
    // is issued but confined to changing its own password until the account complies.
    const policyError = validatePasswordStrength(password);
    const mustChangePassword = Boolean(policyError) && process.env.ALLOW_WEAK_PASSWORDS !== 'true';

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      mustChangePassword,
    });

    await db.audit.log({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action: mustChangePassword ? 'USER_LOGIN_PASSWORD_CHANGE_REQUIRED' : 'USER_LOGIN',
      module: 'Authentication',
      recordId: user.id,
      description: mustChangePassword
        ? `User ${user.username} (${user.role}) signed in with a password that fails the security policy. Session restricted until the password is changed.`
        : `User ${user.username} (${user.role}) logged in successfully.`,
      ipAddress: req.ip,
    });

    res.json({
      token,
      mustChangePassword,
      passwordChangeReason: mustChangePassword ? policyError : undefined,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email,
        mustChangePassword,
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

// User administration (create/list/update/delete/toggle-active) lives exclusively in
// server/routes/users.ts (mounted at /api/users), which additionally validates and
// persists per-user companyScope. This file used to carry a second, independent copy of
// the same CRUD routes under /api/auth/users; it never learned about companyScope, so a
// user created or edited through it silently ended up unscoped -- i.e. with access to
// every company's data, the opposite of the intended default. The frontend never called
// this copy (only /api/users), so removing it changes no behaviour the UI relies on.

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
      ipAddress: req.ip,
    });

    // Issue a fresh token so a session that was confined to this one endpoint is
    // released immediately, without a sign-out/sign-in round trip.
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
    });

    res.json({
      message: 'Password changed successfully.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email,
        mustChangePassword: false,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to change password.' });
  }
});

export default router;
