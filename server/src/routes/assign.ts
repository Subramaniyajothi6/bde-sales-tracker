import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { me, requireAdmin } from '../lib/auth.js';
import { userRef } from '../lib/present.js';
import { statsByBde } from '../lib/stats.js';
import { attendanceGrid } from '../lib/attendance.js';
import { dateOnly, monthRange, todayIST } from '../lib/time.js';
import { logActivity } from '../lib/activity.js';
import { notify } from '../lib/notify.js';

/**
 * Giving leads to BDEs by how they perform and how much they already have. Admin only.
 * GET /board lists every active BDE with today's attendance, their workload and this
 * month's results; POST / moves the chosen leads to the chosen BDEs, shared in turn.
 */
export const assign = Router();
assign.use(requireAdmin);

const OPEN = { notIn: ['PAID', 'NOT_INTERESTED'] as ('PAID' | 'NOT_INTERESTED')[] };

/** Workload and results of every active BDE, for choosing who gets more leads. */
export async function board() {
  const today = todayIST();
  const { from } = monthRange(today.slice(0, 7));
  const workDate = dateOnly(today);
  const bdes = await db.user.findMany({ where: { role: 'BDE', active: true }, orderBy: { employeeId: 'asc' } });
  const ids = bdes.map(b => b.id);
  const [open, due, overdue, fresh, callsToday, stats, att] = await Promise.all([
    db.lead.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, stage: OPEN }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, stage: OPEN, followUpOn: { lte: workDate } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, stage: OPEN, followUpOn: { lt: workDate } }, _count: { _all: true } }),
    db.lead.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids }, stage: 'NEW' }, _count: { _all: true } }),
    db.callLog.groupBy({ by: ['bdeId'], where: { bdeId: { in: ids }, workDate }, _count: { _all: true } }),
    statsByBde(from, today),
    attendanceGrid(ids, today, today)
  ]);
  // Count per BDE id, from a groupBy result
  const byOwner = (rows: { ownerId: number; _count: { _all: number } }[]) => new Map(rows.map(r => [r.ownerId, r._count._all]));
  const [openN, dueN, overdueN, freshN] = [open, due, overdue, fresh].map(byOwner);
  const callsN = new Map(callsToday.map(r => [r.bdeId, r._count._all]));
  return bdes.map(b => {
    const s = stats.get(b.id)!;
    const marked = s.attended + s.missed;
    return {
      bde: userRef(b),
      today: attendanceStatus(att.byUser.get(b.id)?.cells[0]?.status),
      load: { open: openN.get(b.id) ?? 0, due: dueN.get(b.id) ?? 0, overdue: overdueN.get(b.id) ?? 0, notCalled: freshN.get(b.id) ?? 0 },
      callsToday: callsN.get(b.id) ?? 0,
      month: {
        // Per day the BDE actually called, so leave and a late start don't pull it down
        callsPerDay: s.daysWorked ? Math.round(s.calls / s.daysWorked) : 0,
        interestedRate: s.calls ? s.interested / s.calls : 0,
        interviewsAttended: s.attended,
        showRate: marked ? s.attended / marked : null,
        paid: s.paid,
        revenue: s.revenue,
        daysOnTarget: s.daysOnTarget,
        daysWorked: s.daysWorked
      }
    };
  });
}
function attendanceStatus(s: string | undefined) {
  return s === 'PRESENT' || s === 'LATE' ? s : s === 'LEAVE' ? 'LEAVE' : s === 'OFF' ? 'OFF' : 'NOT_IN';
}

assign.get('/board', async (_req, res) => {
  res.json({ bdes: await board() });
});

/** Move leads to BDEs: the leads are dealt out in turn, in the order the BDEs were picked. */
assign.post('/', async (req, res) => {
  const b = z.object({
    leadIds: z.array(z.number().int()).min(1, 'Choose the leads to give out').max(2000),
    toBdeIds: z.array(z.number().int()).min(1, 'Choose at least one BDE').max(100)
  }).parse(req.body);
  const [targets, leads] = await Promise.all([
    db.user.findMany({ where: { id: { in: b.toBdeIds }, role: 'BDE', active: true } }),
    db.lead.findMany({ where: { id: { in: b.leadIds }, stage: OPEN }, include: { owner: true } })
  ]);
  if (targets.length !== new Set(b.toBdeIds).size) throw new HttpError(400, 'Choose active BDEs only');
  const order = b.toBdeIds.map(id => targets.find(t => t.id === id)!);
  const moved = new Map<number, number>();
  let turn = 0;
  for (const l of leads) {
    const to = order[turn++ % order.length];
    if (to.id === l.ownerId) continue;
    await db.lead.update({
      where: { id: l.id },
      data: { ownerId: to.id, notes: { create: { authorId: me(req).id, text: `Moved from ${l.owner.name} to ${to.name}` } } }
    });
    moved.set(to.id, (moved.get(to.id) ?? 0) + 1);
  }
  const total = [...moved.values()].reduce((a, c) => a + c, 0);
  for (const [id, count] of moved) notify([id], 'LEADS_GIVEN', `${count} lead${count === 1 ? '' : 's'} given to you by the admin`, '/bde/leads');
  if (total) logActivity(me(req).id, 'LEAD_MOVED', `${total} leads given to ${moved.size} BDE${moved.size === 1 ? '' : 's'}`);
  res.json({
    moved: total,
    skipped: b.leadIds.length - total,
    perBde: [...moved].map(([id, count]) => ({ bde: userRef(targets.find(t => t.id === id)!), count }))
  });
});
