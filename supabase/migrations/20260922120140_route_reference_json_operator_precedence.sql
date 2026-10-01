-- JSON extraction must complete before removing the consumed review key.
begin;
set local lock_timeout='5s';
do $$
declare
 definition text:=pg_get_functiondef('booking_api.preserve_route_mode_references()'::regprocedure);
 anchor text:='(new."JobRoute_RouteJSON"->''routeData''-''modeChangeReview'')';
begin
 if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then
  raise exception 'Unexpected route reference trigger; review current definition.';
 end if;
 execute replace(definition,anchor,'((new."JobRoute_RouteJSON"->''routeData'')-''modeChangeReview'')');
end $$;
commit;
