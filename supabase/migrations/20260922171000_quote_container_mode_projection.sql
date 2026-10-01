-- Only project applicable equipment. Keep the saved snapshot and existing jobs
-- unchanged. Older unclassified snapshots retain their historical behaviour.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('booking_api.quote_container_rows(jsonb,text,uuid)'::regprocedure);
  marker text := '  requests := case';
  guard text := $guard$
  -- An explicit non-container service must not resurrect hidden old requests.
  if (nullif(btrim(payload->>'shipmentType'), '') is not null
      and upper(replace(btrim(split_part(payload->>'shipmentType', ' - ', 1)), ' ', '_')) not in ('FCL', 'CONTAINER'))
    or (nullif(btrim(payload->>'mode'), '') is not null
      and lower(replace(replace(btrim(payload->>'mode'), '-', '_'), ' ', '_')) not in ('sea', 'ocean', 'sea_fcl', 'sea_lcl', 'rail', 'inland_waterway')
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(facts->'routingLegs') = 'array' then facts->'routingLegs' else '[]'::jsonb end) leg
        where lower(replace(replace(btrim(leg->>'mode'), '-', '_'), ' ', '_')) in ('sea', 'ocean', 'sea_fcl', 'sea_lcl', 'rail', 'inland_waterway')
      )) then
    return '[]'::jsonb;
  end if;
$guard$;
begin
  if position(marker in definition) = 0 then
    raise exception 'quote_container_rows changed: review projection guard before release';
  end if;
  execute replace(definition, marker, guard || marker);
end;
$migration$;
commit;
