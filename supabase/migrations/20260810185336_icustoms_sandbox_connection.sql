-- Connection metadata only. API credentials remain in Supabase Edge Function
-- secrets and are never stored in a table or returned to the browser.
insert into public."ICUS_ApiConnections" (
  "ICUSC_id",
  "ICUSC_Name",
  "ICUSC_JurisdictionCode",
  "ICUSC_Environment",
  "ICUSC_BaseURL",
  "ICUSC_AuthType",
  "ICUSC_SecretRef",
  "ICUSC_DefaultForOffice",
  "ICUSC_IsActive",
  "ICUSC_SettingsJSON"
)
values (
  'c96a43a9-866a-4d27-ace1-5a6b82085dcb'::uuid,
  'iCustoms CDS sandbox',
  'GB',
  'sandbox',
  'https://ihub-tdr.customscloud.co',
  'api_key',
  'edge-secrets:ICUSTOMS_API_KEY,ICUSTOMS_API_SECRET',
  true,
  true,
  jsonb_build_object(
    'product', 'CDS',
    'direction', 'export',
    'declarationCategory', 'B1',
    'supportedOperations', jsonb_build_array('draft', 'update_draft', 'submit', 'notification'),
    'credentialLocation', 'Supabase Edge Function secrets'
  )
)
on conflict ("ICUSC_id") do update
set
  "ICUSC_Name" = excluded."ICUSC_Name",
  "ICUSC_JurisdictionCode" = excluded."ICUSC_JurisdictionCode",
  "ICUSC_Environment" = excluded."ICUSC_Environment",
  "ICUSC_BaseURL" = excluded."ICUSC_BaseURL",
  "ICUSC_AuthType" = excluded."ICUSC_AuthType",
  "ICUSC_SecretRef" = excluded."ICUSC_SecretRef",
  "ICUSC_DefaultForOffice" = excluded."ICUSC_DefaultForOffice",
  "ICUSC_IsActive" = excluded."ICUSC_IsActive",
  "ICUSC_SettingsJSON" = excluded."ICUSC_SettingsJSON",
  "ICUSC_UpdatedAt" = now();

create unique index if not exists "ux_ICUS_Submissions_customs_idempotency"
  on public."ICUS_Submissions" ("ICUSS_CustomsID", "ICUSS_IdempotencyKey")
  where "ICUSS_CustomsID" is not null and "ICUSS_IdempotencyKey" is not null;
