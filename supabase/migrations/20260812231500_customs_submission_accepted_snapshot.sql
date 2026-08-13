-- Exact declaration data accepted for submission. This immutable source is
-- captured before the provider call and is the only production source for an
-- official declaration PDF. Request metadata remains separate and sanitised.
alter table public."ICUS_Submissions"
  add column if not exists "ICUSS_DeclarationSnapshotJSON" jsonb,
  add column if not exists "ICUSS_ProviderStatus" text;

alter table public."ICUS_Submissions"
  drop constraint if exists "CK_ICUS_Submissions_declaration_snapshot";

alter table public."ICUS_Submissions"
  add constraint "CK_ICUS_Submissions_declaration_snapshot"
  check (
    "ICUSS_DeclarationSnapshotJSON" is null
    or (
      jsonb_typeof("ICUSS_DeclarationSnapshotJSON") = 'object'
      and jsonb_typeof("ICUSS_DeclarationSnapshotJSON" -> 'schemaVersion') = 'number'
      and "ICUSS_DeclarationSnapshotJSON" ->> 'schemaVersion' = '1'
      and jsonb_typeof("ICUSS_DeclarationSnapshotJSON" -> 'declaration') = 'object'
      and jsonb_typeof("ICUSS_DeclarationSnapshotJSON" -> 'items') = 'array'
    )
  );

comment on column public."ICUS_Submissions"."ICUSS_DeclarationSnapshotJSON" is
  'Immutable server-captured Customs_Declarations and Customs_Items snapshot at the exact submit boundary. Used for accepted official document generation.';
comment on column public."ICUS_Submissions"."ICUSS_ProviderStatus" is
  'Exact provider lifecycle status before Multideck maps released or cleared to its accepted completion state.';

-- Existing sandbox and pre-snapshot rows deliberately remain null. They can
-- create verification copies but can never be marked official; the product UI
-- carries that environment distinction without drawing over the PDF itself.
