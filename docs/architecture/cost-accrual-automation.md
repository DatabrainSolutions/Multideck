# Charge-level cost accrual automation

## Outcome and current delivery boundary

Target: a half-day month-end review, supported by daily exception resolution rather
than a half-day promise irrespective of missing supplier evidence. Multideck owns
the ledger; an accounts package is a mirror, not a second posting authority.

The earlier residual-finalisation pilot is deployed to the demo backend with
automation off. The September 25 event-driven lifecycle described below is
implemented and locally tested, but has not been deployed or enabled for a
tenant. It retains the reviewed period workflow alongside approved event
recognition. See `docs/verification/2026-09-22-cost-accrual-model.md` for the
earlier pilot and `docs/verification/2026-09-25-finance-charge-lifecycle.md`
for the new local verification state.

## Accounting model

- Keep individual charge records linked to legal entity, job, supplier, charge
  code, expense nominal, accrual-control nominal, service evidence and currency.
- Include a job in management WIP only when it is explicitly assigned to the
  selected legal entity. Unassigned legacy jobs require audited assignment
  after source review; a company or office match does not establish ownership
  by every legal entity in that workspace.
- Map many charge codes to a small number of accrual controls. Do not create a
  nominal per job/charge instance. Allow a tenant to use one control or several
  categories; a mapping is reviewed, never inferred from a nominal's name.
- Preserve original estimate, every revision, cumulative actuals, outstanding
  accrual, finalisation decisions and reversal history. Missing historical
  original estimates remain unknown; today's estimate is not relabelled original.
- The accounting balance and commercial remaining estimate are different fields.
  An unposted expected cost belongs in management expectations, not automatically
  in statutory expense. Confirm the tenant's service-recognition rule before GL
  automation is enabled. Booked/confirmed is not necessarily service performed.
- Use local net excluding tax for expense/accrual matching. Source currency and
  locked exchange-rate evidence must remain available. Separate FX differences
  from supplier price variance; do not silently consume one in the other.

For estimate E, cumulative matched actual A and already-posted open accrual B:

- Partial/awaiting invoice: target outstanding estimate = max(E − A, 0).
- Approved final: target accrual = 0; recognised cost = A.
- Incremental GL adjustment = target accrual − B, not a fresh posting of E.
- Positive adjustment: debit original expense, credit accrual control.
- Negative adjustment: debit accrual control, credit original expense.
- £100 initially accrued, £96 invoiced and £96 already relieved leaves B=£4.
  Finalisation debits accrual £4 and credits the original expense £4. No extra
  revenue or miscellaneous-profit nominal is created.

Do not also reverse the full £100 after the existing invoice workflow already
relieved £96. Import existing open accrual balances once; do not run old period
accrual generation and a new continuous engine over the same charges.

## Human-in-the-loop policy

The model accepts entity/base-currency policy revisions with independent under-
and over-estimate percentage limits and absolute caps. Both limits must pass,
including exact boundaries. There is no assumed tenant approval or default live
tolerance. Automated finalisation additionally requires explicit final invoice
evidence, exact matching, completed service, an open period, verified nominals,
no dispute/credit/cancellation and mirror readiness where required.

Outside tolerance requires a named authorised approver and reason. Approval binds
to entity, charge, policy revision and a server-owned snapshot revision. Any
source change invalidates it. A client-provided approval object is never posting
authority: the database executor reloads the persisted approval, rechecks the
actor's current permissions and compare the entire snapshot while holding locks.
The pure model only generates proposals; it does not authenticate or post them.

Human override cannot bypass a locked period, missing mapping, mismatched supplier,
dispute, unsupported currency treatment or stale evidence. Zero-cost/no-invoice
write-offs require their own evidence/approval path, not an artificial final invoice.

## Event lifecycle and worker boundary

Implemented: persisted final confirmations feed a bounded queue processed by the
existing secret-authenticated tenant accounting worker. Atomic SQL reloads source
evidence, policy, current permissions, open period and original nominal pair, then
creates one balanced residual journal and audit. Exact-snapshot exception approvals
can clear tolerance-only exceptions. Provider I/O happens after native commit.
Source-table locks conservatively prevent concurrent invoice/link phantoms and
have a two-second lock timeout; this needs load testing before wider rollout.
The queue is scheduled deterministic database work, not recurring LLM evaluation.

Charge, service, job, document, invoice-link, policy and adjustment events now
coalesce into one tenant-scoped revisioned queue case. The bounded worker
recognises cost accrual or revenue WIP only under a separately approved mandate,
fresh completed-service evidence, current dated nominal mapping and an open
accounting period. Native double-entry posting, immutable recognition evidence
and audit commit together. The existing reviewed period workflow remains for
charges without event recognition and is guarded against duplicate recognition.

Posted exact invoice links relieve only the matching charge's open cost accrual
or revenue WIP. Credits, changed estimates and late source events enter review;
an independently approved correction posts the exact delta to an open period
using the original nominal pair. A no-balance late case also requires a recorded
reason and independent approval before the queue is settled. Source revisions,
tenant scope and current permissions are rechecked at approval. A locked period
is never silently reopened or amended.

The native close pack checks trial balance, charge subledger controls, AR/AP,
bank and provider status, pending charge cases and source freshness before an
independent period lock. A separate monthly VAT inventory classifies exact
native VAT-control postings, opening balances, evidence and cut-off differences;
an independently approved digest is required for a GB accounting close. A VAT
return review is not that control. Provider mirroring remains separately
evidenced and must pass its own reconciliation gate where enabled.

## Ageing intelligence

The statistics kernel estimates invoice arrival within a horizon conditional on
the invoice still being outstanding at the current age. Kaplan–Meier treatment
includes censored/open observations; excluding them would bias the result.
Minimum sample and at-risk counts and observation-horizon coverage are required.
Insufficient evidence returns unknown, never a fabricated percentage.

The history pipeline must cohort by tenant/entity, supplier and charge code, use
actual service and received-invoice timestamps (not planned delivery or accounting
date), distinguish first/partial/final arrivals, and exclude invalidated records.
Tenant data is not pooled without a separate authorised design. Backtest against
held-out later periods and surface sample size, age, evidence and calibration.
No model probability authorises releasing a genuine obligation. A human may use
the evidence to chase a supplier or investigate whether the liability still exists.

## Month-end operating target

Daily: resolve missing matches/mappings, review finals, chase aged items and clear
mirror failures. Month end: reconcile charge subledger to accrual controls, SL/PL
to their controls and banks; review material exceptions; approve dated adjustments;
lock the period and retain a reproducible close pack. Track reconciliation
differences, unresolved exception value/count, auto-handled proportion, mirror
failures and actual reviewer time. Only describe the half-day target as achieved
after real tenant closes meet it without hidden suspense or unexplained balances.

## Dexter boundary

The finance domain now reads charge cases, corrections, recognition mandates,
no-balance resolutions and close evidence with source identifiers. Deterministic
watches follow persisted status and revision changes. Recognition evidence,
mandate approval, corrections, case resolution and close approval remain manual
Finance actions because they require source review and an independent colleague.
Historical invoice-arrival predictions remain unsupported chat reads and watches.

## Release gates

- Real PostgreSQL lifecycle tests for posting deltas, concurrent invoices, duplicate
  events, stale approvals, estimate edits, partial/final invoices, credits,
  cancellation, zero-cost release, late invoices, period locks and mirror failure.
- Full access regression, exact audit registration, tenant-aware migration preflight,
  schema baseline coverage, adapter readback and authenticated UI journeys.
- Per-tenant policy approval and an explicit cutover from existing period accruals.
- No live enablement until all gates pass, including tenant migration preflight,
  signed monthly VAT source coverage and end-to-end posting verification.
