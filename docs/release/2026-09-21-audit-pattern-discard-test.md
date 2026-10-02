# Uniform Audit disclosure and Discard/reopen acceptance

User authorised the local Audit presentation update followed by Discard/reopen on
JI0991146. All live Booking event types now use the same native details/summary
disclosure, collapsed initially. Date, actor and summary remain visible. Existing
charge, cancellation and route detail renderers remain inside that disclosure;
other events expose recorded metadata as labelled, wrapping text (including
before/after snapshots). Missing metadata explicitly says no additional details
were recorded. Recorded IDs are not replaced with invented historical names.
No new reusable component or backend endpoint was introduced.

Checks: client TypeScript build passed; four charge diff tests passed; diff
whitespace check passed. Chrome confirmed all event types collapsed, cancellation
reason/Keep expanded, ownership before/after expanded, and Enter collapsed.
Mobile visual review and exhaustive event-type payload checks remain unperformed.

## Connected Discard/reopen test — 21 September 2026, 11:35 BST

- Used the normal localhost cancellation dialog with an internal test reason and
  explicit Discard selection. Saved cancellation removed the working TEST-FRT row.
- Reopened using a distinct internal test reason. Same Booking returned to
  Provisional; Harry/Wakefield 41, Air/Import and customer remained on screen.
- Database confirmed planning revision 3, empty rows and zero Job_Costing_Lines.
- Immutable history still has revisions 1, 2 and 3. Revision 3 stores the complete
  prior GBP125 cost / GBP175 sell line and an empty after-state. Reopening did not
  restore it. Old charge-save Audit entries remain available; cancellation carries
  the Discard decision. The cancellation entry currently exposes the decision,
  not the full discarded-row snapshot as a new inline charge diff.
- Browser refresh used to verify persisted reopened state. No fresh charges added,
  no In-progress confirmation, no financial reporting sign-off in this step.

Only authorised internal test data changed in shared development. The local UI
change is not pushed/deployed; no migration or Edge deployment. Discarded working
charge is deliberately not restored: preserved history is evidence, not an undo.
Next acceptance: user reviews Audit/empty Finance, then separately approve fresh
charge creation and confirmation-to-In-progress testing.
