-- Application-wide live-data foundation for fixture-backed product surfaces.
-- Every table is physically tenant-scoped by Company_ID and additionally protected by RLS.

create table if not exists public."Operations_Bookings" (
  "Booking_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Booking_Reference" varchar not null,
  "Customer_Name" varchar not null,
  "Route" varchar not null,
  "Carrier" varchar not null default '',
  "Equipment" varchar not null default '',
  "Mode" varchar not null,
  "Direction" varchar not null,
  "Shipment_Type" varchar not null,
  "Value_Display" varchar not null default '',
  "Eta_Display" varchar not null default '',
  "Time_Display" varchar not null default '',
  "Status" varchar not null,
  "Progress" integer not null default 0 check ("Progress" between 0 and 100),
  "Owner_Code" varchar not null default '',
  "Tone" varchar not null default 'neutral',
  "Invoice_Reference" varchar not null default '',
  "Job_Reference" varchar not null default '',
  "Customer_Reference" varchar not null default '',
  "Supplier_Reference" varchar not null default '',
  "Origin" varchar not null default '',
  "Destination" varchar not null default '',
  "Vessel" varchar not null default '',
  "Departure_Date" date,
  "Arrival_Date" date,
  "Vin" varchar not null default '',
  "Is_Favourite" boolean not null default false,
  "Custom_Fields" jsonb not null default '[]'::jsonb,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  unique ("Company_ID", "Booking_Reference")
);

create table if not exists public."Operations_Road_Jobs" (
  "Road_Job_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Road_Job_Reference" varchar not null,
  "Booking_Reference" varchar not null,
  "Owner_Code" varchar not null default '',
  "Office_Name" varchar not null default '',
  "Stage" varchar not null,
  "Customer_Name" varchar not null,
  "Customer_Reference" varchar not null default '',
  "Collection" varchar not null,
  "Delivery" varchar not null,
  "Timing" varchar not null default '',
  "Service" varchar not null default '',
  "Carrier" varchar not null default '',
  "Status" varchar not null,
  "Tone" varchar not null default 'neutral',
  "Margin_Display" varchar not null default '',
  "Blocker" varchar,
  "Is_Favourite" boolean not null default false,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  unique ("Company_ID", "Road_Job_Reference")
);

create table if not exists public."Reporting_Reports" (
  "Report_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Report_Reference" varchar not null,
  "Title" varchar not null,
  "Customer_Name" varchar,
  "Report_Type" varchar not null,
  "Status" varchar not null,
  "Tone" varchar not null default 'neutral',
  "Period_Label" varchar not null default '',
  "Generated_At" timestamptz,
  "Scheduled_For" timestamptz,
  "Summary" varchar not null default '',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  unique ("Company_ID", "Report_Reference")
);

create table if not exists public."CRM_Opportunities" (
  "Opportunity_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Opportunity_Reference" varchar not null,
  "Account_Name" varchar not null,
  "Contact_Name" varchar,
  "Stage" varchar not null,
  "Value_Amount" numeric not null default 0,
  "Currency" varchar not null default 'GBP',
  "Probability" integer not null default 0 check ("Probability" between 0 and 100),
  "Owner_Name" varchar not null default '',
  "Next_Action" varchar not null default '',
  "Due_At" timestamptz,
  "Source" varchar not null default '',
  "Status_Tone" varchar not null default 'neutral',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  unique ("Company_ID", "Opportunity_Reference")
);

create table if not exists public."CRM_Activities" (
  "Activity_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Activity_Reference" varchar not null,
  "Opportunity_Reference" varchar,
  "Account_Name" varchar not null,
  "Activity_Type" varchar not null,
  "Subject" varchar not null,
  "Summary" varchar not null default '',
  "Owner_Name" varchar not null default '',
  "Occurred_At" timestamptz not null,
  "Tone" varchar not null default 'neutral',
  unique ("Company_ID", "Activity_Reference")
);

create table if not exists public."CRM_Campaigns" (
  "Campaign_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Campaign_Reference" varchar not null,
  "Name" varchar not null,
  "Status" varchar not null,
  "Audience_Count" integer not null default 0,
  "Delivered_Count" integer not null default 0,
  "Opened_Count" integer not null default 0,
  "Clicked_Count" integer not null default 0,
  "Sent_At" timestamptz,
  "Tone" varchar not null default 'neutral',
  unique ("Company_ID", "Campaign_Reference")
);

create table if not exists public."CRM_Contacts" (
  "Contact_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Contact_Reference" varchar not null,
  "Account_Name" varchar not null,
  "Contact_Name" varchar not null,
  "Job_Title" varchar not null default '',
  "Email" varchar not null default '',
  "Phone" varchar not null default '',
  "Owner_Name" varchar not null default '',
  "Status" varchar not null default 'Active',
  "Tone" varchar not null default 'neutral',
  "Last_Contact_At" timestamptz,
  unique ("Company_ID", "Contact_Reference")
);

create table if not exists public."Documents_Paper_Tray_Items" (
  "Paper_Tray_Item_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Item_Reference" varchar not null,
  "File_Name" varchar not null,
  "Document_Type" varchar not null,
  "Customer_Name" varchar,
  "Booking_Reference" varchar,
  "Status" varchar not null,
  "Tone" varchar not null default 'neutral',
  "Received_At" timestamptz not null,
  "Confidence" numeric,
  "Page_Count" integer not null default 1,
  "Review_Note" varchar,
  unique ("Company_ID", "Item_Reference")
);

create table if not exists public."AI_Dexter_Context_Items" (
  "Context_Item_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Context_Reference" varchar not null,
  "Context_Type" varchar not null,
  "Title" varchar not null,
  "Summary" varchar not null default '',
  "Related_Reference" varchar,
  "Status" varchar not null default 'Ready',
  "Tone" varchar not null default 'neutral',
  "Updated_At" timestamptz not null default now(),
  unique ("Company_ID", "Context_Reference")
);

create table if not exists public."App_Notifications" (
  "Notification_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Notification_Reference" varchar not null,
  "Title" varchar not null,
  "Description" varchar not null,
  "Tone" varchar not null default 'neutral',
  "Occurred_At" timestamptz not null,
  "Read_At" timestamptz,
  unique ("Company_ID", "Notification_Reference")
);

create table if not exists public."Sales_Quote_Charges" (
  "Quote_Charge_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Quote_Reference" varchar not null,
  "Charge_Code" varchar not null,
  "Description" varchar not null,
  "Creditor" varchar not null,
  "Cost_Currency" varchar not null,
  "Cost_Amount" numeric not null default 0,
  "Sell_Currency" varchar not null,
  "Sell_Amount" numeric not null default 0,
  "Department" varchar not null default '',
  "Sort_Order" integer not null default 0,
  unique ("Company_ID", "Quote_Reference", "Charge_Code")
);

create table if not exists public."Sales_Quote_Parties" (
  "Quote_Party_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Quote_Reference" varchar not null,
  "Party_Role" varchar not null,
  "Party_Code" varchar not null default '',
  "Party_Name" varchar not null,
  "Address_Lines" jsonb not null default '[]'::jsonb,
  "Contact_Name" varchar,
  "Contact_Email" varchar,
  "Tone" varchar not null default 'neutral',
  unique ("Company_ID", "Quote_Reference", "Party_Role")
);

create table if not exists public."Sales_Quote_Events" (
  "Quote_Event_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Quote_Reference" varchar not null,
  "Event_Reference" varchar not null,
  "Event_Type" varchar not null,
  "Summary" varchar not null,
  "Actor_Name" varchar not null,
  "Occurred_At" timestamptz not null,
  "Tone" varchar not null default 'neutral',
  unique ("Company_ID", "Event_Reference")
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'Operations_Bookings','Operations_Road_Jobs','Reporting_Reports','CRM_Opportunities',
    'CRM_Activities','CRM_Campaigns','CRM_Contacts','Documents_Paper_Tray_Items','AI_Dexter_Context_Items','App_Notifications',
    'Sales_Quote_Charges','Sales_Quote_Parties','Sales_Quote_Events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', 'Users can read their company ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())))',
      'Users can read their company ' || table_name,
      table_name
    );
  end loop;
end $$;

grant insert, update on public."Operations_Bookings", public."Operations_Road_Jobs" to authenticated;

drop policy if exists "Users can create their company bookings" on public."Operations_Bookings";
create policy "Users can create their company bookings" on public."Operations_Bookings" for insert to authenticated
with check ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can update their company bookings" on public."Operations_Bookings";
create policy "Users can update their company bookings" on public."Operations_Bookings" for update to authenticated
using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())))
with check ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));

drop policy if exists "Users can create their company road jobs" on public."Operations_Road_Jobs";
create policy "Users can create their company road jobs" on public."Operations_Road_Jobs" for insert to authenticated
with check ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can update their company road jobs" on public."Operations_Road_Jobs";
create policy "Users can update their company road jobs" on public."Operations_Road_Jobs" for update to authenticated
using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())))
with check ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));

do $$
declare demo_company uuid;
begin
  select "Company_ID" into demo_company from public."cmp_Company" where "Company_Name" = 'Jenkar Shipping Ltd' limit 1;
  if demo_company is null then
    raise notice 'Jenkar demo company not found; application demo seed skipped.';
    return;
  end if;

  insert into public."Operations_Bookings" ("Company_ID","Booking_Reference","Customer_Name","Route","Carrier","Equipment","Mode","Direction","Shipment_Type","Value_Display","Eta_Display","Time_Display","Status","Progress","Owner_Code","Tone","Invoice_Reference","Job_Reference","Customer_Reference","Supplier_Reference","Origin","Destination","Vessel","Departure_Date","Arrival_Date","Is_Favourite","Custom_Fields") values
    (demo_company,'MD-22481','Marlow Apparel Ltd','Yantian → Felixstowe','COSCO','40HC','OCEAN','Import','FCL','€84,200','Jun 04','06:20','On track',64,'EM','green','INV-MAR-8841','JOB-LON-22481','MAR-PO-7781','YH-SO-1440','Yantian, China','Felixstowe, United Kingdom','COSCO Pride','2026-05-25','2026-06-04',true,'[{"label":"Season","value":"SS26 launch"},{"label":"Buyer","value":"Sandra Hale"}]'),
    (demo_company,'MD-22479','Bauhaus Importe GmbH','Ningbo → Rotterdam','MAERSK','40GP','OCEAN','Import','FCL','€41,820','Jun 06','11:45','Delayed',41,'EM','amber','INV-BAU-4420','JOB-RTM-22479','BAU-CREF-912','NB-FAC-302','Ningbo, China','Rotterdam, Netherlands','Maersk Girona','2026-05-23','2026-06-06',false,'[{"label":"Delay reason","value":"Rotterdam berth queue"}]'),
    (demo_company,'MD-22455','Northwind GmbH','Shanghai → Long Beach','EVERGREEN','40HC','OCEAN','Import','FCL','€184,200','Jun 09','03:00','Exception',22,'EM','red','INV-YH-6629','JOB-LAX-22455','NW-US-7710','YONG-HUA-448','Shanghai, China','Long Beach, United States','Ever Given','2026-05-21','2026-06-09',true,'[{"label":"HS code","value":"8517.62.00"},{"label":"Licence","value":"CN export licence missing"}]'),
    (demo_company,'MD-22441','Pacific Goods Co','Hamburg → Milano','DHL 2218','LTL','ROAD','Cross trade','LTL','€8,420','May 27','14:00','On track',71,'WC','green','INV-PAC-2044','JOB-MIL-22441','PAC-IT-511','HH-ROAD-09','Hamburg, Germany','Milano, Italy','DHL 2218','2026-05-25','2026-05-27',false,'[{"label":"Delivery slot","value":"Dock 4 afternoon"}]'),
    (demo_company,'MD-22414','Marlow Apparel Ltd','Qingdao → Felixstowe','MAERSK','40HC','OCEAN','Import','FCL','€96,400','Jun 11','17:00','Exception',38,'EM','red','INV-MAR-8902','JOB-FXT-22414','MAR-PO-7810','QD-GAR-502','Qingdao, China','Felixstowe, United Kingdom','Maersk Cardiff','2026-05-26','2026-06-11',true,'[{"label":"Exception","value":"Packing list mismatch"}]')
  on conflict ("Company_ID","Booking_Reference") do update set "Status"=excluded."Status","Progress"=excluded."Progress","Updated_At"=now();

  insert into public."Operations_Road_Jobs" ("Company_ID","Road_Job_Reference","Booking_Reference","Owner_Code","Office_Name","Stage","Customer_Name","Customer_Reference","Collection","Delivery","Timing","Service","Carrier","Status","Tone","Margin_Display","Blocker","Is_Favourite") values
    (demo_company,'RD-10682','MD-22682','JL','UK Distribution','intake','Jenkar','JK-PO-48216','Leicester, GB','Bristol, GB','Collection date missing','Pallet network','Not assigned','Needs planning date','amber','—','Waiting for customer confirmation',false),
    (demo_company,'RD-10676','MD-22676','EM','UK Distribution','ready','Jenkar','JK-PO-48191','Birmingham, GB','Glasgow, GB','Today · collection by 14:00','Dedicated 7.5t','Carrier shortlist ready','Plan now','teal','18.4% est.',null,true),
    (demo_company,'RD-10671','MD-22671','WC','UK Distribution','carrier','Jenkar','JK-PO-48172','Rugby, GB','Exeter, GB','Today · collection 15:00–17:00','Dedicated van','Redline Transport','Confirmation due 11:30','blue','20.7% est.',null,false),
    (demo_company,'RD-10664','MD-22664','EM','UK Distribution','live','Jenkar','JK-PO-48126','Milton Keynes, GB','Newcastle, GB','Out for delivery · ETA 15:20','Dedicated 18t','Grove Haulage','On track','green','19.6% est.',null,true),
    (demo_company,'RD-10658','MD-22658','EM','UK Distribution','close','Jenkar','JK-PO-48094','Derby, GB','Cardiff, GB','Delivered yesterday · POD received','Pallet network','PalletLine','Cost check due','neutral','16.8% est.',null,false)
  on conflict ("Company_ID","Road_Job_Reference") do update set "Stage"=excluded."Stage","Status"=excluded."Status","Updated_At"=now();

  insert into public."Reporting_Reports" ("Company_ID","Report_Reference","Title","Customer_Name","Report_Type","Status","Tone","Period_Label","Generated_At","Summary") values
    (demo_company,'RPT-MAR-MAY-REVIEW','Marlow Apparel monthly review','Marlow Apparel Ltd','Client review','Ready','green','May 2026','2026-06-01 09:15+00','Service, volume, exceptions and next-month priorities.'),
    (demo_company,'RPT-OPS-WEEKLY','Weekly operations brief',null,'Operations','Ready','teal','Week 22','2026-06-01 08:00+00','Open bookings, service exceptions and team workload.'),
    (demo_company,'RPT-CUSTOMS-WATCH','Customs exception watch',null,'Compliance','Scheduled','amber','Daily',null,'Declarations and documents requiring operator attention.')
  on conflict ("Company_ID","Report_Reference") do update set "Status"=excluded."Status","Updated_At"=now();

  insert into public."CRM_Opportunities" ("Company_ID","Opportunity_Reference","Account_Name","Contact_Name","Stage","Value_Amount","Currency","Probability","Owner_Name","Next_Action","Due_At","Source","Status_Tone") values
    (demo_company,'OPP-1048','HarbourWorks Safety','Nora Vale','Qualified',24500,'GBP',65,'Maya Stone','Confirm Kobe lane requirements','2026-08-07 10:00+00','Website enquiry','teal'),
    (demo_company,'OPP-1043','Cedar & Loom Trading','Amelia Grant','Proposal',42000,'GBP',80,'Elena Moreno','Send final ocean proposal','2026-08-06 14:00+00','Repeat customer','green'),
    (demo_company,'OPP-1039','Asterline Components','Ravi Shah','Discovery',18500,'GBP',35,'Maya Stone','Book technical discovery call','2026-08-08 11:30+00','CRM referral','amber')
  on conflict ("Company_ID","Opportunity_Reference") do update set "Stage"=excluded."Stage","Value_Amount"=excluded."Value_Amount","Updated_At"=now();

  insert into public."CRM_Activities" ("Company_ID","Activity_Reference","Opportunity_Reference","Account_Name","Activity_Type","Subject","Summary","Owner_Name","Occurred_At","Tone") values
    (demo_company,'ACT-2081','OPP-1048','HarbourWorks Safety','Email','Kobe lane requirements received','Customer confirmed one 40HC with DAP delivery.','Maya Stone','2026-08-06 08:42+00','teal'),
    (demo_company,'ACT-2078','OPP-1043','Cedar & Loom Trading','Call','Proposal review completed','Commercial terms accepted pending final validity date.','Elena Moreno','2026-08-05 15:10+00','green'),
    (demo_company,'ACT-2074','OPP-1039','Asterline Components','Task','Discovery call due','Confirm commodity and airfreight dimensions.','Maya Stone','2026-08-05 09:00+00','amber')
  on conflict ("Company_ID","Activity_Reference") do update set "Summary"=excluded."Summary";

  insert into public."CRM_Campaigns" ("Company_ID","Campaign_Reference","Name","Status","Audience_Count","Delivered_Count","Opened_Count","Clicked_Count","Sent_At","Tone") values
    (demo_company,'CAM-2026-07','July ocean market update','Sent',184,181,109,37,'2026-07-28 09:00+00','green'),
    (demo_company,'CAM-2026-08','August customs readiness','Draft',126,0,0,0,null,'neutral')
  on conflict ("Company_ID","Campaign_Reference") do update set "Status"=excluded."Status","Audience_Count"=excluded."Audience_Count";

  insert into public."CRM_Contacts" ("Company_ID","Contact_Reference","Account_Name","Contact_Name","Job_Title","Email","Phone","Owner_Name","Status","Tone","Last_Contact_At") values
    (demo_company,'CON-1162','HarbourWorks Safety','Nora Vale','Supply Chain Manager','nora.vale@harbourworks.example','+44 117 555 0148','Maya Stone','Active','green','2026-08-06 08:42+00'),
    (demo_company,'CON-1157','Cedar & Loom Trading','Amelia Grant','Operations Director','amelia.grant@cedarloom.example','+44 20 7946 0321','Elena Moreno','Active','teal','2026-08-05 15:10+00'),
    (demo_company,'CON-1149','Asterline Components','Ravi Shah','Procurement Lead','ravi.shah@asterline.example','+44 161 555 0186','Maya Stone','Follow up','amber','2026-08-01 09:20+00')
  on conflict ("Company_ID","Contact_Reference") do update set "Job_Title"=excluded."Job_Title","Status"=excluded."Status","Last_Contact_At"=excluded."Last_Contact_At";

  insert into public."Documents_Paper_Tray_Items" ("Company_ID","Item_Reference","File_Name","Document_Type","Customer_Name","Booking_Reference","Status","Tone","Received_At","Confidence","Page_Count","Review_Note") values
    (demo_company,'DOC-PT-771','commercial-invoice-8841.pdf','Commercial invoice','Marlow Apparel Ltd','MD-22481','Ready for review','teal','2026-08-06 08:15+00',99.1,3,'Check incoterms against the booking.'),
    (demo_company,'DOC-PT-768','packing-list-7184.pdf','Packing list','Northwind GmbH','MD-22455','Needs attention','amber','2026-08-06 07:48+00',94.6,2,'Quantity differs from the commercial invoice.'),
    (demo_company,'DOC-PT-762','arrival-notice-22479.pdf','Arrival notice','Bauhaus Importe GmbH','MD-22479','Processed','green','2026-08-05 16:20+00',98.4,1,null)
  on conflict ("Company_ID","Item_Reference") do update set "Status"=excluded."Status","Confidence"=excluded."Confidence";

  insert into public."AI_Dexter_Context_Items" ("Company_ID","Context_Reference","Context_Type","Title","Summary","Related_Reference","Status","Tone") values
    (demo_company,'DEX-CTX-22455','booking','Northwind customs hold','Export licence is missing and blocks release.','MD-22455','Needs attention','red'),
    (demo_company,'DEX-CTX-19158','quote','HarbourWorks Kobe quote','Commercial review is active with margin inside target.','Q-19158','Ready','teal'),
    (demo_company,'DEX-CTX-MARLOW','customer','Marlow account context','Two active exceptions need a customer-ready update.','Marlow Apparel Ltd','Review','amber')
  on conflict ("Company_ID","Context_Reference") do update set "Summary"=excluded."Summary","Updated_At"=now();

  insert into public."App_Notifications" ("Company_ID","Notification_Reference","Title","Description","Tone","Occurred_At") values
    (demo_company,'NOT-22455-LICENCE','Customs hold needs review','MD-22455 is waiting on licence confirmation.','amber','2026-08-06 08:52+00'),
    (demo_company,'NOT-22479-ETA','ETA slipped over threshold','MD-22479 arrival moved beyond the service threshold.','neutral','2026-08-06 08:36+00'),
    (demo_company,'NOT-19157-READY','Quote ready to send','Q-19157 completed commercial review.','teal','2026-08-06 08:05+00')
  on conflict ("Company_ID","Notification_Reference") do update set "Title"=excluded."Title","Description"=excluded."Description","Tone"=excluded."Tone","Occurred_At"=excluded."Occurred_At";

  insert into public."Sales_Quote_Charges" ("Company_ID","Quote_Reference","Charge_Code","Description","Creditor","Cost_Currency","Cost_Amount","Sell_Currency","Sell_Amount","Department","Sort_Order") values
    (demo_company,'Q-19158','ECCLR','Export Customs Clearance Fee','Harbourline Forwarding Ltd','GBP',0,'GBP',35,'CES',10),
    (demo_company,'Q-19158','VGM','Verified Gross Mass','Quayline Port Services','GBP',23.56,'GBP',35,'SEA',20),
    (demo_company,'Q-19158','DTHC','Destination Terminal Handling Charges','Kobe Gateway Agency','USD',380,'USD',380,'SEA',30),
    (demo_company,'Q-19158','OCART','Pick Up Transport','Severn Road Logistics','GBP',610,'GBP',630,'SEA',40),
    (demo_company,'Q-19157','OFRT','Ocean freight','Bluewave Ocean','USD',2480,'GBP',2310,'SEA',10),
    (demo_company,'Q-19157','PICK','Supplier collection','Lion City Haulage','SGD',840,'GBP',520,'SEA',20),
    (demo_company,'Q-19157','DOC','Documentation','Bluewave Ocean','GBP',85,'GBP',125,'SEA',30),
    (demo_company,'Q-19154','AFRT','Air freight','Dnata Cargo','USD',0,'GBP',0,'AIR',10),
    (demo_company,'Q-19154','XRY','Security screening','Dnata Cargo','AED',0,'GBP',0,'AIR',20)
  on conflict ("Company_ID","Quote_Reference","Charge_Code") do update set "Cost_Amount"=excluded."Cost_Amount","Sell_Amount"=excluded."Sell_Amount";

  insert into public."Sales_Quote_Parties" ("Company_ID","Quote_Reference","Party_Role","Party_Code","Party_Name","Address_Lines","Contact_Name","Contact_Email","Tone") values
    (demo_company,'Q-19158','Client','HWSBRI','HarbourWorks Safety','["RIVERGATE WORKS","NORTH QUAY INDUSTRIAL ESTATE","BRISTOL","UNITED KINGDOM"]','Nora Vale','rates@harbourworks.example','teal'),
    (demo_company,'Q-19158','Shipper','HWSBRI','HarbourWorks Safety','["RIVERGATE WORKS","NORTH QUAY INDUSTRIAL ESTATE","BRISTOL","UNITED KINGDOM"]','Dispatch desk',null,'teal'),
    (demo_company,'Q-19158','Consignee','KOBE-DC','Kobe Distribution Centre','["PORT ISLAND","KOBE","JAPAN"]',null,null,'neutral'),
    (demo_company,'Q-19157','Client','CLTSG','Cedar & Loom Trading','["18 ROBINSON ROAD","SINGAPORE"]','Amelia Grant','amelia.grant@cedarloom.example','teal'),
    (demo_company,'Q-19157','Consignee','CLTUK','Cedar & Loom UK','["WESTERN DOCKS","SOUTHAMPTON","UNITED KINGDOM"]','Inbound team',null,'neutral'),
    (demo_company,'Q-19154','Client','ASTDXB','Asterline Components','["DUBAI SILICON OASIS","DUBAI","UNITED ARAB EMIRATES"]','Ravi Shah','ravi.shah@asterline.example','teal'),
    (demo_company,'Q-19154','Consignee','ASTLON','Asterline Components UK','["HEATHROW CARGO AREA","LONDON","UNITED KINGDOM"]',null,null,'neutral')
  on conflict ("Company_ID","Quote_Reference","Party_Role") do update set "Party_Name"=excluded."Party_Name","Address_Lines"=excluded."Address_Lines";

  insert into public."Sales_Quote_Events" ("Company_ID","Quote_Reference","Event_Reference","Event_Type","Summary","Actor_Name","Occurred_At","Tone") values
    (demo_company,'Q-19158','QEV-19158-1','Created','Spot quote created from customer enquiry.','Maya Stone','2026-08-05 09:12+00','neutral'),
    (demo_company,'Q-19158','QEV-19158-2','Rates','Supplier rates attached and converted to job currency.','Dexter','2026-08-05 11:45+00','teal'),
    (demo_company,'Q-19158','QEV-19158-3','Review','Commercial review requested.','Maya Stone','2026-08-06 08:20+00','amber'),
    (demo_company,'Q-19157','QEV-19157-1','Created','Repeat-lane quote created from CRM activity.','Elena Moreno','2026-08-04 10:05+00','neutral'),
    (demo_company,'Q-19157','QEV-19157-2','Review','Customer-ready copy approved.','Elena Moreno','2026-08-06 07:50+00','green'),
    (demo_company,'Q-19154','QEV-19154-1','Created','Urgent airfreight quote created.','Maya Stone','2026-08-06 08:10+00','neutral'),
    (demo_company,'Q-19154','QEV-19154-2','Rates','Supplier pricing requested from Dnata Cargo.','Wei Chen','2026-08-06 08:24+00','amber')
  on conflict ("Company_ID","Event_Reference") do update set "Summary"=excluded."Summary";
end $$;
