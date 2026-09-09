begin;
set local lock_timeout = '5s';

-- Only translate selected Quote fields into the existing save contract.
-- The legacy singular-route writer uses an empty string as an explicit clear;
-- omitted keys mean preserve. JSON null/strip_nulls previously lost that intent.
-- No data backfill, permission change, Customs write or submitted-version edit.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)'::regprocedure);
  old_block text := $old$    save_payload := save_payload || jsonb_build_object('route',jsonb_strip_nulls(jsonb_build_object(
      'origin',case when selected_fields ? 'origin' then proposed->>'origin' end,
      'originUnlocode',case when selected_fields ? 'origin' and proposed->>'origin' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'origin') end,
      'originAddress',case when selected_fields ? 'collectionAddress' then proposed->>'collectionAddress' end,
      'destination',case when selected_fields ? 'destination' then proposed->>'destination' end,
      'destinationUnlocode',case when selected_fields ? 'destination' and proposed->>'destination' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'destination') end,
      'destinationAddress',case when selected_fields ? 'deliveryAddress' then proposed->>'deliveryAddress' end,
      'serviceLevel',case when selected_fields ? 'serviceLevel' then proposed->>'serviceLevel' end,
      'plannedDepartureAt',case when selected_fields ? 'estimatedDeparture' then proposed->>'estimatedDeparture' end,
      'plannedArrivalAt',case when selected_fields ? 'estimatedArrival' then proposed->>'estimatedArrival' end,
      'carrierId',case when selected_fields ? 'carrier' then proposed#>>'{carrier,id}' end,
      'mode',case when selected_fields ? 'mode' then proposed->>'mode' end
    )));$old$;
  new_block text := $new$    save_payload := save_payload || jsonb_build_object('route',jsonb_strip_nulls(jsonb_build_object(
      'origin',case when selected_fields ? 'origin' then coalesce(proposed->>'origin','') end,
      'originUnlocode',case when selected_fields ? 'origin' then case when proposed->>'origin' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'origin') else '' end end,
      'originAddress',case when selected_fields ? 'collectionAddress' then coalesce(proposed->>'collectionAddress','') end,
      'destination',case when selected_fields ? 'destination' then coalesce(proposed->>'destination','') end,
      'destinationUnlocode',case when selected_fields ? 'destination' then case when proposed->>'destination' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'destination') else '' end end,
      'destinationAddress',case when selected_fields ? 'deliveryAddress' then coalesce(proposed->>'deliveryAddress','') end,
      'serviceLevel',case when selected_fields ? 'serviceLevel' then coalesce(proposed->>'serviceLevel','') end,
      'plannedDepartureAt',case when selected_fields ? 'estimatedDeparture' then coalesce(proposed->>'estimatedDeparture','') end,
      'plannedArrivalAt',case when selected_fields ? 'estimatedArrival' then coalesce(proposed->>'estimatedArrival','') end,
      'carrierId',case when selected_fields ? 'carrier' then coalesce(proposed#>>'{carrier,id}','') end,
      'mode',case when selected_fields ? 'mode' then proposed->>'mode' end
    )));$new$;
  field_name text;
begin
  if (length(definition)-length(replace(definition,old_block,'')))/length(old_block)<>1 then
    raise exception 'Review current Quote apply route payload before updating selected clears.';
  end if;
  definition:=replace(definition,old_block,new_block);
  -- Replacing a coded port with a named place (or blank) must not leave the old
  -- UN/LOCODE taking precedence over the newly accepted origin/destination.
  foreach field_name in array array['origin','destination'] loop
    old_block:=format($old$    if proposed->>'%1$s' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then
      save_payload := save_payload || jsonb_build_object('%1$sUnlocode',upper(proposed->>'%1$s'));
    end if;$old$,field_name);
    new_block:=format($new$    save_payload := save_payload || jsonb_build_object('%1$sUnlocode',
      case when proposed->>'%1$s' ~ '^[A-Za-z]{2}[A-Za-z0-9]{3}$' then upper(proposed->>'%1$s') else null end);$new$,field_name);
    if (length(definition)-length(replace(definition,old_block,'')))/length(old_block)<>1 then
      raise exception 'Review current Quote apply % payload before updating selected clears.',field_name;
    end if;
    definition:=replace(definition,old_block,new_block);
  end loop;
  execute definition;
end;
$migration$;

commit;
