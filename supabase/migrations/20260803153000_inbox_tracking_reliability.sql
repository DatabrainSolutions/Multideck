-- Keep open evidence separate from the outbound send state and clarify that a
-- single token represents the message audience, including Reply all.

begin;

comment on column public."Comm_MessageTrackingTokens"."CommTrack_RecipientHashSHA256" is
  'SHA-256 of the sorted, normalised recipient audience. No recipient address is stored here.';

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
      v_token."CommTrack_MessageID", v_token."CommTrack_SendID", 'opened', null, null,
      jsonb_build_object('source', 'tracking_image', 'confidence', 'estimated')
    );
  end if;
  return true;
end;
$$;

revoke all on function public.comm_record_tracking_open(text) from public, anon, authenticated;
grant execute on function public.comm_record_tracking_open(text) to service_role;

commit;
