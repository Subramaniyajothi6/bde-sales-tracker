/** Typed functions for every API endpoint. Matches docs/API.md. */
import { get, post, patch, del, postForm, fileUrl } from './client';

export { ApiError, setUnauthorizedHandler } from './client';

// ---------- Types ----------
export type Role = 'ADMIN' | 'BDE';
export type Stage = 'INTERESTED' | 'FOLLOW_UP' | 'INTERVIEW_SCHEDULED' | 'SELECTED' | 'PAYMENT_COMMITTED' | 'PAID' | 'NOT_INTERESTED';
export type Outcome = 'INTERESTED' | 'CALL_BACK' | 'NOT_INTERESTED' | 'NO_ANSWER';
export type InterviewStatus = 'SCHEDULED' | 'ATTENDED' | 'NO_SHOW';
export type InterviewResult = 'SELECTED' | 'NOT_SELECTED';
export type PaymentStatus = 'PROMISED' | 'PARTIALLY_PAID' | 'PAID';
export type ReceiptCheck = 'TO_VERIFY' | 'VERIFIED' | 'REJECTED';
export type ReportStatus = 'SENT' | 'NOT_SENT' | 'CALLING' | 'NOT_STARTED';

export interface User {
  id: number; employeeId: string; name: string; phone: string; email: string | null; role: Role;
  active: boolean; dailyTarget: number; joinedOn: string; lastLoginAt: string | null; mustChangePassword: boolean;
}
export interface UserRef { id: number; employeeId: string; name: string }
export interface Course { id: number; name: string; type: 'COURSE' | 'INTERNSHIP'; fee: number; active: boolean }
export type Counts = Record<Outcome, number>;

export interface Today {
  date: string; target: number; cutoff: string; counts: Counts; total: number;
  recent: { id: number; outcome: Outcome; calledAt: string }[];
  submittedAt: string | null;
  todo: { followUps: number; interviewsToMark: number; paymentsDue: number };
}

export interface Lead {
  id: number; name: string; phone: string; course: { id: number; name: string; type: string; fee: number };
  owner: UserRef; stage: Stage; followUpOn: string | null; nextAction: string | null; createdAt: string;
}
export interface LeadDetail {
  lead: Lead;
  money: { fee: number; paid: number; balance: number };
  notes: { id: number; text: string; author: string; createdAt: string }[];
  interviews: { id: number; scheduledAt: string; status: InterviewStatus; result: InterviewResult | null }[];
  payments: { id: number; amount: number; status: PaymentStatus; date: string; check: ReceiptCheck | null; closedAt: string | null }[];
}
export interface LeadList {
  leads: Lead[];
  counts: { byStage: Record<Stage, number>; overdue: number; due: number; active: number };
}

export interface Interview {
  id: number; scheduledAt: string; status: InterviewStatus; result: InterviewResult | null;
  lead: { id: number; name: string; phone: string; stage: Stage; course: string }; owner: UserRef;
}

export interface Payment {
  id: number; amount: number; status: PaymentStatus; date: string; note: string | null;
  hasReceipt: boolean; receiptName: string | null; receiptType: string | null;
  check: ReceiptCheck | null; rejectReason: string | null; verifiedAt: string | null; closedAt: string | null; createdAt: string;
  lead: { id: number; name: string; phone: string; course: string; fee: number }; owner: UserRef; recordedBy: UserRef;
}
export interface PaymentList {
  payments: Payment[];
  summary: { toVerify: number; promisedCount: number; promisedAmount: number; collectedThisMonth: number };
}

export interface Stats {
  calls: number; interested: number; scheduled: number; attended: number; missed: number; committed: number;
  paid: number; revenue: number; daysOnTarget: number; daysWorked: number;
}
export interface MonthlyRow { bde: UserRef & { active: boolean }; stats: Stats; rank: number }
export interface Monthly { month: string; from: string; to: string; rows: MonthlyRow[]; totals: Stats }

export interface DailyRow {
  bde: UserRef; counts: Counts; total: number; target: number; status: ReportStatus;
  sentDays: number; dueDays: number; submittedAt: string | null;
}

export interface Dashboard {
  date: string;
  today: { calls: number; target: number; interested: number; interviews: { total: number; attended: number }; collected: { amount: number; count: number } };
  todo: { receiptsToVerify: number; notStarted: number; overdueFollowUps: number; interviewsToMark: number };
  month: Monthly;
}

export interface BdeMonth {
  month: string; bde: UserRef & { phone: string; active: boolean; dailyTarget: number };
  rank: number | null; teamSize: number; stats: Stats | null; teamAverage: Stats;
  days: { date: string; calls: number }[];
}

// ---------- Endpoints ----------
export const api = {
  auth: {
    login: (employeeId: string, password: string) => post<{ user: User }>('/auth/login', { employeeId, password }),
    logout: () => post<{ ok: true }>('/auth/logout'),
    me: () => get<{ user: User | null }>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) => post<{ user: User }>('/auth/change-password', { currentPassword, newPassword })
  },
  users: {
    list: (q: { status?: 'active' | 'inactive' | 'all'; q?: string } = {}) => get<{ users: User[] }>('/users', q),
    nextId: () => get<{ employeeId: string }>('/users/next-id'),
    create: (b: { name: string; phone: string; email?: string; joinedOn?: string; dailyTarget?: number }) => post<{ user: User; temporaryPassword: string }>('/users', b),
    update: (id: number, b: Partial<{ name: string; phone: string; email: string; dailyTarget: number; active: boolean }>) => patch<{ user: User }>(`/users/${id}`, b),
    resetPassword: (id: number) => post<{ temporaryPassword: string }>(`/users/${id}/reset-password`)
  },
  courses: {
    list: () => get<{ courses: Course[] }>('/courses')
  },
  today: {
    get: () => get<Today>('/today'),
    logCall: (outcome: Outcome) => post<Today>('/today/calls', { outcome }),
    undoCall: (id: number) => del<Today>(`/today/calls/${id}`),
    submit: () => post<Today>('/today/submit'),
    reopen: () => post<Today>('/today/reopen')
  },
  dailyReports: {
    list: (from: string, to?: string) => get<{ from: string; to: string; rows: DailyRow[]; days: string[] }>('/daily-reports', { from, to })
  },
  leads: {
    list: (q: { view?: 'all' | 'active' | 'due' | 'overdue'; stage?: Stage; ownerId?: number; q?: string } = {}) => get<LeadList>('/leads', q),
    get: (id: number) => get<LeadDetail>(`/leads/${id}`),
    create: (b: { name: string; phone: string; courseId: number; stage?: Stage; followUpOn?: string; nextAction?: string; ownerId?: number }) => post<{ lead: Lead }>('/leads', b),
    update: (id: number, b: Partial<{ name: string; courseId: number; stage: Stage; followUpOn: string | null; nextAction: string | null; ownerId: number }>) => patch<{ lead: Lead }>(`/leads/${id}`, b),
    addNote: (id: number, text: string) => post<{ note: LeadDetail['notes'][number] }>(`/leads/${id}/notes`, { text })
  },
  interviews: {
    list: (when: 'today' | 'upcoming' | 'past' | 'all', ownerId?: number) => get<{ interviews: Interview[] }>('/interviews', { when, ownerId }),
    create: (leadId: number, date: string, time: string) => post<{ interview: Interview }>('/interviews', { leadId, date, time }),
    mark: (id: number, b: { status?: 'ATTENDED' | 'NO_SHOW'; result?: InterviewResult }) => patch<{ interview: Interview }>(`/interviews/${id}`, b)
  },
  payments: {
    list: (view: 'verify' | 'promised' | 'received' | 'all') => get<PaymentList>('/payments', { view }),
    create: (b: { leadId: number; status: PaymentStatus; amount: number; date: string; note?: string; receipt?: File | null }) => {
      const f = new FormData();
      f.append('leadId', String(b.leadId)); f.append('status', b.status); f.append('amount', String(b.amount)); f.append('date', b.date);
      if (b.note) f.append('note', b.note);
      if (b.receipt) f.append('receipt', b.receipt);
      return postForm<{ payment: Payment }>('/payments', f);
    },
    receiptUrl: (id: number) => fileUrl(`/payments/${id}/receipt`),
    verify: (id: number) => post<{ payment: Payment }>(`/payments/${id}/verify`),
    reject: (id: number, reason: string) => post<{ payment: Payment }>(`/payments/${id}/reject`, { reason })
  },
  stats: {
    dashboard: () => get<Dashboard>('/stats/dashboard'),
    monthly: (month?: string) => get<Monthly>('/stats/monthly', { month }),
    myMonth: (month?: string) => get<{ month: string; me: MonthlyRow | null; teamSize: number }>('/stats/monthly', { month }),
    bde: (id: number, month?: string) => get<BdeMonth>(`/stats/bde/${id}`, { month }),
    attendance: (month?: string) => get<{ month: string; totals: Stats; lowest: { bde: UserRef; scheduled: number; attended: number; rate: number }[] }>('/stats/attendance', { month })
  },
  exports: {
    daily: (from: string, to?: string) => fileUrl('/exports/daily.xlsx', { from, to }),
    monthly: (month?: string) => fileUrl('/exports/monthly.xlsx', { month }),
    leads: () => fileUrl('/exports/leads.xlsx'),
    payments: () => fileUrl('/exports/payments.xlsx')
  }
};
