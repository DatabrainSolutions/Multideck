-- The initial legacy conversion also creates a single equipment placeholder.
-- Reconcile every NEW conversion through the mode-aware projection, not Sea
-- alone. Existing/reused Bookings and their operator equipment are untouched.
begin;
do $migration$
declare
  target regprocedure;
  definition text;
  marker text := 'if found and booking_api.normalise_mode(target_job."Job_TransportModeSummary") in (''sea'', ''ocean'') then';
  matches integer := 0;
begin
  for target in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='booking_api' and p.proname like 'convert_accepted_quote%'
      and position(marker in p.prosrc)>0
  loop
    definition := pg_get_functiondef(target);
    if position('if not coalesce((conversion_result->>''reused'')::boolean, false)' in definition)=0 then
      raise exception 'New-booking guard changed: review before release';
    end if;
    execute replace(definition,marker,'if found then');
    matches := matches+1;
  end loop;
  if matches<>1 then raise exception 'Expected one conversion equipment wrapper, found %',matches; end if;
end;
$migration$;
commit;
