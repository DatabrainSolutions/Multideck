-- Provider event IDs are scoped to one connection. If a provider or caller
-- reuses an ID for a different local message, fail closed instead of allowing
-- the RPC's idempotent conflict path to mutate the wrong email.

begin;

create or replace function public.comm_reject_delivery_event_message_collision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing_message_id uuid;
begin
  if new."CommDelivery_ConnectionID" is null
     or new."CommDelivery_ProviderEventID" is null then
    return new;
  end if;

  select event."CommDelivery_MessageID"
  into v_existing_message_id
  from public."Comm_DeliveryEvents" as event
  where event."CommDelivery_ConnectionID" = new."CommDelivery_ConnectionID"
    and event."CommDelivery_ProviderEventID" = new."CommDelivery_ProviderEventID"
  limit 1;

  if found and v_existing_message_id is distinct from new."CommDelivery_MessageID" then
    raise exception 'A provider delivery event cannot be attached to a different message.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.comm_reject_delivery_event_message_collision()
  from public, anon, authenticated;

drop trigger if exists comm_delivery_event_message_collision_guard
  on public."Comm_DeliveryEvents";
create trigger comm_delivery_event_message_collision_guard
before insert or update of
  "CommDelivery_ConnectionID",
  "CommDelivery_ProviderEventID",
  "CommDelivery_MessageID"
on public."Comm_DeliveryEvents"
for each row
execute function public.comm_reject_delivery_event_message_collision();

commit;
