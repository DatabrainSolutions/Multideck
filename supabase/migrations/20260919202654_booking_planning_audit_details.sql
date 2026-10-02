begin;
set local lock_timeout='5s';
-- Extend only the existing authorised workspace projection. No audit mutation,
-- new endpoint, grants or change to the Booking access check.
do $migration$
declare
 definition text := pg_get_functiondef('booking_api.workspace_before_goods_value_20260905(uuid,text)'::regprocedure);
 anchor text := $anchor$'metadata', event.metadata, 'occurredAt'$anchor$;
 replacement text := $replacement$'metadata', coalesce(event.metadata,'{}'::jsonb) ||
   case when event.event_type='planning_charges_saved' then coalesce((
     select jsonb_build_object('planningHistory',jsonb_build_object(
       'beforeRows',coalesce(nullif(history.before_state->'rows','null'::jsonb),'[]'::jsonb),
       'afterRows',coalesce(nullif(history.after_state->'rows','null'::jsonb),'[]'::jsonb)))
     from booking_api.planning_charge_history history
     where history.job_id=event.job_id
       and history.revision::text=event.metadata->>'revision'
   ),'{}'::jsonb) else '{}'::jsonb end, 'occurredAt'$replacement$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
   raise exception 'Booking audit projection changed; review before applying.';
 end if;
 execute replace(definition,anchor,replacement);
end $migration$;
commit;
