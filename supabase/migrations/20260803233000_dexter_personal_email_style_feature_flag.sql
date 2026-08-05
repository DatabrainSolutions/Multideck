begin;

insert into public."SUB_FeatureFlags" (
  "SUBFeature_ID",
  "SUBFeature_Code",
  "SUBFeature_Name",
  "SUBFeature_ModuleCode",
  "SUBFeature_TypeCode",
  "SUBFeature_DefaultEnabled",
  "SUBFeature_Description",
  "SUBFeature_IsSystem",
  "SUBFeature_CreatedAt"
) values (
  gen_random_uuid(),
  'dexter_personal_email_style',
  'Dexter personal email style',
  'ai',
  'release',
  false,
  'Learns one operator''s compact email style after consent and applies it only to editable email drafts.',
  true,
  now()
)
on conflict ("SUBFeature_Code") do update
set "SUBFeature_Name" = excluded."SUBFeature_Name",
    "SUBFeature_ModuleCode" = excluded."SUBFeature_ModuleCode",
    "SUBFeature_TypeCode" = excluded."SUBFeature_TypeCode",
    "SUBFeature_Description" = excluded."SUBFeature_Description",
    "SUBFeature_IsSystem" = excluded."SUBFeature_IsSystem";

commit;
