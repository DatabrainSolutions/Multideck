# Public schema baseline

`public-schema.sql` is a schema-only snapshot of the linked production project's `public` schema
after the client-to-Supabase migration. It contains no tenant business rows, Auth users, Storage
objects, or secrets. It does include the small Dexter capability registries and system rows that
are executable product configuration and are required before later Dexter migrations can run.

Use this snapshot to establish a new isolated tenant project, then apply only migrations created
after the latest baseline update. Do not replay the historical migrations over the snapshot because
their schema and required Dexter foundation rows are already included in it. Validate the baseline
and all later migrations in a data-free Supabase branch before provisioning a customer project.

Supabase-managed Auth and Storage schemas are not part of this dump. Configure Auth as invite-only,
apply the reviewed Storage bucket policies, deploy every Edge Function, set tenant-specific secrets,
and run the cross-tenant denial checklist before considering a tenant live.
