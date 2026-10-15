import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError, notFound } from '../lib/http.js';
import { me, requireBde } from '../lib/auth.js';
import { addDays, dateOnly, istInstantRange, todayIST, ymd } from '../lib/time.js';
import { env } from '../lib/env.js';
import { punchIn } from '../lib/attendance.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';
import { AUTO_ACTIONS, STAGE_LABEL, checkFollowUp, dateStr, leadFor } from './leads.js';

/**
 * A BDE's working day: log calls, undo a wrong tap, send the report.
 * The report numbers are always counted from the logged calls.
 */
export const today = Router();
today.use(requireBde);

const OUTCOMES = ['INTERESTED', 'CALL_BACK', 'NOT_INTERESTED', 'NO_ANSWER'] as const;

async function todayPayload(req: Request) {
  const user = me(req);
  const date = todayIST();
  const workDate = dateOnly(date);
  const [grouped, recent, sheetNotes, report, followUps, interviewsToMark, paymentsDue, day, leave] = await Promise.all([
    db.callLog.groupBy({ by: ['outcome'], where: { bdeId: user.id, workDate }, _count: { _all: true } }),
    db.callLog.findMany({ where: { bdeId: user.id, workDate }, orderBy: { id: 'desc' }, take: 100, include: { lead: { select: { id: true, name: true } } } }),
    // Today's changes from Excel uploads, for the history
    db.leadNote.findMany({ where: { authorId: user.id, source: 'SHEET', createdAt: istInstantRange(date, date) }, orderBy: { id: 'desc' }, take: 300, include: { lead: { select: { id: true, name: true } } } }),
    db.dailyReport.findUnique({ where: { bdeId_workDate: { bdeId: user.id, workDate } } }),
    db.lead.count({ where: { ownerId: user.id, followUpOn: { lte: workDate }, stage: { notIn: ['PAID', 'NOT_INTERESTED'] } } }),
    db.interview.count({ where: { lead: { ownerId: user.id }, status: 'SCHEDULED', scheduledAt: { lt: istInstantRange(date, date).lt } } }),
    db.payment.count({ where: { lead: { ownerId: user.id }, status: 'PROMISED', closedAt: null, date: { lte: workDate } } }),
    db.attendance.findUnique({ where: { userId_workDate: { userId: user.id, workDate } } }),
    db.leave.findFirst({ where: { userId: user.id, status: 'APPROVED', fromDate: { lte: workDate }, toDate: { gte: workDate } } })
  ]);
  const counts = Object.fromEntries(OUTCOMES.map(o => [o, grouped.find(g => g.outcome === o)?._count._all ?? 0]));
  // One history entry per student per upload: lines saved together (same lead, a few seconds apart)
  const sheet: { at: Date; lead: { id: number; name: string }; lines: string[] }[] = [];
  for (const n of sheetNotes) {
    const last = sheet[sheet.length - 1];
    if (last && last.lead.id === n.leadId && Math.abs(last.at.getTime() - n.createdAt.getTime()) < 5000) last.lines.unshift(n.text);
    else sheet.push({ at: n.createdAt, lead: n.lead, lines: [n.text] });
  }
  // Calls (call list or a new number) and Excel changes, newest first
  const history = [
    ...recent.map(c => ({ kind: 'CALL' as const, id: c.id, at: c.calledAt, outcome: c.outcome, lead: c.lead, lines: [] as string[] })),
    ...sheet.map((e, i) => ({ kind: 'SHEET' as const, id: -(i + 1), at: e.at, outcome: null, lead: e.lead, lines: e.lines }))
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    date,
    target: user.dailyTarget,
    cutoff: env.REPORT_CUTOFF,
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    recent: recent.slice(0, 8).map(c => ({ id: c.id, outcome: c.outcome, calledAt: c.calledAt, lead: c.lead })),
    history,
    submittedAt: report?.submittedAt ?? null,
    note: report?.note ?? null,
    punchIn: day?.punchIn ?? null,
    punchOut: day?.punchOut ?? null,
    onLeave: !!leave,
    todo: { followUps, interviewsToMark, paymentsDue }
  };
}

async function assertOpen(bdeId: number) {
  const report = await db.dailyReport.findUnique({ where: { bdeId_workDate: { bdeId, workDate: dateOnly(todayIST()) } } });
  if (report?.submittedAt) throw new HttpError(409, "Today's report is already sent. Reopen it to make changes.");
}

today.get('/', async (req, res) => {
  res.json(await todayPayload(req));
});

/** Start the working day. Logging the first call also does this, so a forgotten tap still counts. */
async function startDay(req: Request) {
  const { row, created } = await punchIn(me(req).id);
  if (created) logActivity(me(req).id, 'PUNCH_IN', `Started the day at ${row.punchIn.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}`);
}

today.post('/punch-in', async (req, res) => {
  await startDay(req);
  res.json(await todayPayload(req));
});

const OUTCOME_LABEL = { INTERESTED: 'Interested', CALL_BACK: 'Call back later', NOT_INTERESTED: 'Not interested', NO_ANSWER: 'No answer' } as const;
type LeadState = { stage: string; followUpOn: string | null; nextAction: string | null };
const stateOf = (l: { stage: string; followUpOn: Date | null; nextAction: string | null }): LeadState =>
  ({ stage: l.stage, followUpOn: l.followUpOn ? ymd(l.followUpOn) : null, nextAction: l.nextAction });
const sameState = (a: LeadState, b: LeadState) => a.stage === b.stage && a.followUpOn === b.followUpOn && a.nextAction === b.nextAction;

/**
 * Log one call. With a leadId it is a call to that student, picked from the call list: the call counts for
 * today's report, and the student's status, follow-up and history are updated from how it went.
 * Without one it is a new number, counted only.
 */
today.post('/calls', async (req, res) => {
  const b = z.object({
    outcome: z.enum(OUTCOMES),
    leadId: z.number().int().optional(),
    note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
    /** A follow-up date other than tomorrow (not for Not interested) */
    followUpOn: dateStr.optional()
  }).parse(req.body);
  const bdeId = me(req).id, today = todayIST();
  await assertOpen(bdeId);
  if (!b.leadId) {
    await startDay(req);
    await db.callLog.create({ data: { bdeId, outcome: b.outcome, workDate: dateOnly(today) } });
    return res.status(201).json(await todayPayload(req));
  }

  const lead = await leadFor(req, b.leadId);
  if (lead.stage === 'PAID') throw new HttpError(409, `${lead.name} has paid in full; there is nothing to follow up`);
  checkFollowUp(b.followUpOn);
  await startDay(req);

  const data: Prisma.LeadUncheckedUpdateInput = {};
  let stage = lead.stage;
  if (b.outcome === 'NOT_INTERESTED') {
    stage = 'NOT_INTERESTED';
    Object.assign(data, { followUpOn: null, nextAction: null });
  } else {
    if (b.outcome === 'INTERESTED' && ['NEW', 'FOLLOW_UP'].includes(lead.stage)) stage = 'INTERESTED';
    if (b.outcome === 'CALL_BACK' && ['NEW', 'INTERESTED', 'FOLLOW_UP'].includes(lead.stage)) stage = 'FOLLOW_UP';
    const keep = lead.nextAction && !AUTO_ACTIONS.includes(lead.nextAction) ? lead.nextAction : null;
    data.followUpOn = dateOnly(b.followUpOn ?? addDays(today, 1));
    data.nextAction = keep ?? (b.outcome === 'INTERESTED' ? 'Book the interview' : b.outcome === 'CALL_BACK' ? 'Call back' : 'Try calling again');
  }
  if (stage !== lead.stage) data.stage = stage;

  const lines = [`Called: ${OUTCOME_LABEL[b.outcome]}${b.note ? `. ${b.note}` : ''}`];
  if (stage !== lead.stage) lines.push(`Status changed from ${STAGE_LABEL[lead.stage]} to ${STAGE_LABEL[stage]}`);
  // The call and the student's changes are saved together, or not at all
  await db.$transaction(async tx => {
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: { ...data, notes: { create: lines.map(text => ({ authorId: bdeId, text, source: 'CALL' as const })) } }
    });
    await tx.callLog.create({
      data: { bdeId, outcome: b.outcome, workDate: dateOnly(today), leadId: lead.id, undo: { before: stateOf(lead), after: stateOf(updated) } }
    });
  });
  res.status(201).json(await todayPayload(req));
});

/** Undo a call logged today. */
today.delete('/calls/:id', async (req, res) => {
  const call = await db.callLog.findUnique({ where: { id: Number(req.params.id) } });
  if (!call || call.bdeId !== me(req).id || call.workDate.getTime() !== dateOnly(todayIST()).getTime()) throw notFound('Call');
  await assertOpen(me(req).id);
  await db.callLog.delete({ where: { id: call.id } });
  // A call to a student: put their status, follow-up and next action back, unless they were changed since
  const undo = call.undo as { before: LeadState; after: LeadState } | null;
  if (call.leadId && undo) {
    const lead = await db.lead.findUnique({ where: { id: call.leadId } });
    if (lead) {
      const restore = sameState(stateOf(lead), undo.after);
      await db.lead.update({
        where: { id: lead.id },
        data: {
          ...(restore ? { stage: undo.before.stage as never, followUpOn: undo.before.followUpOn ? dateOnly(undo.before.followUpOn) : null, nextAction: undo.before.nextAction } : {}),
          notes: { create: { authorId: me(req).id, source: 'CALL', text: `Call undone (${OUTCOME_LABEL[call.outcome]})${restore ? '' : '. The lead was changed after the call, so it was left as it is'}` } }
        }
      });
    }
  }
  res.json(await todayPayload(req));
});

/** Send today's report, with an optional note for the admin. Sending it also ends the working day (punch out). */
today.post('/submit', async (req, res) => {
  const { note } = z.object({ note: z.string().trim().max(500, 'Keep the note under 500 characters').optional() }).parse(req.body ?? {});
  const bdeId = me(req).id, workDate = dateOnly(todayIST()), now = new Date();
  await db.dailyReport.upsert({
    where: { bdeId_workDate: { bdeId, workDate } },
    create: { bdeId, workDate, submittedAt: now, note: note || null },
    update: { submittedAt: now, note: note || null }
  });
  await startDay(req);
  await db.attendance.update({ where: { userId_workDate: { userId: bdeId, workDate } }, data: { punchOut: now } });
  const total = await db.callLog.count({ where: { bdeId, workDate } });
  logActivity(bdeId, 'REPORT_SENT', `${total} calls${note ? `. Note: ${note}` : ''}`);
  if (note) notify('admins', 'REPORT_NOTE', `${me(req).name}: ${note}`, '/admin/report');
  res.json(await todayPayload(req));
});

/** Reopen today's report to fix it. Past days stay locked (docs/DECISIONS.md #5). */
today.post('/reopen', async (req, res) => {
  const bdeId = me(req).id, workDate = dateOnly(todayIST());
  await db.dailyReport.updateMany({ where: { bdeId, workDate }, data: { submittedAt: null } });
  await db.attendance.updateMany({ where: { userId: bdeId, workDate }, data: { punchOut: null } });
  logActivity(bdeId, 'REPORT_REOPENED', "Reopened today's report");
  res.json(await todayPayload(req));
});
