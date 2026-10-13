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
| Lead `stage` | `INTERESTED`, `FOLLOW_UP`, `INTERVIEW_SCHEDULED`, `SELECTED`, `PAYMENT_COMMITTED`, `PAID`, `NOT_INTERESTED` |
| Call `outcome` | `INTERESTED`, `CALL_BACK`, `NOT_INTERESTED`, `NO_ANSWER` |
| Interview `status` / `result` | `SCHEDULED`, `ATTENDED`, `NO_SHOW` / `SELECTED`, `NOT_SELECTED` |
| Payment `status` | `PROMISED`, `PARTIALLY_PAID`, `PAID` |
| Receipt `check` | `TO_VERIFY`, `VERIFIED`, `REJECTED` (null for promises) |
| Daily report `status` | `SENT`, `NOT_SENT`, `CALLING`, `NOT_STARTED` |

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
| `POST /users` | Admin | `{ name, phone, email?, joinedOn?, dailyTarget? }` | `{ user, temporaryPassword }`. Show the password once. |
| `PATCH /users/:id` | Admin | any of the above, or `{ active: false }` to deactivate | `{ user }` |
| `POST /users/:id/reset-password` | Admin | | `{ temporaryPassword }` |

## Courses

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /courses` | Any | | `{ courses: [{ id, name, type: "COURSE"\|"INTERNSHIP", fee, active }] }` |
| `POST /courses`, `PATCH /courses/:id` | Admin | `{ name, type, fee, active? }` | `{ course }` |

## Today (BDE's working day)

All return the **today** object:
`{ date, target, cutoff: "19:30", counts: { INTERESTED, CALL_BACK, NOT_INTERESTED, NO_ANSWER }, total, recent: [{ id, outcome, calledAt }], submittedAt, todo: { followUps, interviewsToMark, paymentsDue } }`

| Method and path | Who | Send |
|---|---|---|
| `GET /today` | BDE | |
| `POST /today/calls` | BDE | `{ outcome }`. Logs one call. 409 if today's report is already sent. |
| `DELETE /today/calls/:id` | BDE | Undo a call from today |
| `POST /today/submit` | BDE | Send today's report |
| `POST /today/reopen` | BDE | Reopen today's report to fix it |

## Daily reports

| Method and path | Who | Get back |
|---|---|---|
| `GET /daily-reports?from=&to=` | Admin | `{ from, to, days, rows: [{ bde, counts, total, target, status, sentDays, dueDays, submittedAt }] }`. One day if `to` is left out. |

## Leads

| Method and path | Who | Send | Get back |
|---|---|---|---|
| `GET /leads?view=all\|active\|due\|overdue&stage=&ownerId=&q=` | Any | | `{ leads: lead[], counts: { byStage, overdue, due, active } }` |
| `POST /leads` | Any | `{ name, phone, courseId, stage?, followUpOn?, nextAction?, ownerId? (admin only, required) }` | `{ lead }`. **409** if the phone number is already a lead, with a message naming the BDE. |
| `GET /leads/:id` | Any | | `{ lead, money: { fee, paid, balance }, notes, interviews, payments }` |
| `PATCH /leads/:id` | Any | any of `{ name, courseId, stage, followUpOn, nextAction }`; admins can also send `ownerId` to move it | `{ lead }`. Changes are written to the lead's history. |
| `POST /leads/:id/notes` | Any | `{ text }` | `{ note }` |

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
| `GET /stats/dashboard` | Admin | `{ date, today: { calls, target, interested, interviews: { total, attended }, collected: { amount, count } }, todo: { receiptsToVerify, notStarted, overdueFollowUps, interviewsToMark }, month }` |
| `GET /stats/monthly?month=2026-10` | Any | Admin: `{ month, from, to, rows: [{ bde, stats, rank }], totals }`. BDE: `{ month, me: { stats, rank }, teamSize }` |
| `GET /stats/bde/:id?month=` | Admin, or the BDE for themselves | `{ month, bde, rank, teamSize, stats, teamAverage, days: [{ date, calls }] }` |
| `GET /stats/attendance?month=` | Admin | `{ month, totals, lowest: [{ bde, scheduled, attended, rate }] }` |

## Excel downloads (Admin)

`GET /exports/daily.xlsx?from=&to=`, `GET /exports/monthly.xlsx?month=`, `GET /exports/leads.xlsx`, `GET /exports/payments.xlsx`

PDF: the web app opens a print-friendly page and uses the browser's "Save as PDF".
