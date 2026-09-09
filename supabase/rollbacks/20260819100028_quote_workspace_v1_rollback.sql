-- One rollback for all quote_workspace_v1 migrations applied on 2026-08-19.
-- Restores the pre-migration demo quotes and removes only quote-workspace v1 data.

begin;

do $$
begin
  if to_regclass('quote_api.rollback_quote_headers') is null
     or to_regclass('quote_api.rollback_quote_lines') is null then
    raise exception 'Quote rollback snapshots are missing; no data was changed.';
  end if;
end;
$$;

-- Remove quotes created through today's workflow, then restore the exact
-- pre-migration fixtures from the private snapshots.
delete from public."CusQuote_Header"
where "CusQuoteHeader_WorkflowVersionCode" = 'quotes-v1';

insert into public."CusQuote_Header"
select (
  jsonb_populate_record(
    null::public."CusQuote_Header",
    snapshot || jsonb_build_object(
      'CusQuoteHeader_LifecycleCode', 'draft',
      'CusQuoteHeader_ShipmentFactsJSON', '{}'::jsonb
    )
  )
).*
from quote_api.rollback_quote_headers;

insert into public."CusQuote_Lines"
select (jsonb_populate_record(null::public."CusQuote_Lines", snapshot)).*
from quote_api.rollback_quote_lines;

delete from public."sys_AIDexterActions"
where "AIDexterAction_Code" = 'manage_quote_lifecycle';

drop function if exists public.multideck_dexter_action_manage_quote_lifecycle(uuid, uuid, jsonb);
drop function if exists public.quote_workflow_transition_quote(uuid, uuid, text, text, timestamptz);
drop function if exists public.quote_workflow_save_quote(uuid, uuid, jsonb);
drop function if exists public.quote_workflow_has_permission(uuid, text);

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" =
      'Customer quote routing and commercial evidence with exact-reference-first recovery.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'quotes';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" =
      'Quote status, deadline, validity and route changes.',
    "AIDexterWatchCapability_FieldsJSON" =
      '["quoteNumber","status","deadline","validFrom","validTo","origin","destination"]'::jsonb,
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'quotes';

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

revoke all on function public.multideck_dexter_domain_quotes(uuid, text, integer)
  from public, anon, authenticated;

create or replace view public."App_Live_Quotes" with (security_invoker = true) as
select
  q."CusQuoteHeader_ID",
  'Q-' || q."CusQuoteHeader_Number" as "Quote_Reference",
  case q."CusQuoteHeader_Status"
    when 2 then 'Ready to send' when 3 then 'Needs rate' else 'Working' end as "Quote_Status",
  case q."CusQuoteHeader_Status"
    when 2 then 'green' when 3 then 'blue' else 'amber' end as "Quote_Status_Tone",
  c."Org_Name" as "Customer_Name",
  coalesce(q."CusQuoteHeader_OriginExtra", '') as "Origin",
  coalesce(q."CusQuoteHeader_DestinationExtra", '') as "Destination",
  q."CusQuoteHeader_ValidFrom" as "Estimated_Departure",
  q."CusQuoteHeader_ValidTo" as "Estimated_Arrival",
  coalesce((q."CusQuoteHeader_ValidTo" - q."CusQuoteHeader_ValidFrom")::text || ' days', '') as "Transport_Time",
  initcap(coalesce(q."CusQuoteHeader_ModeCode", '')) as "Transport_Mode",
  coalesce(q."CusQuoteHeader_ShipmentTypeCode", '') as "Equipment_Load",
  ''::text as "Pickup", ''::text as "Delivery", 'Direct'::text as "Routing_Via",
  coalesce(q."CusQuoteHeader_Incoterm", '') as "Incoterms",
  coalesce(q."CusQuoteHeader_DestinationExtra", '') as "Incoterms_Place",
  coalesce(q."CusQuoteHeader_ServiceLevel", '') as "Service_Level",
  coalesce(q."CusQuoteHeader_ShipmentTypeCode", '') as "Shipment_Type",
  ''::text as "Carrier", ''::text as "Supplier",
  coalesce(u."User_Firstname" || ' ' || u."User_Lastname", 'Multideck operator') as "Sales_Owner",
  coalesce(u."User_Firstname" || ' ' || u."User_Lastname", 'Multideck operator') as "Operations_Owner",
  'Spot'::text as "Quote_Type",
  initcap(coalesce(q."CusQuoteHeader_Direction", 'Export')) as "Direction",
  ''::text as "Customer_Purchase_Order", ''::text as "Shipper_Reference",
  to_char(q."CusQuoteHeader_ValidTo", 'DD Mon YYYY') as "Validity",
  to_char(q."CusQuoteHeader_Deadline", 'DD Mon · HH24:MI') as "Estimated_Quote",
  coalesce(t.sell, 0) as "Sell_Value",
  coalesce(t.sell - t.cost, 0) as "Estimated_Profit",
  coalesce(t.cost, 0) as "Estimated_Cost",
  case when coalesce(t.sell, 0) = 0 then null
    else round(((t.sell - t.cost) / t.sell) * 100, 2) end as "Estimated_Margin",
  coalesce(q."CusQuoteHeader_CurrencyCode", 'GBP') as "Currency",
  case q."CusQuoteHeader_Status" when 2 then 'Customer copy ready' else 'Draft' end as "Document_Status",
  case q."CusQuoteHeader_Status"
    when 2 then 'Ready to issue' when 3 then 'Supplier pricing' else 'Commercial review' end as "Workflow_Stage",
  case q."CusQuoteHeader_Status"
    when 3 then 'Urgent' when 2 then 'High' else 'Standard' end as "Priority",
  case q."CusQuoteHeader_Status"
    when 3 then 'red' when 2 then 'amber' else 'neutral' end as "Priority_Tone",
  'Canonical quote'::text as "Quote_Source",
  q."CusQuoteHeader_CreatedDate"::timestamptz as "Created_At",
  coalesce(q."CusQuoteHeader_LastEditedDate", q."CusQuoteHeader_CreatedDate")::timestamptz as "Updated_At"
from public."CusQuote_Header" q
join public."Org_Master" c on c."Org_id" = q."CusQuoteHeader_CustomerID"
left join public."cmp_Users" u on u."User_ID" = q."CusQuoteHeader_CreatedBy"
left join lateral (
  select coalesce(sum(l."CusQuoteLine_CostAmountLocal"), 0) cost,
    coalesce(sum(l."CusQuoteLine_RevenueAmountLocal"), 0) sell
  from public."CusQuote_Lines" l
  where l."CusQuoteHeader_ID" = q."CusQuoteHeader_ID"
) t on true
where not q."CusQuoteHeader_IsDeleted";

grant select on public."App_Live_Quotes" to authenticated;

alter table public."CusQuote_Header"
  drop constraint if exists "FK_CusQuote_Header_AcceptedVersion";

drop table if exists public."CusQuote_Events";
drop table if exists public."CusQuote_Versions";
drop table if exists public."CusQuote_Parties";

alter table public."CusQuote_Lines"
  drop column if exists "CusQuoteLine_CostCurrencyCode",
  drop column if exists "CusQuoteLine_RevenueCurrencyCode",
  drop column if exists "CusQuoteLine_CalculationBasisCode",
  drop column if exists "CusQuoteLine_Quantity",
  drop column if exists "CusQuoteLine_UnitRate",
  drop column if exists "CusQuoteLine_MinimumAmount",
  drop column if exists "CusQuoteLine_DefaultMarkupPct",
  drop column if exists "CusQuoteLine_AppliedMarkupPct",
  drop column if exists "CusQuoteLine_MarkupOverrideReason",
  drop column if exists "CusQuoteLine_SourceLabel";

alter table public."CusQuote_Header"
  drop column if exists "CusQuoteHeader_LifecycleCode",
  drop column if exists "CusQuoteHeader_SourceTypeCode",
  drop column if exists "CusQuoteHeader_SourceLeadID",
  drop column if exists "CusQuoteHeader_CustomerNameSnapshot",
  drop column if exists "CusQuoteHeader_ContactNameSnapshot",
  drop column if exists "CusQuoteHeader_ContactEmailSnapshot",
  drop column if exists "CusQuoteHeader_SupplierID",
  drop column if exists "CusQuoteHeader_SupplierNameSnapshot",
  drop column if exists "CusQuoteHeader_CarrierID",
  drop column if exists "CusQuoteHeader_CarrierNameSnapshot",
  drop column if exists "CusQuoteHeader_CustomerReference",
  drop column if exists "CusQuoteHeader_DepartmentID",
  drop column if exists "CusQuoteHeader_SalesOwnerID",
  drop column if exists "CusQuoteHeader_CollectionAddress",
  drop column if exists "CusQuoteHeader_LoadingPoint",
  drop column if exists "CusQuoteHeader_DischargePoint",
  drop column if exists "CusQuoteHeader_DeliveryAddress",
  drop column if exists "CusQuoteHeader_ShipmentFactsJSON",
  drop column if exists "CusQuoteHeader_CustomerNotes",
  drop column if exists "CusQuoteHeader_TermsText",
  drop column if exists "CusQuoteHeader_RateSourceTypeCode",
  drop column if exists "CusQuoteHeader_RateSourceLabel",
  drop column if exists "CusQuoteHeader_DefaultMarkupPct",
  drop column if exists "CusQuoteHeader_MarkupOverrideReason",
  drop column if exists "CusQuoteHeader_FollowUpAt",
  drop column if exists "CusQuoteHeader_OutcomeNotes",
  drop column if exists "CusQuoteHeader_AcceptedVersionID",
  drop column if exists "CusQuoteHeader_WorkflowVersionCode";

do $$
begin
  if exists (
    select 1 from public."CusQuote_Header"
    where "CusQuoteHeader_CustomerID" is null
  ) then
    raise exception 'A non-workflow quote has no customer; rollback stopped without dropping the safeguard.';
  end if;
end;
$$;

alter table public."CusQuote_Header"
  alter column "CusQuoteHeader_CustomerID" set not null;

drop schema quote_api cascade;

commit;
