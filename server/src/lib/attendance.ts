import { db } from './db.js';
import { env } from './env.js';
import { addDays, dateOnly, istInstant, todayIST, ymd } from './time.js';

/**
 * Attendance for each working day, worked out from:
 *  - punch in / punch out (Attendance rows; punch out happens when the day's report is sent),
 *  - approved leave,
 *  - logged calls (a day with calls but no punch-in still counts as present, e.g. data from before punching existed).
 * Sunday is the weekly off. Days before the BDE's joining date are not counted. Rules are in docs/DECISIONS.md.
 */
export type DayStatus = 'PRESENT' | 'LATE' | 'LEAVE' | 'ABSENT' | 'NOT_IN' | 'OFF' | 'UPCOMING' | 'NOT_JOINED';

export interface DayCell {
  date: string;
  status: DayStatus;
  punchIn: Date | null;
  punchOut: Date | null;
  /** Hours between punch in and punch out, one decimal */
  hours: number | null;
}

export interface AttendanceTotals { present: number; late: number; leave: number; absent: number; hours: number }

/** Punch in today if not already in. Returns the day's row. */
export async function punchIn(userId: number) {
  const workDate = dateOnly(todayIST());
  const existing = await db.attendance.findUnique({ where: { userId_workDate: { userId, workDate } } });
  if (existing) return { row: existing, created: false };
  // A second tap at the same moment hits the unique key; read the row the first tap made
  try {
    return { row: await db.attendance.create({ data: { userId, workDate, punchIn: new Date() } }), created: true };
  } catch {
    return { row: (await db.attendance.findUnique({ where: { userId_workDate: { userId, workDate } } }))!, created: false };
  }
}

/** Approved leave days per user between two dates, as a set of "userId|YYYY-MM-DD". */
export async function leaveDays(from: string, to: string, userIds?: number[]) {
  const leaves = await db.leave.findMany({
    where: { status: 'APPROVED', fromDate: { lte: dateOnly(to) }, toDate: { gte: dateOnly(from) }, ...(userIds ? { userId: { in: userIds } } : {}) }
  });
  const out = new Set<string>();
  for (const l of leaves) {
    for (let d = ymd(l.fromDate)!; d <= ymd(l.toDate)!; d = addDays(d, 1)) if (d >= from && d <= to) out.add(`${l.userId}|${d}`);
  }
  return out;
}

export async function attendanceGrid(userIds: number[], from: string, to: string) {
  const today = todayIST();
  const range = { gte: dateOnly(from), lte: dateOnly(to) };
  const [rows, leave, callDays, users] = await Promise.all([
    db.attendance.findMany({ where: { userId: { in: userIds }, workDate: range } }),
    leaveDays(from, to, userIds),
    db.callLog.groupBy({ by: ['bdeId', 'workDate'], where: { bdeId: { in: userIds }, workDate: range } }),
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, joinedOn: true } })
  ]);
  const punched = new Map(rows.map(r => [`${r.userId}|${ymd(r.workDate)}`, r]));
  const called = new Set(callDays.map(c => `${c.bdeId}|${ymd(c.workDate)}`));
  const joined = new Map(users.map(u => [u.id, ymd(u.joinedOn)]));

  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);

  const byUser = new Map<number, { cells: DayCell[]; totals: AttendanceTotals }>();
  for (const id of userIds) {
    const totals: AttendanceTotals = { present: 0, late: 0, leave: 0, absent: 0, hours: 0 };
    const cells = dates.map((date): DayCell => {
      const key = `${id}|${date}`;
      const p = punched.get(key);
      const hours = p?.punchOut ? Math.round(((p.punchOut.getTime() - p.punchIn.getTime()) / 36e5) * 10) / 10 : null;
      let status: DayStatus;
      if (p) status = p.punchIn > istInstant(date, env.LATE_AFTER) ? 'LATE' : 'PRESENT';
      else if (called.has(key)) status = 'PRESENT';
      else if (leave.has(key)) status = 'LEAVE';
      else if (date > today) status = 'UPCOMING';
      else if (date < (joined.get(id) ?? '')) status = 'NOT_JOINED';
      else if (dateOnly(date).getUTCDay() === 0) status = 'OFF';
      else if (date === today) status = 'NOT_IN';
      else status = 'ABSENT';

      if (status === 'PRESENT' || status === 'LATE') totals.present++;
      if (status === 'LATE') totals.late++;
      if (status === 'LEAVE') totals.leave++;
      if (status === 'ABSENT') totals.absent++;
      if (hours) totals.hours += hours;
      return { date, status, punchIn: p?.punchIn ?? null, punchOut: p?.punchOut ?? null, hours };
    });
    totals.hours = Math.round(totals.hours * 10) / 10;
    byUser.set(id, { cells, totals });
  }
  return { dates, byUser };
}
