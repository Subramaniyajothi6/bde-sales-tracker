import type { DayStatus, InterviewResult, InterviewStatus, LeaveStatus, LeaveType, Outcome, PaymentStatus, ReceiptCheck, ReportStatus, Stage } from '../api';

/** Words shown on screen for the API's status values. Change wording here only. */
export const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New', INTERESTED: 'Interested', FOLLOW_UP: 'Follow-up', INTERVIEW_SCHEDULED: 'Interview scheduled', SELECTED: 'Selected',
  PAYMENT_COMMITTED: 'Payment committed', PAID: 'Paid', NOT_INTERESTED: 'Not interested'
};
export const STAGES = Object.keys(STAGE_LABEL) as Stage[];
export const OUTCOME_LABEL: Record<Outcome, string> = { INTERESTED: 'Interested', CALL_BACK: 'Call back later', NOT_INTERESTED: 'Not interested', NO_ANSWER: 'No answer' };
export const OUTCOMES = Object.keys(OUTCOME_LABEL) as Outcome[];
export const OUTCOME_COLOR: Record<Outcome, string> = { INTERESTED: '#1D4ED8', CALL_BACK: '#B45309', NOT_INTERESTED: '#7A8494', NO_ANSWER: '#5B3CC4' };
export const OUTCOME_CLASS: Record<Outcome, string> = { INTERESTED: 'b-int', CALL_BACK: 'b-fu', NOT_INTERESTED: 'b-no', NO_ANSWER: 'b-nr' };
export const INTERVIEW_LABEL: Record<InterviewStatus, string> = { SCHEDULED: 'Scheduled', ATTENDED: 'Attended', NO_SHOW: 'Missed' };
export const RESULT_LABEL: Record<InterviewResult, string> = { SELECTED: 'Selected', NOT_SELECTED: 'Not selected' };
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { PROMISED: 'Promised', PARTIALLY_PAID: 'Partially paid', PAID: 'Paid' };
export const CHECK_LABEL: Record<ReceiptCheck, string> = { TO_VERIFY: 'To verify', VERIFIED: 'Verified', REJECTED: 'Rejected' };
export const REPORT_LABEL: Record<ReportStatus, string> = { SENT: 'Sent', NOT_SENT: 'Not sent', CALLING: 'Calling', NOT_STARTED: 'Not started', ON_LEAVE: 'On leave' };
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { CASUAL: 'Casual', SICK: 'Sick', EMERGENCY: 'Emergency', OTHER: 'Other' };
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
/** Attendance: word, and the short letter used in the month grid */
export const DAY_LABEL: Record<DayStatus, [string, string]> = {
  PRESENT: ['Present', 'P'], LATE: ['Late', 'L'], LEAVE: ['Leave', 'LV'], ABSENT: ['Absent', 'A'],
  NOT_IN: ['Not in yet', '·'], OFF: ['Sunday', ''], UPCOMING: ['', '']
};

/** CSS class for a badge, e.g. "Payment committed" -> s-payment-committed (styles in base.css). */
export const badgeClass = (label: string) => 's-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const rupee = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const short = (n: number) =>
  n >= 100000 ? '₹' + (n / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L'
    : n >= 1000 ? '₹' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : rupee(n);
export const int = (n: number) => Math.round(n || 0).toLocaleString('en-IN');
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');

/** Today's date in India, YYYY-MM-DD. */
export const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);

/** "12 Oct" or "Mon, 12 Oct" */
export function fmtDate(d: string | null | undefined, withDay = false) {
  if (!d) return '';
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC', day: 'numeric', month: 'short', ...(withDay ? { weekday: 'short' } : {})
  });
}
/** Instant -> India date YYYY-MM-DD */
export const istDate = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
/** Instant -> "4:20 pm" India time */
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

/** Follow-up wording and colour: "2 days overdue", "Today", "Tomorrow", "14 Oct". */
export function dueInfo(date: string | null | undefined): { text: string; cls: string } | null {
  if (!date) return null;
  const d = dayDiff(date, todayIST());
  if (d < 0) return { text: `${-d} day${d < -1 ? 's' : ''} overdue`, cls: 'due late' };
  if (d === 0) return { text: 'Today', cls: 'due today' };
  if (d === 1) return { text: 'Tomorrow', cls: 'due soon' };
  return { text: fmtDate(date), cls: 'due' };
}

export const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** "10:00" (24-hour) -> "10:00 am" */
export function fmtClock(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
