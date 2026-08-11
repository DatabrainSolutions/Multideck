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
      "CommMessage_DeliveredAt" = case when p_status_code = 'delivered' then coalesce("CommMessage_DeliveredAt", v_event_at) else "CommMessage_DeliveredAt" end,
      "CommMessage_ReadAt" = case when p_status_code = 'read' then coalesce("CommMessage_ReadAt", now()) else "CommMessage_ReadAt" end,
      "CommMessage_UpdatedAt" = now()
    where "CommMessage_ID" = p_message_id;
  elsif p_event_type_code = 'delivered' then
    update public."Comm_Messages"
    set "CommMessage_DeliveredAt" = coalesce("CommMessage_DeliveredAt", v_event_at),
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

-- A blanket first-minute block loses genuine immediate opens. The edge
-- function now rejects explicit prefetch requests before calling this function;
-- privacy-proxy requests remain estimated evidence because they cannot be
-- reliably distinguished from a recipient's mail app loading the image.
create or replace function public.comm_record_tracking_open(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public."Comm_MessageTrackingTokens"%rowtype;
  v_first boolean;
  v_now timestamptz := now();
begin
  select * into v_token
  from public."Comm_MessageTrackingTokens"
  where "CommTrack_TokenHashSHA256" = p_token_hash
    and "CommTrack_IsActive"
    and "CommTrack_ExpiresAt" > v_now
  for update;
  if not found then return false; end if;

  v_first := v_token."CommTrack_FirstOpenedAt" is null;
  update public."Comm_MessageTrackingTokens"
  set "CommTrack_FirstOpenedAt" = coalesce("CommTrack_FirstOpenedAt", v_now),
      "CommTrack_LastOpenedAt" = v_now,
      "CommTrack_OpenCount" = "CommTrack_OpenCount" + 1
  where "CommTrack_ID" = v_token."CommTrack_ID";

  if v_first then
    perform public."Comm_RecordDeliveryEvent"(
      v_token."CommTrack_MessageID",
      v_token."CommTrack_SendID",
      'opened',
      null,
      'open:' || v_token."CommTrack_ID"::text,
      jsonb_build_object('source', 'tracking_image', 'confidence', 'estimated', 'eventAt', v_now)
    );
  end if;
  return true;
end;
$$;

revoke all on function public.comm_record_tracking_open(text) from public, anon, authenticated;
grant execute on function public.comm_record_tracking_open(text) to service_role;

commit;
