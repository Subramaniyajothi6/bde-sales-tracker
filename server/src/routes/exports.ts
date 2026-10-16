import { Router, type Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';
import { dateOnly, humanDate, monthRange, todayIST, ymd } from '../lib/time.js';
import { formatPhone } from '../lib/phone.js';
import { statsByBde } from '../lib/stats.js';
import { dailyReportRows } from './dailyReports.js';
import { STAGE_LABEL } from './leads.js';
import { attendanceMonth } from './attendance.js';
import { reportRows } from './reports.js';
import type { DayStatus } from '../lib/attendance.js';

/** Excel downloads (.xlsx). Admin only. */
export const exportsRouter = Router();
exportsRouter.use(requireAdmin);

// ---------- Shared sheet layout ----------

/** Colours match the web app (Direction H). ARGB hex. */
const C = {
  primary: 'FF1D4ED8', ink: 'FF1C2533', soft: 'FF5D6878', line: 'FFE1E5EB', zebra: 'FFF7F9FC', totalFill: 'FFEAF0FD',
  green: 'FF15803D', greenTint: 'FFE8F5EC', amber: 'FFB45309', amberTint: 'FFFDF3E4',
  red: 'FFB42318', redTint: 'FFFDECEA', violet: 'FF5B3CC4', violetTint: 'FFF0ECFB', blueTint: 'FFEAF0FD', grey: 'FFF0F2F5'
};
type Tone = 'green' | 'amber' | 'red' | 'violet' | 'blue' | 'grey';
const TONE: Record<Tone, [string, string]> = {
  green: [C.green, C.greenTint], amber: [C.amber, C.amberTint], red: [C.red, C.redTint],
  violet: [C.violet, C.violetTint], blue: [C.primary, C.blueTint], grey: [C.soft, C.grey]
};

interface Col<R> {
  header: string;
  value: (r: R) => string | number | Date | null;
  width?: number;
  /** text = left, int / money = right with separators, date = "13 Oct 2026", center = centred text */
  type?: 'text' | 'int' | 'money' | 'date' | 'center' | 'percent';
  /** Add this column up in the Total row */
  total?: boolean;
  /** Colour a cell, e.g. a status, by returning a tone */
  tone?: (r: R) => Tone | null;
  /** People fill this column in (bulk update sheets): green heading */
  editable?: boolean;
  /** Choices offered as a dropdown in every row of this column */
  list?: string[];
}

export interface Sheet<R> {
  filename: string;
  title: string;
  subtitle: string;
  rows: R[];
  cols: Col<R>[];
  /** Columns kept visible when scrolling sideways (e.g. ID and name) */
  freezeCols?: number;
  totalLabel?: string;
}

const HEADER_ROW = 5;
/** Rupees with Indian grouping: ₹52,250 / ₹1,52,250 / ₹1,52,25,000 */
const INR = String.raw`[>=10000000]"₹"##\,##\,##\,##0;[>=100000]"₹"##\,##\,##0;"₹"##,##0`;
const thin = (argb: string) => ({ style: 'thin' as const, color: { argb } });
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });

function downloadedAt() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return `${humanDate(todayIST())} ${todayIST().slice(0, 4)}, ${time}`;
}

export async function sendSheet<R>(res: Response, s: Sheet<R>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ADZ4NEEDZ BDE Sales Tracker';
  wb.created = new Date();
  const ws = wb.addWorksheet(s.title.slice(0, 31), {
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
    },
    headerFooter: { oddFooter: `&L${s.title}&RPage &P of &N` }
  });
  const n = s.cols.length;

  ws.columns = s.cols.map(c => ({
    width: c.width ?? Math.max(c.type === 'money' ? 14 : c.type === 'date' ? 14 : 11, c.header.length + 3)
  }));

  // Title block
  ws.mergeCells(1, 1, 1, n);
  ws.mergeCells(2, 1, 2, n);
  ws.mergeCells(3, 1, 3, n);
  Object.assign(ws.getCell(1, 1), { value: s.title, font: { name: 'Calibri', size: 16, bold: true, color: { argb: C.ink } } });
  Object.assign(ws.getCell(2, 1), { value: s.subtitle, font: { name: 'Calibri', size: 11, color: { argb: C.ink } } });
  Object.assign(ws.getCell(3, 1), { value: `ADZ4NEEDZ Pvt Ltd, BDE Sales Tracker. Downloaded ${downloadedAt()}.`, font: { name: 'Calibri', size: 9, italic: true, color: { argb: C.soft } } });
  ws.getRow(1).height = 26;

  // Header
  const head = ws.getRow(HEADER_ROW);
  head.values = s.cols.map(c => c.header);
  head.height = 32;
  head.eachCell((cell, j) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(s.cols[j - 1]?.editable ? C.green : C.primary);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { left: thin(C.primary), right: thin('FF3B66E0'), top: thin(C.primary), bottom: thin(C.primary) };
  });

  // Data
  s.rows.forEach((r, i) => {
    const row = ws.getRow(HEADER_ROW + 1 + i);
    row.height = 20;
    s.cols.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      const v = c.value(r);
      cell.value = v === '' ? null : v;
      cell.font = { name: 'Calibri', size: 11, color: { argb: C.ink } };
      cell.border = { bottom: thin(C.line), left: thin(C.line), right: thin(C.line) };
      if (i % 2 === 1) cell.fill = fill(C.zebra);
      const t = c.type ?? 'text';
      cell.alignment = { vertical: 'middle', horizontal: t === 'int' || t === 'money' ? 'right' : t === 'date' || t === 'center' || t === 'percent' ? 'center' : 'left', indent: t === 'text' ? 1 : 0 };
      if (t === 'int') cell.numFmt = '#,##0';
      if (t === 'money') cell.numFmt = INR;
      if (t === 'date') cell.numFmt = 'dd mmm yyyy';
      if (t === 'percent') cell.numFmt = '0%';
      const tone = c.tone?.(r);
      if (tone) {
        cell.font = { ...cell.font, bold: true, color: { argb: TONE[tone][0] } };
        cell.fill = fill(TONE[tone][1]);
      }
    });
  });

  const first = HEADER_ROW + 1, last = HEADER_ROW + s.rows.length;

  // Total row (real formulas, so it stays right if someone edits the numbers)
  if (s.rows.length && s.cols.some(c => c.total)) {
    const row = ws.getRow(last + 1);
    row.height = 24;
    s.cols.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      const letter = ws.getColumn(j + 1).letter;
      if (c.total) cell.value = { formula: `SUM(${letter}${first}:${letter}${last})` };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.ink } };
      cell.fill = fill(C.totalFill);
      cell.border = { top: { style: 'medium', color: { argb: C.primary } }, bottom: thin(C.line) };
      cell.alignment = { vertical: 'middle', horizontal: c.total ? 'right' : 'left', indent: c.total ? 0 : 1 };
      if (c.type === 'money') cell.numFmt = INR;
      else if (c.total) cell.numFmt = '#,##0';
    });
    row.getCell(1).value = s.totalLabel ?? 'Total';
  }

  if (!s.rows.length) {
    ws.mergeCells(first, 1, first, n);
    Object.assign(ws.getCell(first, 1), { value: 'No records for this period.', font: { italic: true, color: { argb: C.soft } } });
  } else {
    ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: last, column: n } };
  }
  // Dropdown choices for list columns, on every row plus room for a few more
  s.cols.forEach((c, j) => {
    if (!c.list?.length) return;
    const letter = ws.getColumn(j + 1).letter;
    for (let r = first; r <= Math.max(last, first) + 20; r++) {
      ws.getCell(`${letter}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`"${c.list.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Pick from the list', error: `Choose one of: ${c.list.join(', ')}`
      };
    }
  });
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: s.freezeCols ?? 0, showGridLines: false }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${s.filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const toDate = (d: string | null) => (d ? dateOnly(d) : null);
const periodText = (from: string, to: string) =>
  from === to ? `${humanDate(from)} ${from.slice(0, 4)}` : `${humanDate(from)} to ${humanDate(to)} ${to.slice(0, 4)}`;

// ---------- Daily report ----------

const REPORT: Record<string, [string, Tone]> = { SENT: ['Sent', 'green'], NOT_SENT: ['Not sent', 'red'], CALLING: ['Calling', 'blue'], NOT_STARTED: ['Not started', 'red'], ON_LEAVE: ['On leave', 'violet'] };

exportsRouter.get('/daily.xlsx', async (req, res) => {
  const today = todayIST();
  const { from = today, to = from } = z.object({ from: dateStr.optional(), to: dateStr.optional() }).parse(req.query);
  const rows = await dailyReportRows(from, to);
  type R = (typeof rows)[number];
  await sendSheet<R>(res, {
    filename: `daily-report-${from}${to !== from ? `-to-${to}` : ''}.xlsx`,
    title: 'Daily calling report',
    subtitle: `${periodText(from, to)}. ${rows.length} BDEs.`,
    rows,
    freezeCols: 2,
    cols: [
      { header: 'Employee ID', value: r => r.bde.employeeId, width: 13 },
      { header: 'BDE', value: r => r.bde.name, width: 20 },
      { header: 'Report', value: r => REPORT[r.status][0], type: 'center', width: 13, tone: r => REPORT[r.status][1] },
      { header: 'Interested', value: r => r.counts.INTERESTED, type: 'int', total: true },
      { header: 'Call back later', value: r => r.counts.CALL_BACK, type: 'int', total: true },
      { header: 'Not interested', value: r => r.counts.NOT_INTERESTED, type: 'int', total: true },
      { header: 'No answer', value: r => r.counts.NO_ANSWER, type: 'int', total: true },
      { header: 'Total calls', value: r => r.total, type: 'int', total: true },
      { header: 'Target', value: r => r.target, type: 'int', total: true },
      { header: 'Against target', value: r => (r.target ? Math.round((r.total / r.target) * 100) / 100 : 0), type: 'percent', width: 15,
        tone: r => (r.total >= r.target ? 'green' : r.total < r.target * 0.6 ? 'amber' : null) },
      // The BDE's note only exists for a single day
      ...(from === to ? [{ header: 'Note from BDE', value: (r: R) => r.note ?? '', width: 45 }] : [])
    ]
  });
});

// ---------- Combined report (any period) ----------

exportsRouter.get('/report.xlsx', async (req, res) => {
  const today = todayIST();
  const { from = today, to = from } = z.object({ from: dateStr.optional(), to: dateStr.optional() }).parse(req.query);
  const data = await reportRows(from, to);
  type R = (typeof data.rows)[number];
  const oneDay = from === to;
  await sendSheet<R>(res, {
    filename: `report-${from}${oneDay ? '' : `-to-${to}`}.xlsx`,
    title: 'BDE report',
    subtitle: `${periodText(from, to)}. ${data.rows.length} BDEs. Revenue counts verified payments only.`,
    rows: [...data.rows].sort((a, b) => b.revenue - a.revenue || b.calls - a.calls),
    freezeCols: 2,
    cols: [
      { header: 'Employee ID', value: r => r.bde.employeeId, width: 13 },
      { header: 'BDE', value: r => r.bde.name, width: 20 },
      oneDay
        ? { header: 'Report', value: r => REPORT[r.report.status][0], type: 'center', width: 13, tone: r => REPORT[r.report.status][1] }
        : { header: 'Reports sent', value: r => `${r.report.sentDays} of ${r.report.dueDays}`, type: 'center', width: 13, tone: r => (r.report.sentDays < r.report.dueDays ? 'red' : 'green') },
      { header: 'Calls', value: r => r.calls, type: 'int', total: true },
      { header: 'Target', value: r => r.target, type: 'int', total: true },
      { header: 'Interested', value: r => r.counts.INTERESTED, type: 'int', total: true },
      { header: 'Call back later', value: r => r.counts.CALL_BACK, type: 'int', total: true },
      { header: 'Not interested', value: r => r.counts.NOT_INTERESTED, type: 'int', total: true },
      { header: 'No answer', value: r => r.counts.NO_ANSWER, type: 'int', total: true },
      { header: 'Interviews attended', value: r => r.interviewsAttended, type: 'int', total: true },
      { header: 'Payment commitments', value: r => r.committed, type: 'int', total: true },
      { header: 'Successful payments', value: r => r.paid, type: 'int', total: true },
      { header: 'Revenue', value: r => r.revenue, type: 'money', total: true, width: 15 },
      ...(oneDay ? [{ header: 'Note from BDE', value: (r: R) => r.report.note ?? '', width: 40 }] : [])
    ]
  });
});

// ---------- Attendance ----------

/** Letter shown in each day cell, and its colour */
const DAY: Record<DayStatus, [string, Tone | null]> = {
  PRESENT: ['P', 'green'], LATE: ['L', 'amber'], LEAVE: ['LV', 'violet'], ABSENT: ['A', 'red'],
  NOT_IN: ['–', null], OFF: ['–', 'grey'], UPCOMING: ['', null], NOT_JOINED: ['', null]
};

exportsRouter.get('/attendance.xlsx', async (req, res) => {
  const { month = todayIST().slice(0, 7) } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query);
  const data = await attendanceMonth(month);
  const monthName = dateOnly(data.from).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  type R = (typeof data.rows)[number];
  await sendSheet<R>(res, {
    filename: `attendance-${month}.xlsx`,
    title: `Attendance, ${monthName}`,
    subtitle: `P = present, L = late (started after ${data.lateAfter}), LV = leave, A = absent, – = Sunday or not in yet. ${data.rows.length} BDEs.`,
    rows: data.rows,
    freezeCols: 2,
    cols: [
      { header: 'Employee ID', value: r => r.bde.employeeId, width: 13 },
      { header: 'BDE', value: r => r.bde.name, width: 20 },
      ...data.dates.map((d, i) => ({
        header: String(Number(d.slice(8))), type: 'center' as const, width: 4.5,
        value: (r: R) => DAY[r.cells[i].status][0],
        tone: (r: R) => DAY[r.cells[i].status][1]
      })),
      { header: 'Present', value: r => r.totals.present, type: 'int', total: true, width: 9 },
      { header: 'Late', value: r => r.totals.late, type: 'int', total: true, width: 7 },
      { header: 'Leave', value: r => r.totals.leave, type: 'int', total: true, width: 7 },
      { header: 'Absent', value: r => r.totals.absent, type: 'int', total: true, width: 8 },
      { header: 'Hours', value: r => r.totals.hours, type: 'center', width: 8 }
    ]
  });
});

// ---------- Monthly performance ----------

exportsRouter.get('/monthly.xlsx', async (req, res) => {
  const { month = todayIST().slice(0, 7) } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query);
  const range = monthRange(month);
  const to = range.to > todayIST() ? todayIST() : range.to;
  const [bdes, byBde] = await Promise.all([db.user.findMany({ where: { role: 'BDE' }, orderBy: { employeeId: 'asc' } }), statsByBde(range.from, to)]);
  const rows = bdes.map(b => ({ b, s: byBde.get(b.id)! }))
    .filter(x => x.b.active || x.s.calls || x.s.revenue)
    .sort((a, b) => b.s.revenue - a.s.revenue || b.s.calls - a.s.calls);
  const monthName = dateOnly(range.from).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  type R = (typeof rows)[number];
  await sendSheet<R>(res, {
    filename: `monthly-performance-${month}.xlsx`,
    title: `Monthly performance report, ${monthName}`,
    subtitle: `${periodText(range.from, to)}. ${rows.length} BDEs, ranked by revenue. Revenue counts verified payments only.`,
    rows,
    freezeCols: 3,
    totalLabel: 'Team total',
    cols: [
      { header: 'Rank', value: r => rows.indexOf(r) + 1, type: 'center', width: 7, tone: r => (rows.indexOf(r) < 3 && r.s.revenue > 0 ? 'blue' : null) },
      { header: 'Employee ID', value: r => r.b.employeeId, width: 13 },
      { header: 'BDE', value: r => r.b.name, width: 20 },
      { header: 'Total calls', value: r => r.s.calls, type: 'int', total: true },
      { header: 'Interested leads', value: r => r.s.interested, type: 'int', total: true },
      { header: 'Interviews attended', value: r => r.s.attended, type: 'int', total: true },
      { header: 'Payment commitments', value: r => r.s.committed, type: 'int', total: true },
      { header: 'Successful payments', value: r => r.s.paid, type: 'int', total: true },
      { header: 'Revenue', value: r => r.s.revenue, type: 'money', total: true, width: 15 },
      { header: 'Days on target', value: r => `${r.s.daysOnTarget} of ${r.s.daysWorked}`, type: 'center', width: 13,
        tone: r => (r.s.daysWorked && r.s.daysOnTarget / r.s.daysWorked >= 0.8 ? 'green' : null) }
    ]
  });
});

// ---------- Leads ----------

const STAGE_TONE: Record<string, Tone> = {
  NEW: 'grey', INTERESTED: 'blue', FOLLOW_UP: 'amber', INTERVIEW_SCHEDULED: 'violet', SELECTED: 'green',
  PAYMENT_COMMITTED: 'amber', PAID: 'green', NOT_INTERESTED: 'grey'
};

exportsRouter.get('/leads.xlsx', async (_req, res) => {
  const list = await db.lead.findMany({ include: { course: true, owner: true }, orderBy: [{ followUpOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] });
  const today = todayIST();
  const open = (l: (typeof list)[number]) => !['PAID', 'NOT_INTERESTED'].includes(l.stage);
  type R = (typeof list)[number];
  await sendSheet<R>(res, {
    filename: `leads-${today}.xlsx`,
    title: 'All leads',
    subtitle: `${list.length} leads as of ${periodText(today, today)}. Overdue follow-ups are in red.`,
    rows: list,
    freezeCols: 2,
    cols: [
      { header: 'Lead ID', value: r => `L-${r.id}`, type: 'center', width: 9 },
      { header: 'Candidate', value: r => r.name, width: 22 },
      { header: 'Phone', value: r => formatPhone(r.phone), width: 17 },
      { header: 'Course or internship', value: r => r.course.name, width: 28 },
      { header: 'BDE', value: r => r.owner.name, width: 16 },
      { header: 'Status', value: r => STAGE_LABEL[r.stage], type: 'center', width: 20, tone: r => STAGE_TONE[r.stage] },
      { header: 'Follow-up', value: r => toDate(ymd(r.followUpOn)), type: 'date',
        tone: r => (r.followUpOn && open(r) && ymd(r.followUpOn)! < today ? 'red' : null) },
      { header: 'Next action', value: r => r.nextAction ?? '', width: 40 },
      { header: 'Added on', value: r => toDate(ymd(r.createdAt)), type: 'date' }
    ]
  });
});

// ---------- Payments ----------

const PAY: Record<string, [string, Tone]> = { PROMISED: ['Promised', 'amber'], PARTIALLY_PAID: ['Partially paid', 'blue'], PAID: ['Paid', 'green'] };
const CHECK: Record<string, [string, Tone]> = { TO_VERIFY: ['To verify', 'amber'], VERIFIED: ['Verified', 'green'], REJECTED: ['Rejected', 'red'] };

exportsRouter.get('/payments.xlsx', async (_req, res) => {
  const list = await db.payment.findMany({ include: { lead: { include: { course: true, owner: true } } }, orderBy: { date: 'desc' } });
  const today = todayIST();
  type R = (typeof list)[number];
  await sendSheet<R>(res, {
    filename: `payments-${today}.xlsx`,
    title: 'All payments',
    subtitle: `${list.length} records as of ${periodText(today, today)}. Promised = not paid yet. Only verified receipts count as revenue.`,
    rows: list,
    freezeCols: 2,
    cols: [
      { header: 'Payment ID', value: r => `P-${r.id}`, type: 'center', width: 11 },
      { header: 'Candidate', value: r => r.lead.name, width: 22 },
      { header: 'Course', value: r => r.lead.course.name, width: 28 },
      { header: 'BDE', value: r => r.lead.owner.name, width: 16 },
      { header: 'Amount', value: r => r.amount, type: 'money', width: 13 },
      { header: 'Date', value: r => toDate(ymd(r.date)), type: 'date' },
      { header: 'Status', value: r => PAY[r.status][0], type: 'center', width: 15, tone: r => PAY[r.status][1] },
      { header: 'Receipt check', value: r => (r.check ? CHECK[r.check][0] : ''), type: 'center', width: 14, tone: r => (r.check ? CHECK[r.check][1] : null) },
      { header: 'Note', value: r => (r.rejectReason ? `Rejected: ${r.rejectReason}` : r.note ?? ''), width: 40 }
    ]
  });
});
