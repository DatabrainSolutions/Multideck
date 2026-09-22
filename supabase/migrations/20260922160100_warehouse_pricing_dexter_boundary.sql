begin;
-- Explicit parity exception: estimates/configuration have no posted-charge semantics.
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description"="AIDexterDomain_Description" || ' Warehouse pricing cards, default rates and customer overrides are not supported by this read adapter. Explain that limitation and open /warehouse/pricing or the CRM account Warehouse tab; never infer prices from orders or inventory.'
where "AIDexterDomain_Code" in ('warehouse_orders','warehouse_inventory','warehouse_items');
update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description"="AIDexterWatchCapability_Description" || ' Warehouse pricing cards and rate changes are unsupported. Do not substitute an order or inventory change watch; direct the operator to Warehouse pricing.'
where "AIDexterWatchCapability_Code" in ('warehouse_orders','warehouse_inventory','warehouse_items');
commit;
