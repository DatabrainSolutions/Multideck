-- A stale operator snapshot cannot succeed by retrying the same transaction.
-- PostgREST versions which retry 40001 may otherwise keep the HTTP call open.
-- Keep all checks, locks, permissions and rollback semantics; change only the
-- three explicit business-conflict signals to PostgREST's HTTP 409 SQLSTATE.
do $migration$
declare
  definition text := pg_get_functiondef('booking_api.save_route_milestone(uuid,uuid,jsonb)'::regprocedure);
  message text;
  anchor text;
begin
  foreach message in array array[
    'The Booking or leg changed. Reload before recording this milestone.',
    'That milestone no longer exists. Reload the Booking.',
    'This milestone changed. Reload before making a correction.'
  ] loop
    anchor := format('raise exception %L using errcode = ''40001'';', message);
    if array_length(string_to_array(definition, anchor), 1) <> 2 then
      raise exception 'Expected exactly one milestone conflict guard for: %', message;
    end if;
    definition := replace(definition, anchor, format('raise exception %L using errcode = ''PT409'';', message));
  end loop;
  execute definition;
end $migration$;
