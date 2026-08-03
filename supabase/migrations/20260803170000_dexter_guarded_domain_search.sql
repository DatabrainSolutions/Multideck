-- Give every current Dexter data domain the same guarded typo recovery used by
-- email search. Exact references and phrases win; fuzzy text is returned only
-- above a conservative threshold and is labelled as a candidate for Dexter to
-- verify before it makes a claim or prepares a change.

create extension if not exists pg_trgm with schema extensions;

create or replace function public._multideck_dexter_search_evidence(
  p_search text,
  p_fields jsonb,
  p_identifier_fields text[] default array[]::text[]
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, public, extensions
as $$
declare
  v_search text := btrim(regexp_replace(lower(coalesce(p_search, '')), '[^[:alnum:]@]+', ' ', 'g'));
  v_search_compact text := regexp_replace(lower(coalesce(p_search, '')), '[^[:alnum:]]+', '', 'g');
  v_key text;
  v_value text;
  v_normalized text;
  v_compact text;
  v_combined text := '';
  v_exact_identifier_key text;
  v_exact_identifier_value text;
  v_exact_key text;
  v_exact_value text;
  v_phrase_key text;
  v_phrase_value text;
  v_phrase_length integer;
  v_best_key text;
  v_best_value text;
  v_best_similarity real := 0;
  v_similarity real;
  v_term text;
  v_term_count integer := 0;
  v_all_terms boolean := true;
begin
  if v_search = '' then
    return jsonb_build_object('matched', true, 'quality', 'unfiltered', 'confidence', 1);
  end if;

  for v_key, v_value in
    select field.key, field.value
    from jsonb_each_text(coalesce(p_fields, '{}'::jsonb)) field
    where nullif(btrim(field.value), '') is not null
  loop
    v_normalized := btrim(regexp_replace(lower(v_value), '[^[:alnum:]@]+', ' ', 'g'));
    v_compact := regexp_replace(lower(v_value), '[^[:alnum:]]+', '', 'g');
    v_combined := btrim(v_combined || ' ' || v_normalized);

    if v_key = any(coalesce(p_identifier_fields, array[]::text[]))
       and v_search_compact <> ''
       and v_search_compact = v_compact then
      v_exact_identifier_key := v_key;
      v_exact_identifier_value := v_value;
    elsif v_search = v_normalized and v_exact_key is null then
      v_exact_key := v_key;
      v_exact_value := v_value;
    elsif position(v_search in v_normalized) > 0
       and (v_phrase_length is null or length(v_normalized) < v_phrase_length) then
      v_phrase_key := v_key;
      v_phrase_value := v_value;
      v_phrase_length := length(v_normalized);
    end if;

    v_similarity := greatest(
      extensions.similarity(v_search, v_normalized),
      extensions.word_similarity(v_search, v_normalized)
    );
    if v_similarity > v_best_similarity then
      v_best_similarity := v_similarity;
      v_best_key := v_key;
      v_best_value := v_value;
    end if;
  end loop;

  if v_exact_identifier_key is not null then
    return jsonb_build_object(
      'matched', true, 'quality', 'exact_identifier', 'matchedField', v_exact_identifier_key,
      'matchedValue', v_exact_identifier_value, 'confidence', 1
    );
  end if;
  if v_exact_key is not null then
    return jsonb_build_object(
      'matched', true, 'quality', 'exact_text', 'matchedField', v_exact_key,
      'matchedValue', v_exact_value, 'confidence', 1
    );
  end if;
  if v_phrase_key is not null then
    return jsonb_build_object(
      'matched', true, 'quality', 'exact_phrase', 'matchedField', v_phrase_key,
      'matchedValue', v_phrase_value, 'confidence', 1
    );
  end if;

  for v_term in
    select token
    from regexp_split_to_table(v_search, '\s+') token
    where length(token) >= 2
  loop
    v_term_count := v_term_count + 1;
    if position(v_term in v_combined) = 0 then
      v_all_terms := false;
    end if;
  end loop;

  if v_term_count > 1 and v_all_terms then
    return jsonb_build_object(
      'matched', true, 'quality', 'all_terms', 'matchedField', 'multiple',
      'matchedValue', null, 'confidence', 0.95
    );
  end if;

  if v_best_key is not null
     and (
       (v_term_count > 1 and v_best_similarity >= 0.72)
       or (v_term_count = 1 and length(v_search) >= 7 and v_best_similarity >= 0.78)
     ) then
    return jsonb_build_object(
      'matched', true, 'quality', 'corrected_text', 'matchedField', v_best_key,
      'matchedValue', v_best_value, 'confidence', round(v_best_similarity::numeric, 2)
    );
  end if;

  return jsonb_build_object('matched', false, 'quality', 'none', 'confidence', 0);
end;
$$;

create or replace function public.multideck_dexter_domain_customers(
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
  select coalesce(jsonb_agg(row_data order by search_rank desc, customer_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', customer."Org_id",
      'name', customer."Org_Name",
      'status', customer."Org_CRMRelationshipStatusCode",
      'isPotentialCustomer', customer."Org_CRMIsPotentialCustomer",
      'searchEvidence', evidence.value - 'matched'
    ) as row_data,
    coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
    customer."Org_Name" as customer_name
    from public."Org_Master" customer
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'name', customer."Org_Name",
        'status', customer."Org_CRMRelationshipStatusCode"
      )
    ) evidence(value)
    where public._multideck_dexter_has_permission(
      (select profile."User_ID" from public."cmp_Users" profile where profile."Auth_User_ID" = auth.uid() and profile."Company_ID" = p_company_id limit 1),
      'Customers.Read'
    )
      and (
        customer."Org_CRMIsPotentialCustomer"
        or exists (
          select 1 from public."Org_Master_Type" customer_type
          join public."Org_Types" type on type."OrgType_ID" = customer_type."OrgType_ID"
          where customer_type."Org_ID" = customer."Org_id" and type."OrgType_Name" = 'Customer'
        )
      )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, customer."Org_Name"
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) customers;
$$;

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
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    lead."CRMLead_NextActionDueAt" sort_due,
    lead."CRMLead_CreatedAt" sort_created
    from public."CRM_Leads" lead
    join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join lateral (
      select nullif(concat_ws(' · ', nullif(btrim(a."OrgAdd_TownCity"), ''), nullif(btrim(a."OrgAdd_CountyState"), ''),
        nullif(split_part(btrim(a."OrgAdd_PostZipCode"), ' ', 1), ''), nullif(upper(btrim(a."OrgAdd_Country")), '')), '') area_label
      from public."Org_Addresses" a where a."Org_ID" = lead."CRMLead_OrgID" order by a."OrgAdd_ID" limit 1
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
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, lead."CRMLead_NextActionDueAt" nulls last, lead."CRMLead_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

create or replace function public.multideck_dexter_domain_deals(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_close nulls last, sort_created desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', deal."CRMOppty_ID", 'name', deal."CRMOppty_Name", 'pipeline', pipeline."CRMPipeline_Name",
      'stage', stage."CRMPipelineStage_Name", 'status', deal."CRMOppty_StatusCode", 'type', deal."CRMOppty_TypeCode",
      'mode', deal."CRMOppty_ModeCode", 'direction', deal."CRMOppty_DirectionCode", 'tradeLane', deal."CRMOppty_TradeLane",
      'serviceInterest', deal."CRMOppty_ServiceInterest", 'expectedCloseDate', deal."CRMOppty_ExpectedCloseDate",
      'probabilityPct', deal."CRMOppty_ProbabilityPct", 'expectedValue', deal."CRMOppty_ExpectedValueAmount",
      'expectedMargin', deal."CRMOppty_ExpectedMarginAmount", 'weightedValue', deal."CRMOppty_WeightedValueAmount",
      'currency', deal."CRMOppty_CurrencyCode", 'nextActionDueAt', deal."CRMOppty_NextActionDueAt",
      'lastActivityAt', deal."CRMOppty_LastActivityAt", 'searchEvidence', evidence.value - 'matched'
    ) row_data,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    deal."CRMOppty_ExpectedCloseDate" sort_close,
    deal."CRMOppty_CreatedAt" sort_created
    from public."CRM_Opportunities" deal
    join public."CRM_Pipelines" pipeline
      on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
     and pipeline."Company_ID" = p_company_id
     and not pipeline."Is_Deleted"
    left join public."CRM_PipelineStages" stage
      on stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
     and not stage."Is_Deleted"
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'name', deal."CRMOppty_Name", 'pipeline', pipeline."CRMPipeline_Name", 'stage', stage."CRMPipelineStage_Name",
        'status', deal."CRMOppty_StatusCode", 'type', deal."CRMOppty_TypeCode", 'mode', deal."CRMOppty_ModeCode",
        'direction', deal."CRMOppty_DirectionCode", 'tradeLane', deal."CRMOppty_TradeLane",
        'serviceInterest', deal."CRMOppty_ServiceInterest"
      )
    ) evidence(value)
    where not deal."CRMOppty_IsDeleted"
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, deal."CRMOppty_ExpectedCloseDate" nulls last, deal."CRMOppty_CreatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

create or replace function public.multideck_dexter_domain_quotes(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_edited desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'recordId', quote."CusQuoteHeader_ID", 'quoteNumber', quote."CusQuoteHeader_Number",
      'type', quote."CusQuoteHeader_Type", 'status', quote."CusQuoteHeader_Status", 'deadline', quote."CusQuoteHeader_Deadline",
      'mode', quote."CusQuoteHeader_ModeCode", 'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode",
      'serviceLevel', quote."CusQuoteHeader_ServiceLevel", 'currency', quote."CusQuoteHeader_CurrencyCode",
      'origin', quote."CusQuoteHeader_OriginExtra", 'destination', quote."CusQuoteHeader_DestinationExtra",
      'direction', quote."CusQuoteHeader_Direction", 'incoterm', quote."CusQuoteHeader_Incoterm",
      'validFrom', quote."CusQuoteHeader_ValidFrom", 'validTo', quote."CusQuoteHeader_ValidTo",
      'lastEditedAt', quote."CusQuoteHeader_LastEditedDate", 'searchEvidence', evidence.value - 'matched'
    ) row_data,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    quote."CusQuoteHeader_LastEditedDate" sort_edited
    from public."CusQuote_Header" quote
    left join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'quoteNumber', quote."CusQuoteHeader_Number", 'type', quote."CusQuoteHeader_Type",
        'status', quote."CusQuoteHeader_Status", 'mode', quote."CusQuoteHeader_ModeCode",
        'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode", 'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
        'currency', quote."CusQuoteHeader_CurrencyCode", 'origin', quote."CusQuoteHeader_OriginExtra",
        'destination', quote."CusQuoteHeader_DestinationExtra", 'direction', quote."CusQuoteHeader_Direction",
        'incoterm', quote."CusQuoteHeader_Incoterm"
      ),
      array['quoteNumber']::text[]
    ) evidence(value)
    where not quote."CusQuoteHeader_IsDeleted"
      and (quote."Org_ID" = p_company_id or office."Company_ID" = p_company_id)
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, quote."CusQuoteHeader_LastEditedDate" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

create or replace function public.multideck_dexter_domain_warehouse(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with parameters as (
    select greatest(1, least(coalesce(p_take, 10), 15)) as take
  ),
  company_facilities as (
    select facility.*
    from public."WMS_Facilities" facility
    join public."cmp_Offices" office
      on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
     and office."Company_ID" = p_company_id
    where not facility."WMSFacility_IsDeleted"
  ),
  overview as (
    select jsonb_build_object(
      'activeFacilities', (select count(*) from company_facilities where "WMSFacility_IsActive"),
      'openOrders', (select count(*) from public."WMS_Orders" orders join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID" join public."sys_WMSOrderStatuses" status on status."WMSOrderStatus_Code" = orders."WMSOrder_StatusCode" where not orders."WMSOrder_IsDeleted" and status."WMSOrderStatus_IsOpen"),
      'openTasks', (select count(*) from public."WMS_Tasks" tasks join company_facilities facility on facility."WMSFacility_ID" = tasks."WMSTask_FacilityID" join public."sys_WMSTaskStatuses" status on status."WMSTaskStatus_Code" = tasks."WMSTask_StatusCode" where status."WMSTaskStatus_IsOpen"),
      'openExceptions', (select count(*) from public."WMS_Exceptions" exception join company_facilities facility on facility."WMSFacility_ID" = exception."WMSException_FacilityID" where exception."WMSException_ResolvedAt" is null),
      'heldStockQuantity', (select coalesce(sum(balance."WMSBalance_HeldQuantity"), 0) from public."WMS_InventoryBalances" balance join company_facilities facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID")
    ) value
  ),
  order_rows as (
    select jsonb_build_object(
      'recordId', orders."WMSOrder_ID", 'orderNumber', orders."WMSOrder_OrderNumber", 'type', orders."WMSOrder_TypeCode",
      'status', orders."WMSOrder_StatusCode", 'priority', orders."WMSOrder_PriorityCode", 'facility', facility."WMSFacility_Code",
      'customerReference', orders."WMSOrder_CustomerReference", 'requestedDate', orders."WMSOrder_RequestedDate",
      'containerNumber', orders."WMSOrder_ContainerNumber", 'releaseGateStatus', orders."WMSOrder_ReleaseGateStatusCode",
      'searchEvidence', evidence.value - 'matched'
    ) value,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    orders."WMSOrder_RequestedDate" sort_date,
    orders."WMSOrder_UpdatedAt" sort_updated
    from public."WMS_Orders" orders
    join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID"
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'orderNumber', orders."WMSOrder_OrderNumber", 'type', orders."WMSOrder_TypeCode",
        'status', orders."WMSOrder_StatusCode", 'priority', orders."WMSOrder_PriorityCode",
        'facilityCode', facility."WMSFacility_Code", 'facilityName', facility."WMSFacility_Name",
        'customerReference', orders."WMSOrder_CustomerReference", 'containerNumber', orders."WMSOrder_ContainerNumber",
        'releaseGateStatus', orders."WMSOrder_ReleaseGateStatusCode"
      ),
      array['orderNumber', 'customerReference', 'containerNumber']::text[]
    ) evidence(value)
    where not orders."WMSOrder_IsDeleted" and (evidence.value->>'matched')::boolean
    order by search_rank desc, orders."WMSOrder_RequestedDate" nulls last, orders."WMSOrder_UpdatedAt" desc
    limit (select take from parameters)
  ),
  inventory_rows as (
    select jsonb_build_object(
      'sku', item."WMSItem_SKU", 'description', item."WMSItem_Description", 'facility', facility."WMSFacility_Code",
      'inventoryStatus', balance."WMSBalance_InventoryStatusCode", 'customsStatus', balance."WMSBalance_CustomsStatusCode",
      'onHand', balance."WMSBalance_OnHandQuantity", 'available', balance."WMSBalance_AvailableQuantity",
      'reserved', balance."WMSBalance_ReservedQuantity", 'held', balance."WMSBalance_HeldQuantity",
      'uom', balance."WMSBalance_UOMCode", 'isBonded', balance."WMSBalance_IsBonded",
      'lastMovementAt', balance."WMSBalance_LastMovementAt", 'searchEvidence', evidence.value - 'matched'
    ) value,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    balance."WMSBalance_UpdatedAt" sort_updated
    from public."WMS_InventoryBalances" balance
    join company_facilities facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
    join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'sku', item."WMSItem_SKU", 'description', item."WMSItem_Description",
        'facilityCode', facility."WMSFacility_Code", 'facilityName', facility."WMSFacility_Name",
        'inventoryStatus', balance."WMSBalance_InventoryStatusCode", 'customsStatus', balance."WMSBalance_CustomsStatusCode"
      ),
      array['sku']::text[]
    ) evidence(value)
    where not item."WMSItem_IsDeleted" and (evidence.value->>'matched')::boolean
    order by search_rank desc, balance."WMSBalance_UpdatedAt" desc
    limit (select take from parameters)
  ),
  exception_rows as (
    select jsonb_build_object(
      'title', exception."WMSException_Title", 'description', exception."WMSException_Description",
      'type', exception."WMSException_TypeCode", 'status', exception."WMSException_StatusCode",
      'severity', exception."WMSException_SeverityCode", 'facility', facility."WMSFacility_Code",
      'orderNumber', orders."WMSOrder_OrderNumber", 'raisedAt', exception."WMSException_RaisedAt",
      'searchEvidence', evidence.value - 'matched'
    ) value,
    coalesce((evidence.value->>'confidence')::numeric, 0) search_rank,
    exception."WMSException_RaisedAt" sort_raised
    from public."WMS_Exceptions" exception
    join company_facilities facility on facility."WMSFacility_ID" = exception."WMSException_FacilityID"
    left join public."WMS_Orders" orders on orders."WMSOrder_ID" = exception."WMSException_OrderID"
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'title', exception."WMSException_Title", 'description', exception."WMSException_Description",
        'type', exception."WMSException_TypeCode", 'status', exception."WMSException_StatusCode",
        'severity', exception."WMSException_SeverityCode", 'facilityCode', facility."WMSFacility_Code",
        'facilityName', facility."WMSFacility_Name", 'orderNumber', orders."WMSOrder_OrderNumber"
      ),
      array['orderNumber']::text[]
    ) evidence(value)
    where exception."WMSException_ResolvedAt" is null and (evidence.value->>'matched')::boolean
    order by search_rank desc, exception."WMSException_RaisedAt" desc
    limit (select take from parameters)
  )
  select jsonb_build_object(
    'overview', (select value from overview),
    'orders', coalesce((select jsonb_agg(value order by search_rank desc, sort_date nulls last, sort_updated desc) from order_rows), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(value order by search_rank desc, sort_updated desc) from inventory_rows), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(value order by search_rank desc, sort_raised desc) from exception_rows), '[]'::jsonb)
  );
$$;

revoke all on function public._multideck_dexter_search_evidence(text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_customers(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_leads(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_deals(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_warehouse(uuid, text, integer) from public, anon, authenticated;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = case "AIDexterDomain_Code"
  when 'warehouse' then 'Facilities, orders, inventory and unresolved exceptions with guarded reference and name recovery.'
  when 'leads' then 'CRM leads, ownership and next actions with guarded company, contact and email recovery.'
  when 'customers' then 'Customer records with guarded name recovery and operator permission checks.'
  when 'deals' then 'CRM opportunities and pipeline evidence with guarded deal-name recovery.'
  when 'quotes' then 'Customer quote routing and commercial evidence with exact-reference-first recovery.'
  else "AIDexterDomain_Description"
end,
"AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" in ('warehouse', 'leads', 'customers', 'deals', 'quotes');
