-- Keep seeded CRM demo leads out of operator-facing CRM and Dexter trust surfaces.
-- Demo rows remain available for controlled setup/diagnostics, but they must not
-- affect workload counts, area summaries, follow-up queues or Watching for you.
begin;

create or replace function public.multideck_crm_list_leads_essential(p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_rows jsonb;
begin
  v_rows := public.multideck_crm_list_leads(p_search);
  return coalesce((
    select jsonb_agg(item || public._multideck_crm_lead_transfer_state((item ->> 'id')::uuid) order by ordinal)
    from jsonb_array_elements(v_rows) with ordinality rows(item, ordinal)
    join public."CRM_Leads" lead on lead."CRMLead_ID" = (item ->> 'id')::uuid
    where lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
  ), '[]'::jsonb);
end;
$$;

-- Keep personal lead work user-scoped while using lead-native locations for
-- area reporting and organisation addresses only as a legacy fallback. Demo
-- leads are excluded at the source CTE so every lead-derived dashboard output
-- (summary, areas and follow-ups) uses the same trust boundary.
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
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
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

-- Dexter uses the same company/user boundary and native lead address, but does
-- not expose seeded demo rows to chat search.
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
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
      and owner."Company_ID" = p_company_id
      and owner."Auth_User_ID" = auth.uid()
      and (evidence.value ->> 'matched')::boolean
    order by search_rank desc, lead."CRMLead_NextActionDueAt" nulls last, lead."CRMLead_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

-- Recreate all lead watch triggers with the same demo guard. The native-address
-- triggers are also guarded because they are independent signal producers.
drop trigger if exists "TR_CRM_Leads_dexter_watch" on public."CRM_Leads";
create trigger "TR_CRM_Leads_dexter_watch"
after insert or update on public."CRM_Leads"
for each row
when (lower(coalesce(new."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true')
execute function public._multideck_dexter_watch_source_change('leads');

drop trigger if exists "TR_CRM_Leads_native_address_dexter_watch_insert" on public."CRM_Leads";
create trigger "TR_CRM_Leads_native_address_dexter_watch_insert"
after insert on public."CRM_Leads"
for each row
when (lower(coalesce(new."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true')
execute function public._multideck_dexter_lead_address_signal();

drop trigger if exists "TR_CRM_Leads_native_address_dexter_watch_update" on public."CRM_Leads";
create trigger "TR_CRM_Leads_native_address_dexter_watch_update"
after update of "CRMLead_AddressLine1", "CRMLead_AddressLine2", "CRMLead_TownCity", "CRMLead_CountyState", "CRMLead_PostZipCode", "CRMLead_CountryCode"
on public."CRM_Leads"
for each row
when (lower(coalesce(new."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true')
execute function public._multideck_dexter_lead_address_signal();

revoke all on function public.multideck_crm_get_dashboard(integer, text) from public, anon;
grant execute on function public.multideck_crm_get_dashboard(integer, text) to authenticated;
revoke all on function public.multideck_crm_list_leads_essential(text) from public, anon;
grant execute on function public.multideck_crm_list_leads_essential(text) to authenticated;
revoke all on function public.multideck_dexter_domain_leads(uuid, text, integer) from public, anon, authenticated;

commit;
