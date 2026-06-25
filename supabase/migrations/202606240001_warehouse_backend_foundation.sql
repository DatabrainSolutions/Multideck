-- Warehouse backend foundation for the current Multideck UI.
-- Keeps data tenant-scoped through cmp_Company.Company_ID.

create table if not exists public."cmp_Company_Modules" (
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Module_Code" varchar not null,
  "Is_Enabled" boolean not null default true,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  primary key ("Company_ID", "Module_Code")
);

alter table public."Warehouse" add column if not exists "Company_ID" uuid references public."cmp_Company"("Company_ID");
alter table public."Warehouse" add column if not exists "Office_ID" uuid references public."cmp_Offices"("Office_ID");
alter table public."Warehouse" add column if not exists "WH_IsActive" boolean not null default true;
alter table public."Warehouse" add column if not exists "Created_At" timestamptz not null default now();
alter table public."Warehouse" add column if not exists "Updated_At" timestamptz not null default now();
alter table public."Warehouse" add column if not exists "Created_By_User_ID" uuid references public."cmp_Users"("User_ID");
alter table public."Warehouse" add column if not exists "Is_Deleted" boolean not null default false;

alter table public."Warehouse_Areas" add column if not exists "Company_ID" uuid references public."cmp_Company"("Company_ID");
alter table public."Warehouse_Areas" add column if not exists "Created_At" timestamptz not null default now();
alter table public."Warehouse_Areas" add column if not exists "Updated_At" timestamptz not null default now();
alter table public."Warehouse_Areas" add column if not exists "Is_Deleted" boolean not null default false;

alter table public."Warehouse_Locations" add column if not exists "Company_ID" uuid references public."cmp_Company"("Company_ID");
alter table public."Warehouse_Locations" add column if not exists "WHL_Code" varchar;
alter table public."Warehouse_Locations" add column if not exists "Created_At" timestamptz not null default now();
alter table public."Warehouse_Locations" add column if not exists "Updated_At" timestamptz not null default now();
alter table public."Warehouse_Locations" add column if not exists "Is_Deleted" boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'FK_Warehouse_Areas_Warehouse'
      and conrelid = 'public."Warehouse_Areas"'::regclass
  ) then
    alter table public."Warehouse_Areas"
      add constraint "FK_Warehouse_Areas_Warehouse"
      foreign key ("WHA_Warehouse")
      references public."Warehouse"("WH_ID")
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'FK_Warehouse_Locations_Area'
      and conrelid = 'public."Warehouse_Locations"'::regclass
  ) then
    alter table public."Warehouse_Locations"
      add constraint "FK_Warehouse_Locations_Area"
      foreign key ("WHL_AreaID")
      references public."Warehouse_Areas"("WHA_ID")
      not valid;
  end if;
end $$;

create table if not exists public."Warehouse_Products" (
  "WHP_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Customer_ID" uuid references public."Org_Master"("Org_ID"),
  "Customer_Name" varchar not null,
  "WHP_UI_ID" varchar not null,
  "WHP_Name" varchar not null,
  "WHP_Category" varchar,
  "WHP_SKU" varchar not null,
  "WHP_HSCode" varchar,
  "WHP_SupplierRef" varchar,
  "WHP_Owner" varchar,
  "WHP_Status" varchar not null default 'In stock',
  "WHP_Tone" varchar not null default 'neutral',
  "WHP_InboundQty" numeric not null default 0,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false,
  unique ("Company_ID", "WHP_UI_ID"),
  unique ("Company_ID", "WHP_SKU")
);

create table if not exists public."Warehouse_Stock" (
  "WHS_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "WHP_ID" uuid not null references public."Warehouse_Products"("WHP_ID") on delete cascade,
  "WHL_ID" uuid references public."Warehouse_Locations"("WHL_ID"),
  "WHS_UI_ID" varchar not null,
  "WHS_LotNumber" varchar,
  "WHS_OnHand" numeric not null default 0,
  "WHS_Allocated" numeric not null default 0,
  "WHS_Available" numeric generated always as ("WHS_OnHand" - "WHS_Allocated") stored,
  "WHS_FillPct" integer not null default 0,
  "WHS_NextMovement" varchar,
  "WHS_Status" varchar not null default 'Available',
  "WHS_Tone" varchar not null default 'neutral',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false,
  unique ("Company_ID", "WHS_UI_ID")
);

create table if not exists public."Warehouse_Orders" (
  "WHO_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Customer_ID" uuid references public."Org_Master"("Org_ID"),
  "Job_ID" uuid references public."Job_Header"("Job_ID"),
  "WHO_Ref" varchar not null,
  "WHO_CustomerName" varchar not null,
  "WHO_Route" varchar,
  "WHO_Type" varchar not null,
  "WHO_Lines" integer not null default 0,
  "WHO_Value" varchar,
  "WHO_Due" varchar,
  "WHO_Window" varchar,
  "WHO_Status" varchar not null,
  "WHO_Tone" varchar not null default 'neutral',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false,
  unique ("Company_ID", "WHO_Ref")
);

create table if not exists public."Warehouse_Movements" (
  "WHM_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "WHP_ID" uuid references public."Warehouse_Products"("WHP_ID"),
  "WHO_ID" uuid references public."Warehouse_Orders"("WHO_ID"),
  "WHL_ID" uuid references public."Warehouse_Locations"("WHL_ID"),
  "WHM_Ref" varchar not null,
  "WHM_Direction" varchar not null check ("WHM_Direction" in ('In', 'Out')),
  "WHM_ProductName" varchar not null,
  "WHM_Reference" varchar,
  "WHM_Quantity" varchar,
  "WHM_Dock" varchar,
  "WHM_Time" varchar,
  "WHM_Status" varchar not null,
  "WHM_Tone" varchar not null default 'neutral',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false,
  unique ("Company_ID", "WHM_Ref")
);

create table if not exists public."Warehouse_Work_Items" (
  "WHWI_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "WHM_ID" uuid references public."Warehouse_Movements"("WHM_ID"),
  "WHWI_Board" varchar not null check ("WHWI_Board" in ('goods-in', 'goods-out')),
  "WHWI_ColumnID" varchar not null,
  "WHWI_ColumnTitle" varchar not null,
  "WHWI_ColumnMeta" varchar,
  "WHWI_CardID" varchar not null,
  "WHWI_Title" varchar not null,
  "WHWI_Meta" varchar,
  "WHWI_Status" varchar not null,
  "WHWI_Tone" varchar not null default 'neutral',
  "WHWI_SortOrder" integer not null default 0,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false,
  unique ("Company_ID", "WHWI_Board", "WHWI_CardID")
);

create table if not exists public."Warehouse_Calendar_Events" (
  "WHCE_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Customer_ID" uuid references public."Org_Master"("Org_ID"),
  "WHO_ID" uuid references public."Warehouse_Orders"("WHO_ID"),
  "WHM_ID" uuid references public."Warehouse_Movements"("WHM_ID"),
  "WHCE_UI_ID" varchar not null,
  "WHCE_Date" date not null,
  "WHCE_StartTime" time without time zone not null,
  "WHCE_EndTime" time without time zone not null,
  "WHCE_Title" varchar not null,
  "WHCE_Type" varchar not null,
  "WHCE_CustomerKey" varchar not null,
  "WHCE_CustomerName" varchar not null,
  "WHCE_CustomerShortName" varchar not null,
  "WHCE_CustomerColor" varchar not null,
  "WHCE_Tone" varchar not null default 'neutral',
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false,
  unique ("Company_ID", "WHCE_UI_ID")
);

create index if not exists "IX_Warehouse_Company" on public."Warehouse"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Areas_Company" on public."Warehouse_Areas"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Locations_Company" on public."Warehouse_Locations"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Locations_Code" on public."Warehouse_Locations"("Company_ID", "WHL_Code");
create index if not exists "IX_Warehouse_Products_Company" on public."Warehouse_Products"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Stock_Company" on public."Warehouse_Stock"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Orders_Company" on public."Warehouse_Orders"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Movements_Company" on public."Warehouse_Movements"("Company_ID") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Work_Items_Company" on public."Warehouse_Work_Items"("Company_ID", "WHWI_Board", "WHWI_ColumnID", "WHWI_SortOrder") where "Is_Deleted" = false;
create index if not exists "IX_Warehouse_Calendar_Company" on public."Warehouse_Calendar_Events"("Company_ID", "WHCE_Date") where "Is_Deleted" = false;

alter table public."cmp_Company_Modules" enable row level security;
alter table public."Warehouse" enable row level security;
alter table public."Warehouse_Areas" enable row level security;
alter table public."Warehouse_Locations" enable row level security;
alter table public."Warehouse_Products" enable row level security;
alter table public."Warehouse_Stock" enable row level security;
alter table public."Warehouse_Orders" enable row level security;
alter table public."Warehouse_Movements" enable row level security;
alter table public."Warehouse_Work_Items" enable row level security;
alter table public."Warehouse_Calendar_Events" enable row level security;

grant select on public."cmp_Users" to authenticated;
grant select on public."cmp_Company_Modules" to authenticated;
grant select on public."Warehouse", public."Warehouse_Areas", public."Warehouse_Locations" to authenticated;
grant select on public."Warehouse_Products", public."Warehouse_Stock", public."Warehouse_Orders", public."Warehouse_Movements", public."Warehouse_Calendar_Events" to authenticated;
grant select, update on public."Warehouse_Work_Items" to authenticated;

drop policy if exists "Users can read their own company user row" on public."cmp_Users";
create policy "Users can read their own company user row"
on public."cmp_Users"
for select
to authenticated
using ("Auth_User_ID" = (select auth.uid()));

drop policy if exists "Users can read enabled company modules" on public."cmp_Company_Modules";
create policy "Users can read enabled company modules"
on public."cmp_Company_Modules"
for select
to authenticated
using (
  "Company_ID" in (
    select "Company_ID"
    from public."cmp_Users"
    where "Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can read their company warehouses" on public."Warehouse";
create policy "Users can read their company warehouses" on public."Warehouse" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse areas" on public."Warehouse_Areas";
create policy "Users can read their company warehouse areas" on public."Warehouse_Areas" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse locations" on public."Warehouse_Locations";
create policy "Users can read their company warehouse locations" on public."Warehouse_Locations" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse products" on public."Warehouse_Products";
create policy "Users can read their company warehouse products" on public."Warehouse_Products" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse stock" on public."Warehouse_Stock";
create policy "Users can read their company warehouse stock" on public."Warehouse_Stock" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse orders" on public."Warehouse_Orders";
create policy "Users can read their company warehouse orders" on public."Warehouse_Orders" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse movements" on public."Warehouse_Movements";
create policy "Users can read their company warehouse movements" on public."Warehouse_Movements" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse work items" on public."Warehouse_Work_Items";
create policy "Users can read their company warehouse work items" on public."Warehouse_Work_Items" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can update their company warehouse work items" on public."Warehouse_Work_Items";
create policy "Users can update their company warehouse work items" on public."Warehouse_Work_Items" for update to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid()))) with check ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));
drop policy if exists "Users can read their company warehouse calendar" on public."Warehouse_Calendar_Events";
create policy "Users can read their company warehouse calendar" on public."Warehouse_Calendar_Events" for select to authenticated using ("Company_ID" in (select "Company_ID" from public."cmp_Users" where "Auth_User_ID" = (select auth.uid())));

do $$
declare
  demo_company uuid;
  demo_warehouse uuid;
begin
  select "Company_ID" into demo_company
  from public."cmp_Company"
  order by "Company_Name"
  limit 1;

  if demo_company is null then
    raise notice 'No company exists; skipping warehouse seed data.';
    return;
  end if;

  insert into public."cmp_Company_Modules" ("Company_ID", "Module_Code", "Is_Enabled")
  values (demo_company, 'warehouse', true)
  on conflict ("Company_ID", "Module_Code") do update set "Is_Enabled" = excluded."Is_Enabled", "Updated_At" = now();

  insert into public."Warehouse" ("Company_ID", "WH_Name", "WH_Organisation", "WH_Address1", "WH_TownCity", "WH_Country", "WH_UNLOCODE", "WH_MainEmail", "WH_MainPhone")
  values (demo_company, 'Felixstowe DC', 'Jenkar Shipping Ltd', 'Dock Gate 2', 'Felixstowe', 'GB', 'GBFXT', 'warehouse@jenkar.co.uk', '+44 1394 000000')
  on conflict do nothing;

  select "WH_ID" into demo_warehouse
  from public."Warehouse"
  where "Company_ID" = demo_company and "WH_Name" = 'Felixstowe DC'
  limit 1;

  insert into public."Warehouse_Areas" ("Company_ID", "WHA_Warehouse", "WHA_Name", "WHA_Description", "WHA_Type")
  values
    (demo_company, demo_warehouse, 'Fast pick', 'Primary pick face for active outbound work.', 1),
    (demo_company, demo_warehouse, 'Reserve', 'Reserve racking and replenishment stock.', 1),
    (demo_company, demo_warehouse, 'Overflow', 'Overflow capacity for campaign stock.', 1),
    (demo_company, demo_warehouse, 'Outerwear', 'Apparel outerwear storage.', 1),
    (demo_company, demo_warehouse, 'Homeware', 'Homeware storage and QA.', 1),
    (demo_company, demo_warehouse, 'Quarantine', 'Held stock pending document or licence review.', 2),
    (demo_company, demo_warehouse, 'Chilled', 'Temperature controlled chilled storage.', 3),
    (demo_company, demo_warehouse, 'Dispatch staging', 'Outbound staging and handoff.', 4),
    (demo_company, demo_warehouse, 'Furniture', 'Furniture and bulky goods.', 1),
    (demo_company, demo_warehouse, 'Food ambient', 'Ambient food stock.', 1),
    (demo_company, demo_warehouse, 'Goods in', 'Inbound dock and putaway queue.', 4)
  on conflict do nothing;

  insert into public."Warehouse_Locations" ("Company_ID", "WHL_AreaID", "WHL_Code", "WHL_Type", "WHL_Height", "WHL_Width", "WHL_Depth", "WHL_MaxKilos", "WHL_MultiProduct")
  select demo_company, a."WHA_ID", v.code, 1, 240, 120, 120, 1000, true
  from (values
    ('Fast pick','A01-04-02'), ('Reserve','R01-08-04'), ('Overflow','A04-01-02'), ('Outerwear','A03-02-05'),
    ('Homeware','B02-01-01'), ('Homeware','B02-03-04'), ('Quarantine','Q01-HOLD'), ('Chilled','COLD-2-08'),
    ('Dispatch staging','COLD-STAGE'), ('Furniture','C04-03-03'), ('Food ambient','D02-05-01'), ('Goods in','DOCK-1')
  ) as v(area_name, code)
  join public."Warehouse_Areas" a on a."Company_ID" = demo_company and a."WHA_Warehouse" = demo_warehouse and a."WHA_Name" = v.area_name
  on conflict do nothing;
end $$;

insert into public."Warehouse_Products" ("Company_ID", "WHP_UI_ID", "WHP_Name", "Customer_Name", "WHP_Category", "WHP_SKU", "WHP_HSCode", "WHP_SupplierRef", "WHP_Owner", "WHP_Status", "WHP_Tone", "WHP_InboundQty")
select c."Company_ID", v.*
from public."cmp_Company" c
cross join (values
  ('prd-mar-thermal','Thermal activewear carton','Marlow Apparel Ltd','Apparel','MAR-ACT-044','6109.90.20','QD-GAR-502','EM','In stock','green',620),
  ('prd-mar-rain-shell','Rain shell jackets','Marlow Apparel Ltd','Outerwear','MAR-RSJ-118','6201.40.90','YH-SO-1440','EM','Low stock','amber',780),
  ('prd-bau-lamp','Ceramic table lamp','Bauhaus Importe GmbH','Homeware','BAU-LMP-220','9405.29.40','NB-FAC-302','JL','In stock','green',0),
  ('prd-nw-router','Enterprise router module','Northwind GmbH','Electronics','NW-RTR-762','8517.62.00','YONG-HUA-448','WC','Quarantine','red',340),
  ('prd-bff-chilled','Chilled meal packs','Black Forest Foods','Food','BFF-CHL-018','2106.90.98','FRA-COLD-18','JL','Low stock','amber',120),
  ('prd-aos-desk','Modular desk pod','Atlas Office Supply','Furniture','AOS-DSK-A12','9403.30.19','SZ-OFF-77','EM','In stock','green',0),
  ('prd-mst-herbs','Dried herb cartons','Mediterranean Spice Trading','Food','MST-HRB-072','0910.99.33','PIR-SPICE-15','WC','Inbound','teal',180)
) as v(ui_id, name, customer, category, sku, hs_code, supplier_ref, owner, status, tone, inbound)
where c."Company_Name" = (select "Company_Name" from public."cmp_Company" order by "Company_Name" limit 1)
on conflict ("Company_ID", "WHP_UI_ID") do update set
  "WHP_Name" = excluded."WHP_Name",
  "Customer_Name" = excluded."Customer_Name",
  "WHP_Category" = excluded."WHP_Category",
  "WHP_SKU" = excluded."WHP_SKU",
  "WHP_HSCode" = excluded."WHP_HSCode",
  "WHP_SupplierRef" = excluded."WHP_SupplierRef",
  "WHP_Owner" = excluded."WHP_Owner",
  "WHP_Status" = excluded."WHP_Status",
  "WHP_Tone" = excluded."WHP_Tone",
  "WHP_InboundQty" = excluded."WHP_InboundQty",
  "Updated_At" = now();

insert into public."Warehouse_Stock" ("Company_ID", "WHP_ID", "WHL_ID", "WHS_UI_ID", "WHS_LotNumber", "WHS_OnHand", "WHS_Allocated", "WHS_FillPct", "WHS_NextMovement", "WHS_Status", "WHS_Tone")
select p."Company_ID", p."WHP_ID", l."WHL_ID", v.ui_id, v.lot, v.on_hand, v.allocated, v.fill, v.next_movement, v.status, v.tone
from (values
  ('MAR-ACT-044','A01-04-02','stk-a01-mar-044','LOT-MAR-7721',840,420,82,'Pick wave 14:00','Allocated','teal'),
  ('MAR-ACT-044','R01-08-04','stk-r01-mar-044','LOT-MAR-7721',620,126,64,'Replenish A01','Available','green'),
  ('MAR-ACT-044','A04-01-02','stk-a04-mar-044','LOT-MAR-7728',380,80,51,'No movement','Available','green'),
  ('MAR-RSJ-118','A03-02-05','stk-a03-mar-118','LOT-MAR-7712',426,308,38,'Replenish from PO','Low stock','amber'),
  ('BAU-LMP-220','B02-01-01','stk-b02-bau-220','LOT-BAU-4420',642,118,76,'Cycle count Fri','Available','green'),
  ('BAU-LMP-220','B02-03-04','stk-b02-bau-220b','LOT-BAU-4426',320,0,44,'No movement','Available','green'),
  ('NW-RTR-762','Q01-HOLD','stk-q01-nw-762','LOT-NW-8517',210,210,64,'Licence review','Quarantine','red'),
  ('BFF-CHL-018','COLD-2-08','stk-cold-bff-018','LOT-BFF-8841',98,82,45,'Dispatch 18:30','Low stock','amber'),
  ('BFF-CHL-018','COLD-STAGE','stk-cold-bff-018b','LOT-BFF-8841',50,0,24,'Carrier handoff','Ready','green'),
  ('AOS-DSK-A12','C04-03-03','stk-c04-aos-a12','LOT-AOS-5108',372,82,68,'No movement','Available','green'),
  ('MST-HRB-072','D02-05-01','stk-d02-mst-072','LOT-MST-7004',204,70,58,'Putaway pending','Inbound','teal'),
  ('MST-HRB-072','DOCK-1','stk-dock-mst-072','LOT-MST-7005',80,0,20,'Move to D02','Inbound','teal')
) as v(sku, location_code, ui_id, lot, on_hand, allocated, fill, next_movement, status, tone)
join public."Warehouse_Products" p on p."WHP_SKU" = v.sku
join public."Warehouse_Locations" l on l."Company_ID" = p."Company_ID" and l."WHL_Code" = v.location_code
on conflict ("Company_ID", "WHS_UI_ID") do update set
  "WHS_OnHand" = excluded."WHS_OnHand",
  "WHS_Allocated" = excluded."WHS_Allocated",
  "WHS_FillPct" = excluded."WHS_FillPct",
  "WHS_NextMovement" = excluded."WHS_NextMovement",
  "WHS_Status" = excluded."WHS_Status",
  "WHS_Tone" = excluded."WHS_Tone",
  "Updated_At" = now();

insert into public."Warehouse_Orders" ("Company_ID", "WHO_Ref", "WHO_CustomerName", "WHO_Route", "WHO_Type", "WHO_Lines", "WHO_Value", "WHO_Due", "WHO_Window", "WHO_Status", "WHO_Tone")
select c."Company_ID", v.ref, v.customer, v.route, v.type, v.lines, v.value, v.due, v.order_window, v.status, v.tone
from public."cmp_Company" c
cross join (values
  ('WO-10482','Marlow Apparel Ltd','Felixstowe DC to Manchester retail','Outbound',18,'GBP 42,600','Today','14:00-16:00','Picking','amber'),
  ('WO-10479','Bauhaus Importe GmbH','Ningbo inbound to B02 homeware','Inbound',9,'GBP 18,420','Today','Dock 3 - 11:30','Receiving','teal'),
  ('WO-10475','Northwind GmbH','Quarantine hold to customs review','Hold',6,'GBP 184,200','Today','Broker review','Blocked','red'),
  ('WO-10471','Black Forest Foods','Cold store to Heathrow consolidation','Outbound',4,'GBP 8,840','Today','18:30 cutoff','Ready','green'),
  ('WO-10466','Atlas Office Supply','Furniture zone to Hamburg road','Outbound',12,'GBP 16,300','Tomorrow','08:00-10:00','Allocated','blue'),
  ('WO-10460','Mediterranean Spice Trading','Inbound putaway to D02','Inbound',7,'GBP 11,940','Tomorrow','Dock 1 - 09:15','Booked','neutral')
) as v(ref, customer, route, type, lines, value, due, order_window, status, tone)
where c."Company_Name" = (select "Company_Name" from public."cmp_Company" order by "Company_Name" limit 1)
on conflict ("Company_ID", "WHO_Ref") do update set
  "WHO_Status" = excluded."WHO_Status",
  "WHO_Tone" = excluded."WHO_Tone",
  "Updated_At" = now();

insert into public."Warehouse_Movements" ("Company_ID", "WHP_ID", "WHL_ID", "WHM_Ref", "WHM_Direction", "WHM_ProductName", "WHM_Reference", "WHM_Quantity", "WHM_Dock", "WHM_Time", "WHM_Status", "WHM_Tone")
select p."Company_ID", p."WHP_ID", l."WHL_ID", v.ref, v.direction, p."WHP_Name", v.reference, v.quantity, v.dock, v.time, v.status, v.tone
from (values
  ('BAU-LMP-220','B02-01-01','GIN-8821','In','PO BAU-CREF-912 - 9 lines','640 ctn','Dock 3','11:30','Receiving','teal'),
  ('MAR-ACT-044','A01-04-02','GOUT-6710','Out','WO-10482 - Manchester retail','420 ctn','Door 7','14:00','Picking','amber'),
  ('MST-HRB-072','DOCK-1','GIN-8817','In','INV-MST-7004 - phyto checked','180 ctn','Dock 1','09:15','Putaway','green'),
  ('BFF-CHL-018','COLD-2-08','GOUT-6704','Out','Cold chain dispatch','82 ctn','Cold 2','18:30','Ready','green'),
  ('NW-RTR-762','Q01-HOLD','GIN-8809','In','CN export licence pending','210 ctn','Q01-HOLD','10:20','Blocked','red'),
  ('AOS-DSK-A12','C04-03-03','GOUT-6698','Out','AOS Hamburg road groupage','82 units','Door 4','Tomorrow','Allocated','blue')
) as v(sku, location_code, ref, direction, reference, quantity, dock, time, status, tone)
join public."Warehouse_Products" p on p."WHP_SKU" = v.sku
left join public."Warehouse_Locations" l on l."Company_ID" = p."Company_ID" and l."WHL_Code" = v.location_code
on conflict ("Company_ID", "WHM_Ref") do update set
  "WHM_Status" = excluded."WHM_Status",
  "WHM_Tone" = excluded."WHM_Tone",
  "Updated_At" = now();

insert into public."Warehouse_Work_Items" ("Company_ID", "WHM_ID", "WHWI_Board", "WHWI_ColumnID", "WHWI_ColumnTitle", "WHWI_ColumnMeta", "WHWI_CardID", "WHWI_Title", "WHWI_Meta", "WHWI_Status", "WHWI_Tone", "WHWI_SortOrder")
select c."Company_ID", m."WHM_ID", v.*
from public."cmp_Company" c
cross join (values
  ('goods-in','goods-in-pending','Pending','Booked inbound work waiting to be claimed.','GIN-8824','Supplier ASN for rain shell cartons','780 ctn - documents due before 13:00','Pending','amber',10),
  ('goods-in','goods-in-pending','Pending','Booked inbound work waiting to be claimed.','GIN-8823','Homeware overflow slot confirmation','Dock 5 - pallet count to confirm','Pending','neutral',20),
  ('goods-in','goods-in-picking','Picking','Claimed and being checked by the floor team.','GIN-8821','Bauhaus homeware cartons at Dock 3','640 ctn - pallet check in progress','Claimed','teal',10),
  ('goods-in','goods-in-picking','Picking','Claimed and being checked by the floor team.','GIN-8820','Outerwear reserve top-up unload','A03 reserve - split by carton type','Picking','blue',20),
  ('goods-in','goods-in-sat','Sat in Goods in','Received and waiting for final putaway or review.','GIN-8817','Mediterranean herbs await putaway','Phyto cert checked - bin D02-05-01','Sat','green',10),
  ('goods-in','goods-in-sat','Sat in Goods in','Received and waiting for final putaway or review.','GIN-8809','Router modules held for licence review','Q01-HOLD - broker follow-up','Hold','red',20),
  ('goods-in','goods-in-loaded','Loaded','Putaway confirmed into warehouse locations.','GIN-8798','Desk pod cartons loaded to C04','82 units - replenishment complete','Loaded','green',10),
  ('goods-out','goods-out-pending','Pending','Outbound work waiting for a picker or dispatch owner.','GOUT-6714','Atlas Hamburg preload queue','82 units - trailer details pending','Pending','blue',10),
  ('goods-out','goods-out-pending','Pending','Outbound work waiting for a picker or dispatch owner.','GOUT-6712','Marlow label batch before pick','18 lines - carrier labels approved','Pending','neutral',20),
  ('goods-out','goods-out-picking','Picking','Claimed and picking for customer dispatch.','GOUT-6710','Thermal activewear Manchester wave','420 ctn - due 14:00','Picking','amber',10),
  ('goods-out','goods-out-picking','Picking','Claimed and picking for customer dispatch.','GOUT-6708','Black Forest chilled order split','Cold 2 - temperature log ready','Claimed','teal',20),
  ('goods-out','goods-out-sat','Sat in Goods out','Picked work staged at the outbound door.','GOUT-6704','Chilled meal packs staged for handoff','82 ctn - 18:30 cutoff','Sat','green',10),
  ('goods-out','goods-out-loaded','Loaded','Loaded to trailer or carrier handoff complete.','GOUT-6698','Modular desk pod trailer load','Door 4 - Hamburg groupage','Loaded','blue',10),
  ('goods-out','goods-out-loaded','Loaded','Loaded to trailer or carrier handoff complete.','GOUT-6692','Retail labels print run dispatched','Carrier labels approved','Loaded','green',20)
) as v(board, column_id, column_title, column_meta, card_id, title, meta, status, tone, sort_order)
left join public."Warehouse_Movements" m on m."Company_ID" = c."Company_ID" and m."WHM_Ref" = v.card_id
where c."Company_Name" = (select "Company_Name" from public."cmp_Company" order by "Company_Name" limit 1)
on conflict ("Company_ID", "WHWI_Board", "WHWI_CardID") do update set
  "WHWI_ColumnID" = excluded."WHWI_ColumnID",
  "WHWI_ColumnTitle" = excluded."WHWI_ColumnTitle",
  "WHWI_ColumnMeta" = excluded."WHWI_ColumnMeta",
  "WHWI_Title" = excluded."WHWI_Title",
  "WHWI_Meta" = excluded."WHWI_Meta",
  "WHWI_Status" = excluded."WHWI_Status",
  "WHWI_Tone" = excluded."WHWI_Tone",
  "WHWI_SortOrder" = excluded."WHWI_SortOrder",
  "Updated_At" = now();

insert into public."Warehouse_Calendar_Events" ("Company_ID", "WHCE_UI_ID", "WHCE_Date", "WHCE_StartTime", "WHCE_EndTime", "WHCE_Title", "WHCE_Type", "WHCE_CustomerKey", "WHCE_CustomerName", "WHCE_CustomerShortName", "WHCE_CustomerColor", "WHCE_Tone")
select c."Company_ID", v.*
from public."cmp_Company" c
cross join (values
  ('wh-cal-0622-mediterranean','2026-06-22'::date,'09:15'::time,'10:45'::time,'Mediterranean herbs receiving','Goods in','mediterranean','Mediterranean Spice Trading','Mediterranean','color-mix(in srgb, var(--md-amber) 54%, var(--md-blue))','teal'),
  ('wh-cal-0623-atlas','2026-06-23'::date,'08:00'::time,'09:30'::time,'Atlas furniture preload','Dispatch','atlas','Atlas Office Supply','Atlas','var(--md-blue)','blue'),
  ('wh-cal-0623-bauhaus','2026-06-23'::date,'11:30'::time,'12:30'::time,'Bauhaus dock slot','Goods in','bauhaus','Bauhaus Importe GmbH','Bauhaus','var(--md-amber)','teal'),
  ('wh-cal-0624-internal','2026-06-24'::date,'10:00'::time,'11:30'::time,'Aisle B cycle count','Stock check','internal','Internal warehouse team','Internal','color-mix(in srgb, var(--md-text) 55%, var(--md-surface))','green'),
  ('wh-cal-0624-marlow','2026-06-24'::date,'10:30'::time,'11:15'::time,'Marlow urgent relabel','Goods out','marlow','Marlow Apparel Ltd','Marlow','var(--md-accent)','amber'),
  ('wh-cal-0624-bauhaus','2026-06-24'::date,'10:45'::time,'11:45'::time,'Bauhaus lamp QA','Stock check','bauhaus','Bauhaus Importe GmbH','Bauhaus','var(--md-amber)','teal'),
  ('wh-cal-0625-marlow-pick','2026-06-25'::date,'13:30'::time,'15:00'::time,'Marlow pick wave','Goods out','marlow','Marlow Apparel Ltd','Marlow','var(--md-accent)','amber'),
  ('wh-cal-0625-northwind','2026-06-25'::date,'16:00'::time,'17:00'::time,'Router licence review','Hold','northwind','Northwind GmbH','Northwind','var(--md-red)','red'),
  ('wh-cal-0626-mediterranean','2026-06-26'::date,'09:00'::time,'10:00'::time,'Food ambient variance close','Stock check','mediterranean','Mediterranean Spice Trading','Mediterranean','color-mix(in srgb, var(--md-amber) 54%, var(--md-blue))','green'),
  ('wh-cal-0627-internal','2026-06-27'::date,'10:30'::time,'11:30'::time,'Overflow warehouse sweep','Capacity','internal','Internal warehouse team','Internal','color-mix(in srgb, var(--md-text) 55%, var(--md-surface))','neutral'),
  ('wh-cal-0628-internal','2026-06-28'::date,'12:00'::time,'12:30'::time,'Quiet day monitor','OOH','internal','Internal warehouse team','Internal','color-mix(in srgb, var(--md-text) 55%, var(--md-surface))','neutral')
) as v(ui_id, event_date, start_time, end_time, title, type, customer_key, customer_name, customer_short_name, customer_color, tone)
where c."Company_Name" = (select "Company_Name" from public."cmp_Company" order by "Company_Name" limit 1)
on conflict ("Company_ID", "WHCE_UI_ID") do update set
  "WHCE_Date" = excluded."WHCE_Date",
  "WHCE_StartTime" = excluded."WHCE_StartTime",
  "WHCE_EndTime" = excluded."WHCE_EndTime",
  "WHCE_Title" = excluded."WHCE_Title",
  "WHCE_Type" = excluded."WHCE_Type",
  "WHCE_Tone" = excluded."WHCE_Tone",
  "Updated_At" = now();
