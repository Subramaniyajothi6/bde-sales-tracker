import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { me, requireAdmin } from '../lib/auth.js';
import { attendanceGrid } from '../lib/attendance.js';
import { monthRange, todayIST } from '../lib/time.js';
import { userRef } from '../lib/present.js';
import { env } from '../lib/env.js';

/** Month attendance: every BDE for the admin, or the BDE's own month. */
export const attendance = Router();

const monthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

export async function attendanceMonth(month: string, userIds?: number[]) {
  const { from, to } = monthRange(month);
  const bdes = await db.user.findMany({
    where: { role: 'BDE', ...(userIds ? { id: { in: userIds } } : { active: true }) },
    orderBy: { employeeId: 'asc' }
  });
  const grid = await attendanceGrid(bdes.map(b => b.id), from, to);
  return {
    month, from, to, lateAfter: env.LATE_AFTER,
    dates: grid.dates,
    rows: bdes.map(b => ({ bde: userRef(b), ...grid.byUser.get(b.id)! }))
  };
}

/** The logged-in BDE's month. */
attendance.get('/me', async (req, res) => {
  const { month = todayIST().slice(0, 7) } = monthQuery.parse(req.query);
  const data = await attendanceMonth(month, [me(req).id]);
  res.json({ month, lateAfter: data.lateAfter, ...data.rows[0] });
});

/** Every active BDE's month, plus today's headcount. */
attendance.get('/', requireAdmin, async (req, res) => {
  const today = todayIST();
  const { month = today.slice(0, 7) } = monthQuery.parse(req.query);
  const data = await attendanceMonth(month);
  const i = data.dates.indexOf(today);
  const todayCells = i >= 0 ? data.rows.map(r => r.cells[i].status) : [];
  res.json({
    ...data,
    today: i >= 0 ? {
      present: todayCells.filter(s => s === 'PRESENT' || s === 'LATE').length,
      late: todayCells.filter(s => s === 'LATE').length,
      onLeave: todayCells.filter(s => s === 'LEAVE').length,
      notIn: todayCells.filter(s => s === 'NOT_IN').length
    } : null
  });
});
