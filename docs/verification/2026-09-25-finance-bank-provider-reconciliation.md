# Finance bank and provider reconciliation — 25 September 2026

## Local implementation

- Bank statement CSV import validates complete period coverage, signed amounts,
  running balances, currency, file identity and exact posted cash matches.
  Finance sign-off checks the bank nominal opening, movement and closing;
  a posted CargoWise opening package contributes to the first-period opening.
  Later unmatched bank ledger postings make the control incomplete.
- ERPNext period comparison makes bounded, counted and repeated reads of
  invoices, payments, journals and GL entries. It retains six exact domains:
  documents, allocations, journal lines, tax lines, trial balance and
  AR/AP/cash controls. Missing, duplicate, partial and conflicting evidence
  cannot verify. A saved run is invalidated by local snapshot changes,
  connection changes, received webhooks or a 15-minute lifetime.
- Sage 50 HyperExt is probed for exact company/status and nominal evidence,
  then deliberately remains incomplete because full paged period evidence is
  not yet available through this connector.
- Linked opening packages have a separate queued ERPNext Journal Entry
  delivery path. The payload and provider identity are frozen; the result is
  matched only after exact submitted account-line readback. The opening
  package workflow must enqueue this path atomically when posting in linked
  mirror mode and block release until its delivery is matched.
- The period comparator explicitly holds imported CargoWise opening invoices
  and historical unapplied cash `incomplete` when they lack individual
  synced, submitted ERPNext invoice or Payment Entry readback. The issue
  names up to eight affected source references and package IDs and directs
  an operator to reconcile control postings before another run. A matched
  opening Journal Entry proves GL delivery only. Historical unapplied cash
  is not treated as current bank statement movement.
- Finance pages and Dexter read/watch domains expose saved evidence with
  existing permissions. Difference review records a disposition or draft
  proposal; it does not write to either ledger.

## Verification performed

- `finance-reconciliation-contract.test.mjs`: six passing tests, including
  quoted CSV and running balance rejection, partial/duplicate/conflict
  comparison, matching invoice and payment allocation with GL and controls,
  missing/changing ERPNext inventory pages, and rejection of missing, wrong
  type or draft opening subledger readback.
- `finance-bank-statement-postgres.test.mjs`: passes against the real tenant
  baseline and local migrations. Exercises duplicate import, cross-entity
  denial, first-period opening GL, posted cash matching, sign-off, later GL
  invalidation, opening mirror queue/claim/failure/retry/match, provider status
  snapshot invalidation, and deterministic Dexter watch pause and permission
  revocation.
- `finance-reconciliation-dexter-postgres.test.mjs`: passes; domains, watches,
  triggers and service-only grants install on the baseline.
- `finance-release-manifest-postgres.test.mjs`: passes with the ordered
  post-snapshot migrations as of this check.
- `multideck.client` TypeScript build passes. The finance-reconciliation Edge
  handler bundles with esbuild; this is a syntax check, not a deployed run.
- Full data-access regression passes with the combined finance migration
  chain: 118 PostgreSQL and contract checks, plus the remaining 10 access
  boundary checks. The earlier transient release-manifest failure was
  resolved by adding the concurrent migrations to its ordered fixture.
- Chrome route check by Finance daily-workflow stream: both reconciliation
  routes render their authenticated headings and scope controls. The local
  tenant returns `Failed to fetch` for the undeployed new Edge endpoint, so
  browser evidence stops before a live import or provider run.

## Connected and release boundary

No live ERPNext period comparison, Sage 50 period probe, tenant migration,
Edge deployment or provider opening journal readback has been confirmed.
The intended tenant, legal entity and accounting period must be selected
before connected tests. ERPNext tax-row semantics and the actual mapped
opening/control accounts need matching and deliberate-difference cases on
that connection. The current linked full opening Journal Entry includes
AR/AP and bank control balances; ERPNext opening invoices and payments
would post those controls again. Full cutover therefore needs a reviewed
residual/clearing journal design and exact submitted provider subledger
readback before release. Sage 50 cannot be signed off as period reconciled until the
tenant HyperExt API provides complete paged journal, allocation, tax and
trial-balance evidence. Do not treat local fixtures or rendered routes as live
accounting parity.
