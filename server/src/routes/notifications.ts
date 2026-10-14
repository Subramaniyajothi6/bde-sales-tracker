import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { me } from '../lib/auth.js';

/** The bell: the logged-in person's notifications. */
export const notifications = Router();

notifications.get('/unread', async (req, res) => {
  res.json({ count: await db.notification.count({ where: { userId: me(req).id, readAt: null } }) });
});

/** Latest 30, newest first. */
notifications.get('/', async (req, res) => {
  const userId = me(req).id;
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 30 }),
    db.notification.count({ where: { userId, readAt: null } })
  ]);
  res.json({ items: items.map(n => ({ id: n.id, kind: n.kind, title: n.title, link: n.link, at: n.createdAt, read: !!n.readAt })), unread });
});

/** Mark some ({ ids }) or all ({}) as read. */
notifications.post('/read', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int()).max(100).optional() }).parse(req.body ?? {});
  await db.notification.updateMany({
    where: { userId: me(req).id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() }
  });
  res.json({ ok: true });
});
