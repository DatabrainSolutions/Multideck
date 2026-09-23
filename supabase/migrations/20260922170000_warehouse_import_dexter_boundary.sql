begin;

-- Files and preview sessions stay in the operator's reviewed import flow.
-- Saved rows reuse the existing warehouse reads, actions and database events.
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = "AIDexterDomain_Description" || ' Saved spreadsheet-imported items and locations use the same warehouse records. Template downloads, import-file parsing and bulk imports through chat are unsupported; direct the operator to the import action in /warehouse/items or /warehouse/locations.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'warehouse_reference';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = "AIDexterWatchCapability_Description" || ' Saved spreadsheet-imported items and locations emit ordinary warehouse record events. Import progress, file contents, validation errors and batch-completion watches are unsupported; inspect the import result in /warehouse/items or /warehouse/locations.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'warehouse';

commit;
