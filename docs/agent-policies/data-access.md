# Shared operational data access

When changing record ownership, roles, permissions, RLS, shared-data queries,
registers or tenant provisioning, preserve the operator's ability to see and
open the company's shared work. Apply this across quotes, bookings, jobs, CRM,
customs, warehouse operations, documents, reporting and finance according to
each area's existing permissions. Never infer that creator or assignee means
exclusive visibility.

Personal mailboxes, notifications, favourites, private reports and watch history
remain personal. Financial approval/posting, administrative settings and external
customer access retain their explicit restrictions. Do not solve missing data by
disabling RLS, using a service-role client in the browser, granting blanket roles,
or weakening the physical tenant boundary.

For an affected surface, prove with a real database fixture that:

1. A standard permitted colleague can list, open and read another colleague's
   record and its child rows. Verify saved drafts and INSERT RETURNING where used.
2. Header, detail, attachments, search/register RPCs and Dexter use compatible
   boundaries. Preserve deliberately scoped providers and personal data.
3. Same-company reads do not imply write, approve, post, send or delete rights.
4. Foreign-company, inactive, unlinked and anonymous callers are denied. Revocation
   takes effect without waiting for the browser to sign out.
5. Deactivating a creator does not remove historical company records unless that
   record type has an explicit documented reason to do so.
6. Actual assigned role names have the required permission mappings. Do not test
   exclusively as an administrator or service-role caller.

Run `node supabase/tests/run-data-access-regression.mjs` before release. PostgreSQL
is mandatory; an unavailable database is a failure, not a skipped pass. The shared
operational and customs fixtures resolve current definitions from the migration
chain. Extend their fixture when changing dependencies, and add a real database
case to the runner for any newly affected data area or permission boundary.
Historical migration text assertions alone do not establish current behaviour.

Before and after applying access changes to a tenant, run the appropriate
read-only live probe (`supabase/tests/operational-access-preflight.sql` for quotes,
bookings and their related rows), or an equivalent role-aware probe for that area.
A live SQL probe is not browser journey proof. Record which areas are executable
database tests, source contracts, live probes and still unverified.

The GitHub `Data access regression` check must pass before merging access changes.
Do not bypass it or apply a migration directly to production to avoid a failed
check. Run the same command and record the intended tenant before any authorised
out-of-band database migration. New role assignments must remain explicit and
scoped to the users and permissions authorised for that workspace.
