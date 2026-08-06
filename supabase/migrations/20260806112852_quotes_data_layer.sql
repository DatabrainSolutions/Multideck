-- Quote data layer for the authenticated Multideck workspace.
-- Business records are scoped by Company_ID; UI labels and filter options remain client-owned.

create table if not exists public."Sales_Quotes" (
  "Quote_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Quote_Reference" varchar not null,
  "Quote_Status" varchar not null,
  "Quote_Status_Tone" varchar not null default 'neutral',
  "Customer_Name" varchar not null,
  "Origin" varchar not null default '',
  "Destination" varchar not null default '',
  "Estimated_Departure" date,
  "Estimated_Arrival" date,
  "Transport_Time" varchar not null default '',
  "Transport_Mode" varchar not null default '',
  "Equipment_Load" varchar not null default '',
  "Pickup" varchar not null default '',
  "Delivery" varchar not null default '',
  "Routing_Via" varchar not null default '',
  "Incoterms" varchar not null default '',
  "Incoterms_Place" varchar not null default '',
  "Service_Level" varchar not null default '',
  "Shipment_Type" varchar not null default '',
  "Carrier" varchar not null default '',
  "Supplier" varchar not null default '',
  "Sales_Owner" varchar not null default '',
  "Operations_Owner" varchar not null default '',
  "Quote_Type" varchar not null default 'Spot',
  "Direction" varchar not null default 'Export',
  "Customer_Purchase_Order" varchar not null default '',
  "Shipper_Reference" varchar not null default '',
  "Validity" varchar not null default '',
  "Estimated_Quote" varchar not null default '',
  "Sell_Value" numeric not null default 0,
  "Estimated_Profit" numeric not null default 0,
  "Estimated_Cost" numeric not null default 0,
  "Estimated_Margin" numeric,
  "Currency" varchar not null default 'GBP',
  "Document_Status" varchar not null default 'Draft',
  "Workflow_Stage" varchar not null default 'Draft',
  "Priority" varchar not null default 'Standard',
  "Priority_Tone" varchar not null default 'neutral',
  "Quote_Source" varchar not null default 'Customer email',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  unique ("Company_ID", "Quote_Reference")
);

create index if not exists "IX_Sales_Quotes_Company_Updated"
  on public."Sales_Quotes" ("Company_ID", "Updated_At" desc);

alter table public."Sales_Quotes" enable row level security;
grant select on public."Sales_Quotes" to authenticated;

drop policy if exists "Users can read their company sales quotes" on public."Sales_Quotes";
create policy "Users can read their company sales quotes"
on public."Sales_Quotes"
for select
to authenticated
using (
  "Company_ID" in (
    select "Company_ID"
    from public."cmp_Users"
    where "Auth_User_ID" = (select auth.uid())
  )
);

-- Seed only the established demo company. Re-running migrations or a local seed is safe.
insert into public."Sales_Quotes" (
  "Company_ID", "Quote_Reference", "Quote_Status", "Quote_Status_Tone", "Customer_Name",
  "Origin", "Destination", "Estimated_Departure", "Estimated_Arrival", "Transport_Time",
  "Transport_Mode", "Equipment_Load", "Pickup", "Delivery", "Routing_Via", "Incoterms",
  "Incoterms_Place", "Service_Level", "Shipment_Type", "Carrier", "Supplier", "Sales_Owner",
  "Operations_Owner", "Quote_Type", "Direction", "Customer_Purchase_Order", "Shipper_Reference",
  "Validity", "Estimated_Quote", "Sell_Value", "Estimated_Profit", "Estimated_Cost", "Estimated_Margin",
  "Currency", "Document_Status", "Workflow_Stage", "Priority", "Priority_Tone", "Quote_Source"
)
select c."Company_ID", v.*
from public."cmp_Company" c
cross join (values
  ('Q-19158','Working','amber','HarbourWorks Safety','GBBRS · Bristol','JPUKB · Kobe','2026-07-26'::date,'2026-09-19'::date,'55 days','Sea','1 × 40HC','Customer delivery','Door delivery','SGSIN · Singapore','DAP','Kobe, Japan','Standard','FCL','Maersk','Hellmann Worldwide Logistics','Maya Stone','Daniel Reed','Spot','Export','PO-48319','HW-SEA-1184','31 Jul 2026','Today, 14:00',1566.42,253.46,1312.96,16.18,'GBP','Draft','Commercial review','Standard','neutral','New shipper'),
  ('Q-19157','Ready to send','green','Cedar & Loom Trading','SGSIN · Singapore','GBSOU · Southampton','2026-07-29'::date,'2026-08-25'::date,'27 days','Sea','2 × 40HC','Supplier collection','Port delivery','Direct','FOB','Singapore','Priority','FCL','ONE','Bluewave Ocean','Elena Moreno','Wei Chen','Spot','Export','CL-7782','CLT-SG-492','28 Jul 2026','Today, 11:30',3327,612.2,2714.8,18.4,'GBP','Customer copy ready','Ready to issue','High','amber','Repeat lane'),
  ('Q-19154','Needs rate','blue','Asterline Components','AEDXB · Dubai','GBLHR · Heathrow','2026-07-24'::date,'2026-07-25'::date,'1 day','Air','4 pallets · 1,280 kg','Dubai Silicon Oasis','Heathrow cargo terminal','Direct','DAP','London, UK','Express','Air freight','Emirates SkyCargo','Dnata Cargo','Maya Stone','Wei Chen','Spot','Export','AC-90944','AST-DXB-0719','24 Jul 2026','Today, 10:45',0,0,0,null,'GBP','Awaiting rates','Supplier pricing','Urgent','red','CRM opportunity')
) as v("Quote_Reference", "Quote_Status", "Quote_Status_Tone", "Customer_Name", "Origin", "Destination", "Estimated_Departure", "Estimated_Arrival", "Transport_Time", "Transport_Mode", "Equipment_Load", "Pickup", "Delivery", "Routing_Via", "Incoterms", "Incoterms_Place", "Service_Level", "Shipment_Type", "Carrier", "Supplier", "Sales_Owner", "Operations_Owner", "Quote_Type", "Direction", "Customer_Purchase_Order", "Shipper_Reference", "Validity", "Estimated_Quote", "Sell_Value", "Estimated_Profit", "Estimated_Cost", "Estimated_Margin", "Currency", "Document_Status", "Workflow_Stage", "Priority", "Priority_Tone", "Quote_Source")
where c."Company_Name" = 'Jenkar Shipping Ltd'
on conflict ("Company_ID", "Quote_Reference") do update set
  "Quote_Status" = excluded."Quote_Status",
  "Quote_Status_Tone" = excluded."Quote_Status_Tone",
  "Customer_Name" = excluded."Customer_Name",
  "Origin" = excluded."Origin",
  "Destination" = excluded."Destination",
  "Estimated_Departure" = excluded."Estimated_Departure",
  "Estimated_Arrival" = excluded."Estimated_Arrival",
  "Transport_Time" = excluded."Transport_Time",
  "Transport_Mode" = excluded."Transport_Mode",
  "Equipment_Load" = excluded."Equipment_Load",
  "Pickup" = excluded."Pickup",
  "Delivery" = excluded."Delivery",
  "Routing_Via" = excluded."Routing_Via",
  "Incoterms" = excluded."Incoterms",
  "Incoterms_Place" = excluded."Incoterms_Place",
  "Service_Level" = excluded."Service_Level",
  "Shipment_Type" = excluded."Shipment_Type",
  "Carrier" = excluded."Carrier",
  "Supplier" = excluded."Supplier",
  "Sales_Owner" = excluded."Sales_Owner",
  "Operations_Owner" = excluded."Operations_Owner",
  "Quote_Type" = excluded."Quote_Type",
  "Direction" = excluded."Direction",
  "Customer_Purchase_Order" = excluded."Customer_Purchase_Order",
  "Shipper_Reference" = excluded."Shipper_Reference",
  "Validity" = excluded."Validity",
  "Estimated_Quote" = excluded."Estimated_Quote",
  "Sell_Value" = excluded."Sell_Value",
  "Estimated_Profit" = excluded."Estimated_Profit",
  "Estimated_Cost" = excluded."Estimated_Cost",
  "Estimated_Margin" = excluded."Estimated_Margin",
  "Currency" = excluded."Currency",
  "Document_Status" = excluded."Document_Status",
  "Workflow_Stage" = excluded."Workflow_Stage",
  "Priority" = excluded."Priority",
  "Priority_Tone" = excluded."Priority_Tone",
  "Quote_Source" = excluded."Quote_Source",
  "Updated_At" = now();
