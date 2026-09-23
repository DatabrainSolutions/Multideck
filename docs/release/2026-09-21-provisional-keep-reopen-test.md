# JI0991146 — Keep and reopen acceptance

User authorised this single test on 21 September 2026. Executed through Chrome
localhost, using the normal signed-in workflow connected to shared development.
No code/backend deployment, push, Discard or In-progress confirmation.

- Cancel dialog required a reason and offered Keep/Discard, neither preselected.
- Selected Keep and supplied an explicitly internal acceptance-test reason.
- Cancellation completed at 10:47 BST. UI showed Cancelled and Reopen as
  Provisional. Audit named Lee Wright, reason and kept-as-inactive decision.
- Read-only database check while cancelled: same JI0991146, planning revision 2,
  same TEST-FRT row, GBP125 cost / GBP175 sell, both ROE1; zero Job_Costing_Lines.
- Reopened using a separate explicit internal test reason at 10:48 BST.
- Database returned draft (Provisional), unchanged revision 2 and charge row;
  zero Job_Costing_Lines. Cancellation/reopening each recorded once in their
  respective event types, both attributed to Lee's actual editor ID
  `4467c131-7068-4a7e-8ebc-e51d2d4af01c`, not assigned owner Harry Phillips.
- Full browser reload retained Provisional, JI0991146, Harry/Wakefield 41,
  Recycling Buddy, Air/Import. Finance displayed GBP125/GBP175 and GBP50 profit,
  original supplier/customer, and editable planning controls.
- Audit after refresh displayed both reasons and Keep decisions. Review-prices-
  and-dates flag true on reopening. Left Audit open for user review.

Limits: zero costing rows verifies no operational charge release in this cycle,
not every monthly report. Full report verification remains a separate step.
The currently visible reopening reminder banner remains pending the agreed later
presentation change. No claim of field-by-field comparison of every Booking child
record or document; this record has no documents. Next: user acceptance, then a
separately authorised Discard/reopen test.
