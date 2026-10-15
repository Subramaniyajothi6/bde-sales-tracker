import { db } from './db.js';

/** Everything the activity log records. Chat messages are private and never logged. */
export const ACTIONS = [
  'LOGIN', 'LOGOUT', 'PASSWORD_CHANGED',
  'PUNCH_IN', 'REPORT_SENT', 'REPORT_REOPENED',
  'LEAD_ADDED', 'LEAD_MOVED', 'LEADS_IMPORTED', 'LEADS_SHEET_UPDATED',
  'INTERVIEW_BOOKED', 'INTERVIEW_MARKED',
  'PAYMENT_RECORDED', 'RECEIPT_VERIFIED', 'RECEIPT_REJECTED',
  'LEAVE_REQUESTED', 'LEAVE_CANCELLED', 'LEAVE_APPROVED', 'LEAVE_REJECTED',
  'BDE_ADDED', 'BDE_UPDATED', 'BDE_DEACTIVATED', 'BDE_REACTIVATED', 'PASSWORD_RESET'
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Write one line to the activity log. It never fails the request it belongs to:
 * if the log can't be written, the error is printed and the user's action still goes through.
 */
export function logActivity(userId: number, action: Action, detail: string) {
  db.activity.create({ data: { userId, action, detail: detail.slice(0, 300) } })
    .catch(err => console.error('Activity log failed:', err));
}
