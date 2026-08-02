-- Rollback for 202606240001_warehouse_backend_foundation.sql.
-- This is intentionally destructive. Run only if the warehouse foundation migration
-- needs to be undone before real warehouse data is entered.

begin;

-- Remove warehouse RLS policies added by the forward migration.
drop policy if exists "Users can read their company warehouse calendar" on public."Warehouse_Calendar_Events";
drop policy if exists "Users can update their company warehouse work items" on public."Warehouse_Work_Items";
drop policy if exists "Users can read their company warehouse work items" on public."Warehouse_Work_Items";
drop policy if exists "Users can read their company warehouse movements" on public."Warehouse_Movements";
drop policy if exists "Users can read their company warehouse orders" on public."Warehouse_Orders";
drop policy if exists "Users can read their company warehouse stock" on public."Warehouse_Stock";
drop policy if exists "Users can read their company warehouse products" on public."Warehouse_Products";
drop policy if exists "Users can read their company warehouse locations" on public."Warehouse_Locations";
drop policy if exists "Users can read their company warehouse areas" on public."Warehouse_Areas";
drop policy if exists "Users can read their company warehouses" on public."Warehouse";
drop policy if exists "Users can read enabled company modules" on public."cmp_Company_Modules";
drop policy if exists "Users can read their own company user row" on public."cmp_Users";

-- Drop operational warehouse tables in dependency order.
drop table if exists public."Warehouse_Calendar_Events" cascade;
drop table if exists public."Warehouse_Work_Items" cascade;
drop table if exists public."Warehouse_Movements" cascade;
drop table if exists public."Warehouse_Orders" cascade;
drop table if exists public."Warehouse_Stock" cascade;
drop table if exists public."Warehouse_Products" cascade;

-- Remove demo warehouse setup rows seeded by the forward migration.
delete from public."Warehouse_Locations"
where "WHL_Code" in (
  'A01-04-02',
  'R01-08-04',
  'A04-01-02',
  'A03-02-05',
  'B02-01-01',
  'B02-03-04',
  'Q01-HOLD',
  'COLD-2-08',
  'COLD-STAGE',
  'C04-03-03',
  'D02-05-01',
  'DOCK-1'
);

delete from public."Warehouse_Areas"
where "WHA_Name" in (
  'Fast pick',
  'Reserve',
  'Overflow',
  'Outerwear',
  'Homeware',
  'Quarantine',
  'Chilled',
  'Dispatch staging',
  'Furniture',
  'Food ambient',
  'Goods in'
)
and "WHA_Warehouse" in (
  select "WH_ID"
  from public."Warehouse"
  where "WH_Name" = 'Felixstowe DC'
    and "WH_Organisation" = 'Jenkar Shipping Ltd'
);

delete from public."Warehouse"
where "WH_Name" = 'Felixstowe DC'
  and "WH_Organisation" = 'Jenkar Shipping Ltd'
  and "WH_UNLOCODE" = 'GBFXT';

-- Remove indexes, constraints, and columns added to existing warehouse setup tables.
drop index if exists public."IX_Warehouse_Calendar_Company";
drop index if exists public."IX_Warehouse_Work_Items_Company";
drop index if exists public."IX_Warehouse_Movements_Company";
drop index if exists public."IX_Warehouse_Orders_Company";
drop index if exists public."IX_Warehouse_Stock_Company";
drop index if exists public."IX_Warehouse_Products_Company";
drop index if exists public."IX_Warehouse_Locations_Code";
drop index if exists public."IX_Warehouse_Locations_Company";
drop index if exists public."IX_Warehouse_Areas_Company";
drop index if exists public."IX_Warehouse_Company";

alter table if exists public."Warehouse_Locations"
  drop constraint if exists "FK_Warehouse_Locations_Area";

alter table if exists public."Warehouse_Areas"
  drop constraint if exists "FK_Warehouse_Areas_Warehouse";

alter table if exists public."Warehouse_Locations"
  drop column if exists "Is_Deleted",
  drop column if exists "Updated_At",
  drop column if exists "Created_At",
  drop column if exists "WHL_Code",
  drop column if exists "Company_ID";

alter table if exists public."Warehouse_Areas"
  drop column if exists "Is_Deleted",
  drop column if exists "Updated_At",
  drop column if exists "Created_At",
  drop column if exists "Company_ID";

alter table if exists public."Warehouse"
  drop column if exists "Is_Deleted",
  drop column if exists "Created_By_User_ID",
  drop column if exists "Updated_At",
  drop column if exists "Created_At",
  drop column if exists "WH_IsActive",
  drop column if exists "Office_ID",
  drop column if exists "Company_ID";

-- Remove the module entitlement table added for future warehouse packaging.
drop table if exists public."cmp_Company_Modules" cascade;

commit;
