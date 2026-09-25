-- Cargo gross weight is not loaded container gross weight: the container tare
-- is unknown at quote conversion. Keep existing jobs and all other quoted
-- equipment fields intact; only future quote projections/conversions change.
-- Dexter's existing equipment read/watch consumes the same saved nullable
-- weight; this correction adds no new capability, write action or event.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  definition text := pg_get_functiondef('booking_api.quote_container_rows(jsonb,text,uuid)'::regprocedure);
  weight_expression text := '''grossWeightKg''[[:space:]]*,[[:space:]]*CASE[[:space:]]+WHEN[[:space:]]+[(]?[[:space:]]*total_quantity[[:space:]]*=[[:space:]]*1[[:space:]]*[)]?[[:space:]]+THEN[[:space:]]+gross_weight([[:space:]]+ELSE[[:space:]]+NULL(::text)?)?[[:space:]]+END';
begin
  if definition !~* weight_expression then
    raise exception 'quote_container_rows weight projection changed: review before release';
  end if;
  definition := regexp_replace(definition, weight_expression, '''grossWeightKg'', NULL::text', 'i');
  execute definition;
end;
$migration$;

commit;
