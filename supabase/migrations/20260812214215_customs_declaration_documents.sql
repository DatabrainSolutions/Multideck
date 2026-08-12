-- Immutable, private declaration PDFs generated from a server-owned Customs snapshot.
-- Accepted declaration documents, including sandbox verification copies, are
-- retained for seven years for customer and audit use.

create table if not exists public."Customs_DeclarationDocuments" (
  "CUSTD_ID" uuid primary key default gen_random_uuid(),
  "CUSTD_CustomsID" uuid not null references public."Customs_Declarations"("CUST_id") on delete restrict,
  "CUSTD_Direction" text not null check ("CUSTD_Direction" in ('import', 'export')),
  "CUSTD_SourceSHA256" text not null check ("CUSTD_SourceSHA256" ~ '^[0-9a-f]{64}$'),
  "CUSTD_IsOfficial" boolean not null default false,
  "CUSTD_ProviderStatus" text,
  "CUSTD_MRN" text,
  "CUSTD_FileName" text not null,
  "CUSTD_StorageBucket" text not null default 'multideck-generated',
  "CUSTD_StoragePath" text not null,
  "CUSTD_MimeType" text not null default 'application/pdf',
  "CUSTD_FileSizeBytes" bigint not null check ("CUSTD_FileSizeBytes" > 0),
  "CUSTD_FileSHA256" text not null check ("CUSTD_FileSHA256" ~ '^[0-9a-f]{64}$'),
  "CUSTD_RetainUntil" timestamptz not null,
  "CUSTD_CreatedAt" timestamptz not null default now(),
  "CUSTD_CreatedBy" uuid not null references auth.users(id),
  constraint "CK_Customs_DeclarationDocuments_accepted_retention"
    check (
      "CUSTD_RetainUntil" >= "CUSTD_CreatedAt" + interval '7 years'
    )
);

create unique index if not exists "UX_Customs_DeclarationDocuments_snapshot"
  on public."Customs_DeclarationDocuments" ("CUSTD_CustomsID", "CUSTD_SourceSHA256");
create index if not exists "IX_Customs_DeclarationDocuments_declaration"
  on public."Customs_DeclarationDocuments" ("CUSTD_CustomsID", "CUSTD_CreatedAt" desc);
create index if not exists "IX_Customs_DeclarationDocuments_retention"
  on public."Customs_DeclarationDocuments" ("CUSTD_RetainUntil");

alter table public."Customs_DeclarationDocuments" enable row level security;
revoke all on public."Customs_DeclarationDocuments" from public, anon;
grant select on public."Customs_DeclarationDocuments" to authenticated;
grant all on public."Customs_DeclarationDocuments" to service_role;

drop policy if exists "Users read own Customs declaration documents" on public."Customs_DeclarationDocuments";
create policy "Users read own Customs declaration documents"
  on public."Customs_DeclarationDocuments"
  for select
  to authenticated
  using (
    exists (
      select 1
      from public."Customs_Declarations" declaration
      where declaration."CUST_id" = "CUSTD_CustomsID"
        and declaration."CUST_CreatedBy" = auth.uid()
        and not declaration."CUST_IsDeleted"
    )
  );

comment on table public."Customs_DeclarationDocuments" is
  'Private Carbone-rendered CDS declaration PDFs. Accepted production documents and sandbox verification copies are immutable and retained for seven years.';
comment on column public."Customs_DeclarationDocuments"."CUSTD_RetainUntil" is
  'Minimum seven-year retention date for every accepted declaration PDF, including non-official sandbox verification copies.';

-- Dexter can already inspect the owning declaration and its provider lifecycle. The PDF is a
-- derived binary with a short-lived signed URL, so chat and Watching for you intentionally do
-- not generate, download or poll it. Operators use the authenticated Customs workspace instead.
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" =
  'The signed-in operator''s UK CDS export and import declaration drafts and filing evidence, including direction, status, references, destination, value, item count and the latest recorded customs submission state. Retained declaration PDFs are available only through the authenticated Customs workspace; Dexter does not generate or download document binaries.'
where "AIDexterDomain_Code" = 'customs_declarations';
