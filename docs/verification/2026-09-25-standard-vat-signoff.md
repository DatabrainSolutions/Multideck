# Standard VAT sign-off status — 25 September 2026

Status: not signed off. Cash Accounting is deferred at the product owner’s request.

## Verified this session

- Deployed `hmrc-vat-oauth` version 2 to the configured Databrain project `aqtwypsuijxlnvtxpuxe` after confirming its eight database RPC dependencies exist.
- Unauthenticated status requests return 401. Authenticated Chrome on localhost now displays “No HMRC VAT connection is recorded” instead of “Failed to fetch”. No business authority has been granted.
- Authenticated connection status now reports sandbox configuration readiness without exposing credentials. Chrome confirmed the missing-setup message and disabled connection action.
- Cash preparation panels and their queue fetch are disabled locally; the existing scheme registration and filing guards remain in place. Chrome confirmed the panels are absent and Standard is selected by default.
- Twelve OAuth/connection tests, eleven Standard calculation/period/prior-error tests, and client TypeScript build passed. These are local tests, not HMRC acceptance.

## Required before sign-off

1. Configure HMRC sandbox application credentials securely. The tenant secret-name inventory contains APP_URL but no HMRC-prefixed application settings. Government Gateway credentials must only be entered on HMRC’s site.
2. Complete the operator connection to obligation verification, dispatch, uncertain-result readback and receipt display. The server coordinators exist but are not wired to request routes/operator actions. This is implementation work, not merely configuration.
3. Establish verified fraud-prevention ingress and product-licence evidence. The current assembler deliberately rejects requests without these sources. HMRC’s web-app-via-server specification requires all applicable headers; do not invent client source ports or proxy addresses.
4. Verify a complete Standard operator journey: registration, quarter anchoring, evidence review, nine boxes, reconciliation timestamp and edit denial, VAT control, filing values, period lock, obligation, declaration, sandbox submission, receipt and uncertain-response recovery.
5. Verify the production approval and enablement process separately after sandbox acceptance.

The existing Databrain Test entity has no saved VAT registration, four posted lines missing VAT capture, and no prepared VAT period. No registration numbers, financial treatments or reconciliation decisions were fabricated to get past these controls.

Reference: https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/web-app-via-server/

## Sandbox connection verified at 14:53 UTC

HMRC sandbox organisation 674513329 was created through HMRC's test-user service with registration date 2018-09-25. The user authorised using it for Databrain Test. Standard registration initially failed because VAT audit record types were missing from sys_WorkflowRecordTypes; incremental migration 20260925145100 supplies the missing references without weakening the foreign key. Registration then succeeded through the operator screen. The data-access regression runner passed.

The sandbox application has VAT (MTD), Test Fraud Prevention Headers and Create Test User APIs enabled. Its exact tenant callback URI is saved on HMRC and Supabase; the user saved application credentials securely. OAuth was initiated from Multideck, the generated test credentials were entered only on HMRC, and the user completed the consent step. The server connection record is connected, authorised 2026-09-25 14:53:31 UTC, authority expires 2028-03-25, initial access token expires 2026-09-25 18:53:31 UTC. No token or password was included in this note.

This supersedes the missing-credentials and missing-registration blockers above. Obligation verification, submission controls, fraud-evidence integration, sandbox return/receipt and production approval are still incomplete. The callback returns to dev.multideck.app, whose deployed frontend currently lands on the home page; the local VAT workspace contains the current connection UI.

## Live Standard return attempt

Captured all four existing posted Databrain Test lines through the UI; missing captures fell from four to zero and four events entered review. Sources are SI-000003 (£1 net) and three SI-000002 lines (£3, £1, £2 net), all with £0 VAT. Review of SI-000003 using its 2026-09-18 document date was rejected: “The posted line has no currently approved UK VAT rule for that tax point.” Read-only database inspection established that DEMO-NONTAX has country GB and category zero_rated but tax type none. The VAT review requires tax type vat, so the rejection is correct. No review or reconciliation was saved and the tax code was not rewritten to force acceptance.

Eleven focused local tests passed: nine-box calculation cases, quarterly anchoring and the PostgreSQL period/evidence lifecycle. These do not establish a live return success. A meaningful live Standard test needs explicitly VAT-coded sales, purchases and credit scenarios with known expected box totals; existing non-tax demo lines must receive a supported disposition before the entity can clear coverage. No return was submitted.
