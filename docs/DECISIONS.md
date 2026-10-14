# Decisions

The project brief left some questions open. The app is built on the answers below.
Each one is a default the team can change. The last column says how hard a change would be.

| # | Question | What the app does now | To change it |
|---|----------|----------------------|--------------|
| 1 | Are daily call counts typed in or counted from logged calls? | **Counted.** The BDE taps one button per call (Interested, Call back later, Not interested, No answer). The daily report is the total of those taps. A wrong tap can be undone until the report is sent. | Medium: add a "type counts" form that writes call rows. |
| 2 | Are leads assigned by the admin or added by BDEs? | **BDEs add their own leads.** The admin can move a lead to another BDE. A phone number can only belong to one lead, so two BDEs can't chase the same candidate. | Easy: allow admins to create leads for a BDE. |
| 3 | Is a part payment one record or several? | **Several.** Each payment is its own record with its own receipt. The balance is the course fee minus everything paid (rejected receipts don't count). A "promise to pay" is a separate record that closes when money arrives. | Hard after launch. Decide before go-live. |
| 4 | Who checks payment screenshots? Can a payment be edited after it is checked? | **The admin verifies or rejects each receipt.** A rejected receipt shows the reason to the BDE, who records the payment again with a new receipt. Verified payments can't be changed by the BDE. | Easy. |
| 5 | Can a BDE change yesterday's report? Is there a cutoff? | **Only today's.** The report is due at 7:30 pm. A BDE can reopen today's report to fix it until midnight. Past days are locked for BDEs. | Easy: cutoff time is a setting. |
| 6 | Is there a team-lead role? | **No.** Two roles: Admin and BDE. | Medium: the role list already allows adding one. |
| 7 | Are monthly targets needed? | **Daily call target per BDE** (default 80). No revenue targets yet. | Easy to add later. |

## What counts in the monthly report

- **Calls / Interested**: from logged calls in the month.
- **Interviews attended**: interviews in the month marked Attended.
- **Commitments**: promises to pay recorded in the month (one per candidate).
- **Successful payments / Revenue**: payments dated in the month **with a verified receipt**. Unverified money does not count until the admin checks it.

## Attendance, leave and chat (added 13 Oct 2026)

These follow the company's Ad Squad workspace, cut down to what a BDE team needs. Each is a default the team can change.

| Question | What the app does now | To change it |
|---|---|---|
| How is attendance marked? | The BDE taps **Start my day** on Today (punch in). Logging the first call also punches in, so a forgotten tap still counts. **Sending the daily report is the punch out.** Reopening the report clears the punch out until it is sent again. | Medium: add a separate "End my day" button. |
| What is late? | Punching in after **10:00 am** (`LATE_AFTER` in `server/.env`). | Easy: change the setting. |
| What is absent? | A past working day (Mon to Sat) with no punch-in, no calls and no approved leave. A day with calls but no punch-in counts as present. Sunday is off. | Easy. |
| Can the admin correct attendance? | Not yet. Leave covers planned absence. | Medium: add an edit on the Attendance grid. |
| How does leave work? | The BDE asks (Casual, Sick, Emergency, Other) with dates and a reason, up to 7 days back. The admin approves, or rejects with a reason the BDE sees. Approved days show as Leave, not Absent, and don't count as missed reports. A BDE can cancel a request until the leave starts. No leave balance is counted yet. | Medium: add yearly leave balances. |
| Who can chat with whom? | Like the company workspace: three channels everyone reads (**#general**, **#team**, and **announcements** where only the admin posts), plus private one-to-one chats between anyone. Private chats can't be read by the admin. Text only. Chat is not in the activity log. New messages arrive within a few seconds. | Easy: more channels. Medium: photos. |
| What rings the bell? | BDE: leave answered, receipt verified or rejected, leads given or moved to them, a new announcement. Admin: leave asked for, receipt to check, a report sent with a note. | Easy: add more. |
| How are leads imported? | The admin uploads an .xlsx or .csv and picks one BDE and a default course. Rows become **New** leads with a follow-up today. Bad numbers, numbers that are already leads, and repeats are skipped and listed before anything is saved. | Easy: split one file across several BDEs. |
| What is in the activity log? | Logins, start of day, reports, leads added, moved or imported, interviews, payments and receipt checks, leave, and team changes. Admin only. | Easy. |

## Screens

- The brief asks for a web application and doesn't mention phones, and most BDEs work on laptops. So **every screen (BDE and admin) is laid out for a laptop first**: a left menu, wide tables, and side-by-side panels.
- Every screen is responsive. Below 960px the left menu becomes a ☰ button, and below 700px tables turn into cards, so tablets and phones work without sideways scrolling.
- On a laptop, BDEs can press **1, 2, 3, 4** to log a call (Interested, Call back later, Not interested, No answer).

## Other choices

- Two lead statuses can't be picked by hand. **Interview scheduled** is set by booking an interview, and **Paid** is set when the admin verifies receipts covering the full fee.
- Follow-up dates must be today or later. An old overdue date can stay as it is until someone changes it.
- Each BDE account needs its own phone number.
- Money is stored in whole rupees.
- Dates follow India time (IST, UTC+5:30).
- Excel downloads are real `.xlsx` files made on the server. PDF uses the browser's "Save as PDF" on a print-friendly page.
