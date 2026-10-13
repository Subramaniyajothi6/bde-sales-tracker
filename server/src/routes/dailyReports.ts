import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { dateOnly, todayIST, workDays, ymd } from '../lib/time.js';
import { callCounts } from '../lib/stats.js';
import { userRef } from '../lib/present.js';
import { leaveDays } from '../lib/attendance.js';

/** Every BDE's calling report for a day, a week or a month. Admin only. */
export const dailyReports = Router();
dailyReports.use(requireAdmin);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function dailyReportRows(from: string, to: string) {
  if (from > to) throw new HttpError(400, '"from" must be before "to"');
  const today = todayIST();
  const due = workDays(from, to < today ? to : today).filter(d => d !== today);
  const days = workDays(from, to);

  const [bdes, counts, reports, leave] = await Promise.all([
    db.user.findMany({ where: { role: 'BDE', active: true }, orderBy: { employeeId: 'asc' } }),
    callCounts(from, to),
    db.dailyReport.findMany({ where: { workDate: { gte: dateOnly(from), lte: dateOnly(to) }, submittedAt: { not: null } } }),
    leaveDays(from, to)
  ]);

  return bdes.map(b => {
    const c = counts.get(b.id) ?? { INTERESTED: 0, CALL_BACK: 0, NOT_INTERESTED: 0, NO_ANSWER: 0 };
    const total = c.INTERESTED + c.CALL_BACK + c.NOT_INTERESTED + c.NO_ANSWER;
    const sent = reports.filter(r => r.bdeId === b.id);
    // Days on approved leave don't need a report
    const dueHere = due.filter(d => !leave.has(`${b.id}|${d}`));
    let status: 'SENT' | 'NOT_SENT' | 'CALLING' | 'NOT_STARTED' | 'ON_LEAVE';
    if (from === to) {
      if (sent.length) status = 'SENT';
      else if (leave.has(`${b.id}|${from}`) && !total) status = 'ON_LEAVE';
      else if (from === today) status = total ? 'CALLING' : 'NOT_STARTED';
      else status = 'NOT_SENT';
    } else {
      status = sent.length >= dueHere.length ? 'SENT' : 'NOT_SENT';
    }
    return {
      bde: userRef(b),
      counts: c,
      total,
      target: b.dailyTarget * days.length,
      status,
      sentDays: sent.length,
      dueDays: from === to ? 1 : dueHere.length,
      submittedAt: from === to ? sent[0]?.submittedAt ?? null : null,
      /** The BDE's note with the report (one day only) */
      note: from === to ? sent[0]?.note ?? null : null
    };
  });
}

dailyReports.get('/', async (req, res) => {
  const today = todayIST();
  const { from = today, to = from } = z.object({ from: dateStr.optional(), to: dateStr.optional() }).parse(req.query);
  const rows = await dailyReportRows(from, to);
  res.json({ from, to, rows, days: workDays(from, to).map(d => ymd(dateOnly(d))) });
});
