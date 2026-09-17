-- Operator-requested direct document reading without a mandatory external malware service.
-- Preserve quarantined/rejected legacy files; only newly validated uploads use this status.
begin;
alter table public."AI_DexterUploads" drop constraint "CK_AI_DexterUploads_scan_status";
alter table public."AI_DexterUploads" add constraint "CK_AI_DexterUploads_scan_status"
  check ("AIDexterUpload_ScanStatusCode" in ('quarantined','clean','rejected','validated'));
comment on column public."AI_DexterUploads"."AIDexterUpload_ScanStatusCode" is
  'validated means file type/signature and archive checks passed; not a malware scan. clean is a historical malware verdict. Quarantined and rejected files are unavailable.';
commit;
