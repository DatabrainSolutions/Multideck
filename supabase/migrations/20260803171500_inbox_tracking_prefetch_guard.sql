-- Mail gateways and provider security scanners can request remote images a few
-- seconds after send. Keep those probes from becoming a recipient open while
-- leaving the token active for a later, more credible request.
--
-- Dexter / Watching for you exception: this changes only the confidence filter
-- on existing tracking evidence. It adds no new operator data or action.

begin;

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
  v_sent_at timestamptz;
begin
  select * into v_token
  from public."Comm_MessageTrackingTokens"
  where "CommTrack_TokenHashSHA256" = p_token_hash
    and "CommTrack_IsActive"
    and "CommTrack_ExpiresAt" > v_now
  for update;
  if not found then return false; end if;

  select coalesce(
    message."CommMessage_SentAt",
    message."CommMessage_CreatedAt",
    v_token."CommTrack_CreatedAt"
  )
  into v_sent_at
  from public."Comm_Messages" as message
  where message."CommMessage_ID" = v_token."CommTrack_MessageID";

  -- A real recipient can still open quickly, but an immediate false positive
  -- is more damaging than a conservative first-minute false negative. Do not
  -- increment counters or create delivery evidence during this guard window.
  if v_now < greatest(
    v_token."CommTrack_CreatedAt",
    coalesce(v_sent_at, v_token."CommTrack_CreatedAt")
  ) + interval '60 seconds' then
    return false;
  end if;

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
