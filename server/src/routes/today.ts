import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError, notFound } from '../lib/http.js';
import { me, requireBde } from '../lib/auth.js';
import { dateOnly, istInstantRange, todayIST } from '../lib/time.js';
import { env } from '../lib/env.js';

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
  const [grouped, recent, report, followUps, interviewsToMark, paymentsDue] = await Promise.all([
    db.callLog.groupBy({ by: ['outcome'], where: { bdeId: user.id, workDate }, _count: { _all: true } }),
    db.callLog.findMany({ where: { bdeId: user.id, workDate }, orderBy: { calledAt: 'desc' }, take: 5 }),
    db.dailyReport.findUnique({ where: { bdeId_workDate: { bdeId: user.id, workDate } } }),
    db.lead.count({ where: { ownerId: user.id, followUpOn: { lte: workDate }, stage: { notIn: ['PAID', 'NOT_INTERESTED'] } } }),
    db.interview.count({ where: { lead: { ownerId: user.id }, status: 'SCHEDULED', scheduledAt: { lt: istInstantRange(date, date).lt } } }),
    db.payment.count({ where: { lead: { ownerId: user.id }, status: 'PROMISED', closedAt: null, date: { lte: workDate } } })
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

/** Log one call. */
today.post('/calls', async (req, res) => {
  const { outcome } = z.object({ outcome: z.enum(OUTCOMES) }).parse(req.body);
  await assertOpen(me(req).id);
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

today.post('/submit', async (req, res) => {
  const bdeId = me(req).id, workDate = dateOnly(todayIST());
  await db.dailyReport.upsert({
    where: { bdeId_workDate: { bdeId, workDate } },
    create: { bdeId, workDate, submittedAt: new Date() },
    update: { submittedAt: new Date() }
  });
  res.json(await todayPayload(req));
});

/** Reopen today's report to fix it. Past days stay locked (docs/DECISIONS.md #5). */
today.post('/reopen', async (req, res) => {
  const bdeId = me(req).id, workDate = dateOnly(todayIST());
  await db.dailyReport.updateMany({ where: { bdeId, workDate }, data: { submittedAt: null } });
  res.json(await todayPayload(req));
});
