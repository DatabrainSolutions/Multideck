# Cost accrual controls — 22 September 2026

## Implemented and deployed to the demo backend

Project: MultiDeck (aqtwypsuijxlnvtxpuxe). Entity: Demo Organisation 021
(a8e98266-f5f4-4620-b45a-e3d991a38209), GBP. Linked ERPNext company:
Databrain Solution Ltd at https://demo-finance.multideck.app.

- Versioned under/over percentage and cash-cap policies; independent approval;
  separately authorised activation/pause. Default is disabled.
- Immutable service/final-invoice evidence, exact supplier/document matching,
  source fingerprints and confirmation history.
- Atomic finalisation of residual balances on EXISTING posted accruals. The
  £100 accrual / £96 invoice / £4 residual test debits the original accrual
  control and credits the original expense. Native balances and audit commit
  together. Concurrent workers/retries cannot duplicate the journal.
- Independent, exact-snapshot approval for tolerance exceptions. Hard blockers
  cannot be overridden. Current permissions are rechecked at execution.
- Existing tenant accounting worker processes bounded pending cases and a
  journal-delivery queue. ERPNext uses the existing pinned-identity, fenced
  journal exporter; explicit delivery failures require correction and retry.
- Arrival estimates connected to entity/supplier/charge-code evidence history,
  including censored outstanding charges. Insufficient history returns unknown.
  No LLM can authorise a posting.
- Database deferred constraints now enforce balanced double-entry postings.
- Local UI at localhost:3000 contains policy, confirmation and review controls.
  No hosted frontend deployment was performed.

## Verification performed

- Full mandatory data-access regression: 37 passed, plus 10 source/security checks.
- Model/worker/ERPNext adapter/reversal tests: 24 passed.
- Real PostgreSQL cost-control fixture covers company/entity access, colleague
  reads, anonymous/inactive/revoked denial, independent approvals, stale evidence,
  wrong supplier, period locks, exact amounts, immutable audit, concurrent
  finalisation, one balanced journal and prevention of recreated accruals.
- Client TypeScript and three changed Edge Function Deno checks passed.
- Provisioning baseline repaired with the actually missing historical party-sync,
  webhook receipt, party lifecycle and inbound migrations; no test assertion was
  weakened. The lifecycle fixture's redundant column creation was removed.
- Demo preflight found no invalid posted batches. Post-deployment RLS checks show
  all six new control tables protected, with no authenticated SELECT/INSERT grant.
- Authenticated Chrome: policy revision saved and read back; self-approval rejected
  by the server; partial service evidence saved with confirmation history and audit.
  Empty history displays unknown prediction rather than a fabricated percentage.
- Desktop and 390px mobile inspected; Escape closes the evidence modal. Chrome's
  native date entry needed an input/change-event helper in this automation tool.
  Fresh page console had no runtime errors (older session logs contained warnings).
- Security advisor reports six expected RLS-without-policy informational notices:
  these are deliberately service-only tables, not missing browser access policies.
  Existing unrelated security warnings remain outside this change.
- Confirmed Edge versions: finance-accruals 25, finance-ledger 2,
  accounting-party-worker 5, all ACTIVE; existing JWT settings retained.
- Existing ERPNext catalogue endpoint returned the linked company and active GBP
  accounts. This is connectivity/read proof, NOT posting/replication proof.

## Persisted demo test records

User explicitly authorised dummy accounting postings. So far only these control
records were created; no accounting posting or ERPNext journal was created:

- Policy revision 1, c763ea87-5091-443b-bf80-e202057dbf96, 5% AND £5 limits each
  direction, clearly marked DEMO QA 2026-09-22. Created by the signed-in Andrew;
  awaiting an independent approver. Automation remains OFF.
- Partial simulated service evidence for the existing internal test charge on
  job 202609-88. Clearly labelled QA; no final invoice asserted.

## Remaining verification and limitations

Connected end-to-end finalisation/ERPNext posting is NOT proven. A real second
approver must approve the test policy; no colleague's identity was impersonated.
The demo nominals still contain generic mapping hints (direct_cost, liability,
etc.) rather than exact ERPNext account IDs. Resolve these through audited finance
setup before posting. No broad mapping changes were made to force a passing test.

This worker does not replace initial accrual recognition: that remains the existing
approved period workflow. Late invoices/credits invalidate evidence and require
review; a dedicated correction/reopening workflow is not implemented. Zero-cost
write-offs without an invoice are intentionally blocked. Initial sales WIP and
full month-end reconciliation/close automation are outside this delivered slice.

Dexter can use existing general-ledger reads/watches for generated journals.
Dedicated policy/evidence/prediction chat actions and watches remain an explicit
unsupported exception. The local prompt explains this; agent-dexter was not
redeployed as part of the narrow finance deployment. The half-day close target has
not yet been demonstrated.
