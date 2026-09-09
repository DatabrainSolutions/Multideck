-- Restore deal editing after the versioned wrapper exposed a legacy contact
-- ownership check that referenced the wrong quoted Org_Contacts column name.

begin;

create or replace function public._multideck_crm_update_deal_unversioned_20260818(
  p_deal_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_deal record;
  v_probability numeric;
  v_value numeric;
begin
  select * into v_context from public._multideck_crm_context();

  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Write') then
    raise exception 'You do not have permission to change CRM.' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_input), '') <> 'object' then
    raise exception 'Deal changes must be an object.' using errcode = '22023';
  end if;

  select deal.* into v_deal
  from public."CRM_Opportunities" deal
  join public."CRM_Pipelines" pipeline
    on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
  where deal."CRMOppty_ID" = p_deal_id
    and not deal."CRMOppty_IsDeleted"
    and pipeline."Company_ID" = v_context.company_id
    and not pipeline."Is_Deleted"
  for update of deal;

  if not found then
    raise exception 'Deal not found.' using errcode = 'P0002';
  end if;

  if p_input ? 'name' and coalesce(btrim(p_input ->> 'name'), '') = '' then
    raise exception 'A deal needs a name.' using errcode = '22023';
  end if;

  if p_input ? 'primaryContactId'
     and nullif(p_input ->> 'primaryContactId', '') is not null
     and not exists (
       select 1
       from public."Org_Contacts" contact
       where contact."OrgContact_ID" = (p_input ->> 'primaryContactId')::uuid
         and contact."Org_ID" = v_deal."CRMOppty_OrgID"
     ) then
    raise exception 'Choose a contact from this deal account.' using errcode = '22023';
  end if;

  if p_input ? 'ownerId'
     and nullif(p_input ->> 'ownerId', '') is not null
     and not exists (
       select 1
       from public."cmp_Users" owner
       where owner."User_ID" = (p_input ->> 'ownerId')::uuid
         and owner."Company_ID" = v_context.company_id
         and coalesce(owner."User_AccessStatus", 'active') = 'active'
     ) then
    raise exception 'Choose an active owner from this workspace.' using errcode = '22023';
  end if;

  update public."CRM_Opportunities"
  set
    "CRMOppty_Name" = case when p_input ? 'name' then btrim(p_input ->> 'name') else "CRMOppty_Name" end,
    "CRMOppty_PrimaryContactID" = case when p_input ? 'primaryContactId' then nullif(p_input ->> 'primaryContactId', '')::uuid else "CRMOppty_PrimaryContactID" end,
    "CRMOppty_OwnerUserID" = case when p_input ? 'ownerId' then nullif(p_input ->> 'ownerId', '')::uuid else "CRMOppty_OwnerUserID" end,
    "CRMOppty_ExpectedCloseDate" = case when p_input ? 'expectedCloseDate' then nullif(p_input ->> 'expectedCloseDate', '')::date else "CRMOppty_ExpectedCloseDate" end,
    "CRMOppty_ExpectedValueAmount" = case when p_input ? 'expectedValueAmount' then nullif(p_input ->> 'expectedValueAmount', '')::numeric else "CRMOppty_ExpectedValueAmount" end,
    "CRMOppty_ExpectedMarginAmount" = case when p_input ? 'expectedMarginAmount' then nullif(p_input ->> 'expectedMarginAmount', '')::numeric else "CRMOppty_ExpectedMarginAmount" end,
    "CRMOppty_CurrencyCode" = case when p_input ? 'currencyCode' then upper(nullif(btrim(p_input ->> 'currencyCode'), '')) else "CRMOppty_CurrencyCode" end,
    "CRMOppty_ModeCode" = case when p_input ? 'modeCode' then nullif(btrim(p_input ->> 'modeCode'), '') else "CRMOppty_ModeCode" end,
    "CRMOppty_DirectionCode" = case when p_input ? 'directionCode' then nullif(btrim(p_input ->> 'directionCode'), '') else "CRMOppty_DirectionCode" end,
    "CRMOppty_OriginNameSnapshot" = case when p_input ? 'originName' then nullif(btrim(p_input ->> 'originName'), '') else "CRMOppty_OriginNameSnapshot" end,
    "CRMOppty_DestinationNameSnapshot" = case when p_input ? 'destinationName' then nullif(btrim(p_input ->> 'destinationName'), '') else "CRMOppty_DestinationNameSnapshot" end,
    "CRMOppty_TradeLane" = case when p_input ? 'tradeLane' then nullif(btrim(p_input ->> 'tradeLane'), '') else "CRMOppty_TradeLane" end,
    "CRMOppty_ServiceInterest" = case when p_input ? 'serviceInterest' then nullif(btrim(p_input ->> 'serviceInterest'), '') else "CRMOppty_ServiceInterest" end,
    "CRMOppty_CustomerNeed" = case when p_input ? 'customerNeed' then nullif(btrim(p_input ->> 'customerNeed'), '') else "CRMOppty_CustomerNeed" end,
    "CRMOppty_ValueProposition" = case when p_input ? 'valueProposition' then nullif(btrim(p_input ->> 'valueProposition'), '') else "CRMOppty_ValueProposition" end,
    "CRMOppty_NextActionDueAt" = case when p_input ? 'nextActionDueAt' then nullif(p_input ->> 'nextActionDueAt', '')::timestamptz else "CRMOppty_NextActionDueAt" end,
    "CRMOppty_UpdatedAt" = now(),
    "CRMOppty_UpdatedBy" = v_context.user_id
  where "CRMOppty_ID" = p_deal_id
  returning "CRMOppty_ExpectedValueAmount", "CRMOppty_ProbabilityPct"
  into v_value, v_probability;

  update public."CRM_Opportunities"
  set "CRMOppty_WeightedValueAmount" =
    case
      when v_value is null or v_probability is null then null
      else round(v_value * v_probability / 100, 4)
    end
  where "CRMOppty_ID" = p_deal_id;

  return public._multideck_crm_deal_json(p_deal_id, v_context.company_id);
end;
$$;

revoke all on function public._multideck_crm_update_deal_unversioned_20260818(uuid, jsonb)
  from public, anon, authenticated;

commit;
