-- Editing a deal where it is read needs somewhere to write it.
--
-- Before this, the CRM write boundary could move a deal between stages, mark it won
-- and convert a lead into one, but nothing could change the deal's own fields, so a
-- deal detail view had no way to save anything an operator typed.
--
-- The payload is a partial patch: only keys actually present are written, which is
-- what lets one inline field save on its own without the client having to send —
-- and risk overwriting — every neighbouring value. Presence is tested with `?` so a
-- key can be explicitly set to null, which `coalesce` could not express.
--
-- Scope is the same as every other deal function: the deal has to reach the caller's
-- company through an active pipeline, or it does not exist as far as this is concerned.

create or replace function public.multideck_crm_update_deal(
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

  if p_input ? 'name' and coalesce(trim(p_input->>'name'), '') = '' then
    raise exception 'A deal needs a name.' using errcode = '22023';
  end if;

  if p_input ? 'primaryContactId' and nullif(p_input->>'primaryContactId', '') is not null
     and not exists (
       select 1
       from public."Org_Contacts" contact
       join public."Org_Master" organisation on organisation."Org_id" = contact."Org_id"
       where contact."OrgContact_ID" = (p_input->>'primaryContactId')::uuid
         and organisation."Company_ID" = v_context.company_id
     ) then
    raise exception 'Choose a contact from this workspace.' using errcode = '22023';
  end if;

  update public."CRM_Opportunities"
  set
    "CRMOppty_Name" = case when p_input ? 'name' then trim(p_input->>'name') else "CRMOppty_Name" end,
    "CRMOppty_PrimaryContactID" = case when p_input ? 'primaryContactId' then nullif(p_input->>'primaryContactId', '')::uuid else "CRMOppty_PrimaryContactID" end,
    "CRMOppty_OwnerUserID" = case when p_input ? 'ownerId' then nullif(p_input->>'ownerId', '')::uuid else "CRMOppty_OwnerUserID" end,
    "CRMOppty_ExpectedCloseDate" = case when p_input ? 'expectedCloseDate' then nullif(p_input->>'expectedCloseDate', '')::date else "CRMOppty_ExpectedCloseDate" end,
    "CRMOppty_ExpectedValueAmount" = case when p_input ? 'expectedValueAmount' then nullif(p_input->>'expectedValueAmount', '')::numeric else "CRMOppty_ExpectedValueAmount" end,
    "CRMOppty_ExpectedMarginAmount" = case when p_input ? 'expectedMarginAmount' then nullif(p_input->>'expectedMarginAmount', '')::numeric else "CRMOppty_ExpectedMarginAmount" end,
    "CRMOppty_CurrencyCode" = case when p_input ? 'currencyCode' then upper(nullif(trim(p_input->>'currencyCode'), '')) else "CRMOppty_CurrencyCode" end,
    "CRMOppty_ModeCode" = case when p_input ? 'modeCode' then nullif(trim(p_input->>'modeCode'), '') else "CRMOppty_ModeCode" end,
    "CRMOppty_DirectionCode" = case when p_input ? 'directionCode' then nullif(trim(p_input->>'directionCode'), '') else "CRMOppty_DirectionCode" end,
    "CRMOppty_OriginName" = case when p_input ? 'originName' then nullif(trim(p_input->>'originName'), '') else "CRMOppty_OriginName" end,
    "CRMOppty_DestinationName" = case when p_input ? 'destinationName' then nullif(trim(p_input->>'destinationName'), '') else "CRMOppty_DestinationName" end,
    "CRMOppty_TradeLane" = case when p_input ? 'tradeLane' then nullif(trim(p_input->>'tradeLane'), '') else "CRMOppty_TradeLane" end,
    "CRMOppty_ServiceInterest" = case when p_input ? 'serviceInterest' then nullif(trim(p_input->>'serviceInterest'), '') else "CRMOppty_ServiceInterest" end,
    "CRMOppty_CustomerNeed" = case when p_input ? 'customerNeed' then nullif(trim(p_input->>'customerNeed'), '') else "CRMOppty_CustomerNeed" end,
    "CRMOppty_ValueProposition" = case when p_input ? 'valueProposition' then nullif(trim(p_input->>'valueProposition'), '') else "CRMOppty_ValueProposition" end,
    "CRMOppty_NextActionDueAt" = case when p_input ? 'nextActionDueAt' then nullif(p_input->>'nextActionDueAt', '')::timestamptz else "CRMOppty_NextActionDueAt" end,
    "CRMOppty_UpdatedAt" = now(),
    "CRMOppty_UpdatedBy" = v_context.user_id
  where "CRMOppty_ID" = p_deal_id
  returning "CRMOppty_ExpectedValueAmount", "CRMOppty_ProbabilityPct"
  into v_value, v_probability;

  -- The weighted figure is derived, never typed, so it is recomputed from whatever
  -- the value and the stage probability now are rather than left behind stale.
  update public."CRM_Opportunities"
  set "CRMOppty_WeightedValueAmount" =
    case when v_value is null or v_probability is null then null else round(v_value * v_probability / 100, 4) end
  where "CRMOppty_ID" = p_deal_id;

  return public._multideck_crm_deal_json(p_deal_id, v_context.company_id);
end;
$$;

revoke all on function public.multideck_crm_update_deal(uuid, jsonb) from public, anon;
grant execute on function public.multideck_crm_update_deal(uuid, jsonb) to authenticated;
