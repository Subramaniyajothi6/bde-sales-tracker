import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';
import { ACTIONS } from '../lib/activity.js';
import { istInstantRange } from '../lib/time.js';
import { userRef } from '../lib/present.js';

/** The admin's activity log: who did what and when, newest first. */
export const activity = Router();
activity.use(requireAdmin);

const PAGE = 100;

activity.get('/', async (req, res) => {
  const q = z.object({
    userId: z.coerce.number().int().optional(),
    action: z.enum(ACTIONS).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Load older entries: the id of the last entry already shown */
    before: z.coerce.number().int().optional()
  }).parse(req.query);
  const items = await db.activity.findMany({
    where: {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.date ? { createdAt: istInstantRange(q.date, q.date) } : {}),
      ...(q.before ? { id: { lt: q.before } } : {})
    },
    include: { user: true },
    orderBy: { id: 'desc' },
    take: PAGE + 1
  });
  const more = items.length > PAGE;
  res.json({
    items: items.slice(0, PAGE).map(a => ({ id: a.id, at: a.createdAt, action: a.action, detail: a.detail, user: { ...userRef(a.user), role: a.user.role } })),
    nextBefore: more ? items[PAGE - 1].id : null
  });
});
