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
No operator UI or Dexter action/watch is exposed yet.

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
