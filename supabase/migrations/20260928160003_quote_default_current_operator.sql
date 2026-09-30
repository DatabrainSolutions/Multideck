-- A newly created Quote belongs to the authenticated operator by default.
-- An explicitly selected owner and every existing Quote remain unchanged.
do $guard$
declare definition text;
begin
  select pg_get_functiondef('quote_api.save_quote(uuid,uuid,jsonb)'::regprocedure)
    into definition;
  if position('quote_api.save_quote_before_cargo_totals_20260905' in definition) = 0
    or position('quote_api.normalise_cargo_facts' in definition) = 0 then
    raise exception 'Quote save boundary changed; review owner default before applying.';
  end if;
end $guard$;

create or replace function quote_api.save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operator_user_id uuid;
begin
  if requested_quote_id is null
     and nullif(btrim(payload->>'salesOwnerId'), '') is null then
    select "User_ID" into operator_user_id
    from public."cmp_Users"
    where "Auth_User_ID" = caller_auth_user_id
      and "User_AccessStatus" = 'active';

    if operator_user_id is null then
      raise exception 'An active operator is required to create a Quote.' using errcode = '42501';
    end if;
    payload := jsonb_set(payload, '{salesOwnerId}', to_jsonb(operator_user_id::text), true);
  end if;

  if payload->'shipmentFacts' ? 'cargoLines' then
    payload := jsonb_set(payload, '{shipmentFacts}', quote_api.normalise_cargo_facts(payload->'shipmentFacts'));
  end if;
  return quote_api.save_quote_before_cargo_totals_20260905(caller_auth_user_id, requested_quote_id, payload);
end;
$$;

revoke all on function quote_api.save_quote(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function quote_api.save_quote(uuid,uuid,jsonb) to service_role;
