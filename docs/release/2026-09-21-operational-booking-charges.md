# Operational Booking charges: development release

## Scope and release

Operational charge editor and preservation-first accepted-Quote charge review.
Frontend remains local on port 3000. No GitHub push, Vercel deployment or worktree.
Existing unrelated edits preserved; Customs/iCustoms, tracking and PDF branding
unchanged. User acceptance remains outstanding, not the entire freight goal done.

Shared development tenant: `aqtwypsuijxlnvtxpuxe`.
`bookings-workflow` v56 ACTIVE, JWT verification enabled, retrieved source matches
the release bundle; deployed v55 shared dependency preserved. `agent-dexter` v286
adds only two explicit unsupported notices to the authoritative v285 bundle;
all other deployed files retained unchanged.

Applied migrations (filenames aligned to remote versions; contents unchanged):

- `20260921154728_booking_charge_provenance.sql`
- `20260921154731_booking_charge_removal.sql`
- `20260921154733_booking_charge_restoration.sql`
- `20260921154737_booking_operational_charge_editor.sql`
- `20260921154738_booking_charge_source_and_bulk_guards.sql`
- `20260921154739_booking_quote_charge_review.sql`
- `20260921154740_booking_charge_editor_activation.sql`

Originally staged under 144654, 145254, 145852, 150921, 152038, 152329 and 152748
respectively. Earlier staged-only notes are historical, superseded by this release.

## Behaviour

- Shared Quote charge component now serves operational Finance: Add, Remove,
  Save, required reasons and protected rows. Provisional retains its separate
  planning editor and financial exclusion. In-progress changes affect operational
  costing. Complete/Cancelled are read-only; live-job cancellation/corrections
  remain separate boss decisions.
- Saves change only selected lines, atomically, with full before-row and Booking
  timestamp checks. Audit uses the signed-in actor, not the Booking owner.
- Removed lines retain complete immutable archive/audit. No implicit restoration;
  discarded Provisional charges never return through reopening.
- New conversions record exact Quote/version/line provenance. Quote reviews
  default to Keep, preserve manual Booking lines, require individual decisions,
  retain remaining non-charge reviews and never edit accepted Quote history.
- Old whole-list save/sync routes reject charge replacement; other field workflows
  remain available. The bulk charge checkbox directs users to Finance.
- History tables have RLS and no browser grants; authorising functions are
  service-only behind the authenticated Edge route.

## Verification

- Production build and TypeScript passed; existing bundle-size warnings remain.
- Forty access-regression checks passed, including real PostgreSQL lifecycle and
  permission tests. Focused client adapter, audit, planner and Dexter boundary
  tests passed.
- Disposable PostgreSQL executes the actual migrations: add/edit/remove, precise
  provenance, stale/protected denial, rollback, explicit Quote changes/restoration,
  preserved manual lines, immutable Quote snapshots and endpoint grants. It is a
  focused fixture, not a complete production clone. Source patches were also
  rehearsed against downloaded live definitions.
- A two-connection FK test confirms financial linking waits on the operational
  charge lock, including the financial link with ON DELETE SET NULL.
- Live access preflight passed before/after for 12 internal users: unchanged
  90 Booking headers/88 register entries, 33 Quotes, 47 routes, 24 cargo rows,
  19 Quote lines, 77 documents and 22 organisations. Direct anonymous/browser
  write grants remain false.
- Advisors identify the three private history tables as RLS-enabled without
  policies: deliberate deny-all, not missing public access. See
  [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Chrome/local JI0991146: added TEST-OPS-0921 at GBP100/150, changed to GBP125/175
  and revised the description; saved, reopened Finance, verified database values
  and the expandable Audit differences. Actor Lee Wright; owner Harry Phillips.
- Removed the temporary line using the UI. One removal receipt/archive retained;
  original TEST-NEW remains GBP200/275 and discarded TEST-FRT remains absent.
  Temporary line ID: `b0193d9f-5250-40d9-bcd1-b08f5e7df24b`.
- Required-reason validation/focus and keyboard Enter verified. Empty pending
  Quote review displays successfully. Page width equals viewport width at 390px;
  the shared table retains its scrollable responsive treatment.
- A rolled-back live transaction verified exact provenance/editing of the original
  released planning line and stale-timestamp rejection, retaining no changes.
- Browser testing caught and fixed deletion audit null-stripping and no-pending-
  review handling. An earlier Vite hot-reload error occurred during edits; final
  type/build checks succeeded.

## Explicit limits

- No pending accepted Quote revision exists in the shared test data. Populated
  line-review decisions have executable SQL coverage, not a complete browser
  send/accept/revise journey. No email sent or accepted Quote fabricated for testing.
- Twelve historical ledger rows lack reliable source metadata: no guessed
  backfill. They stay protected; independent new Booking lines can still be added.
  Historical editing needs explicit reconciliation, not matching by price/order.
- Financially evidenced lines and legacy financial-catalogue rows require the
  separate financial-correction policy.
- Dexter charge inspection/editing/individual decision watches explicitly return
  unsupported and direct users to Finance; existing watches are unchanged. Broad
  Dexter contract tests still have failures outside the touched charge behaviour;
  do not describe that whole suite as passing. Focused new boundary tests pass.
- Frontend deployment/push and user acceptance remain separate. Do not infer
  sign-off of the whole freight goal or cancellation of In-progress jobs.
