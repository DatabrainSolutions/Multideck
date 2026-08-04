-- Server-owned commercial-invoice extraction records. Uploaded PDFs are kept in the
-- existing private document bucket only for the duration of the provider request;
-- normalized results are cached by exact document hash, model and schema version.

begin;

create table if not exists public."Customs_InvoiceExtractions" (
  "CUSTIE_ID" uuid primary key default gen_random_uuid(),
  "CUSTIE_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CUSTIE_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CUSTIE_DeclarationID" uuid null references public."Customs_Declarations"("CUST_id") on delete set null,
  "CUSTIE_SourceExtractionID" uuid null references public."Customs_InvoiceExtractions"("CUSTIE_ID") on delete set null,
  "CUSTIE_StoredObjectID" uuid null references public."DOC_StoredObjects"("DOCStoredObject_ID") on delete set null,
  "CUSTIE_FileName" varchar(255) not null,
  "CUSTIE_MimeType" varchar(160) not null default 'application/pdf',
  "CUSTIE_FileSizeBytes" bigint not null check ("CUSTIE_FileSizeBytes" > 0 and "CUSTIE_FileSizeBytes" <= 10485760),
  "CUSTIE_SHA256" varchar(64) not null check ("CUSTIE_SHA256" ~ '^[0-9a-f]{64}$'),
  "CUSTIE_RequestedModel" varchar(80) not null,
  "CUSTIE_ProviderModel" varchar(80) null,
  "CUSTIE_SchemaVersion" integer not null check ("CUSTIE_SchemaVersion" > 0),
  "CUSTIE_StatusCode" varchar(24) not null default 'processing'
    check ("CUSTIE_StatusCode" in ('processing', 'ready', 'failed', 'cancelled', 'expired')),
  "CUSTIE_ResultJSON" jsonb not null default '{}'::jsonb check (jsonb_typeof("CUSTIE_ResultJSON") = 'object'),
  "CUSTIE_UsageJSON" jsonb not null default '{}'::jsonb check (jsonb_typeof("CUSTIE_UsageJSON") = 'object'),
  "CUSTIE_TimingsJSON" jsonb not null default '{}'::jsonb check (jsonb_typeof("CUSTIE_TimingsJSON") = 'object'),
  "CUSTIE_PageCount" integer not null default 0 check ("CUSTIE_PageCount" >= 0),
  "CUSTIE_FailureCode" varchar(80) null,
  "CUSTIE_CreatedAt" timestamptz not null default now(),
  "CUSTIE_UpdatedAt" timestamptz not null default now(),
  "CUSTIE_CompletedAt" timestamptz null,
  "CUSTIE_ExpiresAt" timestamptz not null default (now() + interval '30 days'),
  constraint "CK_Customs_InvoiceExtractions_source_not_self"
    check ("CUSTIE_SourceExtractionID" is null or "CUSTIE_SourceExtractionID" <> "CUSTIE_ID")
);

create index if not exists "IX_Customs_InvoiceExtractions_owner_created"
  on public."Customs_InvoiceExtractions" ("CUSTIE_CompanyID", "CUSTIE_UserID", "CUSTIE_CreatedAt" desc);

create index if not exists "IX_Customs_InvoiceExtractions_expiry"
  on public."Customs_InvoiceExtractions" ("CUSTIE_ExpiresAt")
  where "CUSTIE_StatusCode" in ('ready', 'failed', 'cancelled');

create index if not exists "IX_Customs_InvoiceExtractions_declaration"
  on public."Customs_InvoiceExtractions" ("CUSTIE_DeclarationID")
  where "CUSTIE_DeclarationID" is not null;

create index if not exists "IX_Customs_InvoiceExtractions_source"
  on public."Customs_InvoiceExtractions" ("CUSTIE_SourceExtractionID")
  where "CUSTIE_SourceExtractionID" is not null;

create index if not exists "IX_Customs_InvoiceExtractions_stored_object"
  on public."Customs_InvoiceExtractions" ("CUSTIE_StoredObjectID")
  where "CUSTIE_StoredObjectID" is not null;

create unique index if not exists "UX_Customs_InvoiceExtractions_active_canonical"
  on public."Customs_InvoiceExtractions" (
    "CUSTIE_CompanyID", "CUSTIE_SHA256", "CUSTIE_RequestedModel", "CUSTIE_SchemaVersion"
  )
  where "CUSTIE_SourceExtractionID" is null and "CUSTIE_StatusCode" in ('processing', 'ready');

alter table public."Customs_InvoiceExtractions" enable row level security;
revoke all on table public."Customs_InvoiceExtractions" from public, anon, authenticated;
grant all on table public."Customs_InvoiceExtractions" to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('multideck-documents', 'multideck-documents', false, 26214400)
on conflict (id) do update set
  public = false,
  file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit);

comment on table public."Customs_InvoiceExtractions" is
  'API-only commercial-invoice OCR jobs and normalized cache results. Raw PDFs are temporary private Storage objects.';

commit;
