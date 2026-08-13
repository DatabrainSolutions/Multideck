-- Broadcast delivery is always real Resend delivery. Preserve any historical
-- simulated rows honestly as failures before removing mock states.

begin;

update public."DEV_BroadcastRecipients"
set "BroadcastRecipient_StatusCode" = 'failed',
    "BroadcastRecipient_Error" = coalesce("BroadcastRecipient_Error", 'Legacy simulated dispatch; no email was sent.'),
    "BroadcastRecipient_DeliveredAt" = null
where "BroadcastRecipient_StatusCode" = 'mocked';

update public."DEV_Broadcasts"
set "Broadcast_StatusCode" = 'failed',
    "Broadcast_DeliveryMode" = null,
    "Broadcast_Error" = coalesce("Broadcast_Error", 'Legacy simulated dispatch; no email was sent.'),
    "Broadcast_DeliveredCount" = 0,
    "Broadcast_FailedCount" = greatest("Broadcast_FailedCount", "Broadcast_RecipientCount"),
    "Broadcast_UpdatedAt" = now()
where "Broadcast_StatusCode" = 'mocked' or "Broadcast_DeliveryMode" = 'mock';

alter table public."DEV_Broadcasts" drop constraint if exists "CK_DEV_Broadcasts_status";
alter table public."DEV_Broadcasts"
  add constraint "CK_DEV_Broadcasts_status"
  check ("Broadcast_StatusCode" in ('draft','sending','sent','partially_failed','failed'));

alter table public."DEV_BroadcastRecipients" drop constraint if exists "CK_DEV_BroadcastRecipients_status";
alter table public."DEV_BroadcastRecipients"
  add constraint "CK_DEV_BroadcastRecipients_status"
  check ("BroadcastRecipient_StatusCode" in ('ready','excluded','sending','delivered','failed'));

commit;
