import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '../lib/db.js';
import { HttpError, forbidden, notFound } from '../lib/http.js';
import { isAdmin, me, requireAdmin } from '../lib/auth.js';
import { normalizePhone, formatPhone } from '../lib/phone.js';
import { dateOnly, todayIST, ymd } from '../lib/time.js';
import { userRef } from '../lib/present.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';

export const leads = Router();

export const STAGES = ['NEW', 'INTERESTED', 'FOLLOW_UP', 'INTERVIEW_SCHEDULED', 'SELECTED', 'PAYMENT_COMMITTED', 'PAID', 'NOT_INTERESTED'] as const;
export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  NEW: 'New', INTERESTED: 'Interested', FOLLOW_UP: 'Follow-up', INTERVIEW_SCHEDULED: 'Interview scheduled',
  SELECTED: 'Selected', PAYMENT_COMMITTED: 'Payment committed', PAID: 'Paid', NOT_INTERESTED: 'Not interested'
};
/** Next actions the app writes itself; a call or a status change from Excel replaces these, but keeps one the BDE typed */
export const AUTO_ACTIONS = ['First call', 'Book the interview', 'Call back', 'Try calling again'];
/** The next action that goes with a status, as a call on Today would set it */
export const STAGE_ACTION: Partial<Record<(typeof STAGES)[number], string>> = { INTERESTED: 'Book the interview', FOLLOW_UP: 'Call back' };
const CLOSED = ['PAID', 'NOT_INTERESTED'] as const;
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-12');

/** A new or changed follow-up date can't be in the past. */
export function checkFollowUp(date: string | null | undefined) {
  if (date && date < todayIST()) throw new HttpError(400, 'Choose today or a later date for the follow-up');
}
// These two statuses follow real events: an interview booked, and the full fee verified
const NEEDS_INTERVIEW = 'Book the interview to set "Interview scheduled"';
const NEEDS_PAYMENT = 'A lead becomes Paid by itself when the admin verifies the full fee';

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
    view: z.enum(['all', 'active', 'due', 'overdue']).optional(),
    /** Only the leads from one of the admin's imports */
    batchId: z.coerce.number().int().optional()
  }).parse(req.query);
  const today = dateOnly(todayIST());

  const base: Prisma.LeadWhereInput = {
    ...(isAdmin(req) ? (f.ownerId ? { ownerId: f.ownerId } : {}) : { ownerId: me(req).id }),
    ...(f.batchId ? { batchId: f.batchId } : {}),
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

  const [list, byStage, overdue, due, active, all] = await Promise.all([
    db.lead.findMany({
      where: { ...base, ...view, ...(f.stage ? { stage: f.stage } : {}) },
      include: { course: true, owner: true },
      orderBy: [{ followUpOn: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 500
    }),
    db.lead.groupBy({ by: ['stage'], where: { ...base, ...view }, _count: { _all: true } }),
    db.lead.count({ where: { ...base, ...viewWhere.overdue } }),
    db.lead.count({ where: { ...base, ...viewWhere.due } }),
    db.lead.count({ where: { ...base, ...viewWhere.active } }),
    db.lead.count({ where: base })
  ]);
  res.json({
    leads: list.map(leadOut),
    counts: {
      byStage: Object.fromEntries(STAGES.map(s => [s, byStage.find(g => g.stage === s)?._count._all ?? 0])),
      // byStage follows the chosen view; overdue, due, active and all are always the full counts
      overdue, due, active, all
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

  if (b.stage === 'INTERVIEW_SCHEDULED') throw new HttpError(400, NEEDS_INTERVIEW);
  if (b.stage === 'PAID') throw new HttpError(400, NEEDS_PAYMENT);
  checkFollowUp(b.followUpOn);

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
  if (isAdmin(req)) notify([lead.ownerId], 'LEADS_GIVEN', `New lead for you: ${lead.name}`, `/bde/leads/${lead.id}`);
  logActivity(me(req).id, 'LEAD_ADDED', `${lead.name}, ${lead.course.name}${isAdmin(req) ? ` for ${lead.owner.name}` : ''}`);
  res.status(201).json({ lead: leadOut(lead) });
});

/**
 * The admin's imports, newest first, with how far their students have got:
 * a count per status for the whole batch and for each BDE in it, and how many have been called.
 */
leads.get('/batches', requireAdmin, async (_req, res) => {
  const batches = await db.importBatch.findMany({ include: { createdBy: true }, orderBy: { id: 'desc' }, take: 50 });
  const ids = batches.map(b => b.id);
  const [byStage, byOwnerStage] = await Promise.all([
    db.lead.groupBy({ by: ['batchId', 'stage'], where: { batchId: { in: ids } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['batchId', 'ownerId', 'stage'], where: { batchId: { in: ids } }, _count: { _all: true } })
  ]);
  const owners = await db.user.findMany({ where: { id: { in: [...new Set(byOwnerStage.map(r => r.ownerId))] } } });
  const stageCounts = (rows: { stage: string; _count: { _all: number } }[]) =>
    Object.fromEntries(STAGES.map(s => [s, rows.filter(r => r.stage === s).reduce((t, r) => t + r._count._all, 0)]));
  res.json({
    batches: batches.map(b => {
      const mine = byOwnerStage.filter(r => r.batchId === b.id);
      return {
        id: b.id, fileName: b.fileName, createdAt: b.createdAt, createdBy: b.createdBy.name, count: b.count,
        // Every lead from the batch, wherever it is now (moving a lead to another BDE keeps it in the batch)
        stages: stageCounts(byStage.filter(r => r.batchId === b.id)),
        // Called = moved on from "Not called"
        called: byStage.filter(r => r.batchId === b.id && r.stage !== 'NEW').reduce((t, r) => t + r._count._all, 0),
        byBde: [...new Set(mine.map(r => r.ownerId))].map(id => {
          const u = owners.find(o => o.id === id)!;
          return { bde: userRef(u), stages: stageCounts(mine.filter(r => r.ownerId === id)) };
        }).sort((x, y) => x.bde.name.localeCompare(y.bde.name))
      };
    })
  });
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
    notes: notes.map(n => ({ id: n.id, text: n.text, author: n.author.name, source: n.source, createdAt: n.createdAt })),
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
  let fee = lead.course.fee;
  if (b.courseId !== undefined && b.courseId !== lead.courseId) {
    const course = await db.course.findUnique({ where: { id: b.courseId } });
    if (!course) throw new HttpError(400, 'Choose a course or internship');
    data.courseId = course.id;
    fee = course.fee;
    notes.push(`Course changed to ${course.name}`);
  }
  if (b.stage && b.stage !== lead.stage) {
    if (b.stage === 'INTERVIEW_SCHEDULED' && !(await db.interview.count({ where: { leadId: lead.id, status: 'SCHEDULED' } }))) {
      throw new HttpError(400, NEEDS_INTERVIEW);
    }
    if (b.stage === 'PAID') {
      const verified = await db.payment.aggregate({ where: { leadId: lead.id, check: 'VERIFIED' }, _sum: { amount: true } });
      if ((verified._sum.amount ?? 0) < fee) throw new HttpError(400, NEEDS_PAYMENT);
    }
    data.stage = b.stage;
    notes.push(`Status changed from ${STAGE_LABEL[lead.stage]} to ${STAGE_LABEL[b.stage]}`);
  }
  // An existing overdue date can be saved again unchanged (e.g. when only the next action is edited)
  if (b.followUpOn && b.followUpOn !== ymd(lead.followUpOn)) checkFollowUp(b.followUpOn);
  if (b.followUpOn !== undefined) data.followUpOn = b.followUpOn ? dateOnly(b.followUpOn) : null;
  if (b.nextAction !== undefined) data.nextAction = b.nextAction || null;
  if (b.ownerId !== undefined && b.ownerId !== lead.ownerId) {
    if (!isAdmin(req)) throw new HttpError(403, 'Only admins can move a lead to another BDE');
    const owner = await db.user.findUnique({ where: { id: b.ownerId } });
    if (!owner || owner.role !== 'BDE' || !owner.active) throw new HttpError(400, 'Choose an active BDE');
    data.ownerId = owner.id;
    notes.push(`Moved from ${lead.owner.name} to ${owner.name}`);
    logActivity(me(req).id, 'LEAD_MOVED', `${lead.name}: ${lead.owner.name} to ${owner.name}`);
    notify([owner.id], 'LEADS_GIVEN', `${lead.name} was moved to you`, `/bde/leads/${lead.id}`);
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
