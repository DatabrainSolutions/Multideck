# Public schema baseline

`public-schema.sql` is a schema-only snapshot of the linked production project's `public` schema
after the client-to-Supabase migration. It contains no application rows, Auth users, Storage
objects, or secrets.

Use this snapshot to establish a new isolated tenant project, then apply only migrations created
after the snapshot date. Do not replay the historical migrations over the snapshot because their
changes are already included in it.

Supabase-managed Auth and Storage schemas are not part of this dump. Configure Auth as invite-only,
apply the reviewed Storage bucket policies, deploy every Edge Function, set tenant-specific secrets,
and run the cross-tenant denial checklist before considering a tenant live.
