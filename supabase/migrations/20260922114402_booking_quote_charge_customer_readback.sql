-- Read the customer already retained with the accepted Quote charge. Operator
-- overrides (including an explicit JSON null) keep precedence. No row backfill.
begin;
set local lock_timeout='5s';
do $$
declare
 definition text:=pg_get_functiondef('booking_api.operational_charge_values(jsonb)'::regprocedure);
 anchor text:='line#>''{JobCostingLine_SourceMetadataJSON,planningCharge,customerId}'',''null'')';
 replacement text:='line#>''{JobCostingLine_SourceMetadataJSON,planningCharge,customerId}'',line#>''{JobCostingLine_SourceMetadataJSON,quoteCharge,customerId}'',''null'')';
begin
 if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then
  raise exception 'Unexpected operational charge customer projection; review current definition.';
 end if;
 execute replace(definition,anchor,replacement);
end $$;
commit;
