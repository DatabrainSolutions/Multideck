create or replace view public."App_Live_Bookings" with (security_invoker = true) as
select
  j."Job_ID",
  'MD-' || j."Job_Number" as "Booking_Reference",
  coalesce(c."Org_Name", 'Unassigned customer') as "Customer_Name",
  concat_ws(' → ', coalesce(j."Job_OriginNameSnapshot", j."Job_OriginUNLocode"), coalesce(j."Job_DestinationNameSnapshot", j."Job_DestinationUNLocode")) as "Route",
  coalesce(carrier."Org_Name", 'Carrier pending') as "Carrier",
  coalesce(cargo.description, 'Shipment') as "Equipment",
  upper(coalesce(j."Job_TransportModeSummary", 'road')) as "Mode",
  initcap(coalesce(j."Job_Direction", 'Domestic')) as "Direction",
  coalesce(cargo.description, 'General cargo') as "Shipment_Type",
  ''::text as "Value_Display",
  coalesce(to_char(j."Job_PredictedDeliveryAt", 'DD Mon · HH24:MI'), to_char(j."Job_RequiredDeliveryDate", 'DD Mon')) as "Eta_Display",
  coalesce(j."Job_CurrentLocationNameSnapshot", 'Planning') as "Time_Display",
  case when coalesce(j."Job_TrackingRiskScore", 0) >= 0.80 then 'Exception' when coalesce(j."Job_TrackingRiskScore", 0) >= 0.50 then 'Delayed' else 'On track' end as "Status",
  case when j."Job_ClosedDate" is not null then 100 when j."Job_TrackingStatus" = 'in_transit' then 62 when j."Job_TrackingStatus" = 'delayed' then 48 else 24 end as "Progress",
  'OP'::text as "Owner_Code",
  case when coalesce(j."Job_TrackingRiskScore", 0) >= 0.80 then 'red' when coalesce(j."Job_TrackingRiskScore", 0) >= 0.50 then 'amber' else 'green' end as "Tone",
  ''::text as "Invoice_Reference",
  'JOB-' || j."Job_Number" as "Job_Reference",
  coalesce(c."Org_AccCode", '') as "Customer_Reference",
  ''::text as "Supplier_Reference",
  coalesce(j."Job_OriginNameSnapshot", j."Job_OriginUNLocode", '') as "Origin",
  coalesce(j."Job_DestinationNameSnapshot", j."Job_DestinationUNLocode", '') as "Destination",
  coalesce(r."JobRoute_TransportMeansName", r."JobRoute_Vessel", '') as "Vessel",
  coalesce(r."JobRoute_EstimatedDepartureAt", r."JobRoute_PlannedDepartureAt")::date as "Departure_Date",
  coalesce(r."JobRoute_EstimatedArrivalAt", r."JobRoute_PlannedArrivalAt", j."Job_PredictedDeliveryAt")::date as "Arrival_Date",
  coalesce(r."JobRoute_VehicleRegistration", '') as "Vin",
  false as "Is_Favourite",
  jsonb_build_array(jsonb_build_object('label', 'Tracking', 'value', coalesce(j."Job_TrackingStatus", 'Planning'))) as "Custom_Fields",
  coalesce(j."Job_UpdatedAt", j."Job_CreatedDate"::timestamptz) as "Updated_At",
  coalesce(r."JobRoute_EstimatedDepartureAt", r."JobRoute_PlannedDepartureAt") as "Departure_At",
  coalesce(r."JobRoute_EstimatedArrivalAt", r."JobRoute_PlannedArrivalAt", j."Job_PredictedDeliveryAt") as "Arrival_At"
from public."Job_Header" j
left join public."Org_Master" c on c."Org_id" = j."Job_Customer"
left join public."Org_Master" carrier on carrier."Org_id" = j."Job_Carrier"
left join lateral (
  select rr.*
  from public."Job_Routing" rr
  where rr."Job_ID" = j."Job_ID"
  order by rr."JobRoute_OrderNo" nulls last
  limit 1
) r on true
left join lateral (
  select max(cg."JobCargo_Description") as description
  from public."Job_Cargo" cg
  where cg."JobCargo_JobID" = j."Job_ID"
    and not coalesce(cg."JobCargo_IsDeleted", false)
) cargo on true
where not coalesce(j."Job_IsDeleted", false);

comment on column public."App_Live_Bookings"."Departure_At" is 'Full route departure timestamp for time-series analysis; operator date UI continues to use Departure_Date.';
comment on column public."App_Live_Bookings"."Arrival_At" is 'Full route arrival timestamp for time-series analysis; operator date UI continues to use Arrival_Date.';
