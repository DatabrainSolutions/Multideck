-- Calendar: booking link kinds (1-1, round robin, collective) with named hosts,
-- richer public-form questions, editable mirrored Google/Microsoft events, and
-- Dexter parity for both.
begin;

-- ---------------------------------------------------------------------------
-- Booking link kinds and hosts
-- ---------------------------------------------------------------------------
alter table public."CAL_BookingLinks"
  add column if not exists "CALBookingLink_KindCode" varchar(20) not null default 'one_on_one';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'CK_CAL_BookingLinks_kind') then
    alter table public."CAL_BookingLinks"
      add constraint "CK_CAL_BookingLinks_kind" check ("CALBookingLink_KindCode" in ('one_on_one','round_robin','collective'));
  end if;
end $$;

create table if not exists public."CAL_BookingLinkHosts" (
  "CALBookingLinkHost_ID" uuid primary key default gen_random_uuid(),
  "CALBookingLinkHost_BookingLinkID" uuid not null references public."CAL_BookingLinks"("CALBookingLink_ID") on delete cascade,
  "CALBookingLinkHost_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALBookingLinkHost_SortOrder" integer not null default 0,
  "CALBookingLinkHost_CreatedAt" timestamptz not null default now(),
  unique ("CALBookingLinkHost_BookingLinkID", "CALBookingLinkHost_UserID")
);
create index if not exists "IX_CAL_BookingLinkHosts_user"
  on public."CAL_BookingLinkHosts" ("CALBookingLinkHost_UserID");
alter table public."CAL_BookingLinkHosts" enable row level security;
revoke all on public."CAL_BookingLinkHosts" from public, anon, authenticated;
grant select, insert, update, delete on public."CAL_BookingLinkHosts" to service_role;

-- Which host a public hold was assigned to. Null means the link owner.
alter table public."CAL_BookingHolds"
  add column if not exists "CALBookingHold_HostUserID" uuid references public."cmp_Users"("User_ID") on delete set null;

-- ---------------------------------------------------------------------------
-- Deliveries: Dexter-approved changes to mirrored provider events
-- ---------------------------------------------------------------------------
alter table public."CAL_Deliveries" drop constraint if exists "CK_CAL_Deliveries_kind";
alter table public."CAL_Deliveries" add constraint "CK_CAL_Deliveries_kind" check (
  "CALDelivery_KindCode" in (
    'provider_create','provider_update','provider_cancel','crm_link','booking_verification','management',
    'standalone_confirmation','reminder','rescheduled','cancelled','group_reschedule_request','group_reschedule_outcome',
    'external_event_update','external_event_cancel'
  )
);

-- ---------------------------------------------------------------------------
-- Finalise a verified hold for any booking kind. The assigned host becomes the
-- organiser; collective co-hosts become internal attendees so provider
-- invitations reach them.
-- ---------------------------------------------------------------------------
create or replace function public.multideck_calendar_finalise_verified_hold(
  p_hold_id uuid,
  p_booking_link_id uuid,
  p_verification_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_hold public."CAL_BookingHolds"%rowtype;
  v_link public."CAL_BookingLinks"%rowtype;
  v_reservation public."CAL_Reservations"%rowtype;
  v_meeting public."CAL_Meetings"%rowtype;
  v_status text;
  v_connection_provider text;
  v_host uuid;
  v_cohost record;
begin
  if p_hold_id is null or p_booking_link_id is null or p_verification_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The verified booking request is invalid.' using errcode='22023';
  end if;

  select hold.* into v_hold
  from public."CAL_BookingHolds" hold
  where hold."CALBookingHold_ID"=p_hold_id
    and hold."CALBookingHold_BookingLinkID"=p_booking_link_id
  for update;
  if not found then
    raise exception 'That booking hold is not available.' using errcode='P0002';
  end if;
  if v_hold."CALBookingHold_VerificationHash" <> p_verification_hash then
    raise exception 'The verification code does not match.' using errcode='22023';
  end if;

  if v_hold."CALBookingHold_MeetingID" is not null then
    select meeting.* into v_meeting
    from public."CAL_Meetings" meeting
    where meeting."CALMeeting_ID"=v_hold."CALBookingHold_MeetingID";
    if not found then
      raise exception 'The verified booking meeting is missing.' using errcode='55000';
    end if;
    return to_jsonb(v_meeting);
  end if;

  if v_hold."CALBookingHold_ExpiresAt" <= now() then
    raise exception 'That booking hold has expired.' using errcode='55000';
  end if;

  select link.* into v_link
  from public."CAL_BookingLinks" link
  where link."CALBookingLink_ID"=p_booking_link_id
    and link."CALBookingLink_CompanyID"=v_hold."CALBookingHold_CompanyID"
    and link."CALBookingLink_StatusCode"='active'
  for share;
  if not found then
    raise exception 'That booking link is no longer active.' using errcode='55000';
  end if;

  v_host := coalesce(v_hold."CALBookingHold_HostUserID", v_link."CALBookingLink_OwnerUserID");
  if v_host <> v_link."CALBookingLink_OwnerUserID" and not exists (
    select 1 from public."CAL_BookingLinkHosts" host
    where host."CALBookingLinkHost_BookingLinkID"=v_link."CALBookingLink_ID" and host."CALBookingLinkHost_UserID"=v_host
  ) then
    raise exception 'The assigned host is no longer part of this booking link.' using errcode='55000';
  end if;

  select reservation.* into v_reservation
  from public."CAL_Reservations" reservation
  where reservation."CALReservation_ID"=v_hold."CALBookingHold_ReservationID"
    and reservation."CALReservation_CompanyID"=v_hold."CALBookingHold_CompanyID"
    and reservation."CALReservation_OwnerUserID"=v_host
    and reservation."CALReservation_SourceCode"='hold'
    and reservation."CALReservation_SourceID"=p_hold_id
    and reservation."CALReservation_StatusCode"='active'
    and reservation."CALReservation_ExpiresAt">now()
  for update;
  if not found then
    raise exception 'That booking time is no longer reserved.' using errcode='55000';
  end if;

  if v_link."CALBookingLink_ProviderCode" in ('google_meet','microsoft_teams','zoom') then
    v_connection_provider := case v_link."CALBookingLink_ProviderCode"
      when 'google_meet' then 'google'
      when 'microsoft_teams' then 'microsoft'
      else 'zoom'
    end;
    if not exists (
      select 1
      from public."CAL_ProviderConnections" connection
      where connection."CALConnection_CompanyID"=v_link."CALBookingLink_CompanyID"
        and connection."CALConnection_UserID"=v_host
        and connection."CALConnection_ProviderCode"=v_connection_provider
        and connection."CALConnection_StatusCode"='connected'
    ) then
      raise exception 'The selected meeting provider is not connected.' using errcode='55000';
    end if;
    v_status := 'provisioning';
  else
    v_status := 'confirmed';
  end if;

  insert into public."CAL_Meetings" (
    "CALMeeting_CompanyID","CALMeeting_OrganiserUserID","CALMeeting_ReservationID",
    "CALMeeting_Title","CALMeeting_Agenda","CALMeeting_StartAt","CALMeeting_EndAt","CALMeeting_TimeZone",
    "CALMeeting_StatusCode","CALMeeting_ProviderCode","CALMeeting_Location","CALMeeting_BookingLinkID",
    "CALMeeting_SourceCode","CALMeeting_CreatedBy","CALMeeting_UpdatedBy"
  ) values (
    v_link."CALBookingLink_CompanyID",v_host,v_reservation."CALReservation_ID",
    v_link."CALBookingLink_Title",coalesce(nullif(btrim(v_hold."CALBookingHold_AnswersJSON"->>'notes'),''),v_link."CALBookingLink_Description"),
    v_reservation."CALReservation_StartAt",v_reservation."CALReservation_EndAt",v_hold."CALBookingHold_TimeZone",
    v_status,v_link."CALBookingLink_ProviderCode",v_link."CALBookingLink_Location",v_link."CALBookingLink_ID",
    'booking_link',v_host,v_host
  ) on conflict ("CALMeeting_ReservationID") do nothing
  returning * into v_meeting;

  if v_meeting."CALMeeting_ID" is null then
    select meeting.* into v_meeting
    from public."CAL_Meetings" meeting
    where meeting."CALMeeting_ReservationID"=v_reservation."CALReservation_ID";
    if not found then
      raise exception 'The booking meeting could not be secured.' using errcode='55000';
    end if;
  end if;

  if v_link."CALBookingLink_KindCode"='collective' then
    for v_cohost in
      select profile."User_ID", profile."User_Email", concat_ws(' ', profile."User_Firstname", profile."User_Lastname") as full_name
      from public."CAL_BookingLinkHosts" host
      join public."cmp_Users" profile on profile."User_ID"=host."CALBookingLinkHost_UserID"
      where host."CALBookingLinkHost_BookingLinkID"=v_link."CALBookingLink_ID"
        and host."CALBookingLinkHost_UserID"<>v_host
        and profile."User_Email" is not null
      order by host."CALBookingLinkHost_SortOrder"
    loop
      insert into public."CAL_MeetingParticipants" (
        "CALParticipant_MeetingID","CALParticipant_UserID","CALParticipant_Name","CALParticipant_Email",
        "CALParticipant_RoleCode","CALParticipant_ResponseCode","CALParticipant_IsExternal"
      ) values (
        v_meeting."CALMeeting_ID", v_cohost."User_ID", left(coalesce(nullif(btrim(v_cohost.full_name),''), split_part(v_cohost."User_Email",'@',1)),240),
        lower(left(v_cohost."User_Email",320)), 'attendee', 'accepted', false
      ) on conflict ("CALParticipant_MeetingID","CALParticipant_Email") do nothing;
    end loop;
  end if;

  update public."CAL_Reservations"
  set "CALReservation_SourceCode"='meeting',
      "CALReservation_SourceID"=v_meeting."CALMeeting_ID",
      "CALReservation_ExpiresAt"=null
  where "CALReservation_ID"=v_reservation."CALReservation_ID";

  update public."CAL_BookingHolds"
  set "CALBookingHold_VerifiedAt"=coalesce("CALBookingHold_VerifiedAt",now()),
      "CALBookingHold_MeetingID"=v_meeting."CALMeeting_ID"
  where "CALBookingHold_ID"=p_hold_id;

  return to_jsonb(v_meeting);
end;
$$;

revoke all on function public.multideck_calendar_finalise_verified_hold(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.multideck_calendar_finalise_verified_hold(uuid,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- Dexter: booking links now describe their kind and hosts
-- ---------------------------------------------------------------------------
create or replace function public.multideck_dexter_domain_booking_links(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row.data order by row.title), '[]'::jsonb)
  from (
    select link."CALBookingLink_Title" as title,
      jsonb_build_object(
        'recordId', link."CALBookingLink_ID", 'recordType', 'booking_link',
        'title', link."CALBookingLink_Title", 'durationMinutes', link."CALBookingLink_DurationMinutes",
        'provider', link."CALBookingLink_ProviderCode", 'status', link."CALBookingLink_StatusCode",
        'kind', link."CALBookingLink_KindCode",
        'hosts', coalesce((
          select jsonb_agg(concat_ws(' ', profile."User_Firstname", profile."User_Lastname") order by host."CALBookingLinkHost_SortOrder")
          from public."CAL_BookingLinkHosts" host
          join public."cmp_Users" profile on profile."User_ID"=host."CALBookingLinkHost_UserID"
          where host."CALBookingLinkHost_BookingLinkID"=link."CALBookingLink_ID"
        ), '[]'::jsonb),
        'requiredQuestions', coalesce((
          select jsonb_agg(question->>'label')
          from jsonb_array_elements(link."CALBookingLink_QuestionsJSON") question
          where (question->>'required')::boolean is true
        ), '[]'::jsonb),
        'path', '/book/' || link."CALBookingLink_OrganiserSlug" || '/' || link."CALBookingLink_Slug"
      ) as data
    from public."CAL_BookingLinks" link
    where link."CALBookingLink_CompanyID" = p_company_id
      and link."CALBookingLink_OwnerUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and (nullif(btrim(coalesce(p_search,'')),'') is null
        or link."CALBookingLink_Title" ilike '%' || btrim(p_search) || '%')
    order by link."CALBookingLink_Title"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;

-- Shared host resolver for the Dexter booking-link actions: emails of
-- colleagues in the same company become host rows.
create or replace function public._multideck_calendar_apply_booking_hosts(p_company_id uuid, p_owner_id uuid, p_link_id uuid, p_kind text, p_host_emails jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_email text; v_user uuid; v_order integer := 0; v_count integer;
begin
  if p_kind not in ('one_on_one','round_robin','collective') then
    raise exception 'Choose a one-to-one, round robin or collective booking link.' using errcode='22023';
  end if;
  delete from public."CAL_BookingLinkHosts" where "CALBookingLinkHost_BookingLinkID"=p_link_id;
  if p_kind = 'one_on_one' then return; end if;
  for v_email in select lower(btrim(value#>>'{}')) from jsonb_array_elements(coalesce(p_host_emails,'[]'::jsonb)) loop
    select "User_ID" into v_user from public."cmp_Users" where "Company_ID"=p_company_id and lower("User_Email")=v_email and "User_AccessStatus"='active' limit 1;
    if v_user is null then
      raise exception 'Host % is not an active member of this workspace.', v_email using errcode='22023';
    end if;
    insert into public."CAL_BookingLinkHosts" ("CALBookingLinkHost_BookingLinkID","CALBookingLinkHost_UserID","CALBookingLinkHost_SortOrder")
    values (p_link_id, v_user, v_order) on conflict do nothing;
    v_order := v_order + 1;
  end loop;
  insert into public."CAL_BookingLinkHosts" ("CALBookingLinkHost_BookingLinkID","CALBookingLinkHost_UserID","CALBookingLinkHost_SortOrder")
  values (p_link_id, p_owner_id, -1) on conflict do nothing;
  select count(*) into v_count from public."CAL_BookingLinkHosts" where "CALBookingLinkHost_BookingLinkID"=p_link_id;
  if v_count < 2 then
    raise exception 'Round robin and collective booking links need at least two hosts.' using errcode='22023';
  end if;
end;
$$;

create or replace function public.multideck_dexter_action_create_booking_link(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider text := coalesce(nullif(p_arguments->>'provider',''),'multideck');
  v_duration integer := coalesce((p_arguments->>'duration_minutes')::integer,30);
  v_title text := nullif(btrim(p_arguments->>'title'),'');
  v_kind text := coalesce(nullif(p_arguments->>'kind',''),'one_on_one');
  v_name text; v_organiser_slug text; v_slug text; v_link public."CAL_BookingLinks";
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.BookingLinks.Manage') then raise exception 'You do not have permission to manage booking links.' using errcode='42501'; end if;
  if v_title is null then raise exception 'Booking link title is required.' using errcode='22023'; end if;
  if v_duration < 15 or v_duration > 240 or mod(v_duration,5) <> 0 then raise exception 'Choose a duration between 15 minutes and 4 hours.' using errcode='22023'; end if;
  if v_provider not in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person') then raise exception 'Choose a supported meeting type.' using errcode='22023'; end if;
  if v_provider in ('google_meet','microsoft_teams','zoom') and not exists (
    select 1 from public."CAL_ProviderConnections" connection where connection."CALConnection_CompanyID"=p_company_id and connection."CALConnection_UserID"=p_user_id
      and connection."CALConnection_ProviderCode"=case when v_provider='google_meet' then 'google' when v_provider='microsoft_teams' then 'microsoft' else 'zoom' end and connection."CALConnection_StatusCode"='connected'
  ) then raise exception 'Connect the selected meeting provider before creating this booking link.' using errcode='22023'; end if;
  select coalesce(nullif(btrim(concat_ws(' ',"User_Firstname","User_Lastname")),''),split_part("User_Email",'@',1)) into v_name from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id;
  v_organiser_slug := trim(both '-' from regexp_replace(lower(coalesce(v_name,'meet')),'[^a-z0-9]+','-','g'));
  v_slug := trim(both '-' from regexp_replace(lower(v_title),'[^a-z0-9]+','-','g'));
  if v_slug='' then v_slug:='meeting'; end if;
  if exists (select 1 from public."CAL_BookingLinks" where "CALBookingLink_OrganiserSlug"=v_organiser_slug and "CALBookingLink_Slug"=v_slug) then v_slug:=left(v_slug,50)||'-'||left(replace(gen_random_uuid()::text,'-',''),8); end if;
  insert into public."CAL_BookingLinks" (
    "CALBookingLink_CompanyID","CALBookingLink_OwnerUserID","CALBookingLink_OrganiserSlug","CALBookingLink_Slug","CALBookingLink_Title","CALBookingLink_Description",
    "CALBookingLink_DurationMinutes","CALBookingLink_ProviderCode","CALBookingLink_Location","CALBookingLink_StatusCode","CALBookingLink_KindCode","CALBookingLink_QuestionsJSON"
  ) values (p_company_id,p_user_id,v_organiser_slug,v_slug,left(v_title,180),nullif(left(btrim(p_arguments->>'description'),5000),''),v_duration,v_provider,nullif(left(btrim(p_arguments->>'location'),500),''),'active',v_kind,
    '[{"id":"company","label":"Company","type":"short_text","required":false,"builtIn":true},{"id":"phone","label":"Phone","type":"phone","required":false,"builtIn":true},{"id":"notes","label":"What would you like to discuss?","type":"long_text","required":false,"builtIn":true}]'::jsonb
  ) returning * into v_link;
  perform public._multideck_calendar_apply_booking_hosts(p_company_id, p_user_id, v_link."CALBookingLink_ID", v_kind, p_arguments->'host_emails');
  return jsonb_build_object('id',v_link."CALBookingLink_ID",'title',v_link."CALBookingLink_Title",'kind',v_link."CALBookingLink_KindCode",'status',v_link."CALBookingLink_StatusCode",'path','/book/'||v_link."CALBookingLink_OrganiserSlug"||'/'||v_link."CALBookingLink_Slug");
end;
$$;

create or replace function public.multideck_dexter_action_edit_booking_link(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := (p_arguments->>'target_id')::uuid; v_link public."CAL_BookingLinks"; v_duration integer; v_provider text; v_kind text;
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.BookingLinks.Manage') then raise exception 'You do not have permission to manage booking links.' using errcode='42501'; end if;
  select * into v_link from public."CAL_BookingLinks" where "CALBookingLink_ID"=v_id and "CALBookingLink_CompanyID"=p_company_id and "CALBookingLink_OwnerUserID"=p_user_id for update;
  if not found then raise exception 'That booking link is not available.' using errcode='P0002'; end if;
  v_duration := coalesce((p_arguments->>'duration_minutes')::integer,v_link."CALBookingLink_DurationMinutes");
  v_provider := coalesce(nullif(p_arguments->>'provider',''),v_link."CALBookingLink_ProviderCode");
  v_kind := coalesce(nullif(p_arguments->>'kind',''),v_link."CALBookingLink_KindCode");
  if v_duration < 15 or v_duration > 240 or mod(v_duration,5) <> 0 then raise exception 'Choose a duration between 15 minutes and 4 hours.' using errcode='22023'; end if;
  if v_provider not in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person') then raise exception 'Choose a supported meeting type.' using errcode='22023'; end if;
  if v_provider in ('google_meet','microsoft_teams','zoom') and not exists (
    select 1 from public."CAL_ProviderConnections" connection where connection."CALConnection_CompanyID"=p_company_id and connection."CALConnection_UserID"=p_user_id
      and connection."CALConnection_ProviderCode"=case when v_provider='google_meet' then 'google' when v_provider='microsoft_teams' then 'microsoft' else 'zoom' end and connection."CALConnection_StatusCode"='connected'
  ) then raise exception 'Connect the selected meeting provider before changing this booking link.' using errcode='22023'; end if;
  update public."CAL_BookingLinks" set
    "CALBookingLink_Title"=case when p_arguments ? 'title' and nullif(btrim(p_arguments->>'title'),'') is not null then left(btrim(p_arguments->>'title'),180) else "CALBookingLink_Title" end,
    "CALBookingLink_Description"=case when p_arguments ? 'description' then nullif(left(btrim(p_arguments->>'description'),5000),'') else "CALBookingLink_Description" end,
    "CALBookingLink_DurationMinutes"=v_duration,"CALBookingLink_ProviderCode"=v_provider,"CALBookingLink_KindCode"=v_kind,
    "CALBookingLink_Location"=case when p_arguments ? 'location' then nullif(left(btrim(p_arguments->>'location'),500),'') else "CALBookingLink_Location" end,
    "CALBookingLink_UpdatedAt"=now()
  where "CALBookingLink_ID"=v_id returning * into v_link;
  if btrim(v_link."CALBookingLink_Title")='' then raise exception 'Booking link title is required.' using errcode='22023'; end if;
  if p_arguments ? 'kind' or p_arguments ? 'host_emails' then
    perform public._multideck_calendar_apply_booking_hosts(p_company_id, p_user_id, v_id, v_kind,
      case when p_arguments ? 'host_emails' and jsonb_typeof(p_arguments->'host_emails')='array' then p_arguments->'host_emails'
        else (select coalesce(jsonb_agg(profile."User_Email" order by host."CALBookingLinkHost_SortOrder"),'[]'::jsonb) from public."CAL_BookingLinkHosts" host join public."cmp_Users" profile on profile."User_ID"=host."CALBookingLinkHost_UserID" where host."CALBookingLinkHost_BookingLinkID"=v_id and host."CALBookingLinkHost_UserID"<>p_user_id) end);
  end if;
  return jsonb_build_object('id',v_id,'title',v_link."CALBookingLink_Title",'kind',v_link."CALBookingLink_KindCode",'durationMinutes',v_link."CALBookingLink_DurationMinutes",'provider',v_link."CALBookingLink_ProviderCode",'status',v_link."CALBookingLink_StatusCode");
end;
$$;

-- ---------------------------------------------------------------------------
-- Dexter: mirrored Google / Microsoft events
-- ---------------------------------------------------------------------------
create or replace function public.multideck_dexter_domain_external_events(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row.data order by row.start_at), '[]'::jsonb)
  from (
    select event."CALProviderEvent_StartAt" as start_at,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', event."CALProviderEvent_ID", 'recordType', 'external_event',
        'title', case when event."CALProviderEvent_IsPrivate" then 'Busy' else coalesce(event."CALProviderEvent_Title",'Busy') end,
        'startAt', event."CALProviderEvent_StartAt", 'endAt', event."CALProviderEvent_EndAt",
        'source', connection."CALConnection_ProviderCode", 'private', event."CALProviderEvent_IsPrivate",
        'canEdit', connection."CALConnection_StatusCode"='connected',
        'route', '/calendar?date=' || to_char(event."CALProviderEvent_StartAt" at time zone 'UTC','YYYY-MM-DD')
      )) as data
    from public."CAL_ProviderEvents" event
    join public."CAL_ProviderConnections" connection on connection."CALConnection_ID"=event."CALProviderEvent_ConnectionID"
    where event."CALProviderEvent_CompanyID" = p_company_id
      and event."CALProviderEvent_OwnerUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and event."CALProviderEvent_MeetingID" is null
      and event."CALProviderEvent_IsCancelled" = false
      and event."CALProviderEvent_EndAt" > now() - interval '1 day'
      and (nullif(btrim(coalesce(p_search,'')),'') is null
        or (event."CALProviderEvent_IsPrivate" = false and event."CALProviderEvent_Title" ilike '%' || btrim(p_search) || '%'))
    order by event."CALProviderEvent_StartAt"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;

create or replace function public._multideck_calendar_queue_external_event_change(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_cancel boolean, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_event public."CAL_ProviderEvents"; v_connection public."CAL_ProviderConnections"; v_key text;
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageOwn') then
    raise exception 'You do not have permission to change calendar events.' using errcode='42501';
  end if;
  select * into v_event from public."CAL_ProviderEvents"
  where "CALProviderEvent_ID"=p_event_id and "CALProviderEvent_CompanyID"=p_company_id and "CALProviderEvent_OwnerUserID"=p_user_id for update;
  if not found then raise exception 'That calendar event is not available to change.' using errcode='42501'; end if;
  if v_event."CALProviderEvent_MeetingID" is not null then raise exception 'That event is a Multideck meeting. Use the meeting actions instead.' using errcode='22023'; end if;
  if v_event."CALProviderEvent_IsCancelled" then raise exception 'That event was already removed from the provider.' using errcode='22023'; end if;
  select * into v_connection from public."CAL_ProviderConnections" where "CALConnection_ID"=v_event."CALProviderEvent_ConnectionID";
  if not found or v_connection."CALConnection_StatusCode"<>'connected' or v_connection."CALConnection_ProviderCode" not in ('google','microsoft') then
    raise exception 'Reconnect the calendar this event came from before changing it.' using errcode='22023';
  end if;
  if not p_cancel then
    if p_change->>'title' is not null and v_event."CALProviderEvent_IsPrivate" then
      raise exception 'Private provider events keep their title. You can still move or delete them.' using errcode='22023';
    end if;
    if p_change->>'title' is null and p_change->>'startAt' is null then
      raise exception 'Nothing to change on this event.' using errcode='22023';
    end if;
    if p_change->>'startAt' is not null and ((p_change->>'endAt')::timestamptz <= (p_change->>'startAt')::timestamptz) then
      raise exception 'The event must finish after it starts.' using errcode='22023';
    end if;
  end if;
  v_key := 'external-event:'||p_event_id||':'||case when p_cancel then 'cancel' else 'update' end||':'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public."CAL_Deliveries" ("CALDelivery_CompanyID","CALDelivery_KindCode","CALDelivery_IdempotencyKey","CALDelivery_RenderedJSON")
  values (p_company_id, case when p_cancel then 'external_event_cancel' else 'external_event_update' end, v_key,
    jsonb_strip_nulls(jsonb_build_object('providerEventId',p_event_id,'requestedBy',p_user_id,'title',p_change->>'title','startAt',p_change->>'startAt','endAt',p_change->>'endAt','timeZone',p_change->>'timeZone')));
  return jsonb_build_object('id',p_event_id,'source',v_connection."CALConnection_ProviderCode",'status','sync_pending',
    'title',case when v_event."CALProviderEvent_IsPrivate" then 'Busy' else v_event."CALProviderEvent_Title" end,
    'currentStartAt',v_event."CALProviderEvent_StartAt",'currentEndAt',v_event."CALProviderEvent_EndAt",
    'requestedStartAt',p_change->>'startAt','requestedEndAt',p_change->>'endAt');
end;
$$;

create or replace function public.multideck_dexter_action_update_external_event(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public._multideck_calendar_queue_external_event_change(p_company_id, p_user_id, (p_arguments->>'target_id')::uuid, false,
    jsonb_build_object('title',nullif(btrim(p_arguments->>'title'),''),'startAt',nullif(p_arguments->>'start_at',''),'endAt',nullif(p_arguments->>'end_at',''),'timeZone',nullif(p_arguments->>'time_zone','')));
end;
$$;

create or replace function public.multideck_dexter_action_delete_external_event(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public._multideck_calendar_queue_external_event_change(p_company_id, p_user_id, (p_arguments->>'target_id')::uuid, true, '{}'::jsonb);
end;
$$;

revoke all on function public._multideck_calendar_apply_booking_hosts(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public._multideck_calendar_queue_external_event_change(uuid,uuid,uuid,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_external_events(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_update_external_event(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_delete_external_event(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_booking_links(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_create_booking_link(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_edit_booking_link(uuid,uuid,jsonb) from public, anon, authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt",
  "AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy"
) values
  ('booking_links','Booking links','The signed-in operator''s reusable booking links: kind (one-to-one, round robin or collective), hosts, required public-form questions and publication state.','multideck_dexter_domain_booking_links',10,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'["calendar","public_link"]'::jsonb,'owner'),
  ('external_events','Synced calendar events','Upcoming Google and Microsoft calendar events mirrored into the signed-in operator''s Multideck calendar, with whether each can be changed from Multideck.','multideck_dexter_domain_external_events',11,true,now(),'["Calendar.Read"]'::jsonb,'["calendar"]'::jsonb,'owner')
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name"=excluded."AIDexterDomain_Name","AIDexterDomain_Description"=excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder"=excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now(),
  "AIDexterDomain_RequiredPermissionsJSON"=excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON"=excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy"=excluded."AIDexterDomain_ScopeStrategy";

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"
) values
  ('create_booking_link','booking_links','Create booking link','Create a booking link (one-to-one, round robin or collective) with inherited availability after approval. Hosts are colleagues'' email addresses.','multideck_dexter_action_create_booking_link','{"type":"object","properties":{"title":{"type":"string"},"description":{"type":["string","null"]},"duration_minutes":{"type":"integer","minimum":15,"maximum":240},"provider":{"type":"string","enum":["multideck","google_meet","microsoft_teams","zoom","phone","in_person"]},"location":{"type":["string","null"]},"kind":{"type":"string","enum":["one_on_one","round_robin","collective"]},"host_emails":{"type":"array","items":{"type":"string"}},"reason":{"type":"string"}},"required":["title","description","duration_minutes","provider","location","kind","host_emails","reason"],"additionalProperties":false}'::jsonb,16,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'booking_link_create','owner',true),
  ('edit_booking_link','booking_links','Edit booking link','Edit the core fields, kind or hosts on one booking link after approval.','multideck_dexter_action_edit_booking_link','{"type":"object","properties":{"target_id":{"type":"string"},"title":{"type":["string","null"]},"description":{"type":["string","null"]},"duration_minutes":{"type":["integer","null"],"minimum":15,"maximum":240},"provider":{"type":["string","null"],"enum":["multideck","google_meet","microsoft_teams","zoom","phone","in_person",null]},"location":{"type":["string","null"]},"kind":{"type":["string","null"],"enum":["one_on_one","round_robin","collective",null]},"host_emails":{"type":["array","null"],"items":{"type":"string"}},"reason":{"type":"string"}},"required":["target_id","title","description","duration_minutes","provider","location","kind","host_emails","reason"],"additionalProperties":false}'::jsonb,17,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'booking_link_edit','owner',true),
  ('update_external_event','external_events','Move or rename synced event','Move or rename one Google or Microsoft calendar event. The change is written back to the provider after approval.','multideck_dexter_action_update_external_event','{"type":"object","properties":{"target_id":{"type":"string"},"title":{"type":["string","null"]},"start_at":{"type":["string","null"]},"end_at":{"type":["string","null"]},"time_zone":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","title","start_at","end_at","time_zone","reason"],"additionalProperties":false}'::jsonb,19,true,now(),'["Calendar.ManageOwn"]'::jsonb,'external_event_update','owner',true),
  ('delete_external_event','external_events','Delete synced event','Delete one Google or Microsoft calendar event from the provider after approval.','multideck_dexter_action_delete_external_event','{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,20,true,now(),'["Calendar.ManageOwn"]'::jsonb,'external_event_delete','owner',true)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode","AIDexterAction_Name"=excluded."AIDexterAction_Name",
  "AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_SortOrder"=excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now(),
  "AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily"=excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy"=excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect"=true;

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Meeting confirmations, changes, attendee responses, provider sync failures, and synced Google or Microsoft events that move or disappear.',
  "AIDexterWatchCapability_FieldsJSON"='["status","startAt","endAt","provider","response","syncError","changeRequest","externalEvent"]'::jsonb,
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='calendar';

-- ---------------------------------------------------------------------------
-- Watching for you: mirrored provider events raise signals when they move or
-- are cancelled. Pure sync noise (revision only) does not.
-- ---------------------------------------------------------------------------
create or replace function public._multideck_calendar_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_owner uuid; v_source uuid; v_capability text; v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'CAL_Meetings' then
    v_company := new."CALMeeting_CompanyID"; v_owner := new."CALMeeting_OrganiserUserID"; v_source := new."CALMeeting_ID"; v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('status',old."CALMeeting_StatusCode",'startAt',old."CALMeeting_StartAt",'endAt',old."CALMeeting_EndAt",'syncError',old."CALMeeting_LastSyncError"); end if;
    v_new := jsonb_build_object('status',new."CALMeeting_StatusCode",'startAt',new."CALMeeting_StartAt",'endAt',new."CALMeeting_EndAt",'syncError',new."CALMeeting_LastSyncError");
  elsif tg_table_name = 'CAL_BookingLinks' then
    v_company := new."CALBookingLink_CompanyID"; v_owner := new."CALBookingLink_OwnerUserID"; v_source := new."CALBookingLink_ID"; v_capability := 'booking_links';
    if tg_op='UPDATE' then v_old := jsonb_build_object('status',old."CALBookingLink_StatusCode",'kind',old."CALBookingLink_KindCode"); end if;
    v_new := jsonb_build_object('status',new."CALBookingLink_StatusCode",'kind',new."CALBookingLink_KindCode");
  elsif tg_table_name = 'CAL_MeetingParticipants' then
    select meeting."CALMeeting_CompanyID",meeting."CALMeeting_OrganiserUserID",meeting."CALMeeting_ID" into v_company,v_owner,v_source
    from public."CAL_Meetings" meeting where meeting."CALMeeting_ID"=new."CALParticipant_MeetingID";
    v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('response',old."CALParticipant_ResponseCode"); end if;
    v_new := jsonb_build_object('response',new."CALParticipant_ResponseCode",'participantId',new."CALParticipant_ID");
  elsif tg_table_name = 'CAL_ChangeRequests' then
    select meeting."CALMeeting_CompanyID",meeting."CALMeeting_OrganiserUserID",meeting."CALMeeting_ID" into v_company,v_owner,v_source
    from public."CAL_Meetings" meeting where meeting."CALMeeting_ID"=new."CALChangeRequest_MeetingID";
    v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('changeRequest',old."CALChangeRequest_StatusCode"); end if;
    v_new := jsonb_build_object('changeRequest',new."CALChangeRequest_StatusCode",'requestId',new."CALChangeRequest_ID");
  elsif tg_table_name = 'CAL_ProviderEvents' then
    if new."CALProviderEvent_MeetingID" is not null then return new; end if;
    if tg_op='UPDATE' and old."CALProviderEvent_StartAt"=new."CALProviderEvent_StartAt" and old."CALProviderEvent_EndAt"=new."CALProviderEvent_EndAt"
      and old."CALProviderEvent_IsCancelled"=new."CALProviderEvent_IsCancelled" and coalesce(old."CALProviderEvent_Title",'')=coalesce(new."CALProviderEvent_Title",'') then
      return new;
    end if;
    v_company := new."CALProviderEvent_CompanyID"; v_owner := new."CALProviderEvent_OwnerUserID"; v_source := new."CALProviderEvent_ID"; v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('externalEvent',case when old."CALProviderEvent_IsCancelled" then 'cancelled' else 'active' end,'startAt',old."CALProviderEvent_StartAt",'endAt',old."CALProviderEvent_EndAt"); end if;
    v_new := jsonb_build_object('externalEvent',case when new."CALProviderEvent_IsCancelled" then 'cancelled' else 'active' end,'startAt',new."CALProviderEvent_StartAt",'endAt',new."CALProviderEvent_EndAt",
      'title',case when new."CALProviderEvent_IsPrivate" then 'Busy' else coalesce(new."CALProviderEvent_Title",'Busy') end);
  else return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
  ) select v_company,v_capability,tg_table_name,v_source,v_old,v_new
  where exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_OwnerUserID"=v_owner
      and watch."AIDexterWatch_CapabilityCode"=v_capability and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_source)
  );
  return new;
end;
$$;

drop trigger if exists "CAL_ProviderEvents_WatchSignal" on public."CAL_ProviderEvents";
create trigger "CAL_ProviderEvents_WatchSignal" after insert or update on public."CAL_ProviderEvents"
for each row execute function public._multideck_calendar_watch_signal();
revoke all on function public._multideck_calendar_watch_signal() from public, anon, authenticated;

commit;
