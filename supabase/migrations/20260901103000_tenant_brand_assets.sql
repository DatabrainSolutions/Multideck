begin;

-- Customer-facing brand marks are deliberately public: contact cards and
-- operational emails must be able to display them without exposing a tenant
-- session or a short-lived signed URL. Upload and mutation remain server-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-brand-assets',
  'tenant-brand-assets',
  true,
  2097152,
  array['image/svg+xml', 'image/png', 'image/jpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No browser write policy is created. The tenant-branding Edge Function uses
-- the service role after checking Settings.Manage and owns every mutation.

commit;
