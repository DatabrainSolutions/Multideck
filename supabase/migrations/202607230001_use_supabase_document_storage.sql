-- Keep already-catalogued Azure rows unchanged: their provider code is required for any
-- deliberate content migration. New records are written to Supabase Storage by the API.

alter table if exists public."DOC_StoredObjects"
  alter column "DOCStoredObject_ProviderCode" set default 'supabase_storage';

comment on table public."DOC_StoredObjects" is
  'Canonical catalogue for document binaries stored in Supabase Storage (and any explicitly retained legacy provider).';
