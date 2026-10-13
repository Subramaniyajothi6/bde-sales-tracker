import { Router, type Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';
import { monthRange, todayIST, ymd } from '../lib/time.js';
import { formatPhone } from '../lib/phone.js';
import { statsByBde } from '../lib/stats.js';
import { dailyReportRows } from './dailyReports.js';
import { STAGE_LABEL } from './leads.js';

/** Excel downloads (.xlsx). Admin only. */
export const exportsRouter = Router();
exportsRouter.use(requireAdmin);

type Col = { header: string; key: string; width?: number; money?: boolean };

async function sendSheet(res: Response, filename: string, title: string, cols: Col[], rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ADZ4NEEDZ BDE Tracker';
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach(r => ws.addRow(r));
  cols.forEach((c, i) => { if (c.money) ws.getColumn(i + 1).numFmt = '₹#,##0'; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const STATUS_LABEL: Record<string, string> = { SENT: 'Sent', NOT_SENT: 'Not sent', CALLING: 'Calling', NOT_STARTED: 'Not started' };

exportsRouter.get('/daily.xlsx', async (req, res) => {
  const today = todayIST();
  const { from = today, to = from } = z.object({ from: dateStr.optional(), to: dateStr.optional() }).parse(req.query);
  const rows = await dailyReportRows(from, to);
  await sendSheet(res, `daily-report-${from}${to !== from ? `-to-${to}` : ''}.xlsx`, 'Daily report', [
    { header: 'Employee ID', key: 'id' }, { header: 'BDE', key: 'name', width: 22 }, { header: 'Report', key: 'status' },
    { header: 'Interested', key: 'i' }, { header: 'Call back later', key: 'c' }, { header: 'Not interested', key: 'n' },
    { header: 'No answer', key: 'a' }, { header: 'Total calls', key: 't' }, { header: 'Target', key: 'target' }
  ], rows.map(r => ({
    id: r.bde.employeeId, name: r.bde.name, status: STATUS_LABEL[r.status],
    i: r.counts.INTERESTED, c: r.counts.CALL_BACK, n: r.counts.NOT_INTERESTED, a: r.counts.NO_ANSWER, t: r.total, target: r.target
  })));
});

exportsRouter.get('/monthly.xlsx', async (req, res) => {
  const { month = todayIST().slice(0, 7) } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query);
  const r = monthRange(month);
  const [bdes, byBde] = await Promise.all([db.user.findMany({ where: { role: 'BDE' }, orderBy: { employeeId: 'asc' } }), statsByBde(r.from, r.to)]);
  await sendSheet(res, `monthly-performance-${month}.xlsx`, `Performance ${month}`, [
    { header: 'Employee ID', key: 'id' }, { header: 'BDE', key: 'name', width: 22 },
    { header: 'Total calls', key: 'calls' }, { header: 'Interested leads', key: 'interested' },
    { header: 'Interviews attended', key: 'attended' }, { header: 'Payment commitments', key: 'committed' },
    { header: 'Successful payments', key: 'paid' }, { header: 'Revenue', key: 'revenue', money: true },
    { header: 'Days on target', key: 'days' }
  ], bdes.map(b => ({ b, s: byBde.get(b.id)! }))
    .filter(x => x.b.active || x.s.calls || x.s.revenue)
    .sort((a, b) => b.s.revenue - a.s.revenue)
    .map(({ b, s }) => ({ id: b.employeeId, name: b.name, ...s, days: `${s.daysOnTarget} of ${s.daysWorked}` })));
});

exportsRouter.get('/leads.xlsx', async (_req, res) => {
  const list = await db.lead.findMany({ include: { course: true, owner: true }, orderBy: { createdAt: 'desc' } });
  await sendSheet(res, `leads-${todayIST()}.xlsx`, 'Leads', [
    { header: 'Lead ID', key: 'id' }, { header: 'Candidate', key: 'name', width: 22 }, { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Course or internship', key: 'course', width: 28 }, { header: 'BDE', key: 'bde', width: 18 }, { header: 'Status', key: 'stage', width: 20 },
    { header: 'Follow-up', key: 'fu' }, { header: 'Next action', key: 'next', width: 40 }, { header: 'Added on', key: 'added' }
  ], list.map(l => ({
    id: l.id, name: l.name, phone: formatPhone(l.phone), course: l.course.name, bde: l.owner.name, stage: STAGE_LABEL[l.stage],
    fu: ymd(l.followUpOn) ?? '', next: l.nextAction ?? '', added: ymd(l.createdAt)
  })));
});

exportsRouter.get('/payments.xlsx', async (_req, res) => {
  const list = await db.payment.findMany({ include: { lead: { include: { course: true, owner: true } } }, orderBy: { date: 'desc' } });
  const STATUS: Record<string, string> = { PROMISED: 'Promised', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid' };
  const CHECK: Record<string, string> = { TO_VERIFY: 'To verify', VERIFIED: 'Verified', REJECTED: 'Rejected' };
  await sendSheet(res, `payments-${todayIST()}.xlsx`, 'Payments', [
    { header: 'Payment ID', key: 'id' }, { header: 'Candidate', key: 'name', width: 22 }, { header: 'Course', key: 'course', width: 28 },
    { header: 'BDE', key: 'bde', width: 18 }, { header: 'Amount', key: 'amount', money: true }, { header: 'Date', key: 'date' },
    { header: 'Status', key: 'status' }, { header: 'Receipt check', key: 'check' }, { header: 'Note', key: 'note', width: 40 }
  ], list.map(p => ({
    id: p.id, name: p.lead.name, course: p.lead.course.name, bde: p.lead.owner.name, amount: p.amount, date: ymd(p.date),
    status: STATUS[p.status], check: p.check ? CHECK[p.check] : '', note: p.rejectReason ? `Rejected: ${p.rejectReason}` : p.note ?? ''
  })));
});
