-- The full editor sends both a legacy first-route summary and the real legs.
-- Only the legs may write routing in that case. Keep all surrounding public
-- direction, decimal, permissions, audit and detail-save stages unchanged.
begin;

do $migration$
declare
  definition text;
  original_call text := 'perform booking_api.save_booking(caller_auth_user_id, requested_job_id, payload);';
begin
  select pg_get_functiondef('public.booking_workflow_save_before_branch_direction_20260904(uuid,uuid,jsonb)'::regprocedure)
  into definition;
  if position(original_call in definition) = 0
    or position('perform booking_api.save_booking_route_legs(caller_auth_user_id, requested_job_id, payload);' in definition) = 0 then
    raise exception 'Booking save stages have changed; review routing integration before applying this migration.';
  end if;
  execute replace(definition, original_call,
    'perform booking_api.save_booking(caller_auth_user_id, requested_job_id, case when payload ? ''routes'' then payload - ''route'' else payload end);');
end;
$migration$;

-- The renamed stage stays private. The existing public entry point and its
-- canonical authorisation checks remain the only application save boundary.
revoke all on function public.booking_workflow_save_before_branch_direction_20260904(uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;

commit;
