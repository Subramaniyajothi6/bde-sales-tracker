import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError, notFound } from '../lib/http.js';
import { me, requireBde } from '../lib/auth.js';
import { dateOnly, istInstantRange, todayIST } from '../lib/time.js';
import { env } from '../lib/env.js';
import { punchIn } from '../lib/attendance.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';

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
  const [grouped, recent, report, followUps, interviewsToMark, paymentsDue, day, leave] = await Promise.all([
    db.callLog.groupBy({ by: ['outcome'], where: { bdeId: user.id, workDate }, _count: { _all: true } }),
    db.callLog.findMany({ where: { bdeId: user.id, workDate }, orderBy: { calledAt: 'desc' }, take: 5 }),
    db.dailyReport.findUnique({ where: { bdeId_workDate: { bdeId: user.id, workDate } } }),
    db.lead.count({ where: { ownerId: user.id, followUpOn: { lte: workDate }, stage: { notIn: ['PAID', 'NOT_INTERESTED'] } } }),
    db.interview.count({ where: { lead: { ownerId: user.id }, status: 'SCHEDULED', scheduledAt: { lt: istInstantRange(date, date).lt } } }),
    db.payment.count({ where: { lead: { ownerId: user.id }, status: 'PROMISED', closedAt: null, date: { lte: workDate } } }),
    db.attendance.findUnique({ where: { userId_workDate: { userId: user.id, workDate } } }),
    db.leave.findFirst({ where: { userId: user.id, status: 'APPROVED', fromDate: { lte: workDate }, toDate: { gte: workDate } } })
  ]);
  const counts = Object.fromEntries(OUTCOMES.map(o => [o, grouped.find(g => g.outcome === o)?._count._all ?? 0]));
  return {
    date,
    target: user.dailyTarget,
    cutoff: env.REPORT_CUTOFF,
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    recent: recent.map(c => ({ id: c.id, outcome: c.outcome, calledAt: c.calledAt })),
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

/** Log one call. */
today.post('/calls', async (req, res) => {
  const { outcome } = z.object({ outcome: z.enum(OUTCOMES) }).parse(req.body);
  await assertOpen(me(req).id);
  await startDay(req);
  await db.callLog.create({ data: { bdeId: me(req).id, outcome, workDate: dateOnly(todayIST()) } });
  res.status(201).json(await todayPayload(req));
});

/** Undo a call logged today. */
today.delete('/calls/:id', async (req, res) => {
  const call = await db.callLog.findUnique({ where: { id: Number(req.params.id) } });
  if (!call || call.bdeId !== me(req).id || call.workDate.getTime() !== dateOnly(todayIST()).getTime()) throw notFound('Call');
  await assertOpen(me(req).id);
  await db.callLog.delete({ where: { id: call.id } });
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
