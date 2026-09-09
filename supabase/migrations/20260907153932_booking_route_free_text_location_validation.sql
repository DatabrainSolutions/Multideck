-- Free-text route editors intentionally clear the location-code alias. A blank
-- alias must not hide a supplied place name. Keep the current writer, including
-- its permission checks, later route extensions, audit behaviour and privileges.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('booking_api.save_booking_route_legs(uuid,uuid,jsonb)'::regprocedure);
  old_origin text := $old$nullif(btrim(coalesce(leg->>'originUnlocode', leg->>'origin')), '')$old$;
  old_destination text := $old$nullif(btrim(coalesce(leg->>'destinationUnlocode', leg->>'destination')), '')$old$;
begin
  if (length(definition) - length(replace(definition, old_origin, ''))) / length(old_origin) <> 1
     or (length(definition) - length(replace(definition, old_destination, ''))) / length(old_destination) <> 1 then
    raise exception 'Route location validator has changed; review before applying this migration.';
  end if;
  definition := replace(definition, old_origin,
    $new$coalesce(nullif(btrim(leg->>'originUnlocode'), ''), nullif(btrim(leg->>'origin'), ''))$new$);
  definition := replace(definition, old_destination,
    $new$coalesce(nullif(btrim(leg->>'destinationUnlocode'), ''), nullif(btrim(leg->>'destination'), ''))$new$);
  execute definition;
end;
$migration$;
commit;
