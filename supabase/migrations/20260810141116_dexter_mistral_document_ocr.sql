-- Persist bounded, server-only Mistral OCR 4 results against private Dexter
-- uploads. The browser cannot read this table directly; agent-dexter resolves
-- the signed-in operator and company before it reads or writes extraction data.

begin;

alter table public."AI_DexterUploads"
  add column if not exists "AIDexterUpload_OCRStatusCode" varchar(24),
  add column if not exists "AIDexterUpload_OCRRequestedModel" varchar(80),
  add column if not exists "AIDexterUpload_OCRProviderModel" varchar(80),
  add column if not exists "AIDexterUpload_OCRSchemaVersion" smallint,
  add column if not exists "AIDexterUpload_OCRResultJSON" jsonb,
  add column if not exists "AIDexterUpload_OCRPageCount" integer,
  add column if not exists "AIDexterUpload_OCRFailureCode" varchar(80),
  add column if not exists "AIDexterUpload_OCRCompletedAt" timestamptz;

alter table public."AI_DexterUploads"
  drop constraint if exists "CK_AI_DexterUploads_ocr_status";

alter table public."AI_DexterUploads"
  add constraint "CK_AI_DexterUploads_ocr_status"
  check (
    "AIDexterUpload_OCRStatusCode" is null
    or "AIDexterUpload_OCRStatusCode" in ('processing', 'ready', 'failed')
  );

alter table public."AI_DexterUploads"
  drop constraint if exists "CK_AI_DexterUploads_ocr_page_count";

alter table public."AI_DexterUploads"
  add constraint "CK_AI_DexterUploads_ocr_page_count"
  check ("AIDexterUpload_OCRPageCount" is null or "AIDexterUpload_OCRPageCount" >= 0);

create index if not exists "IX_AI_DexterUploads_ocr_cache"
  on public."AI_DexterUploads" (
    "AIDexterUpload_CompanyID",
    "AIDexterUpload_SHA256",
    "AIDexterUpload_OCRRequestedModel",
    "AIDexterUpload_OCRSchemaVersion",
    "AIDexterUpload_OCRCompletedAt" desc
  )
  where "AIDexterUpload_StatusCode" = 'active'
    and "AIDexterUpload_OCRStatusCode" = 'ready';

comment on column public."AI_DexterUploads"."AIDexterUpload_OCRResultJSON" is
  'Bounded, page-labelled Mistral OCR result used as untrusted evidence by Dexter. Stored server-side only.';

comment on column public."AI_DexterUploads"."AIDexterUpload_OCRStatusCode" is
  'Server-only extraction state. Interactive OCR execution is not a Watching for you event; destination record changes retain their existing event adapters.';

-- Reassert the private API-only boundary in case an older tenant provisioned
-- the source table with broader defaults.
alter table public."AI_DexterUploads" enable row level security;
revoke all on table public."AI_DexterUploads" from public, anon, authenticated;
grant all on table public."AI_DexterUploads" to service_role;

commit;
