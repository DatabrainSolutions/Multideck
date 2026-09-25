# Finance 1–4 release acceptance plan

Owner: Finance workstream 5. Prepared 25 September 2026 for the Sunday 27 September
release decision. UK VAT and HMRC filing are outside this decision and remain a
separate release. This plan records checks to perform, not passing evidence.

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
| Cash and mirrors | Imported bank lines, matches and reconciled bank control; deliberate missing/duplicate/amount/status/allocation/tax/nominal discrepancies; complete ERPNext period inventory including trial balance and AR/AP/cash; partial pages, stale cursor and changed connection never verify; provider-only change and concurrent conflict enter reviewed workflow; retry retains provider identity. Sage 50 must have connected proof for supported paths and an explicit unsupported boundary for the rest. | Finance 2 |
| Accrual, WIP and close | Initial recognition, £100/£60/£36/£4 cost case, mirrored revenue case, partial/final/credit/late correction, exact relief and idempotency; job subledger to GL control; independently approved close pack, unresolved exception gate and closed-period denial. Automation stays off until tenant policy/cutover and connected posting proof. | Finance 3 |
| Daily Finance and AI | Supplier PO/invoice match, payment/remittance, statement/collections, aged AR/AP and job profit in operator UI; reviewed proposals have source file/record IDs, field or line/page provenance, model/prompt version, proposal time, reviewer and override reason; posting remains deterministic and permissioned. | Finance 4 |
| Access and Dexter | Standard permitted colleague can list/open another colleague's finance records and child rows; read-only user cannot approve/post; foreign company/entity, inactive, revoked and anonymous users are denied. Dexter reads same scoped source evidence, writes only allowlisted approved actions, and event-driven watch match/non-match, once-only, pause/resume and isolation pass. Unsupported capabilities answer clearly. | All |
| Provisioning and deployment | Fresh isolated project installs baseline and later migrations, roles, RLS, reference data and functions; intended tenant has expected migration history and role-aware read-only probes; exact deployed versions and authenticated browser journeys pass, including failure and recovery, mobile, keyboard and console/network checks. | All, after stable handoff |

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

## Execution order and decision

1. Receive stable file/migration/test handoffs from Finance 1–4; preserve VAT and
   concurrent edits. Review the combined diff and migration order.
2. Run focused local contracts and PostgreSQL fixtures, then the serial full data
   access regression. Run client type/build and relevant Edge parsing checks.
3. Rehearse the full post-snapshot migration chain in a verified disposable
   project. On the intended tenant, run read-only preflight and compare migration,
   function and configuration versions before any authorised application.
4. Exercise authenticated operator and connected ERPNext journeys with deliberate
   discrepancies and recovery. Test available Sage 50 paths against its exact
   connection. Check cross-tenant and revoked access before/after changes.
5. Verify the deployed App/Edge versions and rerun critical journeys there. Obtain
   finance-owner review of opening balances, unresolved discrepancies, close pack,
   AI error cases and provider scope. Publish go/no-go with each unverified gate.

**No-go** if a mandatory accounting balance/control differs without approved
explanation, a partial provider read turns green, a user crosses an access
boundary, an AI proposal lacks source/reviewer audit or bypasses approval, an
unapproved automation posts, intended-tenant identity is ambiguous, or deployed
versions and connected outcomes are unverified. An implementation can be accepted
as a local increment while the release remains no-go.

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
  whereas this checkout was `395c0edf` plus uncommitted work. Those versions
  do not establish deployment of the new workstreams.
- The existing `Multideck Provisioning Test Sep 2026` project already has
  migration history and cannot serve as an empty-project baseline proof.
- Chrome opened both the latest Vercel deployment URL and its project alias.
  Each `/auth` page displayed “This deployment is not authorised for this
  workspace domain.” No credentials were entered. An exact authorised tenant
  App hostname and test session are needed for authenticated operator proof.
