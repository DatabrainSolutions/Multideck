-- Make delivery evidence belong to one provider connection and one message.
-- This makes repeated provider notifications harmless and prevents a thread's
-- later activity from becoming evidence for every outbound message in it.
--
-- Dexter / Watching for you parity: this tightens the identity and idempotency
-- of the existing email delivery capability. Comm_DeliveryEvents already feeds
-- the email watch adapter, so no new capability or recurring LLM work is added.

begin;

create or replace function public."Comm_RecordDeliveryEvent"(
  p_message_id uuid,
  p_send_id uuid,
  p_event_type_code varchar,
  p_status_code varchar,
  p_provider_event_id varchar default null,
  p_payload_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_delivery_id uuid;
  v_connection_id uuid;
  v_provider_message_id varchar;
  v_event_at timestamptz := now();
begin
  if p_message_id is null then
    raise exception 'A delivery event must identify one message.' using errcode = '22023';
  end if;

  select mailbox."CommMailbox_ConnectionID", message."CommMessage_ProviderMessageID"
  into v_connection_id, v_provider_message_id
  from public."Comm_Messages" as message
  join public."Comm_Mailboxes" as mailbox
    on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
  where message."CommMessage_ID" = p_message_id;

  if not found or v_connection_id is null then
    raise exception 'The delivery event message has no provider connection.' using errcode = '23503';
  end if;

  if p_send_id is not null and not exists (
    select 1
    from public."Comm_SendRequests" as send_request
    where send_request."CommSend_ID" = p_send_id
      and send_request."CommSend_MessageID" = p_message_id
  ) then
    raise exception 'The delivery event send does not belong to its message.' using errcode = '23503';
  end if;

  begin
    v_event_at := coalesce(nullif(p_payload_json ->> 'eventAt', '')::timestamptz, now());
  exception when others then
    v_event_at := now();
  end;

  insert into public."Comm_DeliveryEvents" (
    "CommDelivery_MessageID",
    "CommDelivery_SendID",
    "CommDelivery_ConnectionID",
    "CommDelivery_EventTypeCode",
    "CommDelivery_StatusCode",
    "CommDelivery_ProviderEventID",
    "CommDelivery_ProviderMessageID",
    "CommDelivery_EventAt",
    "CommDelivery_PayloadJSON"
  ) values (
    p_message_id,
    p_send_id,
    v_connection_id,
    p_event_type_code,
    p_status_code,
    nullif(btrim(p_provider_event_id), ''),
    v_provider_message_id,
    v_event_at,
    coalesce(p_payload_json, '{}'::jsonb)
  )
  on conflict ("CommDelivery_ConnectionID", "CommDelivery_ProviderEventID")
    where "CommDelivery_ConnectionID" is not null and "CommDelivery_ProviderEventID" is not null
  do nothing
  returning "CommDelivery_ID" into v_delivery_id;

  if v_delivery_id is null and p_provider_event_id is not null then
    select event."CommDelivery_ID" into v_delivery_id
    from public."Comm_DeliveryEvents" as event
    where event."CommDelivery_ConnectionID" = v_connection_id
      and event."CommDelivery_ProviderEventID" = p_provider_event_id;
  end if;

  if p_message_id is not null and p_status_code is not null then
    update public."Comm_Messages"
    set
      "CommMessage_StatusCode" = p_status_code,
      "CommMessage_DeliveredAt" = case when p_status_code = 'delivered' then coalesce("CommMessage_DeliveredAt", now()) else "CommMessage_DeliveredAt" end,
      "CommMessage_ReadAt" = case when p_status_code = 'read' then coalesce("CommMessage_ReadAt", now()) else "CommMessage_ReadAt" end,
      "CommMessage_UpdatedAt" = now()
    where "CommMessage_ID" = p_message_id;
  elsif p_event_type_code = 'delivered' then
    update public."Comm_Messages"
    set "CommMessage_DeliveredAt" = coalesce("CommMessage_DeliveredAt", now()),
        "CommMessage_UpdatedAt" = now()
    where "CommMessage_ID" = p_message_id;
  end if;

  if p_send_id is not null and p_status_code is not null then
    update public."Comm_SendRequests"
    set "CommSend_StatusCode" = p_status_code,
        "CommSend_UpdatedAt" = now()
    where "CommSend_ID" = p_send_id
      and "CommSend_MessageID" = p_message_id;
  end if;

  return v_delivery_id;
end;
$$;

revoke all on function public."Comm_RecordDeliveryEvent"(uuid, uuid, varchar, varchar, varchar, jsonb)
  from public, anon, authenticated;
grant execute on function public."Comm_RecordDeliveryEvent"(uuid, uuid, varchar, varchar, varchar, jsonb)
  to service_role;

-- Repair historical Gmail rows only when In-Reply-To exactly identifies one
-- outbound RFC Message-ID in the same local thread.
with exact_reply as (
  select inbound."CommMessage_ID" as inbound_id,
         min(outbound."CommMessage_ID"::text)::uuid as outbound_id
  from public."Comm_Messages" as inbound
  join public."Comm_Messages" as outbound
    on outbound."CommMessage_ThreadID" = inbound."CommMessage_ThreadID"
   and not outbound."CommMessage_IsInbound"
   and outbound."CommMessage_InternetMessageID" is not null
   and lower(btrim(outbound."CommMessage_InternetMessageID")) = lower(btrim(inbound."CommMessage_HeaderJSON" ->> 'in-reply-to'))
  where inbound."CommMessage_IsInbound"
    and inbound."CommMessage_ReplyToMessageID" is null
    and nullif(btrim(inbound."CommMessage_HeaderJSON" ->> 'in-reply-to'), '') is not null
  group by inbound."CommMessage_ID"
  having count(*) = 1
)
update public."Comm_Messages" as inbound
set "CommMessage_ReplyToMessageID" = exact_reply.outbound_id,
    "CommMessage_UpdatedAt" = now()
from exact_reply
where inbound."CommMessage_ID" = exact_reply.inbound_id;

insert into public."Comm_DeliveryEvents" (
  "CommDelivery_MessageID",
  "CommDelivery_SendID",
  "CommDelivery_ConnectionID",
  "CommDelivery_EventTypeCode",
  "CommDelivery_StatusCode",
  "CommDelivery_ProviderEventID",
  "CommDelivery_ProviderMessageID",
  "CommDelivery_EventAt",
  "CommDelivery_PayloadJSON"
)
select outbound."CommMessage_ID",
       send_request."CommSend_ID",
       mailbox."CommMailbox_ConnectionID",
       'replied',
       null,
       'reply:' || inbound."CommMessage_ID"::text || ':' || outbound."CommMessage_ID"::text,
       inbound."CommMessage_ProviderMessageID",
       coalesce(inbound."CommMessage_ReceivedAt", inbound."CommMessage_MessageDate", inbound."CommMessage_CreatedAt"),
       jsonb_build_object('source', 'exact_header_backfill', 'inboundMessageId', inbound."CommMessage_ID", 'confidence', 'confirmed')
from public."Comm_Messages" as inbound
join public."Comm_Messages" as outbound
  on outbound."CommMessage_ID" = inbound."CommMessage_ReplyToMessageID"
join public."Comm_Mailboxes" as mailbox
  on mailbox."CommMailbox_ID" = outbound."CommMessage_MailboxID"
left join lateral (
  select request."CommSend_ID"
  from public."Comm_SendRequests" as request
  where request."CommSend_MessageID" = outbound."CommMessage_ID"
  order by request."CommSend_CreatedAt" desc
  limit 1
) as send_request on true
where inbound."CommMessage_IsInbound"
on conflict ("CommDelivery_ConnectionID", "CommDelivery_ProviderEventID")
  where "CommDelivery_ConnectionID" is not null and "CommDelivery_ProviderEventID" is not null
do nothing;

commit;
