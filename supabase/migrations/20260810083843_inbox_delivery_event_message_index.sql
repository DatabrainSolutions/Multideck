-- Thread detail derives one evidence timeline per outbound message. Keep that
-- lookup bounded as delivery/open/reply history grows.
create index if not exists "IX_Comm_DeliveryEvents_message_event_at"
  on public."Comm_DeliveryEvents" (
    "CommDelivery_MessageID",
    "CommDelivery_EventAt" desc
  );
