-- Leads can exist before an organisation does. Keep their location on the lead
-- and use an organisation address only as a fallback after conversion.
begin;

alter table public."CRM_Leads"
  add column if not exists "CRMLead_AddressLine1" character varying(160),
  add column if not exists "CRMLead_AddressLine2" character varying(160),
  add column if not exists "CRMLead_TownCity" character varying(120),
  add column if not exists "CRMLead_CountyState" character varying(120),
  add column if not exists "CRMLead_PostZipCode" character varying(40);

comment on column public."CRM_Leads"."CRMLead_AddressLine1" is 'Lead-native address line. Does not require an organisation record.';
comment on column public."CRM_Leads"."CRMLead_AddressLine2" is 'Optional second lead-native address line.';
comment on column public."CRM_Leads"."CRMLead_TownCity" is 'Lead-native town or city used for CRM area reporting.';
comment on column public."CRM_Leads"."CRMLead_CountyState" is 'Lead-native county, region or state used for CRM area reporting.';
comment on column public."CRM_Leads"."CRMLead_PostZipCode" is 'Lead-native postal or ZIP code used for CRM area reporting.';
comment on column public."CRM_Leads"."CRMLead_CountryCode" is 'Two-letter ISO country code for the lead, independent of any organisation.';

create or replace function public._multideck_crm_lead_native_address(p_lead_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when nullif(concat_ws('',
      nullif(btrim(lead."CRMLead_AddressLine1"), ''),
      nullif(btrim(lead."CRMLead_AddressLine2"), ''),
      nullif(btrim(lead."CRMLead_TownCity"), ''),
      nullif(btrim(lead."CRMLead_CountyState"), ''),
      nullif(btrim(lead."CRMLead_PostZipCode"), ''),
      nullif(btrim(lead."CRMLead_CountryCode"), '')
    ), '') is null then null
    else jsonb_strip_nulls(jsonb_build_object(
      'line1', nullif(btrim(lead."CRMLead_AddressLine1"), ''),
      'line2', nullif(btrim(lead."CRMLead_AddressLine2"), ''),
      'townCity', nullif(btrim(lead."CRMLead_TownCity"), ''),
      'countyState', nullif(btrim(lead."CRMLead_CountyState"), ''),
      'postZipCode', nullif(btrim(lead."CRMLead_PostZipCode"), ''),
      'countryCode', upper(nullif(btrim(lead."CRMLead_CountryCode"), ''))
    ))
  end
  from public."CRM_Leads" lead
  where lead."CRMLead_ID" = p_lead_id and not lead."CRMLead_IsDeleted";
$$;

revoke all on function public._multideck_crm_lead_native_address(uuid) from public, anon, authenticated;

-- Populate only the explicitly marked QR demo leads. No organisation rows are
-- created, so the seed mirrors the pre-conversion lead lifecycle.
with demo_addresses(email, line1, line2, town_city, county_state, post_zip_code, country_code) as (
  values
    ('qr-demo-1@example.com', 'Unit 1', 'Northgate Demo Logistics Park', 'Manchester', 'Greater Manchester', 'M17 1AB', 'GB'),
    ('qr-demo-2@example.com', 'Unit 2', 'Midland Demo Freight Park', 'Birmingham', 'West Midlands', 'B24 8HZ', 'GB'),
    ('qr-demo-3@example.com', 'Unit 3', 'Northgate Demo Logistics Park', 'Manchester', 'Greater Manchester', 'M17 1AB', 'GB'),
    ('qr-demo-4@example.com', 'Unit 4', 'Thames Demo Cargo Centre', 'London', 'Greater London', 'E16 2PX', 'GB'),
    ('qr-demo-5@example.com', 'Unit 5', 'Midland Demo Freight Park', 'Birmingham', 'West Midlands', 'B24 8HZ', 'GB')
)
update public."CRM_Leads" lead
set "CRMLead_AddressLine1" = demo.line1,
    "CRMLead_AddressLine2" = demo.line2,
    "CRMLead_TownCity" = demo.town_city,
    "CRMLead_CountyState" = demo.county_state,
    "CRMLead_PostZipCode" = demo.post_zip_code,
    "CRMLead_CountryCode" = demo.country_code,
    "CRMLead_UpdatedAt" = now()
from demo_addresses demo
where lower(btrim(lead."CRMLead_Email")) = demo.email
  and not lead."CRMLead_IsDeleted"
  and coalesce((lead."CRMLead_MetadataJSON" ->> 'isDemo')::boolean, false)
  and lead."CRMLead_MetadataJSON" ->> 'source' = 'qr-contact-card-seed';

-- Preserve the existing four-argument creation RPC for deployed clients and
-- add an address-aware overload for the current app.
create or replace function public.multideck_crm_create_follow_up_lead(
  p_email text,
  p_person_name text,
  p_company_name text,
  p_thread_id uuid,
  p_address jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_result jsonb;
  v_lead_id uuid;
  v_country text := upper(nullif(btrim(coalesce(p_address ->> 'countryCode', '')), ''));
begin
  if p_address is not null and jsonb_typeof(p_address) <> 'object' then
    raise exception 'Lead address must be an object.' using errcode = '22023';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'Enter a two-letter ISO country code, such as GB.' using errcode = '22023';
  end if;
  if length(coalesce(p_address ->> 'line1', '')) > 160
    or length(coalesce(p_address ->> 'line2', '')) > 160
    or length(coalesce(p_address ->> 'townCity', '')) > 120
    or length(coalesce(p_address ->> 'countyState', '')) > 120
    or length(coalesce(p_address ->> 'postZipCode', '')) > 40 then
    raise exception 'One or more lead address fields are too long.' using errcode = '22001';
  end if;

  v_result := public.multideck_crm_create_follow_up_lead(p_email, p_person_name, p_company_name, p_thread_id);
  v_lead_id := (v_result ->> 'id')::uuid;

  update public."CRM_Leads"
  set "CRMLead_AddressLine1" = nullif(btrim(p_address ->> 'line1'), ''),
      "CRMLead_AddressLine2" = nullif(btrim(p_address ->> 'line2'), ''),
      "CRMLead_TownCity" = nullif(btrim(p_address ->> 'townCity'), ''),
      "CRMLead_CountyState" = nullif(btrim(p_address ->> 'countyState'), ''),
      "CRMLead_PostZipCode" = nullif(btrim(p_address ->> 'postZipCode'), ''),
      "CRMLead_CountryCode" = v_country,
      "CRMLead_UpdatedAt" = now()
  where "CRMLead_ID" = v_lead_id;

  return v_result || jsonb_build_object('address', public._multideck_crm_lead_native_address(v_lead_id));
end;
$$;

comment on function public.multideck_crm_create_follow_up_lead(text, text, text, uuid, jsonb) is
  'Creates a reviewed CRM lead with an optional lead-native address. The lead does not require an organisation.';
revoke all on function public.multideck_crm_create_follow_up_lead(text, text, text, uuid, jsonb) from public, anon;
grant execute on function public.multideck_crm_create_follow_up_lead(text, text, text, uuid, jsonb) to authenticated;

-- Return the lead-native address in the existing detail contract. Organisation
-- address data remains a fallback when the lead-native address is empty.
create or replace function public.multideck_crm_get_lead_essential(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_result jsonb;
  v_contacts jsonb;
  v_native_address jsonb;
  v_native_address_label text;
begin
  v_result := public.multideck_crm_get_lead(p_lead_id) || public._multideck_crm_lead_transfer_state(p_lead_id);
  v_native_address := public._multideck_crm_lead_native_address(p_lead_id);
  if v_native_address is not null then
    v_native_address_label := nullif(concat_ws(', ',
      v_native_address ->> 'line1', v_native_address ->> 'line2',
      v_native_address ->> 'townCity', v_native_address ->> 'countyState',
      v_native_address ->> 'postZipCode', v_native_address ->> 'countryCode'
    ), '');
    v_result := jsonb_set(v_result, '{company,address}', to_jsonb(v_native_address_label), true)
      || jsonb_build_object('address', v_native_address);
  end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'marketingOptIn', coalesce(contact."OrgContact_MarketingOptIn", false),
      'marketingConsentSource', contact."OrgContact_MarketingConsentSource",
      'marketingConsentUpdatedAt', contact."OrgContact_MarketingConsentUpdatedAt"
    ) order by item_index
  ), '[]'::jsonb) into v_contacts
  from jsonb_array_elements(coalesce(v_result -> 'contacts', '[]'::jsonb)) with ordinality as rows(item, item_index)
  left join public."Org_Contacts" contact on contact."OrgContact_ID" = (item ->> 'id')::uuid;

  return v_result || coalesce((
    select jsonb_build_object(
      'marketingOptIn', lead."CRMLead_MarketingOptIn",
      'marketingConsentSource', lead."CRMLead_MarketingConsentSource",
      'marketingConsentUpdatedAt', lead."CRMLead_MarketingConsentUpdatedAt",
      'contacts', v_contacts
    ) from public."CRM_Leads" lead
    where lead."CRMLead_ID" = p_lead_id and not lead."CRMLead_IsDeleted"
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.multideck_crm_get_lead_essential(uuid) from public, anon;
grant execute on function public.multideck_crm_get_lead_essential(uuid) to authenticated;

-- Keep personal lead work user-scoped while using lead-native locations for
-- area reporting and organisation addresses only as a legacy fallback.
create or replace function public.multideck_crm_get_dashboard(
  p_inactivity_days integer default 90,
  p_area text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_area text := nullif(lower(btrim(coalesce(p_area, ''))), '');
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  if p_inactivity_days not in (30, 90, 180) then
    raise exception 'Choose an inactivity threshold of 30, 90 or 180 days.' using errcode = '22023';
  end if;

  with owned_leads as (
    select
      lead.*,
      status."CRMLeadStatus_Name" as status_name,
      status."CRMLeadStatus_IsOpen" as is_open,
      coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), organisation."Org_Name", nullif(btrim(lead."CRMLead_PersonName"), ''), 'Unnamed lead') as company_name,
      coalesce(nullif(btrim(lead."CRMLead_PersonName"), ''), nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '')) as contact_name,
      coalesce(nullif(btrim(lead."CRMLead_Email"), ''), contact_email.email, organisation_address."OrgAdd_MainEmail") as email,
      greatest(lead."CRMLead_LastInteractionAt", activity.last_activity_at) as last_contact_at,
      activity.last_subject,
      coalesce(
        nullif(concat_ws(' · ', nullif(btrim(lead."CRMLead_TownCity"), ''), nullif(btrim(lead."CRMLead_CountyState"), ''),
          nullif(split_part(btrim(lead."CRMLead_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(lead."CRMLead_CountryCode")), '')), ''),
        organisation_address.area_label
      ) as area_label,
      coalesce(
        lower(nullif(concat_ws('|', nullif(btrim(lead."CRMLead_TownCity"), ''), nullif(btrim(lead."CRMLead_CountyState"), ''),
          nullif(split_part(btrim(lead."CRMLead_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(lead."CRMLead_CountryCode")), '')), '')),
        organisation_address.area_key
      ) as area_key,
      coalesce(lead."CRMLead_EstimatedValueCurrencyCode", 'GBP') as currency_code
    from public."CRM_Leads" lead
    join public."sys_CRMLeadStatuses" status on status."CRMLeadStatus_Code" = lead."CRMLead_StatusCode"
    left join public."Org_Master" organisation on organisation."Org_id" = lead."CRMLead_OrgID"
    left join public."Org_Contacts" contact on contact."OrgContact_ID" = lead."CRMLead_PrimaryContactID"
    left join lateral (
      select nullif(btrim(email_row."OrgContactEmail_Email"), '') as email
      from public."OrgContact_Emails" email_row
      where email_row."OrgContact_ID" = contact."OrgContact_ID"
      order by email_row."OrgContactEmail_Type", email_row."OrgContactEmail_ID"
      limit 1
    ) contact_email on true
    left join lateral (
      select
        nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') as area_label,
        lower(nullif(concat_ws('|', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '')) as area_key,
        a."OrgAdd_MainEmail"
      from public."Org_Addresses" a
      where a."Org_ID" = lead."CRMLead_OrgID"
      order by a."OrgAdd_ID"
      limit 1
    ) organisation_address on true
    left join lateral (
      select max(a."CRMActivity_ActivityAt") as last_activity_at,
             (array_agg(a."CRMActivity_Subject" order by a."CRMActivity_ActivityAt" desc))[1] as last_subject
      from public."CRM_Activities" a
      where a."CRMActivity_LeadID" = lead."CRMLead_ID" and not a."CRMActivity_IsDeleted"
    ) activity on true
    where lead."CRMLead_OwnerUserID" = v_context.user_id
      and not lead."CRMLead_IsDeleted"
  ), filtered_leads as (
    select * from owned_leads where v_area is null or area_key = v_area
  ), company_deals as (
    select opportunity.*,
           stage."CRMPipelineStage_Name" as pipeline_stage_name,
           pipeline."CRMPipeline_Name" as pipeline_name
    from public."CRM_Opportunities" opportunity
    join public."CRM_Pipelines" pipeline on pipeline."CRMPipeline_ID" = opportunity."CRMOppty_PipelineID"
      and pipeline."Company_ID" = v_context.company_id and not pipeline."Is_Deleted"
    join public."CRM_PipelineStages" stage on stage."CRMPipelineStage_ID" = opportunity."CRMOppty_PipelineStageID"
      and stage."CRMPipeline_ID" = pipeline."CRMPipeline_ID" and not stage."Is_Deleted"
    where not opportunity."CRMOppty_IsDeleted"
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'openLeads', (select count(*) from filtered_leads where is_open),
      'staleLeads', (select count(*) from filtered_leads where is_open and (last_contact_at is null or last_contact_at < now() - make_interval(days => p_inactivity_days))),
      'openDeals', (select count(*) from company_deals where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null),
      'pipelineValue', coalesce((select sum("CRMOppty_ExpectedValueAmount") from company_deals where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null), 0),
      'currencyCode', coalesce((select nullif(btrim("CRMOppty_CurrencyCode"), '') from company_deals where "CRMOppty_ExpectedValueAmount" is not null order by "CRMOppty_CreatedAt" desc limit 1), 'GBP'),
      'dueFollowUps', (select count(*) from filtered_leads where is_open and "CRMLead_NextActionDueAt" <= now())
    ),
    'areas', coalesce((select jsonb_agg(jsonb_build_object('key', area_key, 'label', area_label, 'count', lead_count) order by area_label)
      from (select area_key, area_label, count(*) lead_count from owned_leads where area_key is not null group by area_key, area_label) areas), '[]'::jsonb),
    'followUps', coalesce((select jsonb_agg(jsonb_build_object(
      'id', "CRMLead_ID", 'companyName', company_name, 'decisionMaker', contact_name, 'email', email,
      'location', area_label, 'lastContactAt', last_contact_at, 'previousConversation', last_subject,
      'laneContext', coalesce(nullif(btrim("CRMLead_TradeLane"), ''), nullif(btrim("CRMLead_ServiceInterest"), '')),
      'nextActionAt', "CRMLead_NextActionDueAt", 'stage', status_name,
      'opportunityValue', "CRMLead_EstimatedValueAmount", 'currencyCode', currency_code,
      'contactAgeDays', case when last_contact_at is null then null else floor(extract(epoch from (now() - last_contact_at)) / 86400)::integer end,
      'neverContacted', last_contact_at is null
    ) order by (last_contact_at is not null), last_contact_at asc, "CRMLead_CreatedAt" asc)
    from filtered_leads where is_open and (last_contact_at is null or last_contact_at < now() - make_interval(days => p_inactivity_days))), '[]'::jsonb),
    'pipeline', coalesce((select jsonb_agg(jsonb_build_object(
      'stageId', "CRMOppty_PipelineStageID", 'stage', pipeline_stage_name, 'pipeline', pipeline_name,
      'count', deal_count, 'value', deal_value, 'currencyCode', currency_code
    ) order by stage_order)
    from (select "CRMOppty_PipelineStageID", pipeline_stage_name, pipeline_name, min("CRMOppty_CurrencyCode") currency_code,
      count(*) deal_count, coalesce(sum("CRMOppty_ExpectedValueAmount"), 0) deal_value,
      min((select s."CRMPipelineStage_SortOrder" from public."CRM_PipelineStages" s where s."CRMPipelineStage_ID" = company_deals."CRMOppty_PipelineStageID")) stage_order
      from company_deals where "CRMOppty_WonAt" is null and "CRMOppty_LostAt" is null
      group by "CRMOppty_PipelineStageID", pipeline_stage_name, pipeline_name) pipeline_groups), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
      'id', activity."CRMActivity_ID", 'leadId', activity."CRMActivity_LeadID", 'dealId', activity."CRMActivity_OpportunityID",
      'subject', activity."CRMActivity_Subject", 'summary', activity."CRMActivity_Summary", 'at', activity."CRMActivity_ActivityAt"
    ) order by activity."CRMActivity_ActivityAt" desc)
    from (select activity.* from public."CRM_Activities" activity
      where not activity."CRMActivity_IsDeleted" and activity."CRMActivity_OwnerUserID" = v_context.user_id
      order by activity."CRMActivity_ActivityAt" desc limit 12) activity), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_crm_get_dashboard(integer, text) from public, anon;
grant execute on function public.multideck_crm_get_dashboard(integer, text) to authenticated;

-- Dexter reads the same lead-native location and can match it during guarded
-- search. No generic write access is introduced.
create or replace function public.multideck_dexter_domain_leads(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_due nulls last, sort_created desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', lead."CRMLead_ID", 'companyName', lead."CRMLead_CompanyName", 'contactName', lead."CRMLead_PersonName",
      'contactEmail', lead."CRMLead_Email", 'status', lead."CRMLead_StatusCode", 'rating', lead."CRMLead_RatingCode",
      'source', lead."CRMLead_SourceCode", 'ownerId', lead."CRMLead_OwnerUserID",
      'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
      'address', public._multideck_crm_lead_native_address(lead."CRMLead_ID"),
      'area', address.area_label, 'mode', lead."CRMLead_ModeCode", 'direction', lead."CRMLead_DirectionCode",
      'tradeLane', lead."CRMLead_TradeLane", 'serviceInterest', lead."CRMLead_ServiceInterest",
      'estimatedValue', lead."CRMLead_EstimatedValueAmount", 'currency', lead."CRMLead_EstimatedValueCurrencyCode",
      'urgency', lead."CRMLead_UrgencyCode", 'score', lead."CRMLead_Score",
      'conversionProbability', lead."CRMLead_AIProbabilityToConvert", 'nextActionDueAt', lead."CRMLead_NextActionDueAt",
      'lastInteractionAt', lead."CRMLead_LastInteractionAt",
      'contactAgeDays', case when lead."CRMLead_LastInteractionAt" is null then null else floor(extract(epoch from (now() - lead."CRMLead_LastInteractionAt")) / 86400)::integer end,
      'pendingTransfer', pending_transfer.value,
      'searchEvidence', evidence.value - 'matched'
    ) row_data,
    coalesce((evidence.value ->> 'confidence')::numeric, 0) search_rank,
    lead."CRMLead_NextActionDueAt" sort_due,
    lead."CRMLead_CreatedAt" sort_created
    from public."CRM_Leads" lead
    join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join lateral (
      select coalesce(
        nullif(concat_ws(' · ', nullif(btrim(lead."CRMLead_TownCity"), ''), nullif(btrim(lead."CRMLead_CountyState"), ''),
          nullif(split_part(btrim(lead."CRMLead_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(lead."CRMLead_CountryCode")), '')), ''),
        organisation.area_label
      ) area_label
      from (select 1) seed
      left join lateral (
        select nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
          nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') area_label
        from public."Org_Addresses" a
        where a."Org_ID" = lead."CRMLead_OrgID"
        order by a."OrgAdd_ID" limit 1
      ) organisation on true
    ) address on true
    left join lateral (
      select jsonb_build_object('id', request."CRMLeadTransfer_ID", 'status', request."CRMLeadTransfer_Status",
        'fromUserId', request."CRMLeadTransfer_FromUserID", 'toUserId', request."CRMLeadTransfer_ToUserID", 'requestedAt', request."CRMLeadTransfer_RequestedAt") value
      from public."CRM_LeadTransferRequests" request
      where request."CRMLeadTransfer_LeadID" = lead."CRMLead_ID" and request."CRMLeadTransfer_Status" = 'pending'
      order by request."CRMLeadTransfer_RequestedAt" desc limit 1
    ) pending_transfer on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'companyName', lead."CRMLead_CompanyName", 'contactName', lead."CRMLead_PersonName",
        'contactEmail', lead."CRMLead_Email", 'status', lead."CRMLead_StatusCode", 'rating', lead."CRMLead_RatingCode",
        'source', lead."CRMLead_SourceCode", 'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
        'area', address.area_label, 'mode', lead."CRMLead_ModeCode", 'direction', lead."CRMLead_DirectionCode",
        'tradeLane', lead."CRMLead_TradeLane", 'serviceInterest', lead."CRMLead_ServiceInterest", 'urgency', lead."CRMLead_UrgencyCode"
      ),
      array['contactEmail']::text[]
    ) evidence(value)
    where not lead."CRMLead_IsDeleted"
      and owner."Company_ID" = p_company_id
      and owner."Auth_User_ID" = auth.uid()
      and (evidence.value ->> 'matched')::boolean
    order by search_rank desc, lead."CRMLead_NextActionDueAt" nulls last, lead."CRMLead_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

revoke all on function public.multideck_dexter_domain_leads(uuid, text, integer) from public, anon, authenticated;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'CRM lead ownership, transfer decisions, native address, area, contact timing, value and follow-up changes.',
    "AIDexterWatchCapability_FieldsJSON" = '["companyName","contactName","status","rating","estimatedValue","ownerId","address","area","contactAgeDays","pendingTransferStatus","nextActionDueAt"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'leads';

create or replace function public._multideck_dexter_lead_address_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_old_address jsonb := '{}';
  v_new_address jsonb;
  v_old_area text;
  v_new_area text;
begin
  if tg_op <> 'INSERT' then
    v_old_address := jsonb_strip_nulls(jsonb_build_object(
      'line1', nullif(btrim(old."CRMLead_AddressLine1"), ''), 'line2', nullif(btrim(old."CRMLead_AddressLine2"), ''),
      'townCity', nullif(btrim(old."CRMLead_TownCity"), ''), 'countyState', nullif(btrim(old."CRMLead_CountyState"), ''),
      'postZipCode', nullif(btrim(old."CRMLead_PostZipCode"), ''), 'countryCode', upper(nullif(btrim(old."CRMLead_CountryCode"), ''))
    ));
    v_old_area := nullif(concat_ws(' · ', nullif(btrim(old."CRMLead_TownCity"), ''), nullif(btrim(old."CRMLead_CountyState"), ''),
      nullif(split_part(btrim(old."CRMLead_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(old."CRMLead_CountryCode")), '')), '');
  end if;
  v_new_address := jsonb_strip_nulls(jsonb_build_object(
    'line1', nullif(btrim(new."CRMLead_AddressLine1"), ''), 'line2', nullif(btrim(new."CRMLead_AddressLine2"), ''),
    'townCity', nullif(btrim(new."CRMLead_TownCity"), ''), 'countyState', nullif(btrim(new."CRMLead_CountyState"), ''),
    'postZipCode', nullif(btrim(new."CRMLead_PostZipCode"), ''), 'countryCode', upper(nullif(btrim(new."CRMLead_CountryCode"), ''))
  ));
  v_new_area := nullif(concat_ws(' · ', nullif(btrim(new."CRMLead_TownCity"), ''), nullif(btrim(new."CRMLead_CountyState"), ''),
    nullif(split_part(btrim(new."CRMLead_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(new."CRMLead_CountryCode")), '')), '');

  select "Company_ID" into v_company_id
  from public."cmp_Users"
  where "User_ID" = coalesce(new."CRMLead_OwnerUserID", new."CRMLead_CreatedBy")
  limit 1;

  if v_company_id is not null and exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'leads'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = new."CRMLead_ID")
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (
      v_company_id, 'leads', tg_table_name, new."CRMLead_ID",
      jsonb_build_object('address', v_old_address, 'area', v_old_area),
      jsonb_build_object('address', v_new_address, 'area', v_new_area)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CRM_Leads_native_address_dexter_watch_insert" on public."CRM_Leads";
create trigger "TR_CRM_Leads_native_address_dexter_watch_insert"
after insert on public."CRM_Leads"
for each row execute function public._multideck_dexter_lead_address_signal();

drop trigger if exists "TR_CRM_Leads_native_address_dexter_watch_update" on public."CRM_Leads";
create trigger "TR_CRM_Leads_native_address_dexter_watch_update"
after update of "CRMLead_AddressLine1", "CRMLead_AddressLine2", "CRMLead_TownCity", "CRMLead_CountyState", "CRMLead_PostZipCode", "CRMLead_CountryCode"
on public."CRM_Leads"
for each row execute function public._multideck_dexter_lead_address_signal();

commit;
