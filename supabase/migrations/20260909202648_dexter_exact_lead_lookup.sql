-- Resolve exact lead IDs through the existing owner/company-scoped domain.
-- UUIDs never use typo recovery: a near match must not select a different lead.
-- Chat and watch-target resolution share this function. No new writes or events.
begin;

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
    cross join lateral (select case
      when btrim(coalesce(p_search, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        jsonb_build_object('matched', lead."CRMLead_ID"::text = lower(btrim(p_search)),
          'quality', 'exact_identifier', 'matchedField', 'recordId',
          'matchedValue', lead."CRMLead_ID", 'confidence', 1)
      else public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'companyName', lead."CRMLead_CompanyName", 'contactName', lead."CRMLead_PersonName",
        'contactEmail', lead."CRMLead_Email", 'status', lead."CRMLead_StatusCode", 'rating', lead."CRMLead_RatingCode",
        'source', lead."CRMLead_SourceCode", 'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
        'area', address.area_label, 'mode', lead."CRMLead_ModeCode", 'direction', lead."CRMLead_DirectionCode",
        'tradeLane', lead."CRMLead_TradeLane", 'serviceInterest', lead."CRMLead_ServiceInterest", 'urgency', lead."CRMLead_UrgencyCode"
      ),
      array['contactEmail']::text[]
    ) end) evidence(value)
    where not lead."CRMLead_IsDeleted"
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
      and owner."Company_ID" = p_company_id
      and owner."Auth_User_ID" = auth.uid()
      and (evidence.value ->> 'matched')::boolean
    order by search_rank desc, lead."CRMLead_NextActionDueAt" nulls last, lead."CRMLead_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

revoke all on function public.multideck_dexter_domain_leads(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_leads(uuid, text, integer) to service_role;

commit;
