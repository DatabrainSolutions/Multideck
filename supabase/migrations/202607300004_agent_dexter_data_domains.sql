-- Read-only, authenticated data capabilities for Agent Dexter.
--
-- Each tenant Supabase project owns its own registry. Product modules add a domain by
-- shipping a reviewed query function with the standard (company_id, search, take)
-- signature and registering that function below. Dexter never receives arbitrary SQL
-- access and authenticated users cannot edit the registry or call the domain functions.

begin;

create table if not exists public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code" text primary key,
  "AIDexterDomain_Name" text not null,
  "AIDexterDomain_Description" text not null,
  "AIDexterDomain_QueryFunction" text not null,
  "AIDexterDomain_SortOrder" integer not null default 100,
  "AIDexterDomain_IsActive" boolean not null default true,
  "AIDexterDomain_UpdatedAt" timestamptz not null default now(),
  constraint "CK_sys_AIDexterDataDomains_Code"
    check ("AIDexterDomain_Code" ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint "CK_sys_AIDexterDataDomains_QueryFunction"
    check ("AIDexterDomain_QueryFunction" ~ '^multideck_dexter_domain_[a-z0-9_]{1,40}$')
);

alter table public."sys_AIDexterDataDomains" enable row level security;
revoke all on table public."sys_AIDexterDataDomains" from public, anon, authenticated;

create or replace function public._multideck_dexter_context()
returns table(user_id uuid, company_id uuid)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in again to use Agent Dexter.' using errcode = '42501';
  end if;

  return query
  select profile."User_ID", profile."Company_ID"
  from public."cmp_Users" profile
  where profile."Auth_User_ID" = auth.uid()
    and profile."Company_ID" is not null
  limit 1;

  if not found then
    raise exception 'Your signed-in account is not linked to this Multideck workspace.'
      using errcode = '42501';
  end if;
end;
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
    select
      nullif(btrim(p_search), '') as search,
      greatest(1, least(coalesce(p_take, 10), 15)) as take
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
      'openOrders', (
        select count(*)
        from public."WMS_Orders" orders
        join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID"
        join public."sys_WMSOrderStatuses" status on status."WMSOrderStatus_Code" = orders."WMSOrder_StatusCode"
        where not orders."WMSOrder_IsDeleted" and status."WMSOrderStatus_IsOpen"
      ),
      'openTasks', (
        select count(*)
        from public."WMS_Tasks" tasks
        join company_facilities facility on facility."WMSFacility_ID" = tasks."WMSTask_FacilityID"
        join public."sys_WMSTaskStatuses" status on status."WMSTaskStatus_Code" = tasks."WMSTask_StatusCode"
        where status."WMSTaskStatus_IsOpen"
      ),
      'openExceptions', (
        select count(*)
        from public."WMS_Exceptions" exception
        join company_facilities facility on facility."WMSFacility_ID" = exception."WMSException_FacilityID"
        where exception."WMSException_ResolvedAt" is null
      ),
      'heldStockQuantity', (
        select coalesce(sum(balance."WMSBalance_HeldQuantity"), 0)
        from public."WMS_InventoryBalances" balance
        join company_facilities facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
      )
    ) as value
  ),
  order_rows as (
    select jsonb_build_object(
      'recordId', orders."WMSOrder_ID",
      'orderNumber', orders."WMSOrder_OrderNumber",
      'type', orders."WMSOrder_TypeCode",
      'status', orders."WMSOrder_StatusCode",
      'priority', orders."WMSOrder_PriorityCode",
      'facility', facility."WMSFacility_Code",
      'customerReference', orders."WMSOrder_CustomerReference",
      'requestedDate', orders."WMSOrder_RequestedDate",
      'containerNumber', orders."WMSOrder_ContainerNumber",
      'releaseGateStatus', orders."WMSOrder_ReleaseGateStatusCode"
    ) as value
    from public."WMS_Orders" orders
    join company_facilities facility on facility."WMSFacility_ID" = orders."WMSOrder_FacilityID"
    cross join parameters
    where not orders."WMSOrder_IsDeleted"
      and (
        parameters.search is null
        or orders."WMSOrder_OrderNumber" ilike '%' || parameters.search || '%'
        or orders."WMSOrder_CustomerReference" ilike '%' || parameters.search || '%'
        or orders."WMSOrder_ContainerNumber" ilike '%' || parameters.search || '%'
        or facility."WMSFacility_Code" ilike '%' || parameters.search || '%'
        or facility."WMSFacility_Name" ilike '%' || parameters.search || '%'
      )
    order by orders."WMSOrder_RequestedDate" nulls last, orders."WMSOrder_UpdatedAt" desc
    limit (select take from parameters)
  ),
  inventory_rows as (
    select jsonb_build_object(
      'sku', item."WMSItem_SKU",
      'description', item."WMSItem_Description",
      'facility', facility."WMSFacility_Code",
      'inventoryStatus', balance."WMSBalance_InventoryStatusCode",
      'customsStatus', balance."WMSBalance_CustomsStatusCode",
      'onHand', balance."WMSBalance_OnHandQuantity",
      'available', balance."WMSBalance_AvailableQuantity",
      'reserved', balance."WMSBalance_ReservedQuantity",
      'held', balance."WMSBalance_HeldQuantity",
      'uom', balance."WMSBalance_UOMCode",
      'isBonded', balance."WMSBalance_IsBonded",
      'lastMovementAt', balance."WMSBalance_LastMovementAt"
    ) as value
    from public."WMS_InventoryBalances" balance
    join company_facilities facility on facility."WMSFacility_ID" = balance."WMSBalance_FacilityID"
    join public."WMS_Items" item on item."WMSItem_ID" = balance."WMSBalance_ItemID"
    cross join parameters
    where not item."WMSItem_IsDeleted"
      and (
        parameters.search is null
        or item."WMSItem_SKU" ilike '%' || parameters.search || '%'
        or item."WMSItem_Description" ilike '%' || parameters.search || '%'
        or facility."WMSFacility_Code" ilike '%' || parameters.search || '%'
        or facility."WMSFacility_Name" ilike '%' || parameters.search || '%'
      )
    order by balance."WMSBalance_UpdatedAt" desc
    limit (select take from parameters)
  ),
  exception_rows as (
    select jsonb_build_object(
      'title', exception."WMSException_Title",
      'description', exception."WMSException_Description",
      'type', exception."WMSException_TypeCode",
      'status', exception."WMSException_StatusCode",
      'severity', exception."WMSException_SeverityCode",
      'facility', facility."WMSFacility_Code",
      'orderNumber', orders."WMSOrder_OrderNumber",
      'raisedAt', exception."WMSException_RaisedAt"
    ) as value
    from public."WMS_Exceptions" exception
    join company_facilities facility on facility."WMSFacility_ID" = exception."WMSException_FacilityID"
    left join public."WMS_Orders" orders on orders."WMSOrder_ID" = exception."WMSException_OrderID"
    cross join parameters
    where exception."WMSException_ResolvedAt" is null
      and (
        parameters.search is null
        or exception."WMSException_Title" ilike '%' || parameters.search || '%'
        or exception."WMSException_Description" ilike '%' || parameters.search || '%'
        or exception."WMSException_SeverityCode" ilike '%' || parameters.search || '%'
        or facility."WMSFacility_Code" ilike '%' || parameters.search || '%'
        or orders."WMSOrder_OrderNumber" ilike '%' || parameters.search || '%'
      )
    order by exception."WMSException_RaisedAt" desc
    limit (select take from parameters)
  )
  select jsonb_build_object(
    'overview', (select value from overview),
    'orders', coalesce((select jsonb_agg(value) from order_rows), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(value) from inventory_rows), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(value) from exception_rows), '[]'::jsonb)
  );
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
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(row_data order by sort_due nulls last, sort_created desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', lead."CRMLead_ID",
        'companyName', lead."CRMLead_CompanyName",
        'contactName', lead."CRMLead_PersonName",
        'contactEmail', lead."CRMLead_Email",
        'status', lead."CRMLead_StatusCode",
        'rating', lead."CRMLead_RatingCode",
        'source', lead."CRMLead_SourceCode",
        'owner', nullif(btrim(concat_ws(' ', owner."User_Firstname", owner."User_Lastname")), ''),
        'mode', lead."CRMLead_ModeCode",
        'direction', lead."CRMLead_DirectionCode",
        'tradeLane', lead."CRMLead_TradeLane",
        'serviceInterest', lead."CRMLead_ServiceInterest",
        'estimatedValue', lead."CRMLead_EstimatedValueAmount",
        'currency', lead."CRMLead_EstimatedValueCurrencyCode",
        'urgency', lead."CRMLead_UrgencyCode",
        'score', lead."CRMLead_Score",
        'conversionProbability', lead."CRMLead_AIProbabilityToConvert",
        'nextActionDueAt', lead."CRMLead_NextActionDueAt",
        'lastInteractionAt', lead."CRMLead_LastInteractionAt"
      ) as row_data,
      lead."CRMLead_NextActionDueAt" as sort_due,
      lead."CRMLead_CreatedAt" as sort_created
    from public."CRM_Leads" lead
    left join public."cmp_Users" owner on owner."User_ID" = lead."CRMLead_OwnerUserID"
    left join public."cmp_Users" creator on creator."User_ID" = lead."CRMLead_CreatedBy"
    where not lead."CRMLead_IsDeleted"
      and (owner."Company_ID" = p_company_id or creator."Company_ID" = p_company_id)
      and (
        nullif(btrim(p_search), '') is null
        or lead."CRMLead_CompanyName" ilike '%' || btrim(p_search) || '%'
        or lead."CRMLead_PersonName" ilike '%' || btrim(p_search) || '%'
        or lead."CRMLead_Email" ilike '%' || btrim(p_search) || '%'
        or lead."CRMLead_TradeLane" ilike '%' || btrim(p_search) || '%'
        or lead."CRMLead_ServiceInterest" ilike '%' || btrim(p_search) || '%'
      )
    order by lead."CRMLead_NextActionDueAt" nulls last, lead."CRMLead_CreatedAt" desc
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
  select coalesce(jsonb_agg(row_data order by sort_close nulls last, sort_created desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', deal."CRMOppty_ID",
        'name', deal."CRMOppty_Name",
        'pipeline', pipeline."CRMPipeline_Name",
        'stage', stage."CRMPipelineStage_Name",
        'status', deal."CRMOppty_StatusCode",
        'type', deal."CRMOppty_TypeCode",
        'mode', deal."CRMOppty_ModeCode",
        'direction', deal."CRMOppty_DirectionCode",
        'tradeLane', deal."CRMOppty_TradeLane",
        'serviceInterest', deal."CRMOppty_ServiceInterest",
        'expectedCloseDate', deal."CRMOppty_ExpectedCloseDate",
        'probabilityPct', deal."CRMOppty_ProbabilityPct",
        'expectedValue', deal."CRMOppty_ExpectedValueAmount",
        'expectedMargin', deal."CRMOppty_ExpectedMarginAmount",
        'weightedValue', deal."CRMOppty_WeightedValueAmount",
        'currency', deal."CRMOppty_CurrencyCode",
        'nextActionDueAt', deal."CRMOppty_NextActionDueAt",
        'lastActivityAt', deal."CRMOppty_LastActivityAt"
      ) as row_data,
      deal."CRMOppty_ExpectedCloseDate" as sort_close,
      deal."CRMOppty_CreatedAt" as sort_created
    from public."CRM_Opportunities" deal
    join public."CRM_Pipelines" pipeline
      on pipeline."CRMPipeline_ID" = deal."CRMOppty_PipelineID"
     and pipeline."Company_ID" = p_company_id
     and not pipeline."Is_Deleted"
    left join public."CRM_PipelineStages" stage
      on stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
     and not stage."Is_Deleted"
    where not deal."CRMOppty_IsDeleted"
      and (
        nullif(btrim(p_search), '') is null
        or deal."CRMOppty_Name" ilike '%' || btrim(p_search) || '%'
        or deal."CRMOppty_TradeLane" ilike '%' || btrim(p_search) || '%'
        or deal."CRMOppty_ServiceInterest" ilike '%' || btrim(p_search) || '%'
        or pipeline."CRMPipeline_Name" ilike '%' || btrim(p_search) || '%'
        or stage."CRMPipelineStage_Name" ilike '%' || btrim(p_search) || '%'
      )
    order by deal."CRMOppty_ExpectedCloseDate" nulls last, deal."CRMOppty_CreatedAt" desc
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
  select coalesce(jsonb_agg(row_data order by sort_edited desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'recordId', quote."CusQuoteHeader_ID",
        'quoteNumber', quote."CusQuoteHeader_Number",
        'type', quote."CusQuoteHeader_Type",
        'status', quote."CusQuoteHeader_Status",
        'deadline', quote."CusQuoteHeader_Deadline",
        'mode', quote."CusQuoteHeader_ModeCode",
        'shipmentType', quote."CusQuoteHeader_ShipmentTypeCode",
        'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
        'currency', quote."CusQuoteHeader_CurrencyCode",
        'origin', quote."CusQuoteHeader_OriginExtra",
        'destination', quote."CusQuoteHeader_DestinationExtra",
        'direction', quote."CusQuoteHeader_Direction",
        'incoterm', quote."CusQuoteHeader_Incoterm",
        'validFrom', quote."CusQuoteHeader_ValidFrom",
        'validTo', quote."CusQuoteHeader_ValidTo",
        'lastEditedAt', quote."CusQuoteHeader_LastEditedDate"
      ) as row_data,
      quote."CusQuoteHeader_LastEditedDate" as sort_edited
    from public."CusQuote_Header" quote
    left join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
    where not quote."CusQuoteHeader_IsDeleted"
      and (quote."Org_ID" = p_company_id or office."Company_ID" = p_company_id)
      and (
        nullif(btrim(p_search), '') is null
        or quote."CusQuoteHeader_Number"::text ilike '%' || btrim(p_search) || '%'
        or quote."CusQuoteHeader_ModeCode" ilike '%' || btrim(p_search) || '%'
        or quote."CusQuoteHeader_OriginExtra" ilike '%' || btrim(p_search) || '%'
        or quote."CusQuoteHeader_DestinationExtra" ilike '%' || btrim(p_search) || '%'
      )
    order by quote."CusQuoteHeader_LastEditedDate" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) rows;
$$;

revoke all on function public._multideck_dexter_context() from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_warehouse(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_leads(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_deals(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code",
  "AIDexterDomain_Name",
  "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt"
) values
  ('warehouse', 'Warehouse', 'Facilities, orders, inventory, tasks and unresolved warehouse exceptions.', 'multideck_dexter_domain_warehouse', 10, true, now()),
  ('leads', 'Leads', 'CRM leads, qualification, value, ownership and next-action timing.', 'multideck_dexter_domain_leads', 20, true, now()),
  ('deals', 'Deals', 'CRM opportunities, pipeline stage, probability, value and follow-up timing.', 'multideck_dexter_domain_deals', 30, true, now()),
  ('quotes', 'Quotes', 'Customer quote status, routing, validity and commercial context.', 'multideck_dexter_domain_quotes', 40, true, now())
on conflict ("AIDexterDomain_Code") do update
set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder" = excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive" = excluded."AIDexterDomain_IsActive",
  "AIDexterDomain_UpdatedAt" = excluded."AIDexterDomain_UpdatedAt";

create or replace function public.multideck_dexter_list_domains()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', domain."AIDexterDomain_Code",
        'name', domain."AIDexterDomain_Name",
        'description', domain."AIDexterDomain_Description"
      )
      order by domain."AIDexterDomain_SortOrder", domain."AIDexterDomain_Name"
    ),
    '[]'::jsonb
  )
  into v_result
  from public."sys_AIDexterDataDomains" domain
  where domain."AIDexterDomain_IsActive";

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_query_domain(
  p_domain text,
  p_search text default null,
  p_take integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_code text := lower(btrim(coalesce(p_domain, '')));
  v_query_function text;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();

  select domain."AIDexterDomain_QueryFunction"
  into v_query_function
  from public."sys_AIDexterDataDomains" domain
  where domain."AIDexterDomain_Code" = v_code
    and domain."AIDexterDomain_IsActive";

  if v_query_function is null then
    raise exception 'That Dexter data domain is not available in this workspace.'
      using errcode = '22023';
  end if;

  execute format('select public.%I($1, $2, $3)', v_query_function)
  into v_result
  using v_context.company_id, nullif(btrim(p_search), ''), greatest(1, least(coalesce(p_take, 10), 25));

  return jsonb_build_object(
    'domain', v_code,
    'data', coalesce(v_result, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.multideck_dexter_list_domains() from public, anon;
revoke all on function public.multideck_dexter_query_domain(text, text, integer) from public, anon;
grant execute on function public.multideck_dexter_list_domains() to authenticated;
grant execute on function public.multideck_dexter_query_domain(text, text, integer) to authenticated;

create table if not exists public."sys_AIDexterActions" (
  "AIDexterAction_Code" text primary key,
  "AIDexterAction_DomainCode" text not null references public."sys_AIDexterDataDomains"("AIDexterDomain_Code"),
  "AIDexterAction_Name" text not null,
  "AIDexterAction_Description" text not null,
  "AIDexterAction_Function" text not null,
  "AIDexterAction_ParametersJSON" jsonb not null,
  "AIDexterAction_SortOrder" integer not null default 100,
  "AIDexterAction_IsActive" boolean not null default true,
  "AIDexterAction_UpdatedAt" timestamptz not null default now(),
  constraint "CK_sys_AIDexterActions_Code"
    check ("AIDexterAction_Code" ~ '^[a-z][a-z0-9_]{0,49}$'),
  constraint "CK_sys_AIDexterActions_Function"
    check ("AIDexterAction_Function" ~ '^multideck_dexter_action_[a-z0-9_]{1,50}$')
);

create table if not exists public."AI_DexterActionAudit" (
  "AIDexterAudit_ID" uuid primary key default gen_random_uuid(),
  "AIDexterAudit_CompanyID" uuid not null,
  "AIDexterAudit_UserID" uuid not null,
  "AIDexterAudit_ActionCode" text not null,
  "AIDexterAudit_AccessMode" text not null check ("AIDexterAudit_AccessMode" in ('approve', 'full')),
  "AIDexterAudit_ArgumentsJSON" jsonb not null,
  "AIDexterAudit_ResultJSON" jsonb not null,
  "AIDexterAudit_CreatedAt" timestamptz not null default now()
);

alter table public."sys_AIDexterActions" enable row level security;
alter table public."AI_DexterActionAudit" enable row level security;
revoke all on table public."sys_AIDexterActions" from public, anon, authenticated;
revoke all on table public."AI_DexterActionAudit" from public, anon, authenticated;

create or replace function public._multideck_dexter_can_manage(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."cmp_Users_Roles" user_role
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = p_user_id
      and permission."sys_Permission_Value" = 'AgentDexter.Manage'
  );
$$;

create or replace function public.multideck_dexter_action_update_warehouse_order(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid := (p_arguments ->> 'target_id')::uuid;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_arguments ->> 'requested_date', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'instructions', '')), '') is null then
    raise exception 'Choose at least one warehouse order field to update.' using errcode = '22023';
  end if;

  update public."WMS_Orders" orders
  set
    "WMSOrder_RequestedDate" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'requested_date', '')), '')::date,
      orders."WMSOrder_RequestedDate"
    ),
    "WMSOrder_Instructions" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'instructions', '')), ''),
      orders."WMSOrder_Instructions"
    ),
    "WMSOrder_UpdatedAt" = now(),
    "WMSOrder_UpdatedBy" = p_user_id
  from public."WMS_Facilities" facility
  join public."cmp_Offices" office on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
  where orders."WMSOrder_ID" = v_target_id
    and orders."WMSOrder_FacilityID" = facility."WMSFacility_ID"
    and office."Company_ID" = p_company_id
    and not orders."WMSOrder_IsDeleted"
  returning jsonb_build_object(
    'orderNumber', orders."WMSOrder_OrderNumber",
    'requestedDate', orders."WMSOrder_RequestedDate",
    'instructions', orders."WMSOrder_Instructions"
  ) into v_result;

  if v_result is null then
    raise exception 'That warehouse order is outside this workspace or no longer exists.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.multideck_dexter_action_update_lead(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid := (p_arguments ->> 'target_id')::uuid;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_arguments ->> 'next_action_due_at', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'service_interest', '')), '') is null then
    raise exception 'Choose at least one lead field to update.' using errcode = '22023';
  end if;

  update public."CRM_Leads" lead
  set
    "CRMLead_NextActionDueAt" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'next_action_due_at', '')), '')::timestamptz,
      lead."CRMLead_NextActionDueAt"
    ),
    "CRMLead_ServiceInterest" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'service_interest', '')), ''),
      lead."CRMLead_ServiceInterest"
    ),
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = p_user_id
  where lead."CRMLead_ID" = v_target_id
    and not lead."CRMLead_IsDeleted"
    and exists (
      select 1
      from public."cmp_Users" workspace_user
      where workspace_user."Company_ID" = p_company_id
        and workspace_user."User_ID" in (
          lead."CRMLead_OwnerUserID",
          lead."CRMLead_CreatedBy"
        )
    )
  returning jsonb_build_object(
    'companyName', lead."CRMLead_CompanyName",
    'nextActionDueAt', lead."CRMLead_NextActionDueAt",
    'serviceInterest', lead."CRMLead_ServiceInterest"
  ) into v_result;

  if v_result is null then
    raise exception 'That lead is outside this workspace or no longer exists.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.multideck_dexter_action_update_deal(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid := (p_arguments ->> 'target_id')::uuid;
  v_probability numeric := nullif(btrim(coalesce(p_arguments ->> 'probability_pct', '')), '')::numeric;
  v_result jsonb;
begin
  if v_probability is not null and (v_probability < 0 or v_probability > 100) then
    raise exception 'Deal probability must be between 0 and 100.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_arguments ->> 'expected_close_date', '')), '') is null
     and v_probability is null
     and nullif(btrim(coalesce(p_arguments ->> 'next_action_due_at', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'value_proposition', '')), '') is null then
    raise exception 'Choose at least one deal field to update.' using errcode = '22023';
  end if;

  update public."CRM_Opportunities" deal
  set
    "CRMOppty_ExpectedCloseDate" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'expected_close_date', '')), '')::date,
      deal."CRMOppty_ExpectedCloseDate"
    ),
    "CRMOppty_ProbabilityPct" = coalesce(v_probability, deal."CRMOppty_ProbabilityPct"),
    "CRMOppty_WeightedValueAmount" = case
      when v_probability is not null and deal."CRMOppty_ExpectedValueAmount" is not null
      then round(deal."CRMOppty_ExpectedValueAmount" * v_probability / 100, 4)
      else deal."CRMOppty_WeightedValueAmount"
    end,
    "CRMOppty_NextActionDueAt" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'next_action_due_at', '')), '')::timestamptz,
      deal."CRMOppty_NextActionDueAt"
    ),
    "CRMOppty_ValueProposition" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'value_proposition', '')), ''),
      deal."CRMOppty_ValueProposition"
    ),
    "CRMOppty_UpdatedAt" = now(),
    "CRMOppty_UpdatedBy" = p_user_id
  from public."CRM_Pipelines" pipeline
  where deal."CRMOppty_ID" = v_target_id
    and deal."CRMOppty_PipelineID" = pipeline."CRMPipeline_ID"
    and pipeline."Company_ID" = p_company_id
    and not pipeline."Is_Deleted"
    and not deal."CRMOppty_IsDeleted"
  returning jsonb_build_object(
    'name', deal."CRMOppty_Name",
    'expectedCloseDate', deal."CRMOppty_ExpectedCloseDate",
    'probabilityPct', deal."CRMOppty_ProbabilityPct",
    'nextActionDueAt', deal."CRMOppty_NextActionDueAt",
    'valueProposition', deal."CRMOppty_ValueProposition"
  ) into v_result;

  if v_result is null then
    raise exception 'That deal is outside this workspace or no longer exists.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.multideck_dexter_action_update_quote(
  p_company_id uuid,
  p_user_id uuid,
  p_arguments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_id uuid := (p_arguments ->> 'target_id')::uuid;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_arguments ->> 'deadline', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'service_level', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'internal_notes', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'valid_from', '')), '') is null
     and nullif(btrim(coalesce(p_arguments ->> 'valid_to', '')), '') is null then
    raise exception 'Choose at least one quote field to update.' using errcode = '22023';
  end if;

  update public."CusQuote_Header" quote
  set
    "CusQuoteHeader_Deadline" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'deadline', '')), '')::timestamp,
      quote."CusQuoteHeader_Deadline"
    ),
    "CusQuoteHeader_ServiceLevel" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'service_level', '')), ''),
      quote."CusQuoteHeader_ServiceLevel"
    ),
    "CusQuoteHeader_InternalNotes" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'internal_notes', '')), ''),
      quote."CusQuoteHeader_InternalNotes"
    ),
    "CusQuoteHeader_ValidFrom" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'valid_from', '')), '')::date,
      quote."CusQuoteHeader_ValidFrom"
    ),
    "CusQuoteHeader_ValidTo" = coalesce(
      nullif(btrim(coalesce(p_arguments ->> 'valid_to', '')), '')::date,
      quote."CusQuoteHeader_ValidTo"
    ),
    "CusQuoteHeader_LastEditedDate" = now(),
    "CusQuoteHeader_LastEditedBy" = p_user_id
  where quote."CusQuoteHeader_ID" = v_target_id
    and (
      quote."Org_ID" = p_company_id
      or exists (
        select 1
        from public."cmp_Offices" office
        where office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
          and office."Company_ID" = p_company_id
      )
    )
    and not quote."CusQuoteHeader_IsDeleted"
  returning jsonb_build_object(
    'quoteNumber', quote."CusQuoteHeader_Number",
    'deadline', quote."CusQuoteHeader_Deadline",
    'serviceLevel', quote."CusQuoteHeader_ServiceLevel",
    'validFrom', quote."CusQuoteHeader_ValidFrom",
    'validTo', quote."CusQuoteHeader_ValidTo"
  ) into v_result;

  if v_result is null then
    raise exception 'That quote is outside this workspace or no longer exists.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public._multideck_dexter_can_manage(uuid) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_warehouse_order(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_lead(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_deal(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_quote(uuid, uuid, jsonb) from public, anon, authenticated;

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
    'update_warehouse_order',
    'warehouse',
    'Update warehouse order',
    'Change a warehouse order requested date or internal instructions.',
    'multideck_dexter_action_update_warehouse_order',
    '{"type":"object","properties":{"target_id":{"type":"string","description":"The recordId returned by the warehouse data tool."},"requested_date":{"type":["string","null"],"description":"New ISO date, or null when unchanged."},"instructions":{"type":["string","null"],"description":"New internal instructions, or null when unchanged."},"reason":{"type":"string","description":"A concise operator-facing explanation of the proposed change."}},"required":["target_id","requested_date","instructions","reason"],"additionalProperties":false}'::jsonb,
    10, true, now()
  ),
  (
    'update_lead',
    'leads',
    'Update lead',
    'Change a lead next-action time or service interest.',
    'multideck_dexter_action_update_lead',
    '{"type":"object","properties":{"target_id":{"type":"string","description":"The recordId returned by the leads data tool."},"next_action_due_at":{"type":["string","null"],"description":"New ISO date-time, or null when unchanged."},"service_interest":{"type":["string","null"],"description":"New service interest, or null when unchanged."},"reason":{"type":"string","description":"A concise operator-facing explanation of the proposed change."}},"required":["target_id","next_action_due_at","service_interest","reason"],"additionalProperties":false}'::jsonb,
    20, true, now()
  ),
  (
    'update_deal',
    'deals',
    'Update deal',
    'Change a deal close date, probability, next action or value proposition.',
    'multideck_dexter_action_update_deal',
    '{"type":"object","properties":{"target_id":{"type":"string","description":"The recordId returned by the deals data tool."},"expected_close_date":{"type":["string","null"],"description":"New ISO date, or null when unchanged."},"probability_pct":{"type":["number","null"],"minimum":0,"maximum":100,"description":"New probability percentage, or null when unchanged."},"next_action_due_at":{"type":["string","null"],"description":"New ISO date-time, or null when unchanged."},"value_proposition":{"type":["string","null"],"description":"New value proposition, or null when unchanged."},"reason":{"type":"string","description":"A concise operator-facing explanation of the proposed change."}},"required":["target_id","expected_close_date","probability_pct","next_action_due_at","value_proposition","reason"],"additionalProperties":false}'::jsonb,
    30, true, now()
  ),
  (
    'update_quote',
    'quotes',
    'Update quote',
    'Change a quote deadline, service level, internal notes or validity dates.',
    'multideck_dexter_action_update_quote',
    '{"type":"object","properties":{"target_id":{"type":"string","description":"The recordId returned by the quotes data tool."},"deadline":{"type":["string","null"],"description":"New ISO date-time, or null when unchanged."},"service_level":{"type":["string","null"],"description":"New service level, or null when unchanged."},"internal_notes":{"type":["string","null"],"description":"New internal notes, or null when unchanged."},"valid_from":{"type":["string","null"],"description":"New ISO start date, or null when unchanged."},"valid_to":{"type":["string","null"],"description":"New ISO end date, or null when unchanged."},"reason":{"type":"string","description":"A concise operator-facing explanation of the proposed change."}},"required":["target_id","deadline","service_level","internal_notes","valid_from","valid_to","reason"],"additionalProperties":false}'::jsonb,
    40, true, now()
  )
on conflict ("AIDexterAction_Code") do update
set
  "AIDexterAction_DomainCode" = excluded."AIDexterAction_DomainCode",
  "AIDexterAction_Name" = excluded."AIDexterAction_Name",
  "AIDexterAction_Description" = excluded."AIDexterAction_Description",
  "AIDexterAction_Function" = excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON" = excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder" = excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive" = excluded."AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt" = excluded."AIDexterAction_UpdatedAt";

create or replace function public.multideck_dexter_list_actions()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_can_manage(v_context.user_id) then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', action."AIDexterAction_Code",
        'domain', action."AIDexterAction_DomainCode",
        'name', action."AIDexterAction_Name",
        'description', action."AIDexterAction_Description",
        'parameters', action."AIDexterAction_ParametersJSON"
      )
      order by action."AIDexterAction_SortOrder", action."AIDexterAction_Name"
    ),
    '[]'::jsonb
  )
  into v_result
  from public."sys_AIDexterActions" action
  join public."sys_AIDexterDataDomains" domain
    on domain."AIDexterDomain_Code" = action."AIDexterAction_DomainCode"
   and domain."AIDexterDomain_IsActive"
  where action."AIDexterAction_IsActive";

  return v_result;
end;
$$;

create or replace function public.multideck_dexter_execute_action(
  p_action text,
  p_arguments jsonb,
  p_access_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_code text := lower(btrim(coalesce(p_action, '')));
  v_mode text := lower(btrim(coalesce(p_access_mode, '')));
  v_action_function text;
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_can_manage(v_context.user_id) then
    raise exception 'You do not have permission to let Dexter change workspace data.'
      using errcode = '42501';
  end if;
  if v_mode not in ('approve', 'full') then
    raise exception 'Choose Approve or Full access before changing data.' using errcode = '22023';
  end if;

  select action."AIDexterAction_Function"
  into v_action_function
  from public."sys_AIDexterActions" action
  join public."sys_AIDexterDataDomains" domain
    on domain."AIDexterDomain_Code" = action."AIDexterAction_DomainCode"
   and domain."AIDexterDomain_IsActive"
  where action."AIDexterAction_Code" = v_code
    and action."AIDexterAction_IsActive";

  if v_action_function is null then
    raise exception 'That Dexter action is not available in this workspace.' using errcode = '22023';
  end if;

  execute format('select public.%I($1, $2, $3)', v_action_function)
  into v_result
  using v_context.company_id, v_context.user_id, coalesce(p_arguments, '{}'::jsonb);

  insert into public."AI_DexterActionAudit" (
    "AIDexterAudit_CompanyID",
    "AIDexterAudit_UserID",
    "AIDexterAudit_ActionCode",
    "AIDexterAudit_AccessMode",
    "AIDexterAudit_ArgumentsJSON",
    "AIDexterAudit_ResultJSON"
  ) values (
    v_context.company_id,
    v_context.user_id,
    v_code,
    v_mode,
    coalesce(p_arguments, '{}'::jsonb),
    coalesce(v_result, '{}'::jsonb)
  );

  return jsonb_build_object('action', v_code, 'updated', true, 'result', v_result);
end;
$$;

revoke all on function public.multideck_dexter_list_actions() from public, anon;
revoke all on function public.multideck_dexter_execute_action(text, jsonb, text) from public, anon;
grant execute on function public.multideck_dexter_list_actions() to authenticated;
grant execute on function public.multideck_dexter_execute_action(text, jsonb, text) to authenticated;

commit;
