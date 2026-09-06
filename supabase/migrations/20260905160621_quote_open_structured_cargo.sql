-- Seed new Quotes through the canonical save boundary, not transient UI state.
-- No existing draft, submitted version, reference recipe or Booking is changed.
begin;

-- JSON numbers are rounded by JavaScript before the editor can preserve them.
-- Keep validated decimals as strings in newly saved snapshots; typed projection
-- columns still receive numeric values. Never rewrite issued evidence.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('quote_api.normalise_cargo_lines(jsonb,boolean)'::regprocedure) into definition;
  if position('jsonb_build_object(key, number_value);' in definition) = 0 then
    raise exception 'Quote cargo normaliser changed; review the precision integration before applying.';
  end if;
  execute replace(definition, 'jsonb_build_object(key, number_value);', 'jsonb_build_object(key, number_value::text);');
end $migration$;

create or replace function public.quote_workflow_open_quote(caller_auth_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.save_quote(
    caller_auth_user_id,
    null,
    jsonb_build_object(
      'sourceType', 'account',
      'shipmentFacts', jsonb_build_object(
        'createdOnOpen', true,
        'cargoLines', quote_api.normalise_cargo_lines(jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'description', '')
        ), false)
      )
    )
  );
$$;

revoke all on function public.quote_workflow_open_quote(uuid) from public, anon, authenticated;
grant execute on function public.quote_workflow_open_quote(uuid) to service_role;

commit;
