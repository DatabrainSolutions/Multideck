-- Keep the Quotes register and quote workspace on the same customer-facing
-- reference. The internal Q-{number} remains the fallback for legacy records
-- that do not yet have a saved customer reference.

begin;

create or replace view public."App_Live_Quotes" with (security_invoker = true) as
select
  quote."CusQuoteHeader_ID",
  coalesce(nullif(btrim(quote."CusQuoteHeader_CustomerReference"), ''), 'Q-' || quote."CusQuoteHeader_Number") as "Quote_Reference",
  initcap(replace(coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft'), '_', ' ')) as "Quote_Status",
  case coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft')
    when 'accepted' then 'green' when 'sent' then 'teal'
    when 'calculated' then 'blue' when 'declined' then 'red'
    when 'ghosted' then 'neutral' else 'amber' end as "Quote_Status_Tone",
  coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot", '')::varchar(100) as "Customer_Name",
  coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra", '') as "Origin",
  coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra", '') as "Destination",
  quote."CusQuoteHeader_ValidFrom" as "Estimated_Departure",
  quote."CusQuoteHeader_ValidTo" as "Estimated_Arrival",
  coalesce((quote."CusQuoteHeader_ValidTo" - quote."CusQuoteHeader_ValidFrom")::text || ' days', '') as "Transport_Time",
  initcap(coalesce(quote."CusQuoteHeader_ModeCode", '')) as "Transport_Mode",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'equipment', quote."CusQuoteHeader_ShipmentTypeCode", '')::varchar as "Equipment_Load",
  coalesce(quote."CusQuoteHeader_CollectionAddress", '') as "Pickup",
  coalesce(quote."CusQuoteHeader_DeliveryAddress", '') as "Delivery",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'routingVia', '') as "Routing_Via",
  coalesce(quote."CusQuoteHeader_Incoterm", '')::varchar as "Incoterms",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'namedPlace', '') as "Incoterms_Place",
  coalesce(quote."CusQuoteHeader_ServiceLevel", '')::varchar as "Service_Level",
  coalesce(quote."CusQuoteHeader_ShipmentTypeCode", '')::varchar as "Shipment_Type",
  coalesce(quote."CusQuoteHeader_CarrierNameSnapshot", carrier."Org_Name", '')::text as "Carrier",
  coalesce(quote."CusQuoteHeader_SupplierNameSnapshot", supplier."Org_Name", '')::text as "Supplier",
  coalesce(sales_owner."User_Firstname" || ' ' || sales_owner."User_Lastname", '') as "Sales_Owner",
  coalesce(created_by."User_Firstname" || ' ' || created_by."User_Lastname", '') as "Operations_Owner",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'quoteType', 'Spot') as "Quote_Type",
  initcap(coalesce(quote."CusQuoteHeader_Direction", '')) as "Direction",
  coalesce(quote."CusQuoteHeader_CustomerReference", '')::text as "Customer_Purchase_Order",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'shipperReference', '') as "Shipper_Reference",
  to_char(quote."CusQuoteHeader_ValidTo", 'DD Mon YYYY') as "Validity",
  to_char(quote."CusQuoteHeader_Deadline", 'DD Mon · HH24:MI') as "Estimated_Quote",
  coalesce(totals.sell, 0) as "Sell_Value",
  coalesce(totals.sell - totals.cost, 0) as "Estimated_Profit",
  coalesce(totals.cost, 0) as "Estimated_Cost",
  case when coalesce(totals.sell, 0) = 0 then null
    else round(((totals.sell - totals.cost) / totals.sell) * 100, 2) end as "Estimated_Margin",
  coalesce(quote."CusQuoteHeader_CurrencyCode", '')::varchar as "Currency",
  'Draft'::text as "Document_Status",
  initcap(replace(coalesce(quote."CusQuoteHeader_LifecycleCode", 'draft'), '_', ' ')) as "Workflow_Stage",
  coalesce(quote."CusQuoteHeader_ShipmentFactsJSON"->>'priority', '') as "Priority",
  case when quote."CusQuoteHeader_ShipmentFactsJSON"->>'priority' = 'Urgent'
    then 'red' else 'neutral' end as "Priority_Tone",
  coalesce(quote."CusQuoteHeader_RateSourceLabel", initcap(quote."CusQuoteHeader_RateSourceTypeCode"), '')::text as "Quote_Source",
  quote."CusQuoteHeader_CreatedDate"::timestamptz as "Created_At",
  coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate")::timestamptz as "Updated_At"
from public."CusQuote_Header" quote
left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
left join public."Org_Master" supplier on supplier."Org_id" = quote."CusQuoteHeader_SupplierID"
left join public."Org_Master" carrier on carrier."Org_id" = quote."CusQuoteHeader_CarrierID"
left join public."cmp_Users" sales_owner on sales_owner."User_ID" = quote."CusQuoteHeader_SalesOwnerID"
left join public."cmp_Users" created_by on created_by."User_ID" = quote."CusQuoteHeader_CreatedBy"
left join lateral (
  select
    coalesce(sum(line."CusQuoteLine_CostAmountLocal"), 0) as cost,
    coalesce(sum(line."CusQuoteLine_RevenueAmountLocal"), 0) as sell
  from public."CusQuote_Lines" line
  where line."CusQuoteHeader_ID" = quote."CusQuoteHeader_ID"
) totals on true
where not quote."CusQuoteHeader_IsDeleted";

grant select on public."App_Live_Quotes" to authenticated;

commit;
