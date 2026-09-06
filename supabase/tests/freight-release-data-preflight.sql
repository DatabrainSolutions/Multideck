-- Read-only, bounded output: no Quote contents, personal data or configuration payloads.
-- Re-run against the confirmed development project just before release.
begin read only;
set local statement_timeout='10s';
select jsonb_build_object(
  'versions',count(*),
  'submitted',count(*) filter(where "CusQuoteVersion_IsSubmitted"),
  'structured',count(*) filter(where "CusQuoteVersion_SnapshotJSON" #> '{quote,shipmentFacts,cargoLines}' is not null),
  'explicitNull',count(*) filter(where jsonb_typeof("CusQuoteVersion_SnapshotJSON" #> '{quote,shipmentFacts,cargoLines}')='null')
) as quote_cargo_backfill_scope from public."CusQuote_Versions";
-- Zero is expected before this pending chain. Nonzero means review the exact
-- existing registry rows before an insert or conflict update, not delete them.
select 'domain' as registry,"AIDexterDomain_Code" as code from public."sys_AIDexterDataDomains"
where "AIDexterDomain_Code" in ('booking_cargo','booking_containers','booking_routes','booking_shipment_value','quote_cargo','booking_allocations')
union all select 'action',"AIDexterAction_Code" from public."sys_AIDexterActions"
where "AIDexterAction_Code" in ('update_booking_cargo','update_booking_container','update_booking_route','change_booking_route_mode','update_booking_shipment_value','update_quote_cargo','replace_booking_allocations')
union all select 'watch',"AIDexterWatchCapability_Code" from public."sys_AIDexterWatchCapabilities"
where "AIDexterWatchCapability_Code" in ('booking_cargo','booking_containers','booking_routes','booking_shipment_value','quote_cargo','booking_allocations');
commit;
