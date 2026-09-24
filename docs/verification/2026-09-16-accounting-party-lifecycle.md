# Customer and supplier accounting lifecycle

Status: implemented locally, backend tests passed; not deployed. This is the
party-master stage of the wider two-way accounting integration, not full
accounting-system reconciliation.

## Delivered flow

1. Customer/supplier creation or changes to organisation, roles, CRM company
   scope, billing addresses or accounting preferences enqueue durable work in
   the same database transaction. A rollback also rolls back the sync intent.
2. Each applicable active connection gets separate customer/supplier jobs.
   Scope follows the CRM company and its explicit legal entity when present;
   a company-level account without an entity applies to active entities in that
   company. Inactive entities and deleted CRM profiles do not qualify.
3. The authenticated integration manager configures explicit ERPNext defaults
   and enables automatic sync. The tenant worker must also be deployed/enabled.
   Unsupported adapters become visible blocked jobs rather than claimed successes.
4. ERPNext uses a provider-enforced unique identity derived from tenant project,
   company, legal entity, organisation and role. Both customer and supplier
   identities are separate. An exact name match requires reviewed linking.
5. The worker creates or verifies the account, synchronises the selected billing
   address, reads the result back and checks owned fields and exact address links.
   Updating owned fields requires the previous verified snapshot to match the
   provider, and uses the provider's modified timestamp for concurrency checks.
   Foreign changes block instead of being overwritten.
6. Queue completion, mapping persistence and finance audit evidence are atomic.
   Lease tokens and source revisions reject stale completions. Uncertain creates
   recover by unique identity. Transient failures back off; blocked records need
   review. Expired leases can be reclaimed. A daily catch-up rechecks old verified
   accounts without resetting the pending backlog or active leases.
7. The existing register sync dialog shows verified/pending/attention counts,
   worker activation state, exceptions, recheck and configuration controls.
   Automatic account verification gates invoice/payment exports on enabled
   connections. The older manual wizard remains available when automatic sync
   is off; bulk name-only linking has been removed.

## Scope and limitations

Verified fields currently cover name, company-type classification, currency,
customer/supplier group, customer territory and the selected billing address
including phone/email. They do **not** prove tax IDs, credit limits, payment
terms, bank details, contact records, GL/control-account settings or all
provider-only records match. The worker does not delete provider records or
silently disable them when an organisation is archived or blocked.

A single active address is used; with several addresses, a unique default
billing address (or a single billing-role address) is required. Ambiguity blocks.
Provider addresses shared with another party block because this integration
must not overwrite another account's address.

The queue is provider-neutral. ERPNext has the new automatic adapter. Sage 50
has existing manual HyperExt creation/bulk paths, but automatic verified Sage
sync remains explicitly unsupported until equivalent uniqueness, readback and
recovery guarantees are implemented. Other providers fail closed.

Provider changes are detected by scheduled readback or an explicit recheck.
The earlier webhook receiver still only retains events; a general inbound
consumer, reviewed adjustments and full GL/trial-balance/subledger/cash/tax
reconciliation are outstanding. Document delivery and party-master health must
never be presented as complete ledger reconciliation.

## Dexter

Completed attempts reuse `ACCI_SyncRuns`/`ACCI_SyncEvents`, existing company-safe
finance reads and deterministic watch signals. The database test exercises the
actual finance reader and watch trigger: matching events, duplicate finalisation,
paused/resumed watches and foreign-company isolation. Queue/configuration reads,
retries and provider identity adoption are explicitly unsupported Dexter
capabilities; the prompt directs users to Account checks rather than claiming
access or performing unauthorised provider writes.

## Live observations

Read-only browser inspection on 16 September confirmed
`demo-finance.multideck.app` runs ERPNext **16.34.2** and Frappe **16.33.1**.
Selling Settings has blank Default Customer Group and Default Territory.
No ERPNext configuration, customer, supplier or accounting data was changed.
Supplier defaults, integration-key permissions and actual API delivery remain
unverified.

Relevant sources were checked against the installed versions:

- [Frappe REST implementation](https://github.com/frappe/frappe/blob/v16.33.1/frappe/api/v1.py)
- [Frappe document concurrency checks](https://github.com/frappe/frappe/blob/v16.33.1/frappe/model/document.py)
- [ERPNext Customer fields](https://github.com/frappe/erpnext/blob/v16.34.2/erpnext/selling/doctype/customer/customer.json)

## Deployment order and acceptance

1. Confirm the intended tenant project and exact ERPNext company/site. Run
   role-aware company/connection probes before and after the migration.
2. Apply `20260915154425_accounting_party_lifecycle.sql` and deploy
   `accounting-party-worker` plus `finance-subledger` and the updated Dexter prompt.
   The exact migration is included in the provisioning snapshot.
3. Install/review the three definitions in
   `supabase/integrations/erpnext/party-identity-fields.json`. Confirm unique
   database indexes exist and the existing integration identity can read the
   required metadata and read/create/update Customer, Supplier and Address.
   Do not grant broad administrator access to make a failing test pass.
4. Configure explicit Customer Group, Supplier Group and Territory in the
   Multideck sync dialog. Existing ERPNext records require exact reviewed mapping;
   when automatic sync is enabled that workflow attaches the stable identity.
5. Configure the tenant-only worker with the service-only
   `multideck_accounting_configure_worker(endpoint, true)` RPC. The endpoint is
   the intended project's `/functions/v1/accounting-party-worker` URL. The RPC
   generates a Vault secret and schedules the tenant worker every minute.
   Its endpoint must match the worker's own `SUPABASE_URL` or requests fail closed.
6. Verify the demo customer and supplier lifecycle: create, change name/address,
   repeat a delivery, lose a create response, revoke a connection, remove a role,
   edit externally, and restore a reviewed mapping. Confirm no duplicate account,
   exact saved values, audit/watch evidence and export blocking on exceptions.
7. Clear the existing client merge conflicts before building/deploying the UI,
   then test actual happy/error/empty/pending states, keyboard and mobile layouts
   in both English variants. Check browser console/network and persistence.

Rollback: disable automatic sync per connection and disable the worker through
`multideck_accounting_configure_worker(endpoint, false)`. Preserve queue, mappings,
audit evidence and provider identity fields. Do not delete provider accounts.

## Verification

- 21 new checks passed: 16 provider/scope tests, four worker authentication and
  tenant-endpoint tests, and one real PostgreSQL lifecycle test.
- The existing 20 document-delivery and webhook-receipt tests passed.
- Data access regression: 34 passed, no skips (24 main and 10 filtered contracts).
- Backend Deno checks passed for the worker and finance endpoint.
- Changed client files pass TypeScript syntax transpilation. This is not a full
  application type check or a browser verification.
- Full client build is blocked by pre-existing conflict markers in
  `account-operations-workspace.tsx` and `organisation-foundation-panel.tsx`.
  Those concurrent edits were preserved.
