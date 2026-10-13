import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { endSession, me, requireAuth, sessionUser, startSession, strongEnough } from '../lib/auth.js';
import { publicUser } from '../lib/present.js';
import { logActivity } from '../lib/activity.js';

export const auth = Router();

// Slow down password guessing: 10 wrong passwords per 15 minutes for one employee ID from one address.
// Successful logins don't count, so a whole office behind one internet connection can sign in every morning.
const loginLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: req => `${req.ip}|${String(req.body?.employeeId ?? '').trim().toUpperCase()}`,
  message: { error: 'Too many wrong passwords. Wait 15 minutes and try again.' }
});

auth.post('/login', loginLimit, async (req, res) => {
  const { employeeId, password } = z.object({
    employeeId: z.string().trim().min(1, 'Enter your employee ID'),
    password: z.string().min(1, 'Enter your password')
  }).parse(req.body);

  const user = await db.user.findUnique({ where: { employeeId: employeeId.toUpperCase() } });
  // Same message for an unknown ID and a wrong password, so IDs can't be guessed
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Employee ID or password is wrong');
  }
  if (!user.active) throw new HttpError(403, 'This account is deactivated. Contact your admin.');

  const updated = await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  startSession(res, updated);
  logActivity(user.id, 'LOGIN', /Mobi|Android|iPhone|iPad/i.test(req.get('user-agent') ?? '') ? 'On a phone' : 'On a computer');
  res.json({ user: publicUser(updated) });
});

auth.post('/logout', async (req, res) => {
  const user = await sessionUser(req);
  if (user) logActivity(user.id, 'LOGOUT', '');
  endSession(res);
  res.json({ ok: true });
});

/** Who is logged in. { user: null } when nobody is, so the app can show the login page without an error. */
auth.get('/me', async (req, res) => {
  const user = await sessionUser(req);
  res.json({ user: user ? publicUser(user) : null });
});

auth.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = z.object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string()
  }).parse(req.body);
  const user = me(req);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is wrong');
  if (!strongEnough(newPassword)) throw new HttpError(400, 'Use at least 8 characters with a letter and a number');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a password different from the current one');

  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false, tokenVersion: { increment: 1 } }
  });
  startSession(res, updated); // other devices are logged out, this one stays in
  logActivity(user.id, 'PASSWORD_CHANGED', user.mustChangePassword ? 'Set their own password' : 'Changed password');
  res.json({ user: publicUser(updated) });
});
