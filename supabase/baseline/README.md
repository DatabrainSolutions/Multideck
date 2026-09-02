# Public schema baseline

`public-schema.sql` is a schema-only snapshot of the linked production project's `public` schema
after the client-to-Supabase migration. It contains no tenant business rows, Auth users, Storage
objects, or secrets. It does include the small Dexter capability registries and system rows that
are executable product configuration and are required before later Dexter migrations can run.

Use this snapshot to establish a new isolated tenant project, then apply only migrations created
after the latest baseline update. Do not replay the historical migrations over the snapshot because
their schema and required Dexter foundation rows are already included in it. Validate the baseline
and all later migrations in a data-free Supabase branch before provisioning a customer project.

## Company appearance provisioning

Company-appearance removal also requires
`20260902093000_company_brand_removal_fallback.sql` after this snapshot. It resets
only company-theme profiles when branding is removed and publishes existing
RLS-protected profile updates for open sessions. Do not omit it for new tenants.

## Calendar provisioning cut-over

The current snapshot predates `20260901164232_seamless_calendar_meetings_booking_links.sql`,
`20260901224717_calendar_foreign_key_indexes.sql`,
`20260901230000_calendar_operational_milestones.sql`,
`20260901233300_parallel_calendar_connections.sql`, and
`20260901234500_calendar_meeting_colours.sql`. Until an authoritative schema-only snapshot is
regenerated from a validated tenant branch, every new tenant must apply all five migrations in
timestamp order after `public-schema.sql`, then deploy `calendar-api`, `calendar-public`,
`calendar-oauth`, `calendar-webhook`, and `calendar-worker`. Do not copy the Calendar tables or the
service-only operational-milestone and bounded meeting-colour contracts into this snapshot by hand: the migrations also install
permission assignments, Dexter capabilities, event-driven watches, Vault helpers, durable delivery
functions, triggers, relationship indexes, and company-scoped Calendar ribbons that must remain
reviewed provisioning units.

Before promoting Calendar for a tenant, configure the provider callback origins and secrets, the
Calendar worker endpoint and secret, email delivery, and the exact tenant hostname. Run the booking,
provider, webhook, permission, and cross-tenant denial contracts in that isolated project. Once that
branch is accepted, regenerate `public-schema.sql` and remove this temporary cut-over note in the
same change.

Supabase-managed Auth and Storage schemas are not part of this dump. Configure Auth as invite-only,
apply the reviewed Storage bucket policies, deploy every Edge Function, set tenant-specific secrets,
and run the cross-tenant denial checklist before considering a tenant live.
