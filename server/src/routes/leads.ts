import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { HttpError, forbidden, notFound } from '../lib/http.js';
import { isAdmin, me } from '../lib/auth.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { dateOnly, todayIST, ymd } from '../lib/time.js';
import { userRef } from '../lib/present.js';

export const leads = Router();

export const STAGES = ['INTERESTED', 'FOLLOW_UP', 'INTERVIEW_SCHEDULED', 'SELECTED', 'PAYMENT_COMMITTED', 'PAID', 'NOT_INTERESTED'] as const;
export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  INTERESTED: 'Interested', FOLLOW_UP: 'Follow-up', INTERVIEW_SCHEDULED: 'Interview scheduled',
  SELECTED: 'Selected', PAYMENT_COMMITTED: 'Payment committed', PAID: 'Paid', NOT_INTERESTED: 'Not interested'
};
const CLOSED = ['PAID', 'NOT_INTERESTED'] as const;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-12');

/** Loads a lead the user may see: admins see all, BDEs only their own. */
export async function leadFor(req: Request, id: number) {
  const lead = await db.lead.findUnique({ where: { id }, include: { course: true, owner: true } });
  if (!lead) throw notFound('Lead');
  if (!isAdmin(req) && lead.ownerId !== me(req).id) throw forbidden();
  return lead;
}

/** Fee minus money received that wasn't rejected. */
export async function balanceOf(leadId: number, fee: number) {
  const agg = await db.payment.aggregate({
    where: { leadId, status: { in: ['PARTIALLY_PAID', 'PAID'] }, NOT: { check: 'REJECTED' } },
    _sum: { amount: true }
  });
  const paid = agg._sum.amount ?? 0;
  return { fee, paid, balance: Math.max(0, fee - paid) };
}

type LeadRow = Prisma.LeadGetPayload<{ include: { course: true; owner: true } }>;
const leadOut = (l: LeadRow) => ({
  id: l.id,
  name: l.name,
  phone: formatPhone(l.phone),
  course: { id: l.course.id, name: l.course.name, type: l.course.type, fee: l.course.fee },
  owner: userRef(l.owner),
  stage: l.stage,
  followUpOn: ymd(l.followUpOn),
  nextAction: l.nextAction,
  createdAt: l.createdAt
});

leads.get('/', async (req, res) => {
  const f = z.object({
    stage: z.enum(STAGES).optional(),
    ownerId: z.coerce.number().int().optional(),
    q: z.string().trim().optional(),
    view: z.enum(['all', 'active', 'due', 'overdue']).optional()
  }).parse(req.query);
  const today = dateOnly(todayIST());

  const base: Prisma.LeadWhereInput = {
    ...(isAdmin(req) ? (f.ownerId ? { ownerId: f.ownerId } : {}) : { ownerId: me(req).id }),
    ...(f.q ? { OR: [{ name: { contains: f.q } }, ...(f.q.replace(/\D/g, '') ? [{ phone: { contains: f.q.replace(/\D/g, '') } }] : [])] } : {})
  };
  const open = { stage: { notIn: [...CLOSED] } };
  const viewWhere: Record<string, Prisma.LeadWhereInput> = {
    all: {},
    active: open,
    due: { ...open, followUpOn: { lte: today } },
    overdue: { ...open, followUpOn: { lt: today } }
  };
  const view = viewWhere[f.view ?? 'all'];

  const [list, byStage, overdue, due, active] = await Promise.all([
    db.lead.findMany({
      where: { ...base, ...view, ...(f.stage ? { stage: f.stage } : {}) },
      include: { course: true, owner: true },
      orderBy: [{ followUpOn: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 500
    }),
    db.lead.groupBy({ by: ['stage'], where: { ...base, ...view }, _count: { _all: true } }),
    db.lead.count({ where: { ...base, ...viewWhere.overdue } }),
    db.lead.count({ where: { ...base, ...viewWhere.due } }),
    db.lead.count({ where: { ...base, ...viewWhere.active } })
  ]);
  res.json({
    leads: list.map(leadOut),
    counts: {
      byStage: Object.fromEntries(STAGES.map(s => [s, byStage.find(g => g.stage === s)?._count._all ?? 0])),
      overdue, due, active
    }
  });
});

const createBody = z.object({
  name: z.string().trim().min(2, "Enter the candidate's name").max(100),
  phone: z.string().trim().min(1, 'Enter a mobile number'),
  courseId: z.coerce.number().int(),
  stage: z.enum(STAGES).optional(),
  followUpOn: dateStr.optional().or(z.literal('')),
  nextAction: z.string().trim().max(200).optional(),
  ownerId: z.coerce.number().int().optional()
});

leads.post('/', async (req, res) => {
  const b = createBody.parse(req.body);
  const phone = normalizePhone(b.phone);
  if (!phone) throw new HttpError(400, 'Enter a valid 10-digit mobile number');

  const existing = await db.lead.findUnique({ where: { phone }, include: { owner: true } });
  if (existing) {
    const mine = existing.ownerId === me(req).id;
    throw new HttpError(409, mine
      ? `You already have this number as ${existing.name}`
      : `This number is already a lead for ${existing.owner.name}. Ask your admin if it should move to you.`,
      { leadId: mine || isAdmin(req) ? existing.id : undefined });
  }

  const course = await db.course.findUnique({ where: { id: b.courseId } });
  if (!course || !course.active) throw new HttpError(400, 'Choose a course or internship');

  let ownerId = me(req).id;
  if (isAdmin(req)) {
    const owner = b.ownerId ? await db.user.findUnique({ where: { id: b.ownerId } }) : null;
    if (!owner || owner.role !== 'BDE' || !owner.active) throw new HttpError(400, 'Choose which BDE this lead belongs to');
    ownerId = owner.id;
  }

  const lead = await db.lead.create({
    data: {
      name: b.name, phone, courseId: course.id, ownerId,
      stage: b.stage ?? 'INTERESTED',
      followUpOn: b.followUpOn ? dateOnly(b.followUpOn) : null,
      nextAction: b.nextAction || null,
      notes: { create: { authorId: me(req).id, text: 'Lead added' } }
    },
    include: { course: true, owner: true }
  });
  res.status(201).json({ lead: leadOut(lead) });
});

leads.get('/:id', async (req, res) => {
  const lead = await leadFor(req, Number(req.params.id));
  const [notes, interviews, payments, money] = await Promise.all([
    db.leadNote.findMany({ where: { leadId: lead.id }, include: { author: true }, orderBy: { createdAt: 'desc' } }),
    db.interview.findMany({ where: { leadId: lead.id }, orderBy: { scheduledAt: 'desc' } }),
    db.payment.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' } }),
    balanceOf(lead.id, lead.course.fee)
  ]);
  res.json({
    lead: leadOut(lead),
    money,
    notes: notes.map(n => ({ id: n.id, text: n.text, author: n.author.name, createdAt: n.createdAt })),
    interviews: interviews.map(i => ({ id: i.id, scheduledAt: i.scheduledAt, status: i.status, result: i.result })),
    payments: payments.map(p => ({ id: p.id, amount: p.amount, status: p.status, date: ymd(p.date), check: p.check, closedAt: p.closedAt }))
  });
});

leads.patch('/:id', async (req, res) => {
  const lead = await leadFor(req, Number(req.params.id));
  const b = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    courseId: z.coerce.number().int().optional(),
    stage: z.enum(STAGES).optional(),
    followUpOn: dateStr.nullable().optional().or(z.literal('')),
    nextAction: z.string().trim().max(200).nullable().optional(),
    ownerId: z.coerce.number().int().optional()
  }).parse(req.body);

  const notes: string[] = [];
  const data: Prisma.LeadUncheckedUpdateInput = {};
  if (b.name !== undefined) data.name = b.name;
  if (b.courseId !== undefined && b.courseId !== lead.courseId) {
    const course = await db.course.findUnique({ where: { id: b.courseId } });
    if (!course) throw new HttpError(400, 'Choose a course or internship');
    data.courseId = course.id;
    notes.push(`Course changed to ${course.name}`);
  }
  if (b.stage && b.stage !== lead.stage) {
    data.stage = b.stage;
    notes.push(`Status changed from ${STAGE_LABEL[lead.stage]} to ${STAGE_LABEL[b.stage]}`);
  }
  if (b.followUpOn !== undefined) data.followUpOn = b.followUpOn ? dateOnly(b.followUpOn) : null;
  if (b.nextAction !== undefined) data.nextAction = b.nextAction || null;
  if (b.ownerId !== undefined && b.ownerId !== lead.ownerId) {
    if (!isAdmin(req)) throw new HttpError(403, 'Only admins can move a lead to another BDE');
    const owner = await db.user.findUnique({ where: { id: b.ownerId } });
    if (!owner || owner.role !== 'BDE' || !owner.active) throw new HttpError(400, 'Choose an active BDE');
    data.ownerId = owner.id;
    notes.push(`Moved from ${lead.owner.name} to ${owner.name}`);
  }

  const updated = await db.lead.update({
    where: { id: lead.id },
    data: { ...data, notes: notes.length ? { create: notes.map(text => ({ authorId: me(req).id, text })) } : undefined },
    include: { course: true, owner: true }
  });
  res.json({ lead: leadOut(updated) });
});

leads.post('/:id/notes', async (req, res) => {
  const lead = await leadFor(req, Number(req.params.id));
  const { text } = z.object({ text: z.string().trim().min(1, 'Write a note first').max(500) }).parse(req.body);
  const note = await db.leadNote.create({ data: { leadId: lead.id, authorId: me(req).id, text }, include: { author: true } });
  res.status(201).json({ note: { id: note.id, text: note.text, author: note.author.name, createdAt: note.createdAt } });
});
