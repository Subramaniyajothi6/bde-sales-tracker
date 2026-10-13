import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError, notFound } from '../lib/http.js';
import { requireAdmin, tempPassword } from '../lib/auth.js';
import { publicUser } from '../lib/present.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { dateOnly, todayIST } from '../lib/time.js';

/** Team page: BDE accounts. Admin only. */
export const users = Router();
users.use(requireAdmin);

users.get('/', async (req, res) => {
  const { status = 'active', q = '' } = z.object({
    status: z.enum(['active', 'inactive', 'all']).optional(),
    q: z.string().trim().optional()
  }).parse(req.query);
  const digits = q.replace(/\D/g, '');
  const list = await db.user.findMany({
    where: {
      role: 'BDE',
      ...(status === 'all' ? {} : { active: status === 'active' }),
      ...(q ? { OR: [{ name: { contains: q } }, { employeeId: { contains: q } }, ...(digits ? [{ phone: { contains: digits.slice(-5) } }] : [])] } : {})
    },
    orderBy: { employeeId: 'asc' }
  });
  res.json({ users: list.map(publicUser) });
});

/** Next free ID: BDE-001, BDE-002, ... */
async function nextEmployeeId() {
  const last = await db.user.findFirst({ where: { employeeId: { startsWith: 'BDE-' } }, orderBy: { employeeId: 'desc' } });
  const n = last ? Number(last.employeeId.slice(4)) + 1 : 1;
  return `BDE-${String(n).padStart(3, '0')}`;
}

users.get('/next-id', async (_req, res) => {
  res.json({ employeeId: await nextEmployeeId() });
});

const userFields = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(100),
  phone: z.string().trim().min(1, 'Enter a mobile number'),
  email: z.string().trim().email('Enter a valid email').max(150).optional().or(z.literal('')),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-12').optional(),
  dailyTarget: z.coerce.number().int().min(1).max(500).optional()
});

function phoneOrThrow(input: string) {
  const p = normalizePhone(input);
  if (!p) throw new HttpError(400, 'Enter a valid 10-digit mobile number');
  return formatPhone(p);
}

users.post('/', async (req, res) => {
  const body = userFields.parse(req.body);
  const password = tempPassword();
  const user = await db.user.create({
    data: {
      employeeId: await nextEmployeeId(),
      name: body.name,
      phone: phoneOrThrow(body.phone),
      email: body.email || null,
      joinedOn: dateOnly(body.joinedOn ?? todayIST()),
      dailyTarget: body.dailyTarget ?? 80,
      role: 'BDE',
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true
    }
  });
  // The temporary password is shown once, to the admin. Only its hash is stored.
  res.status(201).json({ user: publicUser(user), temporaryPassword: password });
});

users.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const body = userFields.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== 'BDE') throw notFound('BDE');
  const updated = await db.user.update({
    where: { id },
    data: {
      name: body.name,
      phone: body.phone !== undefined ? phoneOrThrow(body.phone) : undefined,
      email: body.email === '' ? null : body.email,
      joinedOn: body.joinedOn ? dateOnly(body.joinedOn) : undefined,
      dailyTarget: body.dailyTarget,
      active: body.active,
      // Deactivating logs the BDE out everywhere
      ...(body.active === false ? { tokenVersion: { increment: 1 } } : {})
    }
  });
  res.json({ user: publicUser(updated) });
});

users.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== 'BDE') throw notFound('BDE');
  const password = tempPassword();
  await db.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, tokenVersion: { increment: 1 } }
  });
  res.json({ temporaryPassword: password });
});
