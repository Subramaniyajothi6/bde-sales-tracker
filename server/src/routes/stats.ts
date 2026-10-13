import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { forbidden, notFound } from '../lib/http.js';
import { isAdmin, me, requireAdmin } from '../lib/auth.js';
import { dateOnly, istInstantRange, monthRange, todayIST, workDays } from '../lib/time.js';
import { dailyTotals, statsByBde, sumStats, type BdeStats } from '../lib/stats.js';
import { userRef } from '../lib/present.js';

export const stats = Router();

const monthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

/** Month so far: from the 1st up to today for the current month, the whole month otherwise. */
function periodOf(month?: string) {
  const today = todayIST();
  const m = month ?? today.slice(0, 7);
  const r = monthRange(m);
  return { month: m, from: r.from, to: r.to > today ? today : r.to };
}

async function monthlyRows(month?: string) {
  const p = periodOf(month);
  const [bdes, byBde] = await Promise.all([
    db.user.findMany({ where: { role: 'BDE' }, orderBy: { employeeId: 'asc' } }),
    statsByBde(p.from, p.to)
  ]);
  // Deactivated BDEs stay in the report if they worked that month
  const rows = bdes
    .map(b => ({ bde: { ...userRef(b), active: b.active }, stats: byBde.get(b.id)! }))
    .filter(r => r.bde.active || r.stats.calls || r.stats.revenue);
  const ranked = [...rows].sort((a, b) => b.stats.revenue - a.stats.revenue || b.stats.calls - a.stats.calls);
  return { ...p, rows: ranked.map((r, i) => ({ ...r, rank: i + 1 })), totals: sumStats(rows.map(r => r.stats)) };
}

/** Monthly performance report: every BDE (admin) or just me with my rank (BDE). */
stats.get('/monthly', async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const data = await monthlyRows(month);
  if (isAdmin(req)) return void res.json(data);
  const mine = data.rows.find(r => r.bde.id === me(req).id);
  res.json({ month: data.month, from: data.from, to: data.to, me: mine ?? null, teamSize: data.rows.length });
});

/** One BDE's month: totals, calls each day, and the team average for comparison. */
stats.get('/bde/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!isAdmin(req) && id !== me(req).id) throw forbidden();
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== 'BDE') throw notFound('BDE');
  const { month } = monthQuery.parse(req.query);
  const data = await monthlyRows(month);
  const row = data.rows.find(r => r.bde.id === id);
  const totals = await dailyTotals(id, data.from, data.to);
  const n = data.rows.length || 1;
  const average = Object.fromEntries(Object.entries(data.totals).map(([k, v]) => [k, v / n])) as unknown as BdeStats;
  res.json({
    month: data.month,
    bde: { ...userRef(user), phone: user.phone, active: user.active, dailyTarget: user.dailyTarget },
    rank: row?.rank ?? null,
    teamSize: data.rows.length,
    stats: row?.stats ?? null,
    teamAverage: average,
    days: workDays(data.from, data.to).map(d => ({ date: d, calls: totals.get(d) ?? 0 }))
  });
});

/** Admin dashboard: today's totals, the month table and a short to-do list. */
stats.get('/dashboard', requireAdmin, async (_req, res) => {
  const today = todayIST();
  const workDate = dateOnly(today);
  const t = istInstantRange(today, today);
  const [bdes, calls, interviewsToday, paidToday, toVerify, overdue, callersToday, month] = await Promise.all([
    db.user.findMany({ where: { role: 'BDE', active: true }, select: { id: true, dailyTarget: true } }),
    db.callLog.groupBy({ by: ['outcome'], where: { workDate }, _count: { _all: true } }),
    db.interview.groupBy({ by: ['status'], where: { scheduledAt: t }, _count: { _all: true } }),
    db.payment.aggregate({ where: { status: { in: ['PARTIALLY_PAID', 'PAID'] }, date: workDate, NOT: { check: 'REJECTED' } }, _count: { _all: true }, _sum: { amount: true } }),
    db.payment.count({ where: { check: 'TO_VERIFY' } }),
    db.lead.count({ where: { followUpOn: { lt: workDate }, stage: { notIn: ['PAID', 'NOT_INTERESTED'] } } }),
    db.callLog.groupBy({ by: ['bdeId'], where: { workDate } }),
    monthlyRows()
  ]);
  const count = (arr: { _count: { _all: number } }[]) => arr.reduce((s, x) => s + x._count._all, 0);
  const ivCount = (s: string) => interviewsToday.find(i => i.status === s)?._count._all ?? 0;
  res.json({
    date: today,
    today: {
      calls: count(calls),
      target: bdes.reduce((s, b) => s + b.dailyTarget, 0),
      interested: calls.find(c => c.outcome === 'INTERESTED')?._count._all ?? 0,
      interviews: { total: count(interviewsToday), attended: ivCount('ATTENDED') },
      collected: { amount: paidToday._sum.amount ?? 0, count: paidToday._count._all }
    },
    todo: {
      receiptsToVerify: toVerify,
      notStarted: bdes.length - callersToday.filter(c => bdes.some(b => b.id === c.bdeId)).length,
      overdueFollowUps: overdue,
      interviewsToMark: ivCount('SCHEDULED')
    },
    month
  });
});

/** BDEs whose candidates miss interviews most often this month. */
stats.get('/attendance', requireAdmin, async (req, res) => {
  const { month } = monthQuery.parse(req.query);
  const data = await monthlyRows(month);
  const rows = data.rows
    // Rate over interviews already marked, so upcoming ones don't count as missed
    .filter(r => r.stats.attended + r.stats.missed > 0)
    .map(r => ({ bde: r.bde, scheduled: r.stats.attended + r.stats.missed, attended: r.stats.attended, rate: r.stats.attended / (r.stats.attended + r.stats.missed) }))
    .sort((a, b) => a.rate - b.rate);
  res.json({ month: data.month, totals: data.totals, lowest: rows.slice(0, 6) });
});
