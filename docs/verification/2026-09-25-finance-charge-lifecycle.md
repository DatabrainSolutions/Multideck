# Finance charge lifecycle: local verification, 25 September 2026

## Implemented locally

- Revisioned charge event queue with tenant-scoped immutable event history,
  bounded worker processing, retry backoff, review reasons and audited recheck.
- Separately proposed and independently approved initial-recognition mandate.
  Current completed-service evidence, policy, open period and dated nominal
  mapping are rechecked before native cost accrual or revenue WIP posting.
- Exact posted invoice links relieve the matching charge; credits and late
  changes require reviewed, independently approved dated corrections. An
  independently approved no-balance resolution closes an unchanged late case.
- Immutable prepared accounting close snapshot and independently authorised
  period lock, with native trial balance, charge subledger, AR/AP, bank,
  provider, queue and signed accounting-month VAT controls. Posted sources and
  posting lines in a locked period are protected by database triggers.
- Finance Dexter reads and deterministic watches for cases, corrections,
  mandates, resolutions and close evidence. Posting and approval remain in the
  Finance operator workflow.

## Checks performed

- `node --test supabase/tests/finance-charge-recognition-postgres.test.mjs`
  passed initial cost/revenue posting, duplicate denial, correction arithmetic,
  credit restoration, stale source revision, lock denial, tenant denial and
  independent no-balance resolution.
- `node --test supabase/tests/finance-accounting-period-close-postgres.test.mjs`
  passed independent close, stale and access denials, and posting-line
  insert/update denial after period lock.
- `node --test supabase/tests/finance-lifecycle-dexter-postgres.test.mjs`
  passed tenant-scoped reads, service-only execution, matched and unchanged
  signal behavior, paused watch and revoked-owner suppression.
- Charge queue and AR/AP control PostgreSQL tests passed, including CargoWise
  opening source exclusion, control totals, posted FX settlement, zero-delta
  control reclassification and tamper rejection.
- The VAT owner's real PostgreSQL fixture passed a monthly inventory and
  independent sign-off: a posted opening VAT line was classified, self-approval
  was denied, a second actor approved, and missing evidence on a later posted
  document changed status to blocked.
- `node supabase/tests/run-data-access-regression.mjs` passed 118 PostgreSQL
  tests and 10 boundary checks.
- `npm --prefix multideck.client run build` passed TypeScript and Vite.
- The WIP selector function was executed with assigned, unassigned and
  foreign-entity jobs. Accounting candidates returned only the exact entity's
  job; the assignment picker added the unassigned job while excluding the
  foreign one. The WIP/VAT entity-selection edits passed client TypeScript and
  `git diff --check`.
- `node --test supabase/tests/finance-job-entity-assignment-postgres.test.mjs`
  passed unassigned-job assignment, required reason, inactive actor,
  foreign-company entity and office denials, other-entity denial, service-only
  SQL execution, exact history/audit record and idempotent repeat.
- The 30-file non-VAT Finance 1–4 migration manifest installed over the tenant
  schema snapshot with RLS and function grants audited.
- Finance 4's `FINANCE_FULL_MIGRATIONS=1` integration test passed the complete
  non-VAT Finance migration chain through supplier invoice, purchase match,
  independently reviewed payment run and native cash posting after the close
  trigger fix.

## Development WIP outlier and demo scope

A read-only query of the documented development project found September job
`202609-48` with one costing line showing GBP 400,000,000 expected revenue and
GBP 2,500 expected cost. The job has no legal entity assignment or source
record reference. It has no linked finance document line, source document,
WIP release, management close-run item or direct posting batch. The original
record and its history were not changed.

The management WIP selector now requires the job's exact legal entity. An
unassigned job cannot enter any entity's new WIP proposal. In the App, a Finance
operator with `Finance.Management.Prepare` can open **Accruals & WIP → Assign job
period**, enter the exact job reference, choose the matching unassigned
job, inspect its status, record a reason and assign it to the selected legal
entity and management period. The service checks company, office and entity
scope and records job period history and an audit event. The assignment picker
never preselects a job. The job's provenance and amount need operator review
before assignment or financial use. For the native-only demo,
use a newly scoped job assigned to the separately reviewed native-only legal
entity, and show that job's charge, document and GL source IDs. Do not use
the existing Databrain Test entity's aggregate WIP as demo or close evidence.
This is local code and a development-data inspection, not a deployed denial
check.

## Release state and outstanding evidence

This work is locally implemented and tested. It has not been connected to a
tenant, deployed, enabled or confirmed live. Monthly VAT close remains blocked
until its exact inventory has no missing sources, unclassified lines, orphan
evidence or cut-off differences and a second finance operator approves the
current digest. Opening allocations remain blocked until their exact native FX
or control reclassification posting is independently approved. Authenticated
browser journeys, tenant migration preflight, worker execution against live
service data remain release checks. Provider readback is a separate check if
an accounting mirror is enabled; the native-only demo has no mirror. The current localhost
UI points at an older backend and shows `Accrual and WIP endpoint not found`;
it is not evidence of the new workflow running live.
