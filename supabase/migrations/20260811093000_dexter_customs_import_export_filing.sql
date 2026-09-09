-- Give Dexter parity with the operator-owned Customs workspace without
-- bypassing its user ownership, iCustoms validation, provider boundary or
-- explicit filing confirmation.

begin;

create or replace function public._multideck_dexter_customs_draft_payload(
  p_draft jsonb,
  p_direction text
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_direction text := lower(btrim(coalesce(p_direction, '')));
  v_draft jsonb := coalesce(p_draft, '{}'::jsonb);
begin
  if v_direction not in ('import', 'export') then
    raise exception 'Choose whether this is an import or export Customs declaration.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_draft) <> 'object' then
    raise exception 'A valid Customs declaration field-value object is required.' using errcode = '22023';
  end if;
  if v_draft ? 'items' and jsonb_typeof(v_draft -> 'items') <> 'array' then
    raise exception 'Customs declaration goods items must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(v_draft -> 'items', '[]'::jsonb)) > 250 then
    raise exception 'A Dexter Customs declaration can contain up to 250 goods items.' using errcode = '22023';
  end if;

  -- Direction and provider references belong to the product boundary, not the
  -- language model. The saving functions remain the sole writers of records.
  v_draft := v_draft - array['direction', 'multideckReference', 'iCustomsCorrelationId'];
  v_draft := v_draft || jsonb_build_object('direction', v_direction);
  return v_draft;
end;
$$;

create or replace function public.multideck_dexter_action_create_customs_declaration(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_direction text := lower(btrim(coalesce(p_arguments ->> 'declaration_direction', '')));
  v_draft jsonb;
  v_saved record;
begin
  if not exists (
    select 1
    from public."cmp_Users" user_row
    where user_row."User_ID" = p_user_id
      and user_row."Company_ID" = p_company_id
      and user_row."Auth_User_ID" = auth.uid()
  ) then
    raise exception 'Your signed-in account is not linked to this workspace.' using errcode = '42501';
  end if;

  v_draft := public._multideck_dexter_customs_draft_payload(p_arguments -> 'draft', v_direction);
  if not (v_draft ? 'items') then
    v_draft := v_draft || jsonb_build_object('items', jsonb_build_array(jsonb_build_object()));
  end if;

  if v_direction = 'import' then
    select * into v_saved from public.save_customs_import_draft(null, v_draft);
  else
    select * into v_saved from public.save_customs_export_draft(null, v_draft);
  end if;

  return jsonb_build_object(
    'recordId', v_saved.declaration_id,
    'reference', v_saved.local_reference_number,
    'direction', v_direction,
    'updatedAt', v_saved.updated_at
  );
end;
$$;

create or replace function public.multideck_dexter_action_update_customs_declaration(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_target_id uuid := nullif(p_arguments ->> 'target_id', '')::uuid;
  v_direction text;
  v_current jsonb;
  v_draft jsonb;
  v_saved record;
  v_has_provider_draft boolean := false;
begin
  select
    declaration."CUST_Direction",
    declaration."CUST_GenericPayloadJSON",
    nullif(btrim(declaration."CUST_iCustomsExternalID"), '') is not null
  into v_direction, v_current, v_has_provider_draft
  from public."Customs_Declarations" declaration
  join public."cmp_Users" user_row
    on user_row."Auth_User_ID" = declaration."CUST_CreatedBy"
   and user_row."Company_ID" = p_company_id
   and user_row."User_ID" = p_user_id
  where declaration."CUST_id" = v_target_id
    and declaration."CUST_CreatedBy" = auth.uid()
    and declaration."CUST_Status" = 'draft'
    and declaration."CUST_DeclarationKind" in ('cds_export', 'cds_import')
    and declaration."CUST_Direction" in ('export', 'import')
    and not declaration."CUST_IsDeleted"
  for update;

  if not found then
    raise exception 'This Customs draft is unavailable or can no longer be edited.' using errcode = '42501';
  end if;

  v_draft := public._multideck_dexter_customs_draft_payload(
    coalesce(v_current, '{}'::jsonb) || coalesce(p_arguments -> 'draft', '{}'::jsonb),
    v_direction
  );
  if v_direction = 'import' then
    select * into v_saved from public.save_customs_import_draft(v_target_id, v_draft);
  else
    select * into v_saved from public.save_customs_export_draft(v_target_id, v_draft);
  end if;

  return jsonb_build_object(
    'recordId', v_saved.declaration_id,
    'reference', v_saved.local_reference_number,
    'direction', v_direction,
    'needsProviderDraftRefresh', v_has_provider_draft,
    'updatedAt', v_saved.updated_at
  );
end;
$$;

-- These registry sentinels prevent a caller from reaching a provider action
-- through the generic SQL dispatcher. agent-dexter must call icustoms-api with
-- the operator's JWT, so the existing validation, idempotency and Customs audit
-- are always applied.
create or replace function public.multideck_dexter_action_icustoms_edge_only(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'This action must be completed through the authenticated Customs runtime.' using errcode = '42501';
end;
$$;

revoke all on function public._multideck_dexter_customs_draft_payload(jsonb, text) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_create_customs_declaration(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_customs_declaration(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_icustoms_edge_only(uuid, uuid, jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code",
  "AIDexterAction_DomainCode",
  "AIDexterAction_Name",
  "AIDexterAction_Description",
  "AIDexterAction_Function",
  "AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder",
  "AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt"
) values
(
  'create_customs_declaration',
  'customs_declarations',
  'Create Customs declaration draft',
  'Create an operator-owned UK CDS import or export declaration draft from reviewed source data. This does not send anything to iCustoms.',
  'multideck_dexter_action_create_customs_declaration',
  '{"type":"object","properties":{"declaration_direction":{"type":"string","enum":["export","import"]},"draft_json":{"type":"string","description":"A valid JSON object containing every known declaration header and goods-line field, excluding direction. Use source-backed values only; include items as an array."},"reason":{"type":"string"}},"required":["declaration_direction","draft_json","reason"],"additionalProperties":false}'::jsonb,
  130,
  true,
  now()
),
(
  'update_customs_declaration',
  'customs_declarations',
  'Edit Customs declaration draft',
  'Edit an exact operator-owned UK CDS import or export declaration draft. Existing fields are preserved unless supplied in the reviewed draft data; this does not send anything to iCustoms.',
  'multideck_dexter_action_update_customs_declaration',
  '{"type":"object","properties":{"target_id":{"type":"string"},"draft_json":{"type":"string","description":"A valid JSON object containing the reviewed header and goods-line fields to save. Preserve unknown fields by omitting them; include items only when replacing the full goods-item list."},"reason":{"type":"string"}},"required":["target_id","draft_json","reason"],"additionalProperties":false}'::jsonb,
  131,
  true,
  now()
),
(
  'save_customs_provider_draft',
  'customs_declarations',
  'Save Customs draft to iCustoms',
  'Validate an exact operator-owned import or export declaration and save it as a provider draft in the configured iCustoms environment. This does not submit it.',
  'multideck_dexter_action_icustoms_edge_only',
  '{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,
  132,
  true,
  now()
),
(
  'submit_customs_declaration',
  'customs_declarations',
  'Submit Customs declaration to iCustoms',
  'Submit one exact validated provider draft to the configured iCustoms environment. Dexter always requires a separate explicit approval for this external filing step.',
  'multideck_dexter_action_icustoms_edge_only',
  '{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,
  133,
  true,
  now()
)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = true,
  "AIDexterAction_UpdatedAt" = now();

update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Description" = 'The signed-in operator''s UK CDS import and export declaration drafts and filing evidence. Dexter can inspect, draft, edit, validate, save a provider draft and submit one exact declaration only after separate approval.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customs_declarations';

commit;
