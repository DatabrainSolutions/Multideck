create extension if not exists pg_trgm with schema extensions;

create index if not exists "IX_Org_Master_WarehouseCustomerNameSearch"
  on public."Org_Master"
  using gin (lower(coalesce("Org_Name", '')) extensions.gin_trgm_ops);

comment on index public."IX_Org_Master_WarehouseCustomerNameSearch" is
  'Supports bounded literal customer-name search in Warehouse item selectors.';
