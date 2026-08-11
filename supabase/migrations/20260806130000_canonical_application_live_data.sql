-- Canonical application data adapters. No parallel business tables.
create or replace function public.app_current_company_id()
returns uuid language sql stable security definer set search_path=public,pg_temp
as $$ select "Company_ID" from public."cmp_Users" where "Auth_User_ID"=(select auth.uid()) limit 1 $$;
revoke all on function public.app_current_company_id() from public;
grant execute on function public.app_current_company_id() to authenticated;

drop policy if exists "App read company jobs" on public."Job_Header";
create policy "App read company jobs" on public."Job_Header" for select to authenticated using (
  exists(select 1 from public."cmp_Offices" o where o."Office_ID"=coalesce("Job_OrgOfficeID","Job_OfficeID") and o."Company_ID"=public.app_current_company_id()));
drop policy if exists "App read company routes" on public."Job_Routing";
create policy "App read company routes" on public."Job_Routing" for select to authenticated using (
  exists(select 1 from public."Job_Header" j where j."Job_ID"="Job_Routing"."Job_ID"));
drop policy if exists "App read company cargo" on public."Job_Cargo";
create policy "App read company cargo" on public."Job_Cargo" for select to authenticated using (
  exists(select 1 from public."Job_Header" j where j."Job_ID"="Job_Cargo"."JobCargo_JobID"));
drop policy if exists "App read company quotes" on public."CusQuote_Header";
create policy "App read company quotes" on public."CusQuote_Header" for select to authenticated using (
  exists(select 1 from public."cmp_Offices" o where o."Office_ID"=coalesce("CusQuoteHeader_OrgOfficeID","OrgOffice_ID") and o."Company_ID"=public.app_current_company_id()));
drop policy if exists "App read company quote lines" on public."CusQuote_Lines";
create policy "App read company quote lines" on public."CusQuote_Lines" for select to authenticated using (
  exists(select 1 from public."CusQuote_Header" q where q."CusQuoteHeader_ID"="CusQuote_Lines"."CusQuoteHeader_ID"));
drop policy if exists "App read reports" on public."RPT_ReportDefinitions";
create policy "App read reports" on public."RPT_ReportDefinitions" for select to authenticated using ("RPTReport_IsActive");
drop policy if exists "App read company report runs" on public."RPT_ReportRuns";
create policy "App read company report runs" on public."RPT_ReportRuns" for select to authenticated using (
  exists(select 1 from public."cmp_Users" u where u."User_ID"="RPT_ReportRuns"."RPTReportRun_RequestedBy" and u."Company_ID"=public.app_current_company_id()));
drop policy if exists "App read company documents" on public."DOC_StoredObjects";
create policy "App read company documents" on public."DOC_StoredObjects" for select to authenticated using (
  exists(select 1 from public."cmp_Users" u where u."User_ID"="DOC_StoredObjects"."DOCStoredObject_CreatedBy" and u."Company_ID"=public.app_current_company_id()));

update public."Job_Header" set
  "Job_TrackingStatus"=case ("Job_Number"%5) when 0 then 'exception' when 1 then 'in_transit' when 2 then 'delayed' else 'on_track' end,
  "Job_TrackingRiskScore"=case ("Job_Number"%5) when 0 then 0.86 when 2 then 0.61 else 0.18 end,
  "Job_CurrentLocationNameSnapshot"=coalesce("Job_CurrentLocationNameSnapshot","Job_OriginNameSnapshot"),
  "Job_PredictedDeliveryAt"=coalesce("Job_PredictedDeliveryAt","Job_RequiredDeliveryDate"::timestamp+interval '14 hours'),
  "Job_UpdatedAt"=now()
where "Job_InternalNotes" like '[DEMO ONLY]%' and exists (
  select 1 from public."cmp_Offices" o join public."cmp_Company" c on c."Company_ID"=o."Company_ID"
  where o."Office_ID"=coalesce("Job_OrgOfficeID","Job_OfficeID") and c."Company_Name"='Development');

do $$
declare
  office_id uuid;
  operator_id uuid;
  northstar_id uuid;
  atelier_id uuid;
  kestrel_id uuid;
  northstar_quote_id uuid;
  atelier_quote_id uuid;
  kestrel_quote_id uuid;
  service_report_id uuid;
  margin_report_id uuid;
  exception_report_id uuid;
begin
  select o."Office_ID" into office_id from public."cmp_Offices" o join public."cmp_Company" c on c."Company_ID"=o."Company_ID"
  where c."Company_Name"='Development' and exists(select 1 from public."cmp_Users" u where u."Company_ID"=c."Company_ID" and u."Auth_User_ID" is not null) limit 1;
  select u."User_ID" into operator_id from public."cmp_Users" u join public."cmp_Company" c on c."Company_ID"=u."Company_ID"
  where c."Company_Name"='Development' and u."Auth_User_ID" is not null order by u."User_ID" limit 1;
  if office_id is null or operator_id is null then raise exception 'Provisioned Development workspace not found'; end if;

  select "Org_id" into northstar_id from public."Org_Master" where "Org_AccCode"='DEMO-DE100001' limit 1;
  select "Org_id" into atelier_id from public."Org_Master" where "Org_AccCode"='DEMO-DE100002' limit 1;
  select "Org_id" into kestrel_id from public."Org_Master" where "Org_AccCode"='DEMO-DE100003' limit 1;
  if northstar_id is null or atelier_id is null or kestrel_id is null then raise exception 'Canonical Development demo customers not found'; end if;

  select "CusQuoteHeader_ID" into northstar_quote_id from public."CusQuote_Header" where "CusQuoteHeader_Number"=19158 and coalesce("CusQuoteHeader_OrgOfficeID","OrgOffice_ID")=office_id limit 1;
  if northstar_quote_id is null then
    northstar_quote_id := gen_random_uuid();
    insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_Number","CusQuoteHeader_CustomerID","CusQuoteHeader_CreatedDate","CusQuoteHeader_CreatedBy","CusQuoteHeader_LastEditedBy","CusQuoteHeader_LastEditedDate","CusQuoteHeader_OrgOfficeID","OrgOffice_ID","CusQuoteHeader_Status","CusQuoteHeader_ModeCode","CusQuoteHeader_ShipmentTypeCode","CusQuoteHeader_ServiceLevel","CusQuoteHeader_CurrencyCode","CusQuoteHeader_OriginExtra","CusQuoteHeader_DestinationExtra","CusQuoteHeader_Direction","CusQuoteHeader_Incoterm","CusQuoteHeader_ValidFrom","CusQuoteHeader_ValidTo","CusQuoteHeader_InternalNotes")
    values(northstar_quote_id,19158,northstar_id,now()-interval '4 days',operator_id,operator_id,now()-interval '2 hours',office_id,office_id,1,'sea','FCL','Standard','GBP','GBBRS · Bristol','JPUKB · Kobe','export','DAP',current_date,current_date+30,'Commercial review');
  else
    update public."CusQuote_Header" set "CusQuoteHeader_CustomerID"=northstar_id,"CusQuoteHeader_LastEditedDate"=now()-interval '2 hours',"CusQuoteHeader_OrgOfficeID"=office_id,"OrgOffice_ID"=office_id,"CusQuoteHeader_Status"=1,"CusQuoteHeader_InternalNotes"='Commercial review',"CusQuoteHeader_IsDeleted"=false where "CusQuoteHeader_ID"=northstar_quote_id;
  end if;

  select "CusQuoteHeader_ID" into atelier_quote_id from public."CusQuote_Header" where "CusQuoteHeader_Number"=19157 and coalesce("CusQuoteHeader_OrgOfficeID","OrgOffice_ID")=office_id limit 1;
  if atelier_quote_id is null then
    atelier_quote_id := gen_random_uuid();
    insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_Number","CusQuoteHeader_CustomerID","CusQuoteHeader_CreatedDate","CusQuoteHeader_CreatedBy","CusQuoteHeader_LastEditedBy","CusQuoteHeader_LastEditedDate","CusQuoteHeader_OrgOfficeID","OrgOffice_ID","CusQuoteHeader_Status","CusQuoteHeader_ModeCode","CusQuoteHeader_ShipmentTypeCode","CusQuoteHeader_ServiceLevel","CusQuoteHeader_CurrencyCode","CusQuoteHeader_OriginExtra","CusQuoteHeader_DestinationExtra","CusQuoteHeader_Direction","CusQuoteHeader_Incoterm","CusQuoteHeader_ValidFrom","CusQuoteHeader_ValidTo","CusQuoteHeader_InternalNotes")
    values(atelier_quote_id,19157,atelier_id,now()-interval '5 days',operator_id,operator_id,now()-interval '5 hours',office_id,office_id,2,'sea','FCL','Priority','GBP','SGSIN · Singapore','GBSOU · Southampton','import','FOB',current_date-1,current_date+27,'Ready to issue');
  else
    update public."CusQuote_Header" set "CusQuoteHeader_CustomerID"=atelier_id,"CusQuoteHeader_LastEditedDate"=now()-interval '5 hours',"CusQuoteHeader_OrgOfficeID"=office_id,"OrgOffice_ID"=office_id,"CusQuoteHeader_Status"=2,"CusQuoteHeader_InternalNotes"='Ready to issue',"CusQuoteHeader_IsDeleted"=false where "CusQuoteHeader_ID"=atelier_quote_id;
  end if;

  select "CusQuoteHeader_ID" into kestrel_quote_id from public."CusQuote_Header" where "CusQuoteHeader_Number"=19154 and coalesce("CusQuoteHeader_OrgOfficeID","OrgOffice_ID")=office_id limit 1;
  if kestrel_quote_id is null then
    kestrel_quote_id := gen_random_uuid();
    insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_Number","CusQuoteHeader_CustomerID","CusQuoteHeader_CreatedDate","CusQuoteHeader_CreatedBy","CusQuoteHeader_LastEditedBy","CusQuoteHeader_LastEditedDate","CusQuoteHeader_OrgOfficeID","OrgOffice_ID","CusQuoteHeader_Status","CusQuoteHeader_ModeCode","CusQuoteHeader_ShipmentTypeCode","CusQuoteHeader_ServiceLevel","CusQuoteHeader_CurrencyCode","CusQuoteHeader_OriginExtra","CusQuoteHeader_DestinationExtra","CusQuoteHeader_Direction","CusQuoteHeader_Incoterm","CusQuoteHeader_ValidFrom","CusQuoteHeader_ValidTo","CusQuoteHeader_InternalNotes")
    values(kestrel_quote_id,19154,kestrel_id,now()-interval '2 days',operator_id,operator_id,now()-interval '45 minutes',office_id,office_id,3,'air','Air freight','Express','GBP','AEDXB · Dubai','GBLHR · Heathrow','import','DAP',current_date,current_date+7,'Supplier pricing required');
  else
    update public."CusQuote_Header" set "CusQuoteHeader_CustomerID"=kestrel_id,"CusQuoteHeader_LastEditedDate"=now()-interval '45 minutes',"CusQuoteHeader_OrgOfficeID"=office_id,"OrgOffice_ID"=office_id,"CusQuoteHeader_Status"=3,"CusQuoteHeader_InternalNotes"='Supplier pricing required',"CusQuoteHeader_IsDeleted"=false where "CusQuoteHeader_ID"=kestrel_quote_id;
  end if;

  insert into public."CusQuote_Lines"("CusQuoteLine_ID","CusQuoteHeader_ID","CusQuoteLine_Number","CusQuoteLine_Description","CusQuoteLine_InternalNotes","CusQuoteLine_CostROE","CusQuoteLine_CostAmountCurrency","CusQuoteLine_CostAmountLocal","CusQuoteLine_RevenueROE","CusQuoteLine_RevenueAmountCurrency","CusQuoteLine_RevenueAmountLocal","CusQuoteLine_CreatedBy","CusQuoteLine_UpdatedBy")
  values
  (gen_random_uuid(),northstar_quote_id,1,'Ocean freight','SEA',1,920,920,1,1125,1125,operator_id,operator_id),
  (gen_random_uuid(),northstar_quote_id,2,'Export customs clearance','CES',1,78,78,1,135,135,operator_id,operator_id),
  (gen_random_uuid(),northstar_quote_id,3,'Destination handling','SEA',1,315,315,1,306.42,306.42,operator_id,operator_id),
  (gen_random_uuid(),atelier_quote_id,1,'Ocean freight','SEA',1,2140,2140,1,2580,2580,operator_id,operator_id),
  (gen_random_uuid(),atelier_quote_id,2,'Origin and destination handling','SEA',1,574.8,574.8,1,747,747,operator_id,operator_id),
  (gen_random_uuid(),kestrel_quote_id,1,'Air freight · rate pending','AIR',1,0,0,1,0,0,operator_id,operator_id)
  on conflict("CusQuoteHeader_ID","CusQuoteLine_Number") do update set "CusQuoteLine_Description"=excluded."CusQuoteLine_Description","CusQuoteLine_CostAmountLocal"=excluded."CusQuoteLine_CostAmountLocal","CusQuoteLine_RevenueAmountLocal"=excluded."CusQuoteLine_RevenueAmountLocal","CusQuoteLine_UpdatedAt"=now();

  insert into public."RPT_ReportDefinitions"("RPTReport_ID","RPTReport_Code","RPTReport_Name","RPTReport_ModuleCode","RPTReport_Description","RPTReport_QueryRef")
  values
  (gen_random_uuid(),'DEMO_CLIENT_SERVICE','Client service review','jobs','Monthly delivery performance and exceptions.','App_Live_Bookings'),
  (gen_random_uuid(),'DEMO_MARGIN','Shipment margin review','finance','Revenue, cost and gross-profit performance.','App_Live_Quotes'),
  (gen_random_uuid(),'DEMO_EXCEPTION','Exception and recovery log','jobs','Current exceptions and recovery ownership.','App_Live_Bookings')
  on conflict("RPTReport_Code") do update set "RPTReport_Name"=excluded."RPTReport_Name","RPTReport_Description"=excluded."RPTReport_Description","RPTReport_IsActive"=true;

  select "RPTReport_ID" into service_report_id from public."RPT_ReportDefinitions" where "RPTReport_Code"='DEMO_CLIENT_SERVICE';
  select "RPTReport_ID" into margin_report_id from public."RPT_ReportDefinitions" where "RPTReport_Code"='DEMO_MARGIN';
  select "RPTReport_ID" into exception_report_id from public."RPT_ReportDefinitions" where "RPTReport_Code"='DEMO_EXCEPTION';

  insert into public."RPT_ReportRuns"("RPTReportRun_ID","RPTReportRun_ReportID","RPTReportRun_StatusCode","RPTReportRun_RequestedBy","RPTReportRun_ParametersJSON","RPTReportRun_StartedAt","RPTReportRun_FinishedAt","RPTReportRun_CreatedAt")
  select gen_random_uuid(),service_report_id,'completed',operator_id,'{"period":"July 2026","demo_key":"client-service-july-2026"}',now()-interval '2 days',now()-interval '2 days'+interval '18 seconds',now()-interval '2 days'
  where not exists(select 1 from public."RPT_ReportRuns" where "RPTReportRun_ParametersJSON"->>'demo_key'='client-service-july-2026');
  insert into public."RPT_ReportRuns"("RPTReportRun_ID","RPTReportRun_ReportID","RPTReportRun_StatusCode","RPTReportRun_RequestedBy","RPTReportRun_ParametersJSON","RPTReportRun_StartedAt","RPTReportRun_FinishedAt","RPTReportRun_CreatedAt")
  select gen_random_uuid(),margin_report_id,'completed',operator_id,'{"period":"Week 32","demo_key":"margin-week-32"}',now()-interval '5 hours',now()-interval '5 hours'+interval '12 seconds',now()-interval '5 hours'
  where not exists(select 1 from public."RPT_ReportRuns" where "RPTReportRun_ParametersJSON"->>'demo_key'='margin-week-32');
  insert into public."RPT_ReportRuns"("RPTReportRun_ID","RPTReportRun_ReportID","RPTReportRun_StatusCode","RPTReportRun_RequestedBy","RPTReportRun_ParametersJSON","RPTReportRun_StartedAt","RPTReportRun_FinishedAt","RPTReportRun_CreatedAt")
  select gen_random_uuid(),exception_report_id,'queued',operator_id,'{"period":"Today","demo_key":"exception-today"}',null,null,now()+interval '1 hour'
  where not exists(select 1 from public."RPT_ReportRuns" where "RPTReportRun_ParametersJSON"->>'demo_key'='exception-today');
end $$;

create or replace view public."App_Live_Bookings" with(security_invoker=true) as
select j."Job_ID",'MD-'||j."Job_Number" as "Booking_Reference",coalesce(c."Org_Name",'Unassigned customer') as "Customer_Name",
concat_ws(' → ',coalesce(j."Job_OriginNameSnapshot",j."Job_OriginUNLocode"),coalesce(j."Job_DestinationNameSnapshot",j."Job_DestinationUNLocode")) as "Route",
coalesce(carrier."Org_Name",'Carrier pending') as "Carrier",coalesce(cargo.description,'Shipment') as "Equipment",upper(coalesce(j."Job_TransportModeSummary",'road')) as "Mode",initcap(coalesce(j."Job_Direction",'Domestic')) as "Direction",coalesce(cargo.description,'General cargo') as "Shipment_Type",
''::text as "Value_Display",coalesce(to_char(j."Job_PredictedDeliveryAt",'DD Mon · HH24:MI'),to_char(j."Job_RequiredDeliveryDate",'DD Mon')) as "Eta_Display",coalesce(j."Job_CurrentLocationNameSnapshot",'Planning') as "Time_Display",
case when coalesce(j."Job_TrackingRiskScore",0)>=0.80 then 'Exception' when coalesce(j."Job_TrackingRiskScore",0)>=0.50 then 'Delayed' else 'On track' end as "Status",
case when j."Job_ClosedDate" is not null then 100 when j."Job_TrackingStatus"='in_transit' then 62 when j."Job_TrackingStatus"='delayed' then 48 else 24 end as "Progress",'OP'::text as "Owner_Code",
case when coalesce(j."Job_TrackingRiskScore",0)>=0.80 then 'red' when coalesce(j."Job_TrackingRiskScore",0)>=0.50 then 'amber' else 'green' end as "Tone",
''::text as "Invoice_Reference",'JOB-'||j."Job_Number" as "Job_Reference",coalesce(c."Org_AccCode",'') as "Customer_Reference",''::text as "Supplier_Reference",
coalesce(j."Job_OriginNameSnapshot",j."Job_OriginUNLocode",'') as "Origin",coalesce(j."Job_DestinationNameSnapshot",j."Job_DestinationUNLocode",'') as "Destination",coalesce(r."JobRoute_TransportMeansName",r."JobRoute_Vessel",'') as "Vessel",
coalesce(r."JobRoute_EstimatedDepartureAt",r."JobRoute_PlannedDepartureAt")::date as "Departure_Date",coalesce(r."JobRoute_EstimatedArrivalAt",r."JobRoute_PlannedArrivalAt",j."Job_PredictedDeliveryAt")::date as "Arrival_Date",coalesce(r."JobRoute_VehicleRegistration",'') as "Vin",false as "Is_Favourite",
jsonb_build_array(jsonb_build_object('label','Tracking','value',coalesce(j."Job_TrackingStatus",'Planning'))) as "Custom_Fields",coalesce(j."Job_UpdatedAt",j."Job_CreatedDate"::timestamptz) as "Updated_At"
from public."Job_Header" j left join public."Org_Master" c on c."Org_id"=j."Job_Customer" left join public."Org_Master" carrier on carrier."Org_id"=j."Job_Carrier"
left join lateral(select rr.* from public."Job_Routing" rr where rr."Job_ID"=j."Job_ID" order by rr."JobRoute_OrderNo" nulls last limit 1) r on true
left join lateral(select max(cg."JobCargo_Description") description from public."Job_Cargo" cg where cg."JobCargo_JobID"=j."Job_ID" and not coalesce(cg."JobCargo_IsDeleted",false)) cargo on true
where not coalesce(j."Job_IsDeleted",false);

create or replace view public."App_Live_Quotes" with(security_invoker=true) as
select q."CusQuoteHeader_ID",'Q-'||q."CusQuoteHeader_Number" as "Quote_Reference",case q."CusQuoteHeader_Status" when 2 then 'Ready to send' when 3 then 'Needs rate' else 'Working' end as "Quote_Status",
case q."CusQuoteHeader_Status" when 2 then 'green' when 3 then 'blue' else 'amber' end as "Quote_Status_Tone",c."Org_Name" as "Customer_Name",coalesce(q."CusQuoteHeader_OriginExtra",'') as "Origin",coalesce(q."CusQuoteHeader_DestinationExtra",'') as "Destination",
q."CusQuoteHeader_ValidFrom" as "Estimated_Departure",q."CusQuoteHeader_ValidTo" as "Estimated_Arrival",coalesce((q."CusQuoteHeader_ValidTo"-q."CusQuoteHeader_ValidFrom")::text||' days','') as "Transport_Time",
initcap(coalesce(q."CusQuoteHeader_ModeCode",'')) as "Transport_Mode",coalesce(q."CusQuoteHeader_ShipmentTypeCode",'') as "Equipment_Load",''::text as "Pickup",''::text as "Delivery",'Direct'::text as "Routing_Via",
coalesce(q."CusQuoteHeader_Incoterm",'') as "Incoterms",coalesce(q."CusQuoteHeader_DestinationExtra",'') as "Incoterms_Place",coalesce(q."CusQuoteHeader_ServiceLevel",'') as "Service_Level",coalesce(q."CusQuoteHeader_ShipmentTypeCode",'') as "Shipment_Type",
''::text as "Carrier",''::text as "Supplier",coalesce(u."User_Firstname"||' '||u."User_Lastname",'Multideck operator') as "Sales_Owner",coalesce(u."User_Firstname"||' '||u."User_Lastname",'Multideck operator') as "Operations_Owner",
'Spot'::text as "Quote_Type",initcap(coalesce(q."CusQuoteHeader_Direction",'Export')) as "Direction",''::text as "Customer_Purchase_Order",''::text as "Shipper_Reference",to_char(q."CusQuoteHeader_ValidTo",'DD Mon YYYY') as "Validity",to_char(q."CusQuoteHeader_Deadline",'DD Mon · HH24:MI') as "Estimated_Quote",
coalesce(t.sell,0) as "Sell_Value",coalesce(t.sell-t.cost,0) as "Estimated_Profit",coalesce(t.cost,0) as "Estimated_Cost",case when coalesce(t.sell,0)=0 then null else round(((t.sell-t.cost)/t.sell)*100,2) end as "Estimated_Margin",
coalesce(q."CusQuoteHeader_CurrencyCode",'GBP') as "Currency",case q."CusQuoteHeader_Status" when 2 then 'Customer copy ready' else 'Draft' end as "Document_Status",case q."CusQuoteHeader_Status" when 2 then 'Ready to issue' when 3 then 'Supplier pricing' else 'Commercial review' end as "Workflow_Stage",
case q."CusQuoteHeader_Status" when 3 then 'Urgent' when 2 then 'High' else 'Standard' end as "Priority",case q."CusQuoteHeader_Status" when 3 then 'red' when 2 then 'amber' else 'neutral' end as "Priority_Tone",'Canonical quote'::text as "Quote_Source",
q."CusQuoteHeader_CreatedDate"::timestamptz as "Created_At",coalesce(q."CusQuoteHeader_LastEditedDate",q."CusQuoteHeader_CreatedDate")::timestamptz as "Updated_At"
from public."CusQuote_Header" q join public."Org_Master" c on c."Org_id"=q."CusQuoteHeader_CustomerID" left join public."cmp_Users" u on u."User_ID"=q."CusQuoteHeader_CreatedBy"
left join lateral(select coalesce(sum(l."CusQuoteLine_CostAmountLocal"),0) cost,coalesce(sum(l."CusQuoteLine_RevenueAmountLocal"),0) sell from public."CusQuote_Lines" l where l."CusQuoteHeader_ID"=q."CusQuoteHeader_ID") t on true
where not q."CusQuoteHeader_IsDeleted";

grant select on public."App_Live_Bookings",public."App_Live_Quotes" to authenticated;
