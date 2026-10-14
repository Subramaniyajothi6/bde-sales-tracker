import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { HttpError, notFound } from '../lib/http.js';
import { isAdmin, me } from '../lib/auth.js';
import { userRef } from '../lib/present.js';
import { notify } from '../lib/notify.js';

/**
 * Team chat: channels everyone can read (#general, #team, announcements where only admins post)
 * and one-to-one chats between any two people. The app asks for new messages every few seconds
 * (no extra server needed). Chat text is never written to the activity log.
 */
export const chat = Router();

const msgOut = (m: { id: number; senderId: number; text: string; createdAt: Date; readAt: Date | null }) =>
  ({ id: m.id, from: m.senderId, text: m.text, at: m.createdAt, readAt: m.readAt });

async function otherPerson(meId: number, id: number) {
  const other = await db.user.findUnique({ where: { id } });
  if (!other || other.id === meId) throw notFound('Person');
  return other;
}

/** Unread messages per channel for one person (messages from others after their last read one). */
async function channelUnread(userId: number) {
  const [channels, reads] = await Promise.all([
    db.channel.findMany({ orderBy: { id: 'asc' } }),
    db.channelRead.findMany({ where: { userId } })
  ]);
  const counts = await Promise.all(channels.map(c => db.channelMessage.count({
    where: { channelId: c.id, senderId: { not: userId }, id: { gt: reads.find(r => r.channelId === c.id)?.lastReadId ?? 0 } }
  })));
  return channels.map((c, i) => ({ channel: c, unread: counts[i] }));
}

/** Unread count (private and channels), for the badge on Chat. */
chat.get('/unread', async (req, res) => {
  const [direct, channels] = await Promise.all([
    db.message.count({ where: { recipientId: me(req).id, readAt: null } }),
    channelUnread(me(req).id)
  ]);
  res.json({ count: direct + channels.reduce((t, c) => t + c.unread, 0) });
});

// ---------- Channels ----------

const canPost = (req: Parameters<typeof isAdmin>[0], c: { adminOnlyPost: boolean }) => !c.adminOnlyPost || isAdmin(req);
const senderOut = (u: { id: number; employeeId: string; name: string; role: string }) => ({ ...userRef(u), role: u.role });

async function channelByKey(key: string) {
  const c = await db.channel.findUnique({ where: { key } });
  if (!c) throw notFound('Channel');
  return c;
}

chat.get('/channels', async (req, res) => {
  const list = await channelUnread(me(req).id);
  const last = await Promise.all(list.map(({ channel }) => db.channelMessage.findFirst({ where: { channelId: channel.id }, orderBy: { id: 'desc' }, include: { sender: true } })));
  res.json({
    channels: list.map(({ channel: c, unread }, i) => ({
      key: c.key, name: c.name, description: c.description, adminOnlyPost: c.adminOnlyPost, canPost: canPost(req, c), unread,
      last: last[i] ? { text: last[i]!.text, at: last[i]!.createdAt, from: last[i]!.sender.name } : null
    }))
  });
});

/** A channel's messages (last 200, or only newer than ?after=). Opening it marks it as read. */
chat.get('/channels/:key', async (req, res) => {
  const c = await channelByKey(req.params.key);
  const { after } = z.object({ after: z.coerce.number().int().optional() }).parse(req.query);
  const list = await db.channelMessage.findMany({
    where: { channelId: c.id, ...(after ? { id: { gt: after } } : {}) },
    include: { sender: true },
    orderBy: { id: 'desc' },
    take: 200
  });
  const newest = list[0]?.id;
  if (newest) {
    const userId = me(req).id;
    await db.channelRead.upsert({
      where: { userId_channelId: { userId, channelId: c.id } },
      create: { userId, channelId: c.id, lastReadId: newest },
      update: { lastReadId: newest }
    });
  }
  res.json({
    channel: { key: c.key, name: c.name, description: c.description, adminOnlyPost: c.adminOnlyPost, canPost: canPost(req, c) },
    messages: list.reverse().map(m => ({ id: m.id, from: senderOut(m.sender), text: m.text, at: m.createdAt }))
  });
});

chat.post('/channels/:key', async (req, res) => {
  const c = await channelByKey(req.params.key);
  if (!canPost(req, c)) throw new HttpError(403, 'Only the admin can post in announcements');
  const { text } = z.object({ text: z.string().trim().min(1, 'Write a message first').max(1000, 'Keep a message under 1000 characters') }).parse(req.body);
  const m = await db.channelMessage.create({ data: { channelId: c.id, senderId: me(req).id, text }, include: { sender: true } });
  // Sending counts as reading everything up to it
  await db.channelRead.upsert({
    where: { userId_channelId: { userId: me(req).id, channelId: c.id } },
    create: { userId: me(req).id, channelId: c.id, lastReadId: m.id },
    update: { lastReadId: m.id }
  });
  if (c.adminOnlyPost) {
    const everyone = await db.user.findMany({ where: { active: true, NOT: { id: me(req).id } }, select: { id: true, role: true } });
    for (const role of ['BDE', 'ADMIN'] as const) {
      const ids = everyone.filter(u => u.role === role).map(u => u.id);
      notify(ids, 'ANNOUNCEMENT', `Announcement: ${text.length > 120 ? text.slice(0, 117) + '…' : text}`, `/${role.toLowerCase()}/chat/c/${c.key}`);
    }
  }
  res.status(201).json({ message: { id: m.id, from: senderOut(m.sender), text: m.text, at: m.createdAt } });
});

// ---------- One-to-one ----------

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
