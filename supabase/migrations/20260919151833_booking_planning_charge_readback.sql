begin;
set local lock_timeout='5s';

-- Add only planning-source currency evidence to the existing authorised read.
-- No new grants, reads, writes, or changes to Quote/Customs projections.
do $migration$
declare
 definition text := pg_get_functiondef('booking_api.workspace_before_goods_value_20260905(uuid,text)'::regprocedure);
 anchor text := $anchor$'showToCustomer', charge."JobCostingLine_ShowToCustomer"$anchor$;
 addition text := $addition$,
    'planningCurrency', case when charge."JobCostingLine_SourceTable"='booking_api.planning_charge_sets'
      and charge."JobCostingLine_DomainCode"='freight' then jsonb_build_object(
        'cost', charge."JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,costCurrency}',
        'sell', charge."JobCostingLine_SourceMetadataJSON"#>>'{planningCharge,sellCurrency}',
        'base', charge."JobCostingLine_SourceMetadataJSON"->>'baseCurrency'
      ) else null end$addition$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
   raise exception 'Booking charge readback changed; review before applying planning currency projection.';
 end if;
 execute replace(definition,anchor,anchor||addition);
end $migration$;

commit;
