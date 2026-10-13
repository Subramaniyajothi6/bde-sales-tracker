import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { HttpError, forbidden, notFound } from '../lib/http.js';
import { isAdmin, me } from '../lib/auth.js';
import { addDays, dateOnly, humanDate, humanTime, istInstant, istInstantRange, todayIST } from '../lib/time.js';
import { logActivity } from '../lib/activity.js';
import { formatPhone } from '../lib/phone.js';
import { userRef } from '../lib/present.js';
import { leadFor } from './leads.js';

export const interviews = Router();

const withLead = { lead: { include: { owner: true, course: true } } } as const;
type Row = Prisma.InterviewGetPayload<{ include: typeof withLead }>;
const out = (i: Row) => ({
  id: i.id,
  scheduledAt: i.scheduledAt,
  status: i.status,
  result: i.result,
  lead: { id: i.lead.id, name: i.lead.name, phone: formatPhone(i.lead.phone), stage: i.lead.stage, course: i.lead.course.name },
  owner: userRef(i.lead.owner)
});

interviews.get('/', async (req, res) => {
  const { when = 'today', ownerId } = z.object({
    when: z.enum(['today', 'upcoming', 'past', 'all']).optional(),
    ownerId: z.coerce.number().int().optional()
  }).parse(req.query);
  const today = todayIST();
  const t = istInstantRange(today, today);
  const range: Record<string, Prisma.InterviewWhereInput> = {
    // "Today" also keeps older interviews nobody has marked yet, so they aren't forgotten
    today: { OR: [{ scheduledAt: t }, { scheduledAt: { lt: t.gte }, status: 'SCHEDULED' }] },
    upcoming: { scheduledAt: { gte: t.lt } },
    past: { scheduledAt: { lt: t.gte }, NOT: { status: 'SCHEDULED' } },
    all: {}
  };
  const owner = isAdmin(req) ? (ownerId ? { lead: { ownerId } } : {}) : { lead: { ownerId: me(req).id } };
  const list = await db.interview.findMany({
    where: { ...range[when], ...owner },
    include: withLead,
    orderBy: { scheduledAt: when === 'past' ? 'desc' : 'asc' },
    take: 300
  });
  res.json({ interviews: list.map(out) });
});

interviews.post('/', async (req, res) => {
  const b = z.object({
    leadId: z.coerce.number().int(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time')
  }).parse(req.body);
  const lead = await leadFor(req, b.leadId);
  if (b.date < todayIST()) throw new HttpError(400, 'Choose today or a later date');
  const open = await db.interview.findFirst({ where: { leadId: lead.id, status: 'SCHEDULED' } });
  if (open) throw new HttpError(409, `${lead.name} already has an interview booked. Mark it first.`);

  const at = istInstant(b.date, b.time);
  const [, iv] = await db.$transaction([
    db.lead.update({
      where: { id: lead.id },
      data: {
        stage: 'INTERVIEW_SCHEDULED', followUpOn: dateOnly(b.date), nextAction: `Interview at ${humanTime(b.time)}`,
        notes: { create: { authorId: me(req).id, text: `Interview booked for ${humanDate(b.date)}, ${humanTime(b.time)}` } }
      }
    }),
    db.interview.create({ data: { leadId: lead.id, createdById: me(req).id, scheduledAt: at }, include: withLead })
  ]);
  logActivity(me(req).id, 'INTERVIEW_BOOKED', `${lead.name}, ${humanDate(b.date)} ${humanTime(b.time)}`);
  res.status(201).json({ interview: out(iv) });
});

/** Mark attendance, then the result. The lead's status follows automatically. */
interviews.patch('/:id', async (req, res) => {
  const b = z.object({
    status: z.enum(['ATTENDED', 'NO_SHOW']).optional(),
    result: z.enum(['SELECTED', 'NOT_SELECTED']).optional()
  }).parse(req.body);
  const iv = await db.interview.findUnique({ where: { id: Number(req.params.id) }, include: withLead });
  if (!iv) throw notFound('Interview');
  if (!isAdmin(req) && iv.lead.ownerId !== me(req).id) throw forbidden();

  const actor = me(req).id;
  const leadData: Prisma.LeadUpdateInput = {};
  const ivData: Prisma.InterviewUpdateInput = {};
  const notes: string[] = [];

  if (b.status) {
    ivData.status = b.status;
    if (b.status === 'NO_SHOW') {
      ivData.result = null;
      Object.assign(leadData, { stage: 'FOLLOW_UP', followUpOn: dateOnly(addDays(todayIST(), 1)), nextAction: 'Missed the interview. Call to reschedule.' });
      notes.push('Missed the interview');
    } else notes.push('Attended the interview');
  }
  if (b.result) {
    if ((b.status ?? iv.status) !== 'ATTENDED') throw new HttpError(400, 'Mark the interview attended first');
    ivData.result = b.result;
    if (b.result === 'SELECTED') Object.assign(leadData, { stage: 'SELECTED', followUpOn: dateOnly(todayIST()), nextAction: 'Ask when they can pay' });
    else Object.assign(leadData, { stage: 'NOT_INTERESTED', followUpOn: null, nextAction: null });
    notes.push(b.result === 'SELECTED' ? 'Selected' : 'Not selected');
  }
  if (!b.status && !b.result) throw new HttpError(400, 'Nothing to change');

  // Lead first, so the interview returned below shows the lead's new status
  const [, updated] = await db.$transaction([
    db.lead.update({ where: { id: iv.leadId }, data: { ...leadData, notes: { create: notes.map(text => ({ authorId: actor, text })) } } }),
    db.interview.update({ where: { id: iv.id }, data: ivData, include: withLead })
  ]);
  logActivity(actor, 'INTERVIEW_MARKED', `${iv.lead.name}: ${notes.join(', ').toLowerCase()}`);
  res.json({ interview: out(updated) });
});

