import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { addDays, todayIST, workDays } from '../lib/time.js';
import { statsByBde, sumStats } from '../lib/stats.js';
import { leaveDays } from '../lib/attendance.js';
import { dailyReportRows } from './dailyReports.js';

/**
 * One report for any period: the daily-report side (calls, report sent, notes)
 * and the monthly-report side (interviews, commitments, payments, revenue) per BDE.
 * Admin only.
 */
export const reports = Router();
reports.use(requireAdmin);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14');
const MAX_DAYS = 366;

export async function reportRows(from: string, to: string) {
  if (from > to) throw new HttpError(400, 'The start date must be on or before the end date');
  if (addDays(from, MAX_DAYS) < to) throw new HttpError(400, 'Choose a period of one year or less');
  const today = todayIST();
  // Numbers can only exist up to today, so the target counts working days up to today too
  const upTo = to < today ? to : today;
  const [daily, byBde, bdes, leave] = await Promise.all([
    dailyReportRows(from, to),
    statsByBde(from, upTo),
    db.user.findMany({ where: { role: 'BDE', active: true }, select: { id: true, dailyTarget: true } }),
    leaveDays(from, upTo)
  ]);
  const days = from <= upTo ? workDays(from, upTo) : [];
  const target = new Map(bdes.map(b => [b.id, b.dailyTarget]));
  const rows = daily.map(d => {
    const s = byBde.get(d.bde.id)!;
    const workingDays = days.filter(day => !leave.has(`${d.bde.id}|${day}`)).length;
    return {
      bde: d.bde,
      report: { status: d.status, sentDays: d.sentDays, dueDays: d.dueDays, submittedAt: d.submittedAt, note: d.note },
      counts: d.counts,
      calls: d.total,
      target: (target.get(d.bde.id) ?? 80) * workingDays,
      interested: s.interested,
      interviewsScheduled: s.scheduled,
      interviewsAttended: s.attended,
      interviewsMissed: s.missed,
      committed: s.committed,
      paid: s.paid,
      revenue: s.revenue,
      daysOnTarget: s.daysOnTarget,
      daysWorked: s.daysWorked
    };
  });
  const totals = sumStats(rows.map(r => byBde.get(r.bde.id)!));
  return {
    from, to,
    days: days.length,
    rows,
    totals: {
      calls: rows.reduce((t, r) => t + r.calls, 0),
      target: rows.reduce((t, r) => t + r.target, 0),
      interested: totals.interested,
      interviewsAttended: totals.attended,
      committed: totals.committed,
      paid: totals.paid,
      revenue: totals.revenue,
      reportsSent: rows.filter(r => r.report.status === 'SENT').length
    }
  };
}

reports.get('/', async (req, res) => {
  const today = todayIST();
  const { from = today, to = from } = z.object({ from: dateStr.optional(), to: dateStr.optional() }).parse(req.query);
  res.json(await reportRows(from, to));
});
