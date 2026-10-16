/** Typed functions for every API endpoint. Matches docs/API.md. */
import { get, post, patch, del, postForm, fileUrl } from './client';

export { ApiError, setUnauthorizedHandler } from './client';

// ---------- Types ----------
export type Role = 'ADMIN' | 'BDE';
export type Stage = 'NEW' | 'INTERESTED' | 'FOLLOW_UP' | 'INTERVIEW_SCHEDULED' | 'SELECTED' | 'PAYMENT_COMMITTED' | 'PAID' | 'NOT_INTERESTED';
export type Outcome = 'INTERESTED' | 'CALL_BACK' | 'NOT_INTERESTED' | 'NO_ANSWER';
export type InterviewStatus = 'SCHEDULED' | 'ATTENDED' | 'NO_SHOW';
export type InterviewResult = 'SELECTED' | 'NOT_SELECTED';
export type PaymentStatus = 'PROMISED' | 'PARTIALLY_PAID' | 'PAID';
export type ReceiptCheck = 'TO_VERIFY' | 'VERIFIED' | 'REJECTED';
export type ReportStatus = 'SENT' | 'NOT_SENT' | 'CALLING' | 'NOT_STARTED' | 'ON_LEAVE';
export type DayStatus = 'PRESENT' | 'LATE' | 'LEAVE' | 'ABSENT' | 'NOT_IN' | 'OFF' | 'UPCOMING' | 'NOT_JOINED';
export type LeaveType = 'CASUAL' | 'SICK' | 'EMERGENCY' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface User {
  id: number; employeeId: string; name: string; phone: string; email: string | null; role: Role;
  active: boolean; dailyTarget: number; joinedOn: string; lastLoginAt: string | null; mustChangePassword: boolean;
}
export interface UserRef { id: number; employeeId: string; name: string }
export interface Course { id: number; name: string; type: 'COURSE' | 'INTERNSHIP'; fee: number; active: boolean }
export type Counts = Record<Outcome, number>;

export interface Today {
  date: string; target: number; cutoff: string; counts: Counts; total: number;
  recent: { id: number; outcome: Outcome; calledAt: string; lead: { id: number; name: string } | null }[];
  /** Today's calls and Excel changes, newest first. A call has an outcome; an Excel entry has the lines it changed. */
  history: { kind: 'CALL' | 'SHEET'; id: number; at: string; outcome: Outcome | null; lead: { id: number; name: string } | null; lines: string[] }[];
  submittedAt: string | null;
  /** The note sent with today's report */
  note: string | null;
  /** Start of the working day; the report sends punch out */
  punchIn: string | null; punchOut: string | null;
  onLeave: boolean;
  todo: { followUps: number; interviewsToMark: number; paymentsDue: number };
}

export interface Lead {
  id: number; name: string; phone: string; course: { id: number; name: string; type: string; fee: number };
  owner: UserRef; stage: Stage; followUpOn: string | null; nextAction: string | null; createdAt: string;
}
export interface LeadDetail {
  lead: Lead;
  money: { fee: number; paid: number; balance: number };
  notes: { id: number; text: string; author: string; source: NoteSource; createdAt: string }[];
  interviews: { id: number; scheduledAt: string; status: InterviewStatus; result: InterviewResult | null }[];
  payments: { id: number; amount: number; status: PaymentStatus; date: string; check: ReceiptCheck | null; closedAt: string | null }[];
}
export interface LeadList {
  leads: Lead[];
  counts: { byStage: Record<Stage, number>; overdue: number; due: number; active: number; all: number };
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
  sentDays: number; dueDays: number; submittedAt: string | null; note: string | null;
}

export interface Dashboard {
  date: string;
  today: { bdes: number; calls: number; target: number; interested: number; interviews: { total: number; attended: number }; collected: { amount: number; count: number } };
  todo: { receiptsToVerify: number; notStarted: number; overdueFollowUps: number; interviewsToMark: number; leavesToApprove: number };
  month: Monthly;
}

export interface BdeMonth {
  month: string; bde: UserRef & { phone: string; active: boolean; dailyTarget: number };
  rank: number | null; teamSize: number; stats: Stats | null; teamAverage: Stats;
  days: { date: string; calls: number }[];
}

export interface DayCell { date: string; status: DayStatus; punchIn: string | null; punchOut: string | null; hours: number | null }
export interface AttendanceTotals { present: number; late: number; leave: number; absent: number; hours: number }
export interface AttendanceRow { bde: UserRef; cells: DayCell[]; totals: AttendanceTotals }
export interface AttendanceMonth {
  month: string; from: string; to: string; lateAfter: string; dates: string[]; rows: AttendanceRow[];
  today: { present: number; late: number; onLeave: number; notIn: number } | null;
}

export interface Leave {
  id: number; type: LeaveType; from: string; to: string; days: number; reason: string; status: LeaveStatus;
  decisionNote: string | null; decidedBy: UserRef | null; decidedAt: string | null; createdAt: string; user: UserRef;
}

export interface ChatContact { user: UserRef & { role: Role }; last: { text: string; at: string; mine: boolean } | null; unread: number }
export interface ChatMessage { id: number; from: number; text: string; at: string; readAt: string | null }
export interface ChatThread { with: UserRef & { role: Role; active: boolean }; messages: ChatMessage[]; seenUpTo: number | null }

export interface Channel {
  key: string; name: string; description: string; adminOnlyPost: boolean; canPost: boolean; unread: number;
  last: { text: string; at: string; from: string } | null;
}
export interface ChannelMessage { id: number; from: UserRef & { role: Role }; text: string; at: string }
export interface ChannelThread { channel: Omit<Channel, 'unread' | 'last'>; messages: ChannelMessage[] }
export interface Notice { id: number; kind: string; title: string; link: string | null; at: string; read: boolean }

export interface ActivityItem { id: number; at: string; action: string; detail: string; user: UserRef & { role: Role } }

export interface ReportRow {
  bde: UserRef;
  report: { status: ReportStatus; sentDays: number; dueDays: number; submittedAt: string | null; note: string | null };
  counts: Counts; calls: number; target: number; interested: number;
  interviewsScheduled: number; interviewsAttended: number; interviewsMissed: number;
  committed: number; paid: number; revenue: number; daysOnTarget: number; daysWorked: number;
}
export interface Report {
  from: string; to: string; days: number; rows: ReportRow[];
  totals: { calls: number; target: number; interested: number; interviewsAttended: number; committed: number; paid: number; revenue: number; reportsSent: number };
}

export type ImportAssign = 'one' | 'share' | 'available';
export interface ImportResult {
  file: string; owner: { id: number; name: string }; columns: { name: boolean; course: boolean; bde: boolean };
  perOwner: { id: number; name: string; count: number }[];
  rows: number; ready: number; created: number; skippedCount: number; batchId: number | null;
  preview: { row: number; name: string; phone: string; course: string; bde: string }[];
  skipped: { row: number; name: string; phone: string; reason: string }[];
}
export type StageCounts = Record<Stage, number>;
export interface ImportBatch {
  id: number; fileName: string; createdAt: string; createdBy: string; count: number; called: number;
  stages: StageCounts; byBde: { bde: UserRef; stages: StageCounts }[];
}
/** Where a lead history line came from */
export type NoteSource = 'PAGE' | 'CALL' | 'SHEET' | 'IMPORT';

export interface SheetResult {
  file: string; rows: number; changed: number; unchanged: number; problems: number; applied: number;
  /** New students (rows with no Lead ID) among the changes */
  added: number;
  items: { row: number; leadId: number | null; name: string; changes: string[]; errors: string[] }[];
}
export type TodayAttendance = 'PRESENT' | 'LATE' | 'LEAVE' | 'OFF' | 'NOT_IN';
export interface BoardRow {
  bde: UserRef; today: TodayAttendance; callsToday: number;
  load: { open: number; due: number; overdue: number; notCalled: number };
  month: { callsPerDay: number; interestedRate: number; interviewsAttended: number; showRate: number | null; paid: number; revenue: number; daysOnTarget: number; daysWorked: number };
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
    /** Log one call; with leadId it is a call to that student and updates them too */
    logCall: (outcome: Outcome, lead?: { leadId: number; note?: string; followUpOn?: string }) => post<Today>('/today/calls', { outcome, ...lead }),
    undoCall: (id: number) => del<Today>(`/today/calls/${id}`),
    submit: (note?: string) => post<Today>('/today/submit', { note: note || undefined }),
    punchIn: () => post<Today>('/today/punch-in'),
    reopen: () => post<Today>('/today/reopen')
  },
  dailyReports: {
    list: (from: string, to?: string) => get<{ from: string; to: string; rows: DailyRow[]; days: string[] }>('/daily-reports', { from, to })
  },
  leads: {
    list: (q: { view?: 'all' | 'active' | 'due' | 'overdue'; stage?: Stage; ownerId?: number; q?: string; batchId?: number } = {}) => get<LeadList>('/leads', q),
    get: (id: number) => get<LeadDetail>(`/leads/${id}`),
    create: (b: { name: string; phone: string; courseId: number; stage?: Stage; followUpOn?: string; nextAction?: string; ownerId?: number }) => post<{ lead: Lead }>('/leads', b),
    update: (id: number, b: Partial<{ name: string; courseId: number; stage: Stage; followUpOn: string | null; nextAction: string | null; ownerId: number }>) => patch<{ lead: Lead }>(`/leads/${id}`, b),
    addNote: (id: number, text: string) => post<{ note: LeadDetail['notes'][number] }>(`/leads/${id}/notes`, { text }),
    /** Send with commit=false to preview, then commit=true to save */
    /** Admin: import students. assign = one BDE (ownerId), share equally, or share by availability */
    importFile: (file: File, assign: ImportAssign, ownerId: number | null, courseId: number, commit: boolean) => {
      const f = new FormData();
      f.append('assign', assign); if (ownerId) f.append('ownerId', String(ownerId));
      f.append('courseId', String(courseId)); f.append('commit', String(commit)); f.append('file', file);
      return postForm<ImportResult>('/leads/import', f);
    },
    /** Admin: each import with how far its students have got */
    batches: () => get<{ batches: ImportBatch[] }>('/leads/batches'),
    /** The sheet to fill in for a bulk update (own leads for a BDE; the admin can filter) */
    sheetUrl: (q: { view?: 'active' | 'all'; ownerId?: number; batchId?: number } = {}) => fileUrl('/leads/sheet/download.xlsx', q),
    /** Upload the filled-in sheet: commit=false to preview, true to apply */
    uploadSheet: (file: File, commit: boolean) => {
      const f = new FormData();
      f.append('commit', String(commit)); f.append('file', file);
      return postForm<SheetResult>('/leads/sheet/upload', f);
    }
  },
  assign: {
    board: () => get<{ bdes: BoardRow[] }>('/assign/board'),
    move: (leadIds: number[], toBdeIds: number[]) => post<{ moved: number; skipped: number; perBde: { bde: UserRef; count: number }[] }>('/assign', { leadIds, toBdeIds })
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
  reports: {
    get: (from: string, to: string) => get<Report>('/reports', { from, to })
  },
  attendance: {
    month: (month?: string) => get<AttendanceMonth>('/attendance', { month }),
    mine: (month?: string) => get<{ month: string; lateAfter: string } & AttendanceRow>('/attendance/me', { month })
  },
  leaves: {
    list: (status: 'pending' | 'all' = 'all') => get<{ leaves: Leave[]; pending: number }>('/leaves', { status }),
    request: (b: { type: LeaveType; from: string; to: string; reason: string }) => post<{ leave: Leave }>('/leaves', b),
    cancel: (id: number) => post<{ leave: Leave }>(`/leaves/${id}/cancel`),
    approve: (id: number, note?: string) => post<{ leave: Leave }>(`/leaves/${id}/approve`, { note: note || undefined }),
    reject: (id: number, note: string) => post<{ leave: Leave }>(`/leaves/${id}/reject`, { note })
  },
  chat: {
    unread: () => get<{ count: number }>('/chat/unread'),
    contacts: () => get<{ contacts: ChatContact[] }>('/chat/contacts'),
    thread: (userId: number, after?: number) => get<ChatThread>(`/chat/${userId}`, { after }),
    send: (userId: number, text: string) => post<{ message: ChatMessage }>(`/chat/${userId}`, { text }),
    channels: () => get<{ channels: Channel[] }>('/chat/channels'),
    channel: (key: string, after?: number) => get<ChannelThread>(`/chat/channels/${key}`, { after }),
    post: (key: string, text: string) => post<{ message: ChannelMessage }>(`/chat/channels/${key}`, { text })
  },
  notifications: {
    unread: () => get<{ count: number }>('/notifications/unread'),
    list: () => get<{ items: Notice[]; unread: number }>('/notifications'),
    read: (ids?: number[]) => post<{ ok: true }>('/notifications/read', ids ? { ids } : {})
  },
  activity: {
    list: (q: { userId?: number; action?: string; date?: string; before?: number } = {}) => get<{ items: ActivityItem[]; nextBefore: number | null }>('/activity', q)
  },
  exports: {
    attendance: (month?: string) => fileUrl('/exports/attendance.xlsx', { month }),
    report: (from: string, to: string) => fileUrl('/exports/report.xlsx', { from, to }),
    daily: (from: string, to?: string) => fileUrl('/exports/daily.xlsx', { from, to }),
    monthly: (month?: string) => fileUrl('/exports/monthly.xlsx', { month }),
    leads: () => fileUrl('/exports/leads.xlsx'),
    payments: () => fileUrl('/exports/payments.xlsx')
  }
};
