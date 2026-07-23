-- Canonical metadata catalogue for files stored outside PostgreSQL. Binary content lives in
-- Supabase Storage; this table keeps every object discoverable, auditable and relinkable.

create table if not exists public."DOC_StoredObjects" (
  "DOCStoredObject_ID" uuid primary key default gen_random_uuid(),
  "DOCStoredObject_ConcernCode" varchar(40) not null,
  "DOCStoredObject_OrganisationID" uuid null references public."Org_Master"("Org_ID") on delete set null,
  "DOCStoredObject_AggregateType" varchar(80) not null,
  "DOCStoredObject_AggregateID" uuid not null,
  "DOCStoredObject_ProviderCode" varchar(40) not null default 'supabase_storage',
  "DOCStoredObject_Container" varchar(63) not null,
  "DOCStoredObject_BlobName" varchar(1024) not null,
  "DOCStoredObject_OriginalFileName" varchar(255) not null,
  "DOCStoredObject_MimeType" varchar(160) not null,
  "DOCStoredObject_FileSizeBytes" bigint not null check ("DOCStoredObject_FileSizeBytes" >= 0),
  "DOCStoredObject_SHA256" varchar(64) not null,
  "DOCStoredObject_ETag" varchar(160) null,
  "DOCStoredObject_VersionID" varchar(160) null,
  "DOCStoredObject_StatusCode" varchar(40) not null default 'active',
  "DOCStoredObject_CreatedAt" timestamptz not null default now(),
  "DOCStoredObject_CreatedBy" uuid null references public."cmp_Users"("User_ID") on delete set null,
  "DOCStoredObject_CreatedByPortalUserID" uuid null references public."Portal_Users"("PortalUser_ID") on delete set null,
  "DOCStoredObject_DeletedAt" timestamptz null,
  "DOCStoredObject_DeletedBy" uuid null references public."cmp_Users"("User_ID") on delete set null,
  constraint "DOC_StoredObjects_container_blob_key" unique ("DOCStoredObject_Container", "DOCStoredObject_BlobName"),
  constraint "DOC_StoredObjects_status_check" check ("DOCStoredObject_StatusCode" in ('active', 'quarantined', 'deleted'))
);

create index if not exists "IX_DOC_StoredObjects_scope"
  on public."DOC_StoredObjects" ("DOCStoredObject_ConcernCode", "DOCStoredObject_OrganisationID", "DOCStoredObject_AggregateType", "DOCStoredObject_AggregateID");
create index if not exists "IX_DOC_StoredObjects_sha256"
  on public."DOC_StoredObjects" ("DOCStoredObject_SHA256");

alter table public."DOC_StoredObjects" enable row level security;

drop policy if exists "Internal users can read document objects" on public."DOC_StoredObjects";
-- Internal access is intentionally API-only. The backend authorises company scope before
-- issuing a short-lived Supabase signed URL; no broad authenticated database policy is created here.

drop policy if exists "Portal users can read own document objects" on public."DOC_StoredObjects";
-- Portal access is API-only too. Business services enforce the specific order/job scope;
-- organisation membership alone is deliberately not enough to enumerate document metadata.

comment on table public."DOC_StoredObjects" is 'Canonical catalogue for document binaries stored in Supabase Storage.';
