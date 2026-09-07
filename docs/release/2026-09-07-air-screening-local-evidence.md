# Air screening evidence — local foundation, not released

Latest checkpoint: local operator editing, Dexter registry/read/approved writes
and notification-only deterministic watches are implemented. Real PostgreSQL
approval/replay and watch lifecycle tests pass. Isolated browser UTC roundtrip,
responsive and focus checks now pass. Remaining gates include broader
access/retirement cases, current-schema
rehearsal and combined hosted release verification. No screening changes are live.

### Browser preflight and UTC correction

`supabase/tests/tools/verify-booking-security-evidence-browser.mjs` bundles the
actual editor and gallery preview with explicit in-memory save/language fixtures
and blocks all external requests. Chrome passes en-GB/en-US × reduced/normal
motion at 320/768/1280 widths, 200% CSS zoom, focus loop/return, reachable Save,
synthetic save/reopen, read-only controls and no console/page errors or external
requests. The 320px screenshot `/tmp/multideck-screening-mobile.png` was inspected.
Regional context is exercised with identity copy translation; this is not a test
of the entire application translation provider or every keyboard interaction.

The first browser save exposed a real fractional-second mismatch: the native
input allowed fractions but the reused cut-off converter rejected them. Screening
now uses its own strict UTC input conversion, retaining up to six fractional
digits and leaving route cut-off behaviour unchanged. Nine editor tests pass,
including exact microseconds/omission/clear and invalid-date checks; the browser
also saves and reopens `2026-09-07T10:30:45.123` without losing its fraction.

New migration `20260907140238_booking_cargo_security_evidence.sql` creates a
private typed cargo evidence record, independent of AWB documents, Customs,
sanctions screening and clearance decisions. Supplied status/method/name/agent
reference/time/source/notes stay distinct from record lifecycle recorded/voided.
No regulatory status dictionary, automatic clearance or agent verification is
invented. Supplied nonblank text is retained verbatim; unknown fields remain null.

The canonical permission-checked writer verifies active actor, Bookings Read and
Write, company/office Job ownership, active exact cargo, and Job/cargo/evidence
timestamps. It locks Job → cargo → evidence, applies only allowlisted deltas,
preserves omitted fields, supports explicit clears, audits meaningful changes
and forbids rewriting voided records. Creation requires a source plus at least
one supplied status, method or screening time. A void retains the source values.

The table has RLS and no direct browser/service-role access. Indexed cargo and
actor foreign keys follow the database guidance. Only the public service-role
RPC is exposed; its workspace response and fresh Open include identical evidence
and retain existing document categories. Existing AWB tables are not changed.

Booking Edge dispatch and client types/invocation are wired locally. The exact
new action is allowlisted; server-verified actor overrides any caller-supplied
identity, malformed request shapes fail before RPC, and stale writes return 409.
An operator editor and component-gallery preview are now wired in the local
worktree; neither is released. Dexter action/watch support remains unfinished.

## Local operator preview checkpoint

The client production build passed (`/tmp/multideck-screening-ui-build.log`),
with the existing large-bundle warning. Thirteen focused editor/Edge tests pass,
covering exact supplied text, UTC date validation, omission/clear semantics,
stale identities/timestamps, duplicate submissions and failure retention.

Chrome verification at
`http://localhost:3000/components?component=booking-security-evidence` exercised
the actual editor with an injected, in-memory synthetic save function:

- Empty submission focuses Reason; after adding a reason, missing Source
  receives focus and an explanatory error.
- Supplied status, method and source with leading/trailing spaces survive save
  and reopening the correction form verbatim.
- A simulated save failure retains Notes and Reason. Cancel requests discard
  confirmation, initially focuses Keep editing, and confirmed discard restores
  focus to the saved record's correction button.
- Voiding requires a reason, retains supplied values and removes the correction
  button. Expanded details show unknown fields as Not recorded and retain
  attributed create/void history with the recorded reasons.

These checks made no Booking/API writes and do not prove hosted persistence,
backend access isolation, responsive layout or complete keyboard behaviour.
The UTC field's browser entry path, responsive checks, visual review and
Dexter parity remain open. The lifecycle selector and history now explicitly say
Record status, distinct from Security status as supplied. The editor is connected
to Air/mixed-Air cargo and retained evidence on other modes, uses the canonical
save API, and is disabled while parent Booking changes are unsaved.

## Executed checks

- Real PostgreSQL suite passes with the full migration and canonical writer:
  create/read/correct, exact text and timezone conversion, no-op, omission/clear,
  malformed/oversized fields, stale request, unknown actor, wrong cargo,
  invalid void, retired-write denial, service ACL/RLS, attributed audit and
  unchanged Quote/cargo/Booking values (apart from audit update metadata).
- Public Save and fresh Open return the same workspace with evidence and
  retained document category. Surrounding Auth/workspace fixtures remain local
  test boundaries, not proof of hosted cross-tenant access.
- Four executed Edge-dispatch tests pass; they cover exact caller/payload,
  malformed requests, 409 handling and failure/no-result propagation. RPC is a
  declared stub for those transport tests; database behavior is tested separately.
- Booking Deno type check and client TypeScript build pass. Logs:
  `/tmp/multideck-security-evidence-test.log`,
  `/tmp/multideck-screening-edge-check.log`,
  `/tmp/multideck-screening-client-types.log`.

## Mandatory continuation/release gates

### Deterministic watch checkpoint

The pending parity migration registers the eight supplied/lifecycle fields,
emits signals from the private evidence table and extends existing deterministic
owner/change evaluation. Setup verifies one active accessible record, replaces
model labels with saved labels, and rejects automatic actions or non-change
conditions. Listing and RLS retain current Booking access requirements. Dexter
setup instructions and source-label routing now include screening.

Actual PostgreSQL lifecycle passes: matching change produces one owner event and
notification with a Booking source link; unrelated notes and paused changes are
silent; resume fires and repeated no-op save stays silent. Revoked owner signals
do not notify, another user cannot read the event, revoked Booking access hides
watches through listing/RLS, and unknown/voided targets and autonomous actions
are rejected. No swallowed watch health error. Log:
`/tmp/multideck-screening-watch-lifecycle.log`. This uses local identity fixtures,
not hosted cross-tenant proof. Earlier incomplete-registry/watch notes below are
historical checkpoints, superseded by this local implementation only.

### Dexter local adapter checkpoint

The screening review and watch-target adapters now exist and are connected to
both Dexter response paths and dedicated watch setup. Review uses request-local
permission-checked records, exact Booking/cargo/evidence timestamps, allowlisted
fields and known before values. Supplied text and reasons remain verbatim through
both argument parsers and the review. Watch setup uses the signed-in domain read
and rejects ambiguous, substituted, inaccessible and voided targets.

Fourteen screening/DG review-parser-target tests pass; Dexter Deno type checking
passes with `--node-modules-dir=none`. Tests use explicit domain-read fixtures,
not live access or database execution. These adapters do not yet expose a usable
screening capability: database domain/action registry, approved executor,
deterministic watch signal/evaluation, prompt metadata and lifecycle coverage
remain required before release.

Tracing the shared approval guard found `record_booking_dangerous_goods` absent
from its mandatory list despite the existing prompt promising approval even in
Full access. The local guard now includes both DG and screening recording, with
an executed regression test for approve/full modes. This correction is not yet
deployed; previous hosted Approve-mode evidence does not establish Full-access
safety. Verify the prepared-action execution boundary and hosted Full-access
proposal before closing that gate. No live action was attempted in this check.

Follow-up execution-boundary check: the existing DG database migration already
adds DG to the prepared-action executor's mandatory-approval guard. The actual
local PostgreSQL approve/execute/replay fixture passes in approve/full modes:
unapproved calls leave records/audit unchanged, approved calls write, and replay
does not duplicate audit. Thus the Edge omission is a routing/review gap, not
evidence that unapproved DG writes succeeded. Log:
`/tmp/multideck-screening-approval-boundary.log`. Hosted Full-access verification
remains open.

Pending migration `20260907142751_dexter_booking_security_evidence_parity.sql`
now contains the private screening domain read and canonical-writer adapter.
The appended real PostgreSQL fixture passes exact source/reason retention,
unknown values, correction, malformed/duplicate fields, stale timestamp,
wrong-company denial, rollback, attributed audit, unchanged Quotes and private
helper execute permissions. Log: `/tmp/multideck-screening-dexter-adapter.log`.
This is direct adapter coverage, not a prepared screening action or watch test.
The migration is explicitly incomplete and must remain unreleased until domain/
action/watch registration, prepared-executor guard and deterministic watch
signals/evaluation plus their lifecycle tests are added.

### Prepared screening action checkpoint

The still-unreleased parity migration now registers the permission-scoped domain
and allowlisted action, marks it always-approval, and extends the real prepared
executor's mandatory guard with a fail-closed single-anchor check. Dexter prompt
guidance distinguishes source evidence from clearance and allows watch claims
only when a watch capability is listed. Full-access intent routing now recognises
explicit screening evidence edits and denies tested read-only, negative, quoted
and sanctions/clearance requests.

Real PostgreSQL query-domain and prepared approve/execute/replay coverage passes:
creation in Approve mode and correction in Full access remain unapplied until
approval; replay does not duplicate audit. Existing malformed/stale/foreign
adapter cases and exact-source assertions continue to pass. The first run was
correctly denied by server_only because the fixture lacked its server role;
the fixture was corrected, not the guard. Final log:
`/tmp/multideck-screening-prepared-actions.log`. One targeted Deno intent test
and full Dexter type checking pass. This does not establish hosted approval,
complete security lifecycle, or watch support; deterministic screening watch
registration/signals/evaluation and tests remain required before release.

Do not deploy this foundation alone. Complete operator source-evidence editing
and read-only states, exact-source Dexter read/review/mandatory-approved writes,
deterministic matching/non-matching/pause/resume watch support, retirement and
access denial tests, Air/mixed-mode presentation, then current-schema rehearsal
and hosted release/persistence/approval/watch checks as one coherent feature.
No new capability is considered finished without these. Reuse existing UI and
approval/watch primitives; never replace them with generic writes or polling AI.

No live migration, function deploy, provider action, Quote mutation or Vercel/team
change occurred. Customs/iCustoms, tracking, PDF-logo and held Quote revision
approvals remain untouched. The full all-mode goal remains active.
