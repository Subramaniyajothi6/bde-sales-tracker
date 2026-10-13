import { env } from './env.js';

/*
 * The business runs on India time (UTC+5:30, no daylight saving).
 * Calendar dates ("2026-10-12") are stored in DATE columns as midnight UTC.
 */
const IST_OFFSET_MIN = 330;

/** Today's date in India, as YYYY-MM-DD. */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD -> Date for a DATE column. */
export const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** Date from a DATE column -> YYYY-MM-DD. */
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export function addDays(ymdStr: string, n: number): string {
  const d = dateOnly(ymdStr);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d)!;
}

/** First and last day of a month given as YYYY-MM. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Start and end instants (UTC) of an India-time date range, for DATETIME columns. */
export function istInstantRange(from: string, to: string) {
  const start = new Date(dateOnly(from).getTime() - IST_OFFSET_MIN * 60_000);
  const end = new Date(dateOnly(addDays(to, 1)).getTime() - IST_OFFSET_MIN * 60_000);
  return { gte: start, lt: end };
}

/** India date of an instant. */
export const istDateOf = (d: Date) => todayIST(d);

/** "YYYY-MM-DD" + "HH:MM" India time -> instant. */
export function istInstant(date: string, time: string): Date {
  return new Date(new Date(`${date}T${time}:00.000Z`).getTime() - IST_OFFSET_MIN * 60_000);
}

/** The report cutoff for a date, as an instant. */
export const cutoffOf = (date: string) => istInstant(date, env.REPORT_CUTOFF);

/** Working days (Mon to Sat) between two dates, inclusive. */
export function workDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (dateOnly(d).getUTCDay() !== 0) days.push(d);
  }
  return days;
}

/** "2026-10-14" -> "14 Oct", for notes people read. */
export const humanDate = (ymdStr: string) =>
  dateOnly(ymdStr).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** "15:30" -> "3:30 pm" */
export function humanTime(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
