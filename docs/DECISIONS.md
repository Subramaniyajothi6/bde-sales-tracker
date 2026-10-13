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

## Other choices

- Money is stored in whole rupees.
- Dates follow India time (IST, UTC+5:30).
- Excel downloads are real `.xlsx` files made on the server. PDF uses the browser's "Save as PDF" on a print-friendly page.
