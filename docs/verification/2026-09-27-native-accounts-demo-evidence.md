# Native Accounts fictional dev acceptance — 27 September 2026

## Scope and status

This is an authenticated local-app journey against the verified **development** Supabase project `aqtwypsuijxlnvtxpuxe`. The app ran at `http://localhost:3000` in Chrome. It is not evidence of a deployed tenant URL, a production customer, an external accounting provider, HMRC filing, or completed native posting. The founder authorised fictional demo data and a separate native-only legal entity. The existing Databrain Test entity and its ERPNext sandbox connection were left untouched.

The separate legal entity is **Multideck Accounts Demo (Sandbox)** (`a580d54c-280d-4b4b-bdda-5282cf41be20`), GBP/GB, explicitly marked fictional/native-only. Its external mirror mode is `disabled`, with zero `ACCI_Connections`. The `freight-forwarder-v1` chart has 29 template accounts and an active fictional masked GBP bank (`f89ab9a9-c2ab-4895-b72e-a3515d37164f`) linked to native nominal 1000 (`3e6f58bc-b734-455b-89ec-d18c7f06eb58`). September 2026 period `202609` (`38a86064-569b-4ae0-96d6-50cd3a28fdbc`) is open. Native ledger is enabled. Readiness remains **false**, with `tax_treatment` and `tax_advice` missing. No VAT number, tax treatment or qualified tax advice was invented.

Bootstrap data that the UI could not create was inserted directly in this verified dev project: the entity, open period, fictional bank, customer and supplier profiles, job, and charge line. Finance administration and approval policies used the protected finance RPCs; the supplier POs, invoice drafts, and AI proposal were created in the authenticated UI. This distinction matters when interpreting the audit trail. Automatic audit entries exist for the organisation/profile inserts, administration saves, policy saves and finance workflow writes; the direct entity/period/job/charge bootstrap should not be described as an operator UI journey.

## Fictional source records

| Record | Reference | ID |
| --- | --- | --- |
| Customer | Accounts Demo Customer Ltd (fictional), `MDAD-C-2609` | `202ceea7-719e-4b6a-a7b8-21466fceb5e1` |
| Supplier | Accounts Demo Carrier Ltd (fictional), `MDAD-S-2609` | `23b7e4b8-3690-4c3d-9c04-d079b6e75bac` |
| Road export job | `202609-90001` | `0f663284-305b-4235-823a-70745358644a` |
| Exact job charge | Fictional road freight service, GBP 100 expected buy / GBP 180 expected sell | `7c20fd67-e02e-4096-a28a-c48c36ffbb28` |

The purchase-order automatic policy is revision 1, cap GBP 150 (`f97ef456-18b6-47f2-8b43-d157e3f1cd7f`). The supplier-match automatic policy is revision 1, cap GBP 100 and zero variance (`63d8bcfe-bbbf-4c22-afed-5c0ad54e507c`). The document policy is `always_review`, revision 1 (`3e9dc47d-9823-4355-9f89-cbcc7e186999`). Other finance actions were not granted automatic approval.

## Observed browser and database results

1. In Supplier purchase orders, the GBP 100 `MDAD-PO-20260927-01` (`23cd3c3f-5d4c-4ad9-b0b7-97fe78848a51`) became **approved** automatically. Stored evidence says `within_policy`, `canAuto: true`, policy ID and revision 1. Its matched net is GBP 100. The GBP 175 `MDAD-PO-20260927-EX1` (`26926227-1df0-4249-904f-48e3b2b1a124`) stayed **draft** with `amount_limit`, `canAuto: false`. The maker's authenticated UI did not expose Approve on this draft. Both the UI and Edge handler contain a separate-reviewer check; a same-user 403 response was not exercised directly. [PO screenshot](screenshots/2026-09-27-native-accounts-demo/supplier-po-policy.png).
2. In Purchase ledger, supplier invoice `PI-000001` (`743e6b1a-d2a9-4cd3-a9ca-5e041a135399`) was saved as a GBP 100 **draft** against the exact supplier/job charge. Its tax status is pending. In Invoice matching, the governed `gpt-5-mini` proposal (`65026707-0d8d-4fbd-99f6-8e1d670a322a`, prompt `finance-po-match-v1`) cited the invoice and PO supplier, currency, net value and job. A protected automatic match check then approved the exact GBP 100 match (`3b1e3ddd-05c8-492a-846d-9c61018a70d9`) under the supplier-match policy. The UI showed the approved source-cited proposal and that the invoice already had an approved PO match. This changed neither tax nor posting status. [AI match screenshot](screenshots/2026-09-27-native-accounts-demo/ai-exact-match.png).
3. In Sales ledger, customer invoice `SI-000001` (`984f7920-6297-4f1b-bd23-60ac041ae833`) was saved as a GBP 180 **draft** against the same job charge and fictional customer. Its tax status is pending. Both invoice Submit attempts returned: “Finance must approve local tax advice and every line must use an approved effective treatment before review.” The supplier draft remained draft after the browser denial; the sales draft also remained draft after its denial. The purchase register visibly showed `Tax pending`, `draft` and `not queued`. The tax-guard screenshot is retained privately because the full register also displayed unrelated existing records and a signed-in user's details.
4. A protected PO creation request naming the **other** legal entity (`a8e98266-f5f4-4620-b45a-e3d991a38209`) with this demo supplier and job was denied: `Choose one active supplier account for this legal entity.` A readback found zero `MDAD-BOUNDARY-DENIAL` POs. This verifies the tested entity/party pairing boundary, not a full cross-tenant or colleague-role access matrix.

Final entity-scoped readback: two finance documents, both draft; zero cash transactions; zero posting batches; zero external accounting connections; zero opening balance packages. The existing Purchase ledger register also displayed other records available to this user in the dev tenant, so its aggregate balance is **not** a demo-entity balance. All evidence above uses exact IDs and the selected legal entity.

## Acceptance boundary

This demonstrates fictional setup, bounded PO approval, above-limit exception, source-cited AI exact match, cross-entity pairing denial, and the tax submission guard. It does **not** demonstrate supplier payment, customer receipt, bank statement matching or verification, native journal posting, financial statements, collections, or end-to-end completed Accounts. Those flows require reviewed UK tax advice and effective treatments before invoice submission, followed by the distinct reviewer for any exception. No provider mirror or HMRC interaction was attempted. Keep the fictional dev records available for that continuation; do not purge their audit trail.

The app and backend were connected locally to dev services. No claim is made that this browser journey is deployed or confirmed live on `dev.multideck.app`.

## Final checks

`PG_TEST_CONCURRENCY=1 node supabase/tests/run-data-access-regression.mjs` passed locally after this dev setup: 133 PostgreSQL/access tests and 9 boundary contracts, zero failures or skips. `git diff --check` passed. The authenticated Chrome flow and entity-scoped database readback above passed. The browser console contained repeated Chrome extension storage-access errors; the Accounts pages still rendered and returned the expected workflow responses. No app code was changed for this acceptance run.

## Hosted development follow-up — 27 September, 10:51 UTC

After PR #29 merged, Vercel reported `dev.multideck.app` aliased to READY Preview deployment `dpl_9fKSAq8UrE5PsM8pEJR67HdsAgPi`, built from `dev` commit `36632853c228217349de63985bec0482bfb3fa8c`, with no alias error. The hostname's `/.well-known/multideck-live.json` identifies `https://dev.multideck.app`, workspace `dev`, and Supabase project `aqtwypsuijxlnvtxpuxe`. This establishes the deployed client and intended dev backend identity for the follow-up, not a production release.

In an authenticated Chrome session on that hostname, **Controls & audit** loaded the fictional entity, native ledger Enabled, mirror Disabled, zero integrations, revision 2, and readiness `8 / 9 Needs setup`. The disabled-mirror explanation correctly said Multideck Accounts can be ready without a connection. **Supplier purchase orders** still showed the GBP 100 approved and fully matched PO and the GBP 175 draft exception. **Invoice matching** showed an `Approved PO match` for `PI-000001` against `MDAD-PO-20260927-01`, matched invoice net GBP 100, source match/PO IDs, and the approved source-cited `gpt-5-mini` proposal. The previously stale GBP 0 candidate and red unmatched-value warning were absent. **Purchase ledger** still displayed the demo supplier invoice as `Tax pending`, `draft`, ledger `draft` and mirror `not queued`; no hosted submit was attempted in this follow-up.

A fresh entity-scoped database readback found exactly two finance documents, both drafts; zero cash transactions, posting batches, and external accounting connections. The missing approved local tax advice and effective treatments still prevent invoice submission and any honest claim of payment, bank reconciliation, native journal or financial-statement completion. Only Chrome extension storage-access errors were observed in the browser console during the hosted checks. Hosted screenshots containing the signed-in user's identity were retained outside the repository under `/Users/andrewphillips/.codex/private-evidence/hosted-finance-20260927/`.

## Hosted integrated continuation — 27 September, 11:04 UTC

The same authenticated Chrome session on `dev.multideck.app` selected **Multideck Accounts Demo (Sandbox)** for each check below. These are hosted development observations, not a production acceptance or posting claim.

| Workflow | Exact hosted outcome | Limit |
| --- | --- | --- |
| Job profitability | Job `202609-90001` showed GBP 180 expected revenue, GBP 100 expected cost, GBP 0 actual revenue/cost, GBP 0 open WIP/accrual, and GBP 0 recognised gross profit. | The expected GBP 80 margin is an estimate, not posted profit. |
| Accruals & WIP | September period control calculated GBP 180 proposed revenue WIP, GBP 100 proposed cost accrual and GBP 80 adjusted management margin from the one fictional charge. The authenticated workflow prepared run `241fe0e3-2ded-4eac-9a4e-4bbf69be79ff` with an explicit fictional-estimate basis. The run is **draft** and has no posting batch. | No approval or journal posting occurred. The proposal requires source review and independent Finance approval before posting; zero recognised actuals remain. |
| General ledger and financial reports | Manual Journals showed “No journals yet”; the blank New journal form exposed only non-control accounts and Save draft/Post remained disabled. The financial report for January–September showed GBP 0 profit/loss, assets, and liabilities/equity and “No posted ledger activity in this period.” | A zero report is a valid empty-ledger read, not proof of a completed native accounting cycle. |
| Bank statement and reconciliation | The fictional `SANDBOX-GBP` bank and full September period loaded. Period control said **Incomplete**: “A complete period bank statement has not been imported.” The statement import required a CSV plus opening and closing balances and was disabled without them. | No genuine period statement or posted cash exists. A synthetic statement would falsely imply bank evidence; none was imported or verified. |
| Opening balance | The CargoWise migration flow requires a closing trial balance, source reconciliation, bank/tax/accrual evidence, then staged review and approval. This new fictional entity has no prior closing books; no opening package exists. | No supported nonzero balance or tax classification can be asserted from the current evidence. A manual journal cannot substitute for the controlled opening process. |
| Above-cap PO exception | `MDAD-PO-20260927-EX1` remained GBP 175 **draft**, `FINPO_ReviewedBy` null; the maker's hosted UI exposed no Approve action. The GBP 150 automatic cap therefore did not approve it. | A distinct authorised human reviewer is still required. No reviewer identity or approval was fabricated. |

Entity-scoped database readback after the WIP draft: one month-end review run in `draft`, zero manual journals, zero posting batches, and zero opening packages. The PO readback found the GBP 100 PO approved under its automatic policy and the GBP 175 exception still draft. Hosted WIP and bank-control screenshots were saved privately beside the earlier hosted evidence. The remaining tax, bank-source and independent-review dependencies were left intact.
