# Full test, admin and BDE, 15 Oct 2026

The whole app tested from the start, on both sides: the admin brings in students, gives them to BDEs and follows them; the BDEs call, update, book interviews and collect fees.
Fill in **Result** as each step is done (Pass, or Fail with what happened). Bugs found go in [Bugs found in this test](#bugs-found-in-this-test).

## Starting point

The local database was cleaned on 15 Oct 2026 so the test starts empty. A full backup was taken first (`app/backups/db-before-clean-….json`, not in git).

| What | Now |
|---|---|
| Accounts | Admin (ADMIN-01) and 10 BDEs: BDE-001 Anitha R., BDE-002 Bala S., BDE-003 Nisha A., BDE-004 Sanjay D., BDE-005 Charan V., BDE-006 Deepa M., BDE-007 Priya S., BDE-008 Ganesh K., BDE-009 Lakshmi V., BDE-014 Karthik R. Passwords are in `TEST-ACCOUNTS.md`. |
| Deleted | All students (285) and their notes, calls (23,153), daily reports, interviews, payments and receipt files, imports, notifications, and 58 other accounts (20 sample BDEs and 38 test accounts). |
| Kept | Courses (6), attendance, leave, chat and the activity log of the people above. |
| Test files | `app/test-files/new-students.xlsx` (20 students + 2 bad rows) and `new-students-with-bde.xlsx` (6 rows with a BDE ID column). Not in git. |

Before testing: MySQL running (`net start MYSQL80` in an admin PowerShell), then `npm run dev` in `server` and in `web`, and open http://localhost:5173.

## Fixes and changes since the last push (5fc8a49)

| # | Area | What changed |
|---|---|---|
| 1 | Today | Fast taps were dropped while a call was saving. Now every tap counts (15 fast taps = 15 calls). |
| 2 | Today | The four counter buttons didn't say **who** was called. Today now has a **call list** (students due today and overdue): pick the student, then tap how it went (or press 1 to 4). The call counts for the report and updates the student: status, next call date, history line. |
| 3 | Today | Pressing 1 2 3 3 3 updated five students (the next student was picked by itself). Now one pick = one call: nobody is picked after a call, and a green bar offers **Undo**. |
| 4 | Today | **Undo** puts the student back as they were (status, follow-up, next action), not only the count. |
| 5 | Today | A call could update the student but fail to save the call. The two are now saved together. |
| 6 | Today | **+ New number** is a button above the list (it was a row that pushed the students down). Interested → "Add them as a lead" opens with the number filled in. |
| 7 | Today | The list heading says what it is: "Students whose follow-up date has come: N due today, N overdue". |
| 8 | Today | "Last calls" is now **Today's history**: calls and Excel changes together, newest first, each tagged **Call list** or **Excel**. |
| 9 | History | Every line in a student's history is tagged where it came from: **Call list**, **Excel** or **Import** (no tag = changed on the lead page). Old lines were labelled by the database update. |
| 10 | My leads | **All** showed the same number as the chosen tab (99 instead of 145). Now Call today / Active / All always show the full counts. |
| 11 | My leads | New **status filter** (Interested, Interview scheduled, Selected…), with a count per status. |
| 12 | Import (admin) | Students can go to one BDE, be shared equally, or **by availability** (BDEs on leave today skipped, fewest open leads first). A "BDE ID" column in the file decides for its rows. Each import is followed under **Leads → Imports**. |
| 13 | Assign leads (admin) | New page: choose students (an import's not-called, or a BDE's open/overdue), compare BDEs (attendance, workload, this month's results), tick who gets them. |
| 14 | Update from Excel | BDEs (own leads) and the admin (any) download a sheet, fill in the green columns and upload. Preview first, then Apply. Same rules as on screen. |
| 15 | Update from Excel | Rows with **no Lead ID** add **new students** the BDE called (name, phone, course, status). |
| 16 | Update from Excel | Row numbers in the preview were one lower than in Excel. Fixed for the update and for the import. |
| 17 | Update from Excel | The history now also records the new follow-up date and next action from Excel. |
| 18 | Calling page | A trial "Calling (new)" page was built and then removed; its idea moved into Today (2, 3). |
| 19 | Tests | The API check and the browser tests now remove everything they add, so they no longer fill the BDEs' leads and history. The API check works with any number of BDEs. |

Database updates since the last push: `0004_call_lead`, `0005_import_batches`, `0006_call_undo`, `0007_note_source`. Teammates run `npm run db:deploy` after pulling.

## Automatic checks, 15 Oct 2026

| Check | Result |
|---|---|
| API check (`npm run check:api`), on the clean database | **122 passed, 0 failed**. Database counts the same before and after. |
| Browser click-through (BDE and admin, 1366 and 1440 px) | 30/30 |
| Browser: call list (pick, 1 2 3 3 3, undo, new number, phone width) | All passed |
| Browser: import, Imports tab, Assign, BDE Update from Excel | All passed |
| Browser: history tags (Excel and Call list) | All passed |
| Production build (web) and type check (server, web) | OK |

## Full-flow test (by hand)

### Part 1. Admin: set up and bring in students

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Log in as **ADMIN-01**. Open **Team**. | 10 BDEs listed, all active. | |
| 1.2 | Open **Leads**. | No leads yet. Imports tab: "No imports yet". | |
| 1.3 | **Import from Excel** → `new-students.xlsx`, Give the leads to **By availability**, pick a course for rows without one, **Check the file**. | 20 ready, 2 skipped with reasons (bad number, same number twice). "Who gets them" shows the split. | |
| 1.4 | Import. | Imports tab opens with the new import: 20 students, 0 called, all "Not called". | |
| 1.5 | Click **By BDE** on the import. | One row per BDE who got students. | |
| 1.6 | Import `new-students-with-bde.xlsx` (any choice). | 5 ready; BDE-099 refused ("No active BDE with ID BDE-099"). Karthik gets 2, Bala 1, Nisha 1. | |
| 1.7 | Bell (top left) as **Karthik** later. | "N new leads added to your call list". | |
| 1.8 | **Assign leads**: From "An import: students not called yet", choose the first import, How many: 3. | 3 available. BDE table shows today, workload, this month. | |
| 1.9 | **Tick the suggested 3** → **Give the students**. | Toast: "3 students given: …". Their open leads go up by 1. | |

### Part 2. BDE (Karthik, BDE-014): a working day

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Log in as **BDE-014**. | Today page. Call list shows his imported students, "N due today, 0 overdue". | |
| 2.2 | **Start my day**. | "Started h:mm" under the title; attendance marked. | |
| 2.3 | Tap a student's name. | Their card opens with Interested / Call back later / Not interested / No answer. No buttons on other cards. | |
| 2.4 | Tap **Interested**. | Green bar "Name: Interested. Pick the next student" with Undo. Student leaves the list. Calls today +1. Today's history: "Name: Interested", tagged **Call list**. | |
| 2.5 | Pick another student, press **2** then **3 3 3** quickly. | Only **one** call (Call back later). Nobody picked after. | |
| 2.6 | **Undo** in the green bar. | Call removed; student back in the list as before. | |
| 2.7 | Pick a student, **+ Add a note or change the next call date**: note "Wants fee details", date 2 days ahead, **Call back later**. | Student's page: status Follow-up, follow-up on that date, history "Called: Call back later. Wants fee details" tagged Call list. | |
| 2.8 | Pick a student → **Not interested**. | Status Not interested, no follow-up; not in Active. | |
| 2.9 | **+ New number** → type a number → **Interested** → **Add them as a lead**. | Add a lead opens with the number filled in. Save with a course. | |
| 2.10 | Keyboard: ↓ to pick, **1** to log. | Works without the mouse. | |
| 2.11 | **My leads**: Call today / Active / All, then the **status filter** (e.g. Interested). | Counts don't change with the tab; filter shows only that status, with matching count. | |
| 2.12 | Open an Interested student → **Book interview** for tomorrow 11:00. | Status Interview scheduled; shows on **Interviews**. | |

### Part 3. BDE: update from Excel

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | **My leads → Update from Excel → Download Excel**. | Sheet with his open leads; green columns editable; Status, Attended?, Result have dropdowns. | |
| 3.2 | In the sheet: set one New student to **Interested** with a follow-up date and a note; one to **Not interested**; book one an interview (date + time). | | |
| 3.3 | Add a row at the bottom with **no Lead ID**: name, phone, course, status Interested. | | |
| 3.4 | Add a bad row: status **Paid** on a student, or a follow-up date in the past. | | |
| 3.5 | Upload → **Check the sheet**. | "N will change (including 1 new student)", the bad row "can't be applied" with the reason, row numbers match Excel. | |
| 3.6 | **Apply**. | Toast with updated and added counts. | |
| 3.7 | **Today → Today's history**. | Each Excel change listed, tagged **Excel**, with what changed (status, next call, next action, note). | |
| 3.8 | Open one of those students. | History lines tagged **Excel**. | |

### Part 4. Interviews and payments

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | BDE **Interviews**: mark the interview **Attended**, result **Selected**. | Student becomes Selected; next action "Ask when they can pay". | |
| 4.2 | **Payments → Record a payment**: part payment with a receipt image. | Payment listed as waiting for checking. | |
| 4.3 | Admin **Payments**: verify the receipt. | Verified; BDE's revenue goes up. Admin sees the count badge go down. | |
| 4.4 | BDE records the rest; admin verifies. | Student becomes **Paid** by itself when the full fee is verified. | |
| 4.5 | Try setting Paid by hand (status dropdown). | Not possible (greyed out). | |

### Part 5. End of day and the admin's view

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | BDE: note for admin, **Send today's report**. | Report sent; calls locked; day finished. | |
| 5.2 | **Make a correction**, then send again. | Reopens and sends again. | |
| 5.3 | Admin **Dashboard**. | Today's calls, interested, interviews, collected match what was done. | |
| 5.4 | Admin **Reports**. | Karthik's row shows his calls and Sent; others "Not started". The report note appears. | |
| 5.5 | Admin **Leads → Imports**. | Progress moved: Called, Interested, Interview, Selected, Paid counts match. | |
| 5.6 | Admin **Leads**: open one of Karthik's students. | History shows the tags Call list / Excel / Import. | |
| 5.7 | Admin **Assign leads** again. | Karthik's calls today and this month updated. | |
| 5.8 | Admin **Attendance**. | Karthik present today with start and finish time. | |

### Part 6. Other screens

| # | Step | Expected | Result |
|---|---|---|---|
| 6.1 | BDE asks for **leave** (My month); admin approves in Attendance. | BDE gets a notification; on that day he's skipped by "By availability". | |
| 6.2 | **Chat**: BDE → admin, admin replies; #general channel. | Messages arrive; unread counts on the bell and menu. | |
| 6.3 | Admin **Activity**. | Log-ins, calls, sheet updates, imports listed. | |
| 6.4 | Phone width (DevTools, 390 px) as BDE: Today, call list, My leads. | Usable; no sideways scroll; outcome buttons in two rows. | |
| 6.5 | Log out on both. | Back to the log-in page. | |

## Bugs found in this test

| # | Step | What happened | Severity | Fixed? |
|---|---|---|---|---|
| 1 | 3.8 | Status changed to Interested from Excel, but Next action stayed "Call back" (a call on Today sets "Book the interview"). | Low | Code fixed, retest later: a status change from Excel now sets the same next action as a call (Interested: Book the interview, Follow-up: Call back), unless the row gives one or the BDE had typed their own. |
| 2 | 3.8 | A new student added from Excel as Interested had no Next action. | Low | Code fixed, retest later: new students get the next action that goes with their status. |
| 3 | 5.7 | Assign leads put Karthik last although he was the only one working. "Not in yet" counted the same as Present, and Calls a day divided his 4 calls by all 13 working days of the month (0.3, shown as 0), so everyone tied and the table fell back to ID order. | Medium | Yes, retested 15 Oct (Karthik on top): Present/Late first, then Not in yet, then Leave/Off; Calls a day = calls ÷ days the BDE called; ties go to interested % and calls today. |
