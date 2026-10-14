import { db } from './db.js';

/** Kinds of bell notifications. */
export type NotifyKind =
  | 'LEAVE_REQUESTED' | 'LEAVE_ANSWERED'
  | 'RECEIPT_TO_VERIFY' | 'RECEIPT_CHECKED'
  | 'LEADS_GIVEN' | 'REPORT_NOTE' | 'ANNOUNCEMENT';

/**
 * Put a notification under the bell for some people ("admins" = every active admin).
 * Like the activity log, it never fails the request it belongs to.
 */
export function notify(to: number[] | 'admins', kind: NotifyKind, title: string, link?: string) {
  (async () => {
    const userIds = to === 'admins'
      ? (await db.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } })).map(u => u.id)
      : to;
    if (!userIds.length) return;
    await db.notification.createMany({ data: userIds.map(userId => ({ userId, kind, title: title.slice(0, 200), link: link ?? null })) });
  })().catch(err => console.error('Notification failed:', err));
}
