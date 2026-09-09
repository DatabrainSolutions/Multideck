-- Privacy-minimised, opt-in outbound open tracking.

begin;

insert into public."sys_CommDeliveryEventTypes" (
  "CommDeliveryEventType_Code", "CommDeliveryEventType_Name", "CommDeliveryEventType_Description", "CommDeliveryEventType_SortOrder", "CommDeliveryEventType_IsActive"
)
values
  ('sent', 'Sent', 'The mail provider accepted the outbound send.', 10, true),
  ('delivered', 'Delivered', 'A provider or correlated delivery event confirmed delivery.', 20, true),
  ('opened', 'Opened', 'The optional tracking image was requested. This is an estimate.', 30, true),
  ('replied', 'Replied', 'A correlated inbound response was received.', 40, true),
  ('bounced', 'Bounced', 'The provider confirmed that delivery bounced.', 50, true),
  ('failed', 'Failed', 'The provider confirmed that the send failed.', 60, true)
on conflict ("CommDeliveryEventType_Code") do update
set "CommDeliveryEventType_Name" = excluded."CommDeliveryEventType_Name",
    "CommDeliveryEventType_Description" = excluded."CommDeliveryEventType_Description",
    "CommDeliveryEventType_SortOrder" = excluded."CommDeliveryEventType_SortOrder",
    "CommDeliveryEventType_IsActive" = true;

create table if not exists public."Comm_MessageTrackingTokens" (
  "CommTrack_ID" uuid primary key default gen_random_uuid(),
  "CommTrack_MessageID" uuid not null references public."Comm_Messages"("CommMessage_ID") on delete cascade,
  "CommTrack_SendID" uuid references public."Comm_SendRequests"("CommSend_ID") on delete cascade,
  "CommTrack_RecipientHashSHA256" varchar(64) not null,
  "CommTrack_TokenHashSHA256" varchar(64) not null unique,
  "CommTrack_ExpiresAt" timestamptz not null,
  "CommTrack_FirstOpenedAt" timestamptz,
  "CommTrack_LastOpenedAt" timestamptz,
  "CommTrack_OpenCount" integer not null default 0 check ("CommTrack_OpenCount" >= 0),
  "CommTrack_IsActive" boolean not null default true,
  "CommTrack_CreatedAt" timestamptz not null default now()
);

create index if not exists "IX_Comm_MessageTrackingTokens_message_active"
  on public."Comm_MessageTrackingTokens" ("CommTrack_MessageID", "CommTrack_IsActive");
create index if not exists "IX_Comm_MessageTrackingTokens_expiry"
  on public."Comm_MessageTrackingTokens" ("CommTrack_ExpiresAt")
  where "CommTrack_IsActive";

alter table public."Comm_MessageTrackingTokens" enable row level security;
revoke all on table public."Comm_MessageTrackingTokens" from public, anon, authenticated;
grant all on table public."Comm_MessageTrackingTokens" to service_role;

create or replace function public.comm_record_tracking_open(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_token public."Comm_MessageTrackingTokens"%rowtype; v_first boolean; v_now timestamptz := now();
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
      v_token."CommTrack_MessageID", v_token."CommTrack_SendID", 'opened', 'read', null,
      jsonb_build_object('source', 'tracking_image', 'confidence', 'estimated')
    );
  end if;
  return true;
end;
$$;

revoke all on function public.comm_record_tracking_open(text) from public, anon, authenticated;
grant execute on function public.comm_record_tracking_open(text) to service_role;

-- The event recorder is a backend boundary. Browser roles must not be able to
-- manufacture delivered/opened/replied evidence.
revoke all on function public."Comm_RecordDeliveryEvent"(uuid, uuid, varchar, varchar, varchar, jsonb) from public, anon, authenticated;
grant execute on function public."Comm_RecordDeliveryEvent"(uuid, uuid, varchar, varchar, varchar, jsonb) to service_role;

commit;
