-- Editing a lead where it is read needs somewhere to write it.
--
-- Before this, the CRM write boundary could transfer a lead, convert it and raise a
-- follow-up, but nothing could change the lead's own fields, so a lead detail view
-- had no way to save anything an operator typed.
--
-- Like the deal patch, only keys actually present in the payload are written, so one
-- inline field saves on its own without the client sending — and risking overwriting
-- — every neighbouring value. Presence is tested with `?` so a key can be set
-- explicitly to null, which `coalesce` could not express.
--
-- Scoping note: CRM_Leads has no Company_ID of its own. A lead reaches a company
-- either through its organisation or, for a raw lead that has no organisation yet,
-- through its owner. A lead with neither is not editable from here rather than being
-- editable by anyone, which is the safe direction for the ambiguity.

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
  v_lead record;
  v_reachable boolean;
begin
  select * into v_context from public._multideck_crm_context();

  select * into v_lead
  from public."CRM_Leads"
  where "CRMLead_ID" = p_lead_id and not "CRMLead_IsDeleted"
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  select
    coalesce(
      (
        select organisation."Company_ID" = v_context.company_id
        from public."Org_Master" organisation
        where organisation."Org_id" = v_lead."CRMLead_OrgID"
      ),
      (
        select owner."Company_ID" = v_context.company_id
        from public."cmp_Users" owner
        where owner."User_ID" = v_lead."CRMLead_OwnerUserID"
      ),
      false
    )
  into v_reachable;

  if not v_reachable then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if p_input ? 'companyName' and coalesce(trim(p_input->>'companyName'), '') = '' then
    raise exception 'A lead needs a company name.' using errcode = '22023';
  end if;

  update public."CRM_Leads"
  set
    "CRMLead_CompanyName" = case when p_input ? 'companyName' then trim(p_input->>'companyName') else "CRMLead_CompanyName" end,
    "CRMLead_PersonName" = case when p_input ? 'primaryContactName' then nullif(trim(p_input->>'primaryContactName'), '') else "CRMLead_PersonName" end,
    "CRMLead_Email" = case when p_input ? 'primaryContactEmail' then nullif(trim(p_input->>'primaryContactEmail'), '') else "CRMLead_Email" end,
    "CRMLead_CountryCode" = case when p_input ? 'countryCode' then upper(nullif(trim(p_input->>'countryCode'), '')) else "CRMLead_CountryCode" end,
    "CRMLead_TradeLane" = case when p_input ? 'tradeLane' then nullif(trim(p_input->>'tradeLane'), '') else "CRMLead_TradeLane" end,
    "CRMLead_ServiceInterest" = case when p_input ? 'serviceInterest' then nullif(trim(p_input->>'serviceInterest'), '') else "CRMLead_ServiceInterest" end,
    "CRMLead_EstimatedValueAmount" = case when p_input ? 'valueAmount' then nullif(p_input->>'valueAmount', '')::numeric else "CRMLead_EstimatedValueAmount" end,
    "CRMLead_EstimatedValueCurrencyCode" = case when p_input ? 'valueCurrencyCode' then upper(nullif(trim(p_input->>'valueCurrencyCode'), '')) else "CRMLead_EstimatedValueCurrencyCode" end,
    "CRMLead_NextActionDueAt" = case when p_input ? 'nextFollowUpAt' then nullif(p_input->>'nextFollowUpAt', '')::timestamptz else "CRMLead_NextActionDueAt" end,
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = v_context.user_id
  where "CRMLead_ID" = p_lead_id;

  return public._multideck_crm_lead_json(p_lead_id);
end;
$$;

revoke all on function public.multideck_crm_update_lead(uuid, jsonb) from public, anon;
grant execute on function public.multideck_crm_update_lead(uuid, jsonb) to authenticated;
