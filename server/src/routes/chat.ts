import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError, notFound } from '../lib/http.js';
import { me } from '../lib/auth.js';
import { userRef } from '../lib/present.js';

/**
 * One-to-one chat between anyone in the team: BDE to BDE, BDE to admin.
 * The app asks for new messages every few seconds (no extra server needed).
 * Messages are private to the two people and are not in the activity log.
 */
export const chat = Router();

const msgOut = (m: { id: number; senderId: number; text: string; createdAt: Date; readAt: Date | null }) =>
  ({ id: m.id, from: m.senderId, text: m.text, at: m.createdAt, readAt: m.readAt });

async function otherPerson(meId: number, id: number) {
  const other = await db.user.findUnique({ where: { id } });
  if (!other || other.id === meId) throw notFound('Person');
  return other;
}

/** Unread count, for the badge on the Chat tab. */
chat.get('/unread', async (req, res) => {
  res.json({ count: await db.message.count({ where: { recipientId: me(req).id, readAt: null } }) });
});

/** Everyone you can chat with, most recent conversation first. */
chat.get('/contacts', async (req, res) => {
  const meId = me(req).id;
  const [people, recent, unread] = await Promise.all([
    db.user.findMany({ where: { active: true, NOT: { id: meId } }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    db.message.findMany({ where: { OR: [{ senderId: meId }, { recipientId: meId }] }, orderBy: { id: 'desc' }, take: 3000 }),
    db.message.groupBy({ by: ['senderId'], where: { recipientId: meId, readAt: null }, _count: { _all: true } })
  ]);
  const last = new Map<number, (typeof recent)[number]>();
  for (const m of recent) {
    const other = m.senderId === meId ? m.recipientId : m.senderId;
    if (!last.has(other)) last.set(other, m);
  }
  const contacts = people.map(p => {
    const m = last.get(p.id);
    return {
      user: { ...userRef(p), role: p.role },
      last: m ? { text: m.text, at: m.createdAt, mine: m.senderId === meId } : null,
      unread: unread.find(u => u.senderId === p.id)?._count._all ?? 0
    };
  });
  // Conversations with messages first (newest on top), then admins, then everyone else by name
  contacts.sort((a, b) => (b.last ? +b.last.at : 0) - (a.last ? +a.last.at : 0));
  res.json({ contacts });
});

/** Messages with one person. Pass ?after=<id> to get only newer ones. Opening the chat marks their messages as read. */
chat.get('/:userId', async (req, res) => {
  const meId = me(req).id;
  const other = await otherPerson(meId, Number(req.params.userId));
  const { after } = z.object({ after: z.coerce.number().int().optional() }).parse(req.query);
  const between = { OR: [{ senderId: meId, recipientId: other.id }, { senderId: other.id, recipientId: meId }] };
  const list = await db.message.findMany({
    where: { ...between, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: 'desc' },
    take: 200
  });
  await db.message.updateMany({ where: { senderId: other.id, recipientId: meId, readAt: null }, data: { readAt: new Date() } });
  // The newest message of mine the other person has read, so the screen can show "Seen"
  const seen = await db.message.findFirst({ where: { senderId: meId, recipientId: other.id, readAt: { not: null } }, orderBy: { id: 'desc' }, select: { id: true } });
  res.json({
    with: { ...userRef(other), role: other.role, active: other.active },
    messages: list.reverse().map(msgOut),
    seenUpTo: seen?.id ?? null
  });
});

chat.post('/:userId', async (req, res) => {
  const meId = me(req).id;
  const other = await otherPerson(meId, Number(req.params.userId));
  if (!other.active) throw new HttpError(409, `${other.name}'s account is deactivated`);
  const { text } = z.object({ text: z.string().trim().min(1, 'Write a message first').max(1000, 'Keep a message under 1000 characters') }).parse(req.body);
  const m = await db.message.create({ data: { senderId: meId, recipientId: other.id, text } });
  res.status(201).json({ message: msgOut(m) });
});
