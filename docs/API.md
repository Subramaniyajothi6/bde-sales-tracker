# API

Everything the web app can ask the server for. Any frontend design (Direction H today, something else later) uses only these endpoints, so a redesign never needs backend changes.

- Base address: `/api` (same address as the web app in production).
- Data is JSON. Dates are `YYYY-MM-DD` (India time). Times are ISO instants (`2026-10-12T10:50:00.000Z`). Money is whole rupees.
- Login sets an httpOnly cookie. The browser sends it automatically; send requests with `credentials: 'include'`.
- Errors: `{ "error": "Plain message to show the user" }`. Bad form fields also return `"fields": { "phone": "Enter a valid 10-digit mobile number" }`.
- Who can call it: **Any** = any logged-in user, **Admin**, **BDE**. BDEs only ever see their own leads, interviews and payments.

## Status values

| Field | Values |
|---|---|
| Lead `stage` | `NEW` (imported, not called yet), `INTERESTED`, `FOLLOW_UP`, `INTERVIEW_SCHEDULED`, `SELECTED`, `PAYMENT_COMMITTED`, `PAID`, `NOT_INTERESTED` |
| Call `outcome` | `INTERESTED`, `CALL_BACK`, `NOT_INTERESTED`, `NO_ANSWER` |
| Interview `status` / `result` | `SCHEDULED`, `ATTENDED`, `NO_SHOW` / `SELECTED`, `NOT_SELECTED` |
| Payment `status` | `PROMISED`, `PARTIALLY_PAID`, `PAID` |
| Receipt `check` | `TO_VERIFY`, `VERIFIED`, `REJECTED` (null for promises) |
| Daily report `status` | `SENT`, `NOT_SENT`, `CALLING`, `NOT_STARTED`, `ON_LEAVE` |
| Attendance day `status` | `PRESENT`, `LATE`, `LEAVE`, `ABSENT`, `NOT_IN` (today, not started yet), `OFF` (Sunday), `UPCOMING` |
| Leave `type` / `status` | `CASUAL`, `SICK`, `EMERGENCY`, `OTHER` / `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` |

The frontend turns these into words on screen (e.g. `NO_SHOW` → "Missed").

## Login and account

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `POST /auth/login` | anyone | `{ employeeId, password }` | `{ user }`. If `user.mustChangePassword`, show the change-password screen first. |
| `POST /auth/logout` | anyone | | `{ ok }` |
| `GET /auth/me` | anyone | | `{ user }`, or `{ user: null }` if not logged in |
| `POST /auth/change-password` | Any | `{ currentPassword, newPassword }` | `{ user }`. Logs out other devices. |

`user` = `{ id, employeeId, name, phone, email, role: "ADMIN"|"BDE", active, dailyTarget, joinedOn, lastLoginAt, mustChangePassword }`

## Team (BDE accounts)

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /users?status=active\|inactive\|all&q=` | Admin | | `{ users: user[] }` |
| `GET /users/next-id` | Admin | | `{ employeeId: "BDE-031" }` |
| `POST /users` | Admin | `{ name, phone, email?, joinedOn?, dailyTarget? }` | `{ user, temporaryPassword }`. Show the password once. **409** if another account already has this phone number (also on `PATCH`). |
| `PATCH /users/:id` | Admin | any of the above, or `{ active: false }` to deactivate | `{ user }` |
| `POST /users/:id/reset-password` | Admin | | `{ temporaryPassword }` |

## Courses

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /courses` | Any | | `{ courses: [{ id, name, type: "COURSE"\|"INTERNSHIP", fee, active }] }` |
| `POST /courses`, `PATCH /courses/:id` | Admin | `{ name, type, fee, active? }` | `{ course }` |

## Today (BDE's working day)

All return the **today** object:
`{ date, target, cutoff: "19:30", counts: { INTERESTED, CALL_BACK, NOT_INTERESTED, NO_ANSWER }, total, recent: [{ id, outcome, calledAt, lead: { id, name } | null }], history: [{ kind: "CALL" | "SHEET", id, at, outcome, lead, lines }], submittedAt, note, punchIn, punchOut, onLeave, todo: { followUps, interviewsToMark, paymentsDue } }`

| Method and path | Who | Send |
|---|---|---|
| `GET /today` | BDE | |
| `POST /today/punch-in` | BDE | Start the working day (attendance). Doing it again keeps the first time. |
| `POST /today/calls` | BDE | `{ outcome, leadId?, note?, followUpOn? }`. Logs one call, and punches in if not done yet. With `leadId` (a student picked from the call list) it also updates the student: Interested → Interested, Call back later → Follow-up, Not interested → Not interested (follow-up cleared), No answer → status kept; the follow-up moves to tomorrow (or `followUpOn`) and a history line is written. Refused for a lead that has paid in full. 409 if today's report is already sent. |
| `DELETE /today/calls/:id` | BDE | Undo a call from today. For a call to a student, their status, follow-up and next action go back to what they were, unless they were changed after the call. |
| `POST /today/submit` | BDE | `{ note? }` (up to 500 characters, for the admin). Sends today's report and punches out. |
| `POST /today/reopen` | BDE | Reopen today's report to fix it. Clears the punch out until it is sent again. |

## Daily reports

| Method and path | Who | Get back |
|---|---|---|
| `GET /daily-reports?from=&to=` | Admin | `{ from, to, days, rows: [{ bde, counts, total, target, status, sentDays, dueDays, submittedAt, note }] }`. One day if `to` is left out. `note` is only filled for one day. Days on approved leave don't count as due. |

## Leads

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /leads?view=all\|active\|due\|overdue&stage=&ownerId=&q=` | Any | | `{ leads: lead[], counts: { byStage, overdue, due, active } }` |
| `POST /leads` | Any | `{ name, phone, courseId, stage?, followUpOn?, nextAction?, ownerId? (admin only, required) }` | `{ lead }`. **409** if the phone number is already a lead, with a message naming the BDE. **400** if `stage` is `INTERVIEW_SCHEDULED` or `PAID`, or `followUpOn` is before today. |
| `GET /leads/:id` | Any | | `{ lead, money: { fee, paid, balance }, notes, interviews, payments }` |
| `PATCH /leads/:id` | Any | any of `{ name, courseId, stage, followUpOn, nextAction }`; admins can also send `ownerId` to move it | `{ lead }`. Changes are written to the lead's history. **400** if `stage` becomes `INTERVIEW_SCHEDULED` with no booked interview, or `PAID` before the full fee is verified, or `followUpOn` changes to a date before today. |
| `POST /leads/:id/notes` | Any | `{ text }` | `{ note }` |
| `GET /leads/batches` | Admin | | `{ batches: [{ id, fileName, createdAt, createdBy, count, called, stages, byBde: [{ bde, stages }] }] }`: each import and how far its students have got. `GET /leads?batchId=` lists one import's leads. |
| `GET /leads/sheet/download.xlsx?view=active|all&ownerId=&batchId=` | Any | | The bulk-update sheet: own leads for a BDE, any for the admin. Green columns are editable; Status, Attended? and Result have dropdowns. |
| `POST /leads/sheet/upload` | Any | **multipart form**: file `file`, `commit` (`false` = preview) | `{ rows, changed, added, unchanged, problems, applied, items: [{ row, leadId, name, changes, errors }] }`. Same rules as the lead and interview screens; rows with problems are not applied. A row with no Lead ID but a Candidate and Phone adds a new student (Course and Status from the row; the admin also gives a BDE ID); `row` is the Excel row number. |
| `POST /leads/import` | Admin | **multipart form**: file `file` (.xlsx or .csv, max 5 MB, up to 2000 rows), `assign` (`one` with `ownerId`, `share` equally, or `available`: skip BDEs on leave, fewest open leads first), `courseId` (used when a row names no course), `commit` (`false` = preview only). A "BDE ID" column in the file decides for its rows. | `{ file, owner, columns, rows, ready, created, preview: [first 8], skipped: [{ row, name, phone, reason }], skippedCount }`. Each imported row becomes a `NEW` lead with a follow-up today. Bad numbers, numbers that are already leads and repeats in the file are skipped. |

`lead` = `{ id, name, phone, course: { id, name, type, fee }, owner: { id, employeeId, name }, stage, followUpOn, nextAction, createdAt }`

## Interviews

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /interviews?when=today\|upcoming\|past\|all&ownerId=` | Any | | `{ interviews: [{ id, scheduledAt, status, result, lead, owner }] }`. "today" also includes older unmarked ones. |
| `POST /interviews` | Any | `{ leadId, date, time: "15:30" }` | `{ interview }`. Lead moves to Interview scheduled. |
| `PATCH /interviews/:id` | Any | `{ status: "ATTENDED"\|"NO_SHOW" }` then `{ result: "SELECTED"\|"NOT_SELECTED" }` | `{ interview }`. Missed → lead gets a follow-up tomorrow. Selected → lead moves to Selected. |

## Payments

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /payments?view=verify\|promised\|received\|all` | Any | | `{ payments, summary: { toVerify, promisedCount, promisedAmount, collectedThisMonth } }` |
| `POST /payments` | Any | **multipart form**: `leadId, status, amount, date, note?` and file `receipt` (JPG/PNG/WEBP/HEIC/PDF, max 5 MB; required unless `PROMISED`) | `{ payment }`. Amount is checked against the balance. |
| `GET /payments/:id/receipt` | Any | | The receipt file |
| `POST /payments/:id/verify` | Admin | | `{ payment }`. Lead becomes Paid when the full fee is verified. |
| `POST /payments/:id/reject` | Admin | `{ reason }` | `{ payment }`. The BDE sees the reason on the lead. |

`payment` = `{ id, amount, status, date, note, hasReceipt, receiptName, receiptType, check, rejectReason, verifiedAt, closedAt, createdAt, lead: { id, name, phone, course, fee }, owner, recordedBy }`

## Numbers and reports

`stats` = `{ calls, interested, scheduled, attended, missed, committed, paid, revenue, daysOnTarget, daysWorked }`

| Method and path | Who | Get back |
|---|---|---|
| `GET /stats/dashboard` | Admin | `{ date, today: { bdes, calls, target, interested, interviews: { total, attended }, collected: { amount, count } }, todo: { receiptsToVerify, leavesToApprove, notStarted, overdueFollowUps, interviewsToMark }, month }`. `notStarted` leaves out BDEs on approved leave. |
| `GET /stats/monthly?month=2026-10` | Any | Admin: `{ month, from, to, rows: [{ bde, stats, rank }], totals }`. BDE: `{ month, me: { stats, rank }, teamSize }` |
| `GET /stats/bde/:id?month=` | Admin, or the BDE for themselves | `{ month, bde, rank, teamSize, stats, teamAverage, days: [{ date, calls }] }` |
| `GET /stats/attendance?month=` | Admin | `{ month, totals, lowest: [{ bde, scheduled, attended, rate }] }` |

## Reports (any period)

| Method and path | Who | Get back |
|---|---|---|
| `GET /reports?from=&to=` | Admin | `{ from, to, days, rows: [{ bde, report: { status, sentDays, dueDays, submittedAt, note }, counts, calls, target, interested, interviewsScheduled, interviewsAttended, interviewsMissed, committed, paid, revenue, daysOnTarget, daysWorked }], totals }`. Both the daily-report numbers and the monthly-report numbers for any period up to a year. `target` counts working days up to today, not counting approved leave. |

## Assigning leads (Admin)

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /assign/board` | Admin | | `{ bdes: [{ bde, today, callsToday, load: { open, due, overdue, notCalled }, month: { callsPerDay, interestedRate, interviewsAttended, showRate, paid, revenue, daysOnTarget, daysWorked } }] }` |
| `POST /assign` | Admin | `{ leadIds, toBdeIds }` | `{ moved, skipped, perBde }`. Leads are dealt out in turn, in the order the BDEs are given; each BDE is notified. |

## Attendance

`cell` = `{ date, status, punchIn, punchOut, hours }`. Late means punching in after `LATE_AFTER` (`.env`, default 10:00). A day with calls but no punch-in counts as present.

| Method and path | Who | Get back |
|---|---|---|
| `GET /attendance?month=2026-10` | Admin | `{ month, from, to, lateAfter, dates, rows: [{ bde, cells, totals: { present, late, leave, absent, hours } }], today: { present, late, onLeave, notIn } }` (every active BDE) |
| `GET /attendance/me?month=` | Any | The logged-in user's own `{ month, lateAfter, bde, cells, totals }` |

## Leave

`leave` = `{ id, type, from, to, days, reason, status, decisionNote, decidedBy, decidedAt, createdAt, user }`. `days` doesn't count Sundays.

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /leaves?status=pending|all` | Any | | `{ leaves, pending }`. BDEs get their own, newest request first. The admin gets everyone's, waiting ones first. |
| `POST /leaves` | BDE | `{ type, from, to, reason }` | `{ leave }`. Dates up to 7 days back and 4 months ahead. **409** if it overlaps a waiting or approved request. |
| `POST /leaves/:id/cancel` | BDE (own) | | `{ leave }`. Waiting, or approved but not started yet. |
| `POST /leaves/:id/approve` | Admin | `{ note? }` | `{ leave }` |
| `POST /leaves/:id/reject` | Admin | `{ note }` (required, the BDE sees it) | `{ leave }`. **409** if already answered. |

## Chat

Channels for the whole team (below), and one-to-one messages between any two active people (BDE to BDE, BDE to admin). The app asks for new messages every few seconds; no extra server is needed. Messages are private and never appear in the activity log.

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /chat/unread` | Any | | `{ count }` |
| `GET /chat/contacts` | Any | | `{ contacts: [{ user: { id, employeeId, name, role }, last: { text, at, mine } | null, unread }] }`, latest conversation first |
| `GET /chat/:userId?after=<messageId>` | Any | | `{ with, messages: [{ id, from, text, at, readAt }], seenUpTo }`. Last 200, or only newer than `after`. Marks their messages to you as read. `seenUpTo` = your newest message they have read. |
| `POST /chat/:userId` | Any | `{ text }` (1 to 1000 characters) | `{ message }`. **409** if their account is deactivated. |

### Channels

Three channels made by migration 0003: `general` and `team` (everyone posts), `announcements` (only admins post; each post also notifies everyone).

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /chat/channels` | Any | | `{ channels: [{ key, name, description, adminOnlyPost, canPost, unread, last }] }` |
| `GET /chat/channels/:key?after=<messageId>` | Any | | `{ channel, messages: [{ id, from: { id, employeeId, name, role }, text, at }] }`. Opening it marks the channel as read. |
| `POST /chat/channels/:key` | Any (admins only in announcements) | `{ text }` | `{ message }`. **403** for a BDE in announcements. |

`GET /chat/unread` counts private and channel messages together.

## Notifications (the bell)

Made by the server when: a leave is asked for (to admins) or answered (to the BDE), a receipt is recorded (to admins) or checked (to the BDE), leads are imported, added or moved to a BDE, a report is sent with a note (to admins), or an announcement is posted (to everyone).

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /notifications/unread` | Any | | `{ count }` |
| `GET /notifications` | Any | | `{ items: [{ id, kind, title, link, at, read }], unread }`, latest 30 |
| `POST /notifications/read` | Any | `{ ids? }` (none = all) | `{ ok }` |

## Activity log

| Method and path | Who | Get back |
|---|---|---|
| `GET /activity?userId=&action=&date=&before=` | Admin | `{ items: [{ id, at, action, detail, user }], nextBefore }`. Newest first, 100 at a time; pass `before=nextBefore` for older ones. Actions are listed in `server/src/lib/activity.ts`. |

## Excel downloads (Admin)

`GET /exports/report.xlsx?from=&to=` (everything on the Reports page), `GET /exports/attendance.xlsx?month=`, `GET /exports/daily.xlsx?from=&to=` (one day includes the BDEs' notes), `GET /exports/monthly.xlsx?month=`, `GET /exports/leads.xlsx`, `GET /exports/payments.xlsx`

PDF: the web app opens a print-friendly page and uses the browser's "Save as PDF".
