-- Version the source-to-PDF contract independently from the extraction schema and
-- retain only the prepared PDF needed for the short review window.

begin;

alter table public."Customs_InvoiceExtractions"
  add column if not exists "CUSTIE_NormalizerVersion" integer not null default 1
    check ("CUSTIE_NormalizerVersion" > 0),
  add column if not exists "CUSTIE_ConvertedSHA256" varchar(64) null
    check ("CUSTIE_ConvertedSHA256" is null or "CUSTIE_ConvertedSHA256" ~ '^[0-9a-f]{64}$'),
  add column if not exists "CUSTIE_ConversionJSON" jsonb not null default '{}'::jsonb
    check (jsonb_typeof("CUSTIE_ConversionJSON") = 'object'),
  add column if not exists "CUSTIE_PreviewExpiresAt" timestamptz null;

drop index if exists public."UX_Customs_InvoiceExtractions_active_canonical";
create unique index "UX_Customs_InvoiceExtractions_active_canonical"
  on public."Customs_InvoiceExtractions" (
    "CUSTIE_CompanyID", "CUSTIE_SHA256", "CUSTIE_RequestedModel",
    "CUSTIE_SchemaVersion", "CUSTIE_NormalizerVersion"
  )
  where "CUSTIE_SourceExtractionID" is null and "CUSTIE_StatusCode" in ('processing', 'ready');

create index if not exists "IX_Customs_InvoiceExtractions_preview_expiry"
  on public."Customs_InvoiceExtractions" ("CUSTIE_PreviewExpiresAt")
  where "CUSTIE_StoredObjectID" is not null;

comment on column public."Customs_InvoiceExtractions"."CUSTIE_NormalizerVersion" is
  'Source validation and source-to-PDF rendering contract used before OCR.';
comment on column public."Customs_InvoiceExtractions"."CUSTIE_ConvertedSHA256" is
  'SHA-256 of the exact prepared PDF sent to OCR.';
comment on column public."Customs_InvoiceExtractions"."CUSTIE_ConversionJSON" is
  'Source format, conversion strategy, sheet inclusion and operator warnings.';
comment on column public."Customs_InvoiceExtractions"."CUSTIE_PreviewExpiresAt" is
  'Hard expiry for the private prepared-PDF review object; signed URLs are shorter lived.';

commit;
