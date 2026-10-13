import { db } from './db.js';
import { dateOnly, istInstantRange, ymd } from './time.js';

export interface BdeStats {
  calls: number;
  interested: number;
  scheduled: number;
  attended: number;
  missed: number;
  committed: number;
  paid: number;
  revenue: number;
  daysOnTarget: number;
  daysWorked: number;
}

const empty = (): BdeStats => ({ calls: 0, interested: 0, scheduled: 0, attended: 0, missed: 0, committed: 0, paid: 0, revenue: 0, daysOnTarget: 0, daysWorked: 0 });

/**
 * The monthly-report numbers for every BDE between two dates (inclusive, India time).
 * Rules are in docs/DECISIONS.md: payments only count once their receipt is verified.
 */
export async function statsByBde(from: string, to: string): Promise<Map<number, BdeStats>> {
  const days = { gte: dateOnly(from), lte: dateOnly(to) };
  const instants = istInstantRange(from, to);

  const [bdes, calls, perDay, scheduled, attended, missed, promises, paid] = await Promise.all([
    db.user.findMany({ where: { role: 'BDE' }, select: { id: true, dailyTarget: true } }),
    db.callLog.groupBy({ by: ['bdeId', 'outcome'], where: { workDate: days }, _count: { _all: true } }),
    db.callLog.groupBy({ by: ['bdeId', 'workDate'], where: { workDate: days }, _count: { _all: true } }),
    db.interview.groupBy({ by: ['createdById'], where: { scheduledAt: instants }, _count: { _all: true } }),
    db.interview.groupBy({ by: ['createdById'], where: { scheduledAt: instants, status: 'ATTENDED' }, _count: { _all: true } }),
    db.interview.groupBy({ by: ['createdById'], where: { scheduledAt: instants, status: 'NO_SHOW' }, _count: { _all: true } }),
    db.payment.groupBy({ by: ['recordedById', 'leadId'], where: { status: 'PROMISED', createdAt: instants } }),
    db.payment.groupBy({
      by: ['recordedById'],
      where: { status: { in: ['PARTIALLY_PAID', 'PAID'] }, check: 'VERIFIED', date: days },
      _count: { _all: true }, _sum: { amount: true }
    })
  ]);

  const out = new Map<number, BdeStats>(bdes.map(b => [b.id, empty()]));
  const get = (id: number) => { if (!out.has(id)) out.set(id, empty()); return out.get(id)!; };
  const target = new Map(bdes.map(b => [b.id, b.dailyTarget]));

  for (const c of calls) {
    const s = get(c.bdeId);
    s.calls += c._count._all;
    if (c.outcome === 'INTERESTED') s.interested += c._count._all;
  }
  for (const d of perDay) {
    const s = get(d.bdeId);
    s.daysWorked++;
    if (d._count._all >= (target.get(d.bdeId) ?? 80)) s.daysOnTarget++;
  }
  for (const i of scheduled) get(i.createdById).scheduled = i._count._all;
  for (const i of attended) get(i.createdById).attended = i._count._all;
  for (const i of missed) get(i.createdById).missed = i._count._all;
  for (const p of promises) get(p.recordedById).committed++;
  for (const p of paid) { const s = get(p.recordedById); s.paid = p._count._all; s.revenue = p._sum.amount ?? 0; }
  return out;
}

export function sumStats(all: Iterable<BdeStats>): BdeStats {
  const t = empty();
  for (const s of all) for (const k of Object.keys(t) as (keyof BdeStats)[]) t[k] += s[k];
  return t;
}

/** Calls per BDE per outcome for a date range, for the daily reports page. */
export async function callCounts(from: string, to: string, bdeId?: number) {
  const rows = await db.callLog.groupBy({
    by: ['bdeId', 'outcome'],
    where: { workDate: { gte: dateOnly(from), lte: dateOnly(to) }, ...(bdeId ? { bdeId } : {}) },
    _count: { _all: true }
  });
  const out = new Map<number, Record<'INTERESTED' | 'CALL_BACK' | 'NOT_INTERESTED' | 'NO_ANSWER', number>>();
  for (const r of rows) {
    if (!out.has(r.bdeId)) out.set(r.bdeId, { INTERESTED: 0, CALL_BACK: 0, NOT_INTERESTED: 0, NO_ANSWER: 0 });
    out.get(r.bdeId)![r.outcome] = r._count._all;
  }
  return out;
}

/** Total calls per day for one BDE. */
export async function dailyTotals(bdeId: number, from: string, to: string) {
  const rows = await db.callLog.groupBy({
    by: ['workDate'],
    where: { bdeId, workDate: { gte: dateOnly(from), lte: dateOnly(to) } },
    _count: { _all: true }
  });
  return new Map(rows.map(r => [ymd(r.workDate)!, r._count._all]));
}
