# ERPNext inbound processing and delivery recovery

## Status

Account creation and address replication are deployed and verified against
**Databrain Solution Ltd** at `https://demo-finance.multideck.app`. The active
Multideck project is `aqtwypsuijxlnvtxpuxe`, scoped to Demo Organisation 021;
the connection remains sandbox. Full two-way accounting reconciliation is **not
signed off**. The client changes are tested locally against the live backend;
no client deployment is claimed.

## Live rollout evidence, 17 September

- Six unique hidden/no-copy ERP identity fields are installed across Customer,
  Supplier, Address, Sales Invoice, Purchase Invoice and Payment Entry.
- A dedicated integration role grants Custom Field read and Supplier
  read/create/write. The original metadata/supplier 403 failures are resolved.
- All original **17 customer/supplier role jobs** have completed party and
  accounting-address readback. Twelve legacy mappings were reviewed using their
  exact existing ERP IDs, then adopted through revision and provider-version
  checks. The worker verified the resulting changes; adoption alone never
  marked a record synced.
- User-authorised fictional default billing addresses were added for Happy
  Ending Solutions Ltd, Morning Wood Ltd, Demo Organisation 027 and Demo
  Organisation 010, preserving existing operational addresses. They are labelled
  fictional demo data, not for delivery. Existing accounting addresses take
  precedence. The user reconfirmed on 17 September that these changes should stay.
- The database now requires an unambiguous accounting address with line 1,
  town/city and a recognised country for customer/supplier CRM records. Role,
  address, purpose and preference changes cannot remove the last valid address.
  The ordinary atomic creation flow remains supported. Postcodes are optional
  because the platform supports countries without postal codes.
- Chrome happy path: created `Multideck accounting sync acceptance 20260917`,
  organisation `10d23ab3-eaba-4ddf-ba40-70c378a2eaba`, through the customer wizard.
  The background worker created and read back its ERP customer and address.
  The queue now shows **18 verified, zero pending, zero party exceptions**.
  Blank-address creation is disabled; complete address enables creation.
- Four signed `on_change` webhooks are enabled for Sales Invoice, Purchase
  Invoice, Payment Entry and Bank Account, conditioned on the exact company.
  The signing secret is configured privately. Unsigned requests return 401.
- Created labelled **unposted** ERP draft `ACC-SINV-2026-00007` (£1) and changed
  its test remarks. Its real HMAC-signed notification was retained at
  `2026-09-17T21:22:15Z`. The worker correctly produced a visible review issue
  because it has no linked Multideck transaction; no Multideck posting occurred.
  The ERP draft remains unsubmitted. Frappe excludes inserts from `on_change`;
  initial-creation coverage and missed-event recovery remain outstanding.
- Deployed finance-subledger v48, accounting-party-worker v4, erpnext-webhook v11
  and agent-dexter v281. The finance deployment preserves the existing live code
  outside this integration and excludes unrelated local billing-party corrections.
  Dexter's prompt was patched into its current live bundle without reverting
  unrelated newer capabilities.
- The private worker runs every minute. Finance exports now reserve an expiring
  unique attempt and complete queue, batch, item, reference, document mirror
  status, delivery issues and audit together. Expired workers cannot finish a
  reclaimed attempt. Success requires retained ERP readback evidence.
- Twelve standard-user visibility probes pass before and after migration.
  Counts remain bookings 88, booking register 86, quotes 33, quote register 33,
  routing 46, cargo 24, quote lines 19, documents 77. Organisations increased
  from 21 to 22 only because of the labelled customer acceptance record.
- The security advisor has existing unrelated warnings; no new export RPC is
  reported as browser-executable or having a mutable search path. Service-only
  accounting tables intentionally have RLS without browser policies.
- Existing blocked documents still need party/charge mapping review. A live
  retry of PI-000001 correctly stops before provider mutation because Recycling
  Buddy is not a verified supplier for this connection.

### Applied migration history

| Local migration | Live version |
| --- | --- |
| `20260915104214_erpnext_webhook_receipt_guardrails.sql` | `20260917201414` |
| `20260915154425_accounting_party_lifecycle.sql` | `20260917201418` |
| `20260917194628_erpnext_reconciliation_and_inbound.sql` | `20260917201423` |
| `20260917205326_require_accounting_address.sql` | `20260917205950` |
| `20260917210443_accounting_party_identity_review.sql` | `20260917211155` |
| `20260917212723_finance_export_atomic_completion.sql` | `20260917213732` |

Do not reapply these migrations under their local timestamps. The provisioning
baseline includes their exact contents. Unrelated pending migrations were not
bulk-applied.

## Changes

### Connected invoice acceptance, 18 September

- Fixed draft charge options and aligned sales/purchase filtering with the
  catalogue's `sell`, `buy`, `both` and `pass_through` values. The backend returns
  active controlled charges through the existing permissioned draft workspace.
- The tenant catalogue was empty. Added explicitly non-commercial sandbox charge
  `MULTIDECK-DEMO`, with an audited preparation event and `DEMO-NONTAX` treatment.
  Created ERPNext non-stock item `MULTIDECK-DEMO-SERVICE` through its UI, named
  `Multideck Demo Service — non-commercial`, and saved its sales mapping to the
  existing `Service - DSL` account through Finance administration (revision 10).
- Created £1 draft `SI-000003`, ID `06ee7252-0f57-4b1e-a842-0cfec34b91e3`, through
  the real invoice form, sent it for review, and approved it. Multideck posted
  batch `8101542d-18d7-4e49-bd3e-c1aec12c6f4a`: £1 receivable debit and £1 income
  credit. Its initial external attempt correctly blocked on the missing mapping.
- After saving the mapping, Retry mirror created and submitted exactly linked
  ERPNext invoice `ACC-SINV-2026-00008`. Retained readback matched at
  `2026-09-18T09:08:07.959Z`; queue attempt 2 is synced, lease cleared, error cleared,
  and the canonical approved snapshot is retained. The local UI shows Ledger
  posted and Mirror synced with the external record link.
- ERPNext's General Ledger view for that exact voucher shows £1 debit to
  `Debtors - DSL`, £1 credit to `Service - DSL`, and zero net imbalance. This is a
  manual check of this acceptance voucher, not an automated whole-ledger result.
- The real signed return event `ec03d9ac-9f95-4982-a37f-2c3710b47b4e` arrived at
  `09:08:08Z` and completed at `09:08:11Z` on its first attempt. Fresh provider
  readback matched with no differences, explicitly `fullLedgerReconciled: false`.
- Exact v48 deployment hash:
  `acb393735c558b6e0ffe0866b48ca930b38e141b85daa7036ac5b25f3cc6f21c`.
  Its deployment bundle passes the backend type check; the 18 September client
  production build passes with existing bundle-size warnings. Client remains local.

### Receipt and recovery safeguards

Connected receipt acceptance on 18 September also passed:

- ERPNext had no bank ledger child for this company. Created non-group Bank
  account `Multideck Sandbox GBP - DSL`, currency GBP, under `Bank Accounts - DSL`.
  Saved explicit sales mappings for local demo bank
  `b8df8e1e-425e-4f20-a394-284d0d63fd20` and `receivables_control` → `Debtors - DSL`
  through Finance administration (revisions 11–12).
- Created and approved `RCPT-000001`, ID `2eff5893-895f-4522-bc21-0e31b69a5189`,
  for £1 allocated exactly to SI-000003. Its bank reference is
  `SANDBOX-ACCEPTANCE-20260918-NO-REAL-MONEY`; no real funds moved.
- Multideck posted the receipt, cleared its unallocated amount and the invoice's
  outstanding amount to zero, and mirrored submitted Payment Entry
  `ACC-PAY-2026-00006`. Exact readback matched at `2026-09-18T09:17:33.161Z`,
  including the £1 reference to `ACC-SINV-2026-00008`. The signed Payment Entry
  return event matched on its first worker attempt at `09:18:10Z`.
- The invoice's separate settlement event deliberately remains a review exception:
  its retained original outstanding balance was £1 and is now zero. The current
  consumer does not yet reconcile approved cash allocations against subsequent
  invoice balance changes. Do not suppress this issue or call full settlement
  reconciliation complete because payment delivery matched.

- Service-only incoming-event claims use five-minute leases, bounded retries and
  expired-worker fencing. An interrupted eighth attempt can still be recovered.
- The worker reads the current ERPNext document; signed webhook amounts are never
  treated as accounting authority. Late events cannot replay old financial state.
- New deliveries retain the approved canonical comparison snapshot. Echoes are
  checked against this snapshot and the current submitted provider document.
- Cancellations, unknown provider records, changed amounts, settlement changes,
  bank-account events and legacy deliveries without a comparison snapshot require
  review. Provider failures retry, then create an explicit review issue.
- Completion, review issue and audit event are atomic. Completion rechecks the
  active connection, legal entity, site binding and unchanged delivery evidence.
- Incoming processing never posts, imports, cancels, pays or adjusts Multideck's
  approved books. A matched delivery is explicitly not full ledger reconciliation.
- Provider decimal tokens remain strings during readback, preserving their exact
  values before comparison instead of first rounding them through JavaScript.
- New ERPNext documents have a provider-enforced unique Multideck identity. Lost
  creation responses and concurrent requests recover the same document. The
  identity is read back before submission. Missing unique fields block creation.
- Failed external references can retain their ID without a false successful-sync
  timestamp; the migration corrects the previous NOT NULL mismatch.
- The account-sync dialog includes incoming-change counts and review messages.
  Missing backend checks show an integration-update message and disable bulk sync.
- Two existing merge-conflict markers were resolved, preserving both the
  Multideck Live tab and Main Details changes, and office-update preservation.
  The index remains unmerged until the owner's staged changes are reviewed/staged.

## Verification

- Focused party, identity, signed receipt, inbound and readback tests pass.
  The latest export group has 17 passing checks, including real PostgreSQL
  atomic rollback, stale lease, replay, revoked actor, foreign company, changed
  connection/source, cash completion and delivery-issue isolation.
- Full PostgreSQL access regression: 36 checks pass, no skipped fixtures.
- The receipt fixture covers claim exclusion, expired leases, stale tokens,
  terminal idempotence, retry exhaustion, eighth-attempt recovery, reference
  fencing, entity revocation and connection-isolated health.
- The address fixture verifies atomic creation, role-specific selection,
  ambiguous/invalid addresses, removal prevention and browser-role denial.
- The review tests verify stale revision/provider changes, exact identity,
  revoked scope, replay, audit and queued rather than false verified status.
- Backend type checks pass, including the exact finance deployment bundle.
  Client production build passes with existing bundle-size warnings.
- The broad historical finance source-contract suite still contains unrelated
  UI/copy expectation failures. These are not presented as a passing full suite.
  Changed queue mock tests were replaced with stronger real PostgreSQL checks.
- Chrome confirms customer creation and automatic replication, accounting-address
  validation, reviewed identity adoption, successful account statuses and the
  real incoming review exception, and the invoice approval, blocked mapping,
  recovery, provider submission and matching signed return journey. Responsive
  layouts, credit and supplier-payment acceptance remain unverified. The customer
  receipt acceptance evidence above covers the simulated £1 receipt only.

## Dexter parity exception

Receipt-level details, retries, review resolution and receipt-specific watches
are explicitly unsupported in both chat and Watching for you. The prompt says
so and directs operators to Finance setup. Existing supported document evidence
and deterministic account-sync signals remain available. No generic table access,
new financial write, automatic approval or polling LLM has been introduced.
A future receipt capability must add scoped reads and the policy's complete watch
lifecycle tests before removing this exception.

## Ordered rollout prerequisites

1. Resolve the acceptance-company choice and confirm the tenant connection scope.
2. Install `party-identity-fields.json` and `document-identity-fields.json` in the
   intended ERPNext site before deploying the new creation guard. The API user
   needs the corresponding document operations and Custom Field metadata reads.
3. Apply the three incremental receipt, party lifecycle and inbound migrations
   in order after the tenant access preflight; do not bulk-apply unrelated pending
   or duplicate migrations in this checkout. The provisioning baseline contains
   the exact tested migrations.
4. Deploy the finance service, signed receiver and worker with their dependencies
   together; deploy the client and accurate Dexter capability prompt without
   overwriting newer unrelated live changes.
5. Configure the worker's tenant-specific secret/endpoint, reviewed customer and
   supplier groups, territory and existing identity adoption. Do not turn on a
   worker with guessed defaults or mappings.
6. Configure signed ERPNext document events with doctype, name, company, modified
   and event; preserve original signed UTF-8 payloads. Verify receipt, processing,
   exception visibility and duplicate delivery on the named acceptance company.
7. Run a customer and supplier create/update journey, invoice/credit and cash
   delivery, timeout recovery, cancellation/drift, revoked access and recovery.

## Remaining work before full integration sign-off

- Full GL/trial-balance reconciliation with explicit nominal mappings, complete
  paginated provider reads, opening balances and a consistent accounting cutoff.
- Receivable/payable balances, allocations, cash/bank controls and tax control
  totals reconciled in both directions, including provider-only transactions.
- Reviewed inbound resolution/import workflow and automatic missed-event recovery.
- Complete party finance settings parity, including tax identity, payment terms,
  credit limits and control-account requirements.
- Deploy the client, cover initial ERP record creation and run end-to-end
  invoice, credit and cash acceptance; resolve legacy invalid finance parties.
- Complete responsive and role-aware browser acceptance.

MTD/VAT statutory submission certification and Sage 50 delivery remain separate;
neither is claimed by these checks.

## External-change check — 18 September 2026

The requested live check used the existing active connection for **Databrain
Solution Ltd**, in Supabase project `aqtwypsuijxlnvtxpuxe`. A fresh audited party
recheck completed for all **18** customer/supplier links (14 customers and four
suppliers), with successful readbacks between 12:10:46 and 12:12:21 UTC. No
conflicts were reported for the identity, supported master fields and accounting
addresses covered by that worker. This does not verify credit limits, payment
terms, tax identities or every provider field.

ERPNext's company-filtered sales register showed only `ACC-SINV-2026-00006` and
`ACC-SINV-2026-00008` as posted records, both already linked to Multideck, plus
the unposted test draft `ACC-SINV-2026-00007`. The company-filtered purchase
register was empty. The journal register displayed no entries. The payment
register included the already linked acceptance payment
`ACC-PAY-2026-00006`; its other five entries belonged to the separate Demo
company and were not imported. These UI register checks are not a complete,
paginated ledger reconciliation or deletion audit.

The invoice settlement event remains in review because the inbound evaluator
compares its original outstanding snapshot with the current provider balance.
The corresponding £1 payment and allocation already exist in Multideck, so
another import would duplicate the receipt. No review exception was dismissed
and no additional financial record was created during this check.

This tenant has only the ERPNext connection: no Sage 50 connection is present.
The target Sage company and secure HyperExt configuration location were requested.
Consequently no live Sage read, import or reconciliation has been claimed.
Reviewed reverse imports and missed-event catch-up remain implementation gaps,
as recorded in the client integration requirements.

## Provider references

Frappe documents its [HMAC-signed webhook transport](https://docs.frappe.io/framework/v14/user/en/guides/integration/webhooks)
and [document REST reads](https://docs.frappe.io/framework/user/en/guides/integration/rest_api).
Those transport features do not themselves provide accounting reconciliation.
