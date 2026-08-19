-- Make the operator-facing lead and deal contracts safe to deploy and audit.
--
-- Earlier lead reads trusted the physical tenant boundary but did not prove that
-- the selected record belonged to the signed-in user's company. The first deal
-- update migration also referenced CRMOppty_OriginName / DestinationName, while
-- the canonical schema stores those values in the *NameSnapshot columns. This
-- migration closes both gaps and is deliberately the single deployable source
-- for the lead/deal inline-edit boundary.

begin;

-- Match the proven customer permission model: viewers can inspect CRM, while
-- active operational roles can change it. The permission rows already exist in
-- the security hardening migration; these inserts make them effective.
insert into public."sys_UserRole_Permissions" (
  "sys_UserRole_ID",
  "sys_Permission_ID"
)
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from public."sys_UserRoles" role
cross join public."sys_Permissions" permission
where lower(role."sys_UserRole_Name") in (
    'administrator',
    'operations manager',
    'operator',
    'viewer'
  )
  and permission."sys_Permission_Value" = 'CRM.Read'
on conflict do nothing;

insert into public."sys_UserRole_Permissions" (
  "sys_UserRole_ID",
  "sys_Permission_ID"
)
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from public."sys_UserRoles" role
cross join public."sys_Permissions" permission
where lower(role."sys_UserRole_Name") in (
    'administrator',
    'operations manager',
    'operator'
  )
  and permission."sys_Permission_Value" = 'CRM.Write'
on conflict do nothing;

create or replace function public._multideck_crm_lead_is_reachable(
  p_lead_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."CRM_Leads" lead
    left join public."Org_Master" organisation
      on organisation."Org_id" = lead."CRMLead_OrgID"
    left join public."cmp_Users" owner
      on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join public."cmp_Users" creator
      on creator."User_ID" = lead."CRMLead_CreatedBy"
    where lead."CRMLead_ID" = p_lead_id
      and not lead."CRMLead_IsDeleted"
      and (
        -- Customer organisations live inside this physically isolated tenant
        -- project and do not carry Company_ID. Existence in Org_Master is the
        -- tenant boundary for an organisation-backed lead.
        (lead."CRMLead_OrgID" is not null and organisation."Org_id" is not null)
        or (
          lead."CRMLead_OrgID" is null
          and lead."CRMLead_OwnerUserID" is not null
          and owner."Company_ID" = p_company_id
        )
        or (
          lead."CRMLead_OrgID" is null
          and lead."CRMLead_OwnerUserID" is null
          and creator."Company_ID" = p_company_id
        )
      )
  );
$$;

create or replace function public.multideck_crm_list_leads(p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_search text := nullif(btrim(p_search), '');
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();

  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      public._multideck_crm_lead_json(lead."CRMLead_ID")
      order by
        (lead."CRMLead_NextActionDueAt" is null),
        lead."CRMLead_NextActionDueAt",
        lead."CRMLead_LastInteractionAt" desc nulls last,
        lead."CRMLead_CreatedAt" desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public."CRM_Leads" lead
  left join public."cmp_Users" owner
    on owner."User_ID" = lead."CRMLead_OwnerUserID"
  where public._multideck_crm_lead_is_reachable(lead."CRMLead_ID", v_context.company_id)
    and (
      v_search is null
      or lead."CRMLead_CompanyName" ilike '%' || v_search || '%'
      or lead."CRMLead_PersonName" ilike '%' || v_search || '%'
      or lead."CRMLead_Email" ilike '%' || v_search || '%'
      or owner."User_Email" ilike '%' || v_search || '%'
    );

  return v_result;
end;
$$;

-- Preserve the current lead-detail response (native address, consent and
-- transfer state) while rejecting an ID that is not reachable by this company.
create or replace function public.multideck_crm_get_lead_essential(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
  v_contacts jsonb;
  v_native_address jsonb;
  v_native_address_label text;
begin
  select * into v_context from public._multideck_crm_context();

  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Read') then
    raise exception 'You do not have permission to view CRM.' using errcode = '42501';
  end if;

  if not public._multideck_crm_lead_is_reachable(p_lead_id, v_context.company_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  v_result := public.multideck_crm_get_lead(p_lead_id)
    || public._multideck_crm_lead_transfer_state(p_lead_id);
  v_native_address := public._multideck_crm_lead_native_address(p_lead_id);

  if v_native_address is not null then
    v_native_address_label := nullif(concat_ws(', ',
      v_native_address ->> 'line1',
      v_native_address ->> 'line2',
      v_native_address ->> 'townCity',
      v_native_address ->> 'countyState',
      v_native_address ->> 'postZipCode',
      v_native_address ->> 'countryCode'
    ), '');
    v_result := jsonb_set(
      v_result,
      '{company,address}',
      to_jsonb(v_native_address_label),
      true
    ) || jsonb_build_object('address', v_native_address);
  end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'marketingOptIn', coalesce(contact."OrgContact_MarketingOptIn", false),
      'marketingConsentSource', contact."OrgContact_MarketingConsentSource",
      'marketingConsentUpdatedAt', contact."OrgContact_MarketingConsentUpdatedAt"
    ) order by item_index
  ), '[]'::jsonb)
  into v_contacts
  from jsonb_array_elements(coalesce(v_result -> 'contacts', '[]'::jsonb))
    with ordinality as rows(item, item_index)
  left join public."Org_Contacts" contact
    on contact."OrgContact_ID" = (item ->> 'id')::uuid;

  return v_result || coalesce((
    select jsonb_build_object(
      'marketingOptIn', lead."CRMLead_MarketingOptIn",
      'marketingConsentSource', lead."CRMLead_MarketingConsentSource",
      'marketingConsentUpdatedAt', lead."CRMLead_MarketingConsentUpdatedAt",
      'contacts', v_contacts
    )
    from public."CRM_Leads" lead
    where lead."CRMLead_ID" = p_lead_id
      and not lead."CRMLead_IsDeleted"
  ), '{}'::jsonb);
end;
$$;

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
         and contact."Org_id" = v_deal."CRMOppty_OrgID"
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

create or replace function public.multideck_crm_update_lead(
  p_lead_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
begin
  select * into v_context from public._multideck_crm_context();

  if not public._multideck_crm_has_permission(v_context.user_id, 'CRM.Write') then
    raise exception 'You do not have permission to change CRM.' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_input), '') <> 'object' then
    raise exception 'Lead changes must be an object.' using errcode = '22023';
  end if;

  if not public._multideck_crm_lead_is_reachable(p_lead_id, v_context.company_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  perform 1
  from public."CRM_Leads"
  where "CRMLead_ID" = p_lead_id
    and not "CRMLead_IsDeleted"
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if p_input ? 'companyName' and coalesce(btrim(p_input ->> 'companyName'), '') = '' then
    raise exception 'A lead needs a company name.' using errcode = '22023';
  end if;

  update public."CRM_Leads"
  set
    "CRMLead_CompanyName" = case when p_input ? 'companyName' then btrim(p_input ->> 'companyName') else "CRMLead_CompanyName" end,
    "CRMLead_PersonName" = case when p_input ? 'primaryContactName' then nullif(btrim(p_input ->> 'primaryContactName'), '') else "CRMLead_PersonName" end,
    "CRMLead_Email" = case when p_input ? 'primaryContactEmail' then nullif(btrim(p_input ->> 'primaryContactEmail'), '') else "CRMLead_Email" end,
    "CRMLead_CountryCode" = case when p_input ? 'countryCode' then upper(nullif(btrim(p_input ->> 'countryCode'), '')) else "CRMLead_CountryCode" end,
    "CRMLead_TradeLane" = case when p_input ? 'tradeLane' then nullif(btrim(p_input ->> 'tradeLane'), '') else "CRMLead_TradeLane" end,
    "CRMLead_ServiceInterest" = case when p_input ? 'serviceInterest' then nullif(btrim(p_input ->> 'serviceInterest'), '') else "CRMLead_ServiceInterest" end,
    "CRMLead_EstimatedValueAmount" = case when p_input ? 'valueAmount' then nullif(p_input ->> 'valueAmount', '')::numeric else "CRMLead_EstimatedValueAmount" end,
    "CRMLead_EstimatedValueCurrencyCode" = case when p_input ? 'valueCurrencyCode' then upper(nullif(btrim(p_input ->> 'valueCurrencyCode'), '')) else "CRMLead_EstimatedValueCurrencyCode" end,
    "CRMLead_NextActionDueAt" = case when p_input ? 'nextFollowUpAt' then nullif(p_input ->> 'nextFollowUpAt', '')::timestamptz else "CRMLead_NextActionDueAt" end,
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = v_context.user_id
  where "CRMLead_ID" = p_lead_id;

  return public._multideck_crm_lead_json(p_lead_id);
end;
$$;

revoke all on function public._multideck_crm_lead_is_reachable(uuid, uuid) from public, anon, authenticated;

-- The essential endpoints are the supported public read surface. The raw lead
-- functions remain callable by their security-definer wrappers only.
revoke all on function public.multideck_crm_list_leads(text) from public, anon, authenticated;
revoke all on function public.multideck_crm_get_lead(uuid) from public, anon, authenticated;

revoke all on function public.multideck_crm_list_leads_essential(text) from public, anon;
revoke all on function public.multideck_crm_get_lead_essential(uuid) from public, anon;
revoke all on function public.multideck_crm_update_deal(uuid, jsonb) from public, anon;
revoke all on function public.multideck_crm_update_lead(uuid, jsonb) from public, anon;

grant execute on function public.multideck_crm_list_leads_essential(text) to authenticated;
grant execute on function public.multideck_crm_get_lead_essential(uuid) to authenticated;
grant execute on function public.multideck_crm_update_deal(uuid, jsonb) to authenticated;
grant execute on function public.multideck_crm_update_lead(uuid, jsonb) to authenticated;

commit;
