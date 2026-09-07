# Air screening evidence — local foundation, not released

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
