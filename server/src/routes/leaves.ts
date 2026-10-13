import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { HttpError, forbidden, notFound } from '../lib/http.js';
import { isAdmin, me, requireAdmin, requireBde } from '../lib/auth.js';
import { addDays, dateOnly, humanDate, todayIST, workDays, ymd } from '../lib/time.js';
import { userRef } from '../lib/present.js';
import { logActivity } from '../lib/activity.js';

/** Leave requests: a BDE asks, the admin approves or rejects. */
export const leaves = Router();

const TYPES = ['CASUAL', 'SICK', 'EMERGENCY', 'OTHER'] as const;
const TYPE_LABEL: Record<(typeof TYPES)[number], string> = { CASUAL: 'Casual', SICK: 'Sick', EMERGENCY: 'Emergency', OTHER: 'Other' };
/** Leave already taken can be asked for afterwards, up to this many days back (e.g. a sick day). */
const BACKDATE_DAYS = 7;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');

type Row = Prisma.LeaveGetPayload<{ include: { user: true; decidedBy: true } }>;
const out = (l: Row) => ({
  id: l.id,
  type: l.type,
  from: ymd(l.fromDate)!,
  to: ymd(l.toDate)!,
  days: workDays(ymd(l.fromDate)!, ymd(l.toDate)!).length,
  reason: l.reason,
  status: l.status,
  decisionNote: l.decisionNote,
  decidedBy: l.decidedBy ? userRef(l.decidedBy) : null,
  decidedAt: l.decidedAt,
  createdAt: l.createdAt,
  user: userRef(l.user)
});
const span = (l: { fromDate: Date; toDate: Date }) =>
  ymd(l.fromDate) === ymd(l.toDate) ? humanDate(ymd(l.fromDate)!) : `${humanDate(ymd(l.fromDate)!)} to ${humanDate(ymd(l.toDate)!)}`;

/** BDEs see their own; the admin sees everyone's (pending first). */
leaves.get('/', async (req, res) => {
  const { status = 'all' } = z.object({ status: z.enum(['pending', 'all']).optional() }).parse(req.query);
  const list = await db.leave.findMany({
    where: { ...(isAdmin(req) ? {} : { userId: me(req).id }), ...(status === 'pending' ? { status: 'PENDING' } : {}) },
    include: { user: true, decidedBy: true },
    // BDEs see their latest requests first; the admin sees by leave date with waiting ones on top
    orderBy: isAdmin(req) ? [{ fromDate: 'desc' }] : [{ createdAt: 'desc' }],
    take: 300
  });
  const pending = isAdmin(req) ? await db.leave.count({ where: { status: 'PENDING' } }) : list.filter(l => l.status === 'PENDING').length;
  if (isAdmin(req)) list.sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING'));
  res.json({ leaves: list.map(out), pending });
});

leaves.post('/', requireBde, async (req, res) => {
  const b = z.object({
    type: z.enum(TYPES),
    from: dateStr,
    to: dateStr,
    reason: z.string().trim().min(3, 'Say why you need leave').max(300)
  }).parse(req.body);
  const today = todayIST();
  if (b.to < b.from) throw new HttpError(400, 'The last day must be on or after the first day');
  if (b.from < addDays(today, -BACKDATE_DAYS)) throw new HttpError(400, `Leave can be asked for up to ${BACKDATE_DAYS} days back`);
  if (!workDays(b.from, b.to).length) throw new HttpError(400, 'Those dates are only Sundays');
  if (b.to > addDays(today, 120)) throw new HttpError(400, 'Choose dates within the next 4 months');

  const userId = me(req).id;
  const clash = await db.leave.findFirst({
    where: { userId, status: { in: ['PENDING', 'APPROVED'] }, fromDate: { lte: dateOnly(b.to) }, toDate: { gte: dateOnly(b.from) } }
  });
  if (clash) throw new HttpError(409, `You already asked for leave on ${span(clash)}`);

  const leave = await db.leave.create({
    data: { userId, type: b.type, fromDate: dateOnly(b.from), toDate: dateOnly(b.to), reason: b.reason },
    include: { user: true, decidedBy: true }
  });
  logActivity(userId, 'LEAVE_REQUESTED', `${TYPE_LABEL[b.type]} leave, ${span(leave)}`);
  res.status(201).json({ leave: out(leave) });
});

/** A BDE can cancel a request that is pending, or approved leave that hasn't started yet. */
leaves.post('/:id/cancel', requireBde, async (req, res) => {
  const l = await db.leave.findUnique({ where: { id: Number(req.params.id) } });
  if (!l) throw notFound('Leave request');
  if (l.userId !== me(req).id) throw forbidden();
  const canCancel = l.status === 'PENDING' || (l.status === 'APPROVED' && ymd(l.fromDate)! > todayIST());
  if (!canCancel) throw new HttpError(409, 'This leave can no longer be cancelled');
  const updated = await db.leave.update({ where: { id: l.id }, data: { status: 'CANCELLED' }, include: { user: true, decidedBy: true } });
  logActivity(me(req).id, 'LEAVE_CANCELLED', `Leave ${span(l)}`);
  res.json({ leave: out(updated) });
});

async function decide(id: number, adminId: number, status: 'APPROVED' | 'REJECTED', note: string | undefined) {
  const l = await db.leave.findUnique({ where: { id } });
  if (!l) throw notFound('Leave request');
  if (l.status !== 'PENDING') throw new HttpError(409, 'This request has already been answered or cancelled');
  return db.leave.update({
    where: { id },
    data: { status, decidedById: adminId, decidedAt: new Date(), decisionNote: note || null },
    include: { user: true, decidedBy: true }
  });
}

leaves.post('/:id/approve', requireAdmin, async (req, res) => {
  const { note } = z.object({ note: z.string().trim().max(200).optional() }).parse(req.body ?? {});
  const l = await decide(Number(req.params.id), me(req).id, 'APPROVED', note);
  logActivity(me(req).id, 'LEAVE_APPROVED', `${l.user.name}, ${span(l)}`);
  res.json({ leave: out(l) });
});

leaves.post('/:id/reject', requireAdmin, async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(3, 'Say why the leave is rejected').max(200) }).parse(req.body ?? {});
  const l = await decide(Number(req.params.id), me(req).id, 'REJECTED', note);
  logActivity(me(req).id, 'LEAVE_REJECTED', `${l.user.name}, ${span(l)}: ${note}`);
  res.json({ leave: out(l) });
});
