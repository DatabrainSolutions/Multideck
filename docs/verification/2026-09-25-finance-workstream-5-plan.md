# Native Accounts demonstration and Finance release acceptance

Owner: Finance workstream 5. Prepared 25 September 2026 for the Sunday 27 September
demonstration decision. The user subsequently prioritised a fully integrated
native Multideck Accounts journey in the app over ERPNext mirroring. External
provider parity and Sage 50 are separate release questions; their safety
guards stay enabled. UK VAT filing/HMRC remain a separate release, while the
accounting-month VAT control is part of the native close journey. This plan
records checks to perform, not passing evidence.

## Release identity and evidence rules

- Record Git commit, dirty-file inventory, migration range, built client version,
  deployed App and Edge Function versions, exact App hostname, Supabase project
  reference, legal entity and provider company. Prior verification names the
  MultiDeck demo project `aqtwypsuijxlnvtxpuxe`; confirm that it is the intended
  target before any tenant operation. Never infer it from a matching name.
- Keep **local unit/source contract**, **real PostgreSQL fixture**, **disposable
  tenant provisioning**, **intended-tenant read-only probe**, **authenticated
  operator journey**, **connected provider**, and **deployed version** as distinct
  evidence classes. A pass in one class does not satisfy another.
- Capture command, time, target, fixture or record IDs, expected result, actual
  result and failure details for each gate. Redact credentials and private
  financial details in owner-facing evidence. Tests must fail when PostgreSQL
  is unavailable; an omitted check is unverified, never passed.
- Do not apply access migrations without the intended-tenant before/after
  role-aware probe and passing `node supabase/tests/run-data-access-regression.mjs`.
  A disposable project must be verified empty before baseline provisioning.

## Integrated gates

| Gate | Required proof | Owner dependency |
| --- | --- | --- |
| Native books and migration | Approved source-bound opening batch; exact GL/AR/AP/bank/accrual controls; balanced atomic postings; no duplicate control posting; mapped charge from setup through document, journal and reports; FX, credits, reversals, stale mappings, locked periods and retry. | Finance 1 |
| Native cash and bank | Approved receipt and payment from open AR/AP, exact allocation and native cash journal; imported bank lines, matched cash, opening and closing bank ledger control, reviewed sign-off, and a deliberate mismatch that blocks verification. Linked-provider delivery must remain guarded for the native-only demo entity. | Finance 2 |
| Accrual, WIP and close | Initial recognition, £100/£60/£36/£4 cost case, mirrored revenue case, partial/final/credit/late correction, exact relief and idempotency; job subledger to GL control; independently approved close pack, unresolved exception gate and closed-period denial. Automation stays off until tenant policy/cutover and connected posting proof. | Finance 3 |
| Daily Finance and AI | Supplier PO/invoice match, payment/remittance, statement/collections, aged AR/AP and job profit in operator UI; reviewed proposals have source file/record IDs, field or line/page provenance, model/prompt version, proposal time, reviewer and override reason; posting remains deterministic and permissioned. | Finance 4 |
| Access and Dexter | Standard permitted colleague can list/open another colleague's finance records and child rows; read-only user cannot approve/post; foreign company/entity, inactive, revoked and anonymous users are denied. Dexter reads same scoped source evidence, writes only allowlisted approved actions, and event-driven watch match/non-match, once-only, pause/resume and isolation pass. Unsupported capabilities answer clearly. | All |
| Development rollout and operator demo | Intended development tenant has expected migration history and before/after role-aware probes; a clearly labelled native-only legal entity has no active accounting connection; exact App/Edge versions and authenticated maker/reviewer journeys pass, including failure and recovery, mobile, keyboard and console/network checks. | All, after stable handoff |

## AI assurance evaluation

Use a retained, permission-safe fixture of representative supplier invoices,
credits, POs, payment candidates, collection cases and known exceptions. Record
the source ID and expected fields/matches before suggestions run. For each
proposal type measure eligible cases, suggestion coverage, exact-match accuracy,
unsafe false positives, missing provenance, operator acceptance, override rate
and override reasons by model/prompt version. Include duplicate documents,
conflicting POs, wrong legal entity, changed source after proposal and low-quality
OCR. A missing source or stale revision must block approval. Do not infer release
quality from a demo or a model's confidence alone. Suggestions cannot choose a
tax treatment, silently alter a posted amount, approve their own result or trigger
accounting from a watch. Human decisions and deterministic ledger results remain
auditable independently of the model.

## Development demonstration target proposal

**Preferred:** create an active, non-default `Multideck Accounts Demo (sandbox)`
legal entity under the existing development company, with GB/GBP identity,
no company registration or VAT number invented, and a clear non-statutory demo
marker. Keep **Databrain Test** and its ERPNext connection unchanged. Verify
the new entity has zero `ACCI_Connections` and reviewed mirror mode `disabled`,
so a later connection cannot silently enable delivery. Initialise its chart from the existing
`freight-forwarder-v1` template (including 1000 bank, 1100 AR, 2000 AP,
1200/2100 tax and 4000/5000 trading nominals), then add the actual/accrued
accounts needed for WIP. Configure one explicitly synthetic GBP clearing bank
mapped to 1000, with no real bank identifiers, plus document sequences and
review controls. Start with zero opening balances and use only labelled,
plausible sandbox transactions. Use the App's permissioned Finance
administration workflow for chart, bank, settings and audit after a controlled
creation of the entity; review its draft before saving.

**Tax decision remains required before a posted invoice:** the existing
database tax guard requires either an approved entity-specific revision with
`localAdviceConfirmed=true`, or the narrow `DEMO-NONTAX` exception for an
active ERPNext sandbox connection. The proposed unlinked entity qualifies for
neither. A synthetic zero-tax invoice cannot bypass this guard. A qualified
finance reviewer must approve the exact GB VAT treatment and effective date
for the proposed test transaction, including a genuine zero/out-of-scope case
if one is used. Until then the operator can save a tax-pending draft and see
the review block; approval, native posting, cash, VAT control and close cannot
be claimed as connected end-to-end proof for that entity.

**Fallback:** temporarily set the existing Databrain Test mirror mode to
`disabled` through reviewed Finance administration, retain its active sandbox
connection, and restore the setting after the demonstration. The queue trigger
would suppress *new* document/cash mirror rows while disabled, but existing
queued rows remain independently processable. That book already has three
approved or submitted documents outside the native ledger (zero cash gaps),
three blocked mirror queue rows and an
implausible historic WIP test job. Its trial balance and management totals
therefore cannot substantiate a clean Accounts close even if new labelled
native transactions post successfully. Review the queue and snapshot before
and after any temporary setting change; never delete or rewrite history to
make the demo look clean.

## Execution order and decision

1. Receive stable file/migration/test handoffs from Finance 1–4; preserve VAT and
   concurrent edits. Review the combined diff and migration order.
2. Run focused local contracts and PostgreSQL fixtures, then the serial full data
   access regression. Run client type/build and relevant Edge parsing checks.
3. Rehearse the full post-snapshot migration chain on local PostgreSQL. On the
   intended development tenant, run read-only preflight and compare migration,
   function and configuration versions before applying the reviewed chain.
4. Establish a clearly labelled native-only demo legal entity without changing
   the existing ERPNext-linked books. Exercise authenticated maker/reviewer
   workflows, cash-to-bank-to-GL control, month-end and AI review with deliberate
   discrepancies and recovery. Check cross-entity and revoked access.
5. Verify exact deployed App/Edge versions and repeat the operator journey at
   `dev.multideck.app`. Obtain finance-owner review of opening balances,
   unresolved discrepancies, close pack and AI error cases. Publish a native
   demo go/no-go separately from full provider/production release readiness.

**Native demo no-go** if a mandatory accounting balance/control differs without
approved explanation, a user crosses an access boundary, an AI proposal lacks
source/reviewer audit or bypasses approval, an unapproved automation posts,
the demo entity's mirror isolation is ambiguous, or deployed versions and
authenticated outcomes are unverified. A local implementation can pass while
the connected demonstration remains no-go.

**Full provider/production release remains separate:** exact ERPNext opening
subledger parity, the residual opening journal, Sage 50 coverage, live model
quality, fresh project provisioning and production deployment are not claims
of the native demonstration. Existing provider paths must fail closed on
incomplete evidence and must not be weakened to make the demo pass.

## Local Finance 1–4 migration manifest

The committed schema snapshot already contains the earlier Finance cost,
nominal, journal, charge, management and reporting patches. After its documented
journal split and reporting-access fix, apply these Finance 1–4 files in order:

1. `20260925070431_finance_accrual_wip_event_queue.sql`
2. `20260925070458_finance_daily_operations.sql`
3. `20260925070532_charge_mapping_cutover_posting.sql`
4. `20260925071010_finance_accounting_period_close.sql`
5. `20260925071153_opening_balance_gl_cutover.sql`
6. `20260925072009_linked_journal_reversals.sql`
7. `20260925072017_finance_trade_control_reconciliation.sql`
8. `20260925072611_immutable_committed_native_postings.sql`
9. `20260925072948_charge_lifecycle_processing.sql`
10. `20260925073046_versioned_charge_mapping_cutovers.sql`
11. `20260925073443_charge_recognition_authority.sql`
12. `20260925073707_dated_charge_group_accrual_posting.sql`
13. `20260925073708_charge_event_initial_recognition.sql`
14. `20260925074532_charge_lifecycle_review_replay.sql`
15. `20260925075054_reviewed_charge_lifecycle_corrections.sql`
16. `20260925075621_opening_source_items_and_operational_markers.sql`
17. `20260925075945_full_open_item_cutover.sql`
18. `20260925080000_bank_statement_reconciliation.sql`
19. `20260925080343_opening_trade_control_bridge.sql`
20. `20260925080746_finance_lifecycle_dexter_parity.sql`
21. `20260925081349_finance_charge_case_no_balance_resolution.sql`
22. `20260925081955_finance_charge_case_dexter_parity.sql`
23. `20260925083019_finance_linked_full_opening_guard.sql`
24. `20260925083125_accounting_period_vat_control_signoff.sql`
25. `20260925083450_finance_opening_fx_settlement.sql`
26. `20260925083833_accounting_period_vat_control_dexter_parity.sql`
27. `20260925084337_opening_trade_control_fx_settlement_bridge.sql`
28. `20260925085000_finance_opening_mirror_delivery.sql`
29. `20260925090000_finance_provider_period_reconciliation.sql`
30. `20260925100000_finance_reconciliation_dexter.sql`

`supabase/tests/finance-release-manifest-postgres.test.mjs` installs this chain
on a local PostgreSQL instance and checks the resulting tables, functions,
triggers and service-only grants. The manifest is **provisional** while the four
workstreams are active. It excludes UK VAT, the Cloud-owned tenant identity
contract, Edge Function packages and hosted Auth settings. On an existing tenant,
compare installed objects and migration content before choosing the actual
incremental application plan; local filename order is not proof of its state.

## Inventory on 25 September

- The checkout has extensive uncommitted UK VAT work; no VAT file is owned by this
  workstream. Finance 1–4 are active in the same saved checkout.
- PostgreSQL 17.11 binaries are available locally. The focused
  `finance-export-atomic-postgres.test.mjs` fixture passed on this host. There is
  no local database listening on the usual 54322 or 5432 ports and no App server
  on port 3000 at inventory time; fixtures create their own databases.
- A preliminary Finance/Dexter source run passed 96 checks after repairing the
  watch-definition test's Node loader. The test had directly imported ESM
  TypeScript under the repository's CommonJS package setting and failed before
  executing; the loader now strips types into an ESM data module. No production
  watch logic changed. These preliminary checks must be rerun after handoff.
- The early serial `PG_TEST_CONCURRENCY=1 node
  supabase/tests/run-data-access-regression.mjs` passed 102 PostgreSQL/access
  cases and 10 boundary contracts. This run predates stable Finance 1–4
  migrations and therefore does not satisfy the final integrated gate.
- An additional real PostgreSQL fixture now installs the schema-only baseline
  in its documented journal order and checks current Finance management,
  release, charge, customer projection, trigger, uniqueness and service-role
  boundaries; it passes locally. Five broad contract suites that previously
  expected historical `BEGIN MIGRATION` text in the schema dump now assert
  current snapshot objects as well; their 25 focused cases pass together.
  The fixture is now included in the shared access runner.
- A second PostgreSQL fixture installs the current Finance 1–4 manifest
  over that snapshot and verifies representative objects and service-only
  boundaries. It passed locally on 25 September and is included in the shared
  regression runner. This does not install a complete hosted Supabase tenant.
- At 07:40 UTC on 25 September, `PG_TEST_CONCURRENCY=1 node
  supabase/tests/run-data-access-regression.mjs` passed 109 PostgreSQL/source
  cases plus 10 targeted boundary contracts, including the combined Finance
  manifest, opening balances, charge event queue, close, AR/AP control and
  daily Finance workflows. This is a local checkpoint while peers continue
  editing, not a final release pass or intended-tenant result.
- Four further Finance migrations for recognition authority, dated accrual
  posting, initial event recognition and Dexter reconciliation were added after
  that full access run. The now sixteen-file manifest installed in isolation on
  PostgreSQL at the next checkpoint; lifecycle replay and reviewed correction
  migrations, source-item intake and opening-mirror delivery then brought the
  provisional manifest to twenty-three files. The full access suite must run again after
  workstream handoff.
- The 25 September combined client `npm run build` passed TypeScript and Vite
  after Finance 3 completed its in-progress components. Broad
  `finance-*-contract.test.mjs` source contracts passed 91/91 after the
  concurrent VAT copy assertion was aligned. These are local checkpoints, not
  authenticated, connected or deployed verification.
- The current twenty-two-file manifest, including full open-item cutover and
  opening trade-control bridge, installs over the local schema snapshot. Its
  gate enumerates every new Finance table and verifies RLS is enabled, browser
  roles have no direct read/write grant, and the service role can read it. This
  does not exercise cutover approval/posting or actor-level tenant access.
- The next twenty-three-file manifest also installs Finance lifecycle Dexter
  parity and audits every newly installed public function. Anonymous execution
  is denied throughout. Authenticated execution is allowed only for the two
  explicitly reviewed reconciliation-watch readers, which check the signed-in
  user's company and Finance view permission; all other new functions deny it.
- The twenty-fourth file adds approved, audited resolution of charge cases
  whose reviewed source change has no balance effect. The 24-file manifest
  installed and passed the table/function privilege audit locally on 25
  September; it remains provisional until the peer handoffs settle.
- A twenty-fifth file adds scoped Dexter read/watch coverage for those resolved
  charge cases. The 25-file manifest installed and passed the same local
  privilege audit on 25 September. Finance 3 confirmed that accounting close
  must continue to block on VAT control: the VAT workstream has a return-period
  review RPC, not a signed whole-accounting-period clearance contract.
- Finance 3 has since added a separately reviewed accounting-month VAT control
  migration. Its VAT inventory call is guarded so the Finance-only migration
  chain installs without the separate VAT stream and returns `unavailable`
  until that inventory is present. Focused two-person, stale evidence and
  unresolved inventory tests pass; combined VAT-chain and deployed evidence
  remain pending. Finance 1's linked opening guard is also in the provisional
  manifest, with an opening FX settlement migration still in development.
- The subsequent 29-file manifest includes the linked opening guard, monthly
  VAT sign-off and Dexter parity, and source-control/FX settlement correction.
  It installed over the local baseline and passed RLS/function-grant auditing
  on 25 September. The owners' focused lifecycle and combined VAT-chain tests
  are still running; this is an install/access result only.
- The 29-file chain also passed the full-migration daily payment fixture
  (1/1), including independent payment-run approval and native cash posting.
  This does not exercise the new linked opening or FX settlement control path.
- The thirtieth file bridges reviewed FX settlement into opening trade-control
  reconciliation. Its owner reports focused PostgreSQL coverage for a posted FX
  gain, source-control reclassification and tamper rejection. The 30-file
  manifest then installed over the local baseline and passed RLS/function-grant
  auditing (1/1) at 08:50 UTC. Finance 1/3 also report a passing full opening
  chain where EUR cash first remains unreconciled, a reviewed later-period
  correction moves local 108 to source AR 100 and credits realised FX 8, and
  the current bridge verifies. These are local results, not dev-tenant evidence.
- A thirty-first Finance migration requires Dexter's invoice/credit and cash
  draft actions to name the exact legal entity. The 31-file Finance manifest
  passed a clean schema-only PostgreSQL install on 25 September, and the
  separate staged Finance/VAT chain passed its PostgreSQL source-lock fixture.
  Neither result establishes that the development tenant has been migrated.
- `FINANCE_FULL_MIGRATIONS=1 node --test
  supabase/tests/finance-daily-operations-postgres.test.mjs` now exercises the
  ordered non-VAT Finance chain on local PostgreSQL through supplier invoice,
  PO match, prepared payment run, independent approval and native cash posting.
  Its first run found a close trigger reading a batch-only field on a posting
  line. After Finance 3 patched that trigger, the integrated run passed 1/1 on
  25 September. Finance 3 is adding a focused line and locked-period regression;
  rerun this integration check after the remaining workstream changes settle.
- Finance 4 committed its scoped daily Finance and AI match work as `50da65d3`.
  Its final local checks passed the focused daily/model/warehouse cases (9/9),
  the full-chain payment path (1/1), client TypeScript and the Finance
  operations Edge Deno check. A live model response and deployed operator
  workflow remain unverified.
- Finance 2 committed bank/provider reconciliation as `8e1e2dde` and tighter
  opening source-item parity as `b2dc8192`. Its full access run passed 118
  PostgreSQL cases plus 10 boundary contracts, with client TypeScript and
  focused tests passing. Missing, wrong-type or draft ERPNext invoice/payment
  readback for an opening source remains incomplete, with exact source/package
  references exposed for review. No connected period run is claimed.
- Finance 2 also committed `3cbdf96c`, which rejects `full_open_items` mirror
  delivery before any ERPNext Journal Entry write, including a package already
  queued under older code. GL-only opening delivery remains available. Finance
  1's separate batch-post guard is under focused regression; both guard the
  unresolved provider double-count risk.
- Finance 1 committed `e829a8ee` after full opening/FX review. Its real
  PostgreSQL cutover fixture passes customer gain and supplier loss settlement,
  closed-period correction denial, exact source-control GL and the verified
  trade bridge. The migration manifest installs and client TypeScript passes;
  authenticated App review and dev rollout remain outstanding.
- The only active development legal entity, **Databrain Test**
  (`a8e98266-f5f4-4620-b45a-e3d991a38209`), has an active sandbox ERPNext
  connection. A native-only demonstration therefore needs an isolated entity
  with no accounting connection or a separately reviewed mirror policy change.
  Before adding another active entity, the App must accept an explicit scoped
  selection throughout document/cash drafts, intake, bank, reports, WIP/close,
  VAT and Dexter. Two `finance-subledger` singleton gates were found in draft
  creation and options; the Edge selection now checks an active entity in the
  signed-in company and options returns all active entities. Document, cash and
  supplier-intake forms now pass the explicit entity; Dexter's draft action
  schema and handler require it. The WIP assignment picker also accepts an
  exact unassigned job reference for the selected entity with audited scope
  checks. These are local changes: controlled entity provisioning and connected
  two-entity denial checks are still pending. The current dev WIP data includes
  an implausible historic test job, so its aggregate totals are unsuitable as
  demo proof.
- `.vercel/project.json` names `multideck-app-dev`. The client `.env` contains
  public Supabase URL/key entries only and does not itself establish a production
  tenant slug, exact hostname or authorised deployment target.
- Existing source documents describe ERPNext invoice/cash delivery and party
  sync, but mark full two-way period reconciliation as unfinished. Sage 50 has a
  supported customer onboarding connector; document posting is still listed as
  planned. Prior demo backend evidence is historical and requires fresh version
  and connection checks for this release.
- Read-only connected inventory found the MultiDeck demo project's last listed
  migration at `20260924151855_booking_confirmation_scope_and_snapshot`.
  Finance Edge versions at inventory were `finance-subledger` 49,
  `finance-ledger` 6 and `finance-accruals` 25. The Vercel
  `multideck-app-dev` production target was READY at Git commit `73b42b00`,
  but the actual `dev.multideck.app` alias resolved to READY deployment
  `dpl_HWJGgWS1P3W7JZ9ZXb1T9Fnc61B7` at Git `395c0edf` on branch `dev`,
  with no alias error. Both predate Finance 1–4 work; the production target
  should not be mistaken for the development alias version.
- Finance migration names in the local checkout and demo project are not a
  one-to-one timestamp match. Several older local Finance migrations are also
  absent by name from the demo history, including accounting-party profile
  guards and provider catch-up. A release manifest must compare installed
  objects and migration content, resolve those historical gaps and order new
  Finance 1–4 files explicitly; `db push` by filename alone is unsafe.
- The existing `Multideck Provisioning Test Sep 2026` project already has
  migration history and cannot serve as an empty-project baseline proof.
- Chrome opened both the latest Vercel deployment URL and its project alias.
  Each `/auth` page displayed “This deployment is not authorised for this
  workspace domain.” No credentials were entered. Prior release evidence named
  `dev.multideck.app` as the approved development host; that hostname loaded
  an existing signed-in operator session and the deployed Finance navigation
  in a read-only Chrome preflight. The tab was closed. The existing live version
  still needs exact deployed commit/asset verification after the new release;
  the demo project's migration target must still be explicitly confirmed.
- A read-only query against that documented development project found one
  active ERPNext accounting connection for a GB/GBP legal entity, and no Sage 50
  connection. The entity has open August, September and October 2026 periods
  with posted batches. No provider API was called and no reconciliation run
  was recorded. This is candidate test context, not selection of a safe period
  or proof of ERPNext/Sage parity.
- A fresh read-only connection identity check matched the 17 and 23 September
  sandbox verification records: the same connection and legal entity still
  report `sandbox`, `https://demo-finance.multideck.app`, `Databrain Solution
  Ltd`, GB and GBP. Those records describe labelled £1 sandbox journal,
  invoice and payment acceptance tests. Any new connected smoke test must use
  explicit test records and retain its source identity; this identity check
  does not establish period parity or remove the linked cutover blocker.
- The full CargoWise open-item path has an explicit GB historical-VAT safety
  dependency. Its separate VAT exclusion migration is outside this Finance
  manifest. The development entity is GB, so a Finance-only installation must
  leave full open-item posting blocked until the VAT stream's exclusion and
  prior-filing controls are installed and independently verified.
- A matched opening mirror journal covers the trial-balance GL entry only.
  Full CargoWise cutover also creates operational opening invoices and
  unapplied cash. Until those source items have exact ERPNext identities and
  readback, the provider period comparison should flag missing documents or
  payments. Full external parity remains no-go on the current path; a journal
  match alone cannot clear it.
- Finance 1/2 identified a linked-opening double-count risk: the native full
  trial balance contains AR/AP control balances, while mirroring that full
  journal **and** individual opening invoices/payments would create those
  controls twice in the provider. Linked full cutover must remain fail-closed
  until a reviewed residual/clearing journal and exact provider item identities
  are implemented and tested through period comparison. The development entity
  has an active ERPNext connection, so this is a live-path gate there.
- Finance 1 also found native cash settlement currently resolves receivables
  and payables controls to fixed nominal codes 1100/2000. A CargoWise opening
  source may carry different reviewed controls, so later settlement could move
  the wrong GL account and distort realised FX. Full cutover of nonstandard
  control nominals stays no-go until the posting mapping and settlement cases
  preserve the exact approved control identity; Finance 1 is adding a
  fail-closed guard in the interim.
- A second read-only schema preflight found all eighteen sampled prerequisites
  for this Finance chain present on the development project, including native
  journals/posting batches, accrual and WIP tables, cost controls, nominal
  mappings, bank statement tables, Dexter signals and the core access/posting
  functions. This resolves basic object absence, not the divergent historical
  migration-name/content comparison or actor-level access proof.
- Fourteen sampled prerequisite columns for documents, cash, bank statements,
  posting and provider connections are present. Three existing posting and
  cost functions sampled from the development project deny `authenticated`
  execution and allow `service_role`. These are narrow before-migration
  checks; all new grants and representative actor journeys still need proof.
- The same development project has none of six sampled new Finance 1–4 tables
  (opening packages, supplier POs, AI proposals, charge lifecycle queue,
  provider period runs and accounting close reviews). No new Finance migration
  has been applied there in this workstream. The local test cannot be treated
  as an installed-tenant result.
- A wider read-only check on 25 September found none of the 21 tables created
  by the current Finance manifest on that development project. This
  confirms the release tables are absent before rollout; it does not establish
  identical definitions for the pre-existing functions those migrations replace.
- Vercel alias inspection found `dev.multideck.app` on a preview deployment
  from the `dev` ref, while the same Vercel project also owns
  `multideck.app`/`production.multideck.app`; the current `multideck.app`
  alias points to a manually rolled-back production-target deployment built
  from a different `dev` commit. Vercel Settings show production branch
  tracking is `main`, automatic custom production domain assignment is off,
  and `dev` belongs to Preview with `dev.multideck.app` assigned to that
  branch. A development frontend release must verify the new deployment is
  Preview, confirm **only** the intended development alias moves, and check
  the production aliases before and after. Do not invoke production promotion.
