-- Delivery reports and explicit automatic responses can reference an outbound
-- Message-ID, but that reference is transport metadata rather than evidence
-- that the recipient replied. Remove only provider-sync reply events whose
-- exact inbound source message carries a machine-report/automatic header.
--
-- Dexter / Watching for you parity: this corrects evidence in the existing
-- email event stream. It adds no capability and no recurring LLM work.

begin;

with automated_inbound as materialized (
  select
    inbound."CommMessage_ID" as inbound_message_id,
    inbound."CommMessage_ReplyToMessageID" as outbound_message_id
  from public."Comm_Messages" as inbound
  cross join lateral (
    select lower(replace(coalesce(inbound."CommMessage_HeaderJSON"::text, ''), E'\\', '')) as value
  ) as normalized_headers
  where inbound."CommMessage_IsInbound"
    and inbound."CommMessage_ReplyToMessageID" is not null
    and (
      normalized_headers.value ~ '"content-type"\s*:\s*"(multipart/report|message/delivery-status)'
      or (
        normalized_headers.value ~ '"auto-submitted"\s*:\s*"'
        and normalized_headers.value !~ '"auto-submitted"\s*:\s*"no"'
      )
      or normalized_headers.value ~ '"x-autoreply"\s*:'
      or normalized_headers.value ~ '"x-autorespond"\s*:'
    )
), removed_false_reply_events as (
  delete from public."Comm_DeliveryEvents" as event
  using automated_inbound as automated
  where event."CommDelivery_MessageID" = automated.outbound_message_id
    and event."CommDelivery_EventTypeCode" = 'replied'
    and event."CommDelivery_PayloadJSON" ->> 'source' = 'provider_sync'
    and event."CommDelivery_PayloadJSON" ->> 'inboundMessageId' = automated.inbound_message_id::text
  returning event."CommDelivery_ID"
)
update public."Comm_Messages" as inbound
set
  "CommMessage_ReplyToMessageID" = null,
  "CommMessage_UpdatedAt" = now()
from automated_inbound as automated
where inbound."CommMessage_ID" = automated.inbound_message_id;

commit;
