-- Company Events RSVPs gain a third answer: Yes (going), Maybe, No.
--
-- Only "going" requires valid RSVP form answers and counts towards the going
-- total that watches follow. "maybe" and "not going" keep any earlier answers
-- untouched, exactly as "not going" already did.

begin;

alter table public.company_event_rsvps drop constraint if exists company_event_rsvps_status_check;
alter table public.company_event_rsvps add constraint company_event_rsvps_status_check
  check (status in ('going','maybe','not_going'));

create or replace function private.company_event_rsvp_for_actor(p_company_id uuid, p_user_id uuid, p_event_id uuid, p_status text, p_answers jsonb, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare e public.company_events; mine public.company_event_rsvps; v_answers jsonb;
begin
  select * into e from public.company_events where id = p_event_id and company_id = p_company_id;
  if not found or not private.company_event_visible(e, p_user_id) then raise exception 'This event is not available.' using errcode = '42501'; end if;
  if p_status not in ('going','maybe','not_going') then raise exception 'Choose yes, maybe or no.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || p_user_id::text, 2510));
  select * into mine from public.company_event_rsvps where event_id = e.id and user_id = p_user_id for update;
  -- A retried request returns the saved state without writing twice.
  if mine.event_id is not null and p_request_id is not null and mine.last_request_id = p_request_id then
    return private.company_event_json(e, p_user_id, true);
  end if;
  if e.status = 'cancelled' then raise exception 'This event has been cancelled.' using errcode = '55000'; end if;
  if e.status <> 'published' then raise exception 'This event is not open for RSVPs yet.' using errcode = '55000'; end if;
  if coalesce(e.ends_at, e.starts_at) < now() then raise exception 'This event has already taken place.' using errcode = '55000'; end if;
  if p_status = 'going' then
    v_answers := private.company_event_clean_answers(e.form_schema, p_answers);
  else
    v_answers := coalesce(mine.answers, '{}'::jsonb);
  end if;
  insert into public.company_event_rsvps (event_id, user_id, company_id, status, answers, form_snapshot, form_version, last_request_id)
  values (e.id, p_user_id, p_company_id, p_status, v_answers, e.form_schema, e.form_version, p_request_id)
  on conflict (event_id, user_id) do update set status = excluded.status,
    answers = excluded.answers,
    form_snapshot = case when excluded.status = 'going' then excluded.form_snapshot else company_event_rsvps.form_snapshot end,
    form_version = case when excluded.status = 'going' then excluded.form_version else company_event_rsvps.form_version end,
    last_request_id = excluded.last_request_id, updated_at = clock_timestamp();
  insert into public.company_event_audit (company_id, event_id, actor_id, kind, details)
  values (p_company_id, e.id, p_user_id, 'rsvp_' || p_status, jsonb_build_object('formVersion', e.form_version));
  return private.company_event_json(e, p_user_id, true);
end $$;

create or replace function private.company_event_json(p_event public.company_events, p_viewer uuid, p_detail boolean)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  v_maybe integer;
  v_manager boolean := private.company_events_can_manage(p_viewer);
  v_mine public.company_event_rsvps;
  v_going integer;
  v_result jsonb;
begin
  select * into v_mine from public.company_event_rsvps r where r.event_id = p_event.id and r.user_id = p_viewer;
  select count(*) into v_going from public.company_event_rsvps r
    join public."cmp_Users" u on u."User_ID" = r.user_id and coalesce(u."User_AccessStatus",'active') = 'active'
    where r.event_id = p_event.id and r.status = 'going';
  select count(*) into v_maybe from public.company_event_rsvps r
    join public."cmp_Users" u on u."User_ID" = r.user_id and coalesce(u."User_AccessStatus",'active') = 'active'
    where r.event_id = p_event.id and r.status = 'maybe';
  v_result := jsonb_build_object(
    'id',p_event.id,'title',p_event.title,'startsAt',p_event.starts_at,'endsAt',p_event.ends_at,
    'timezone',p_event.timezone,'location',p_event.location,'details',p_event.details,
    'imagePath',p_event.image_path,'status',p_event.status,'cancellationNote',p_event.cancellation_note,
    'form',p_event.form_schema,'formVersion',p_event.form_version,'editVersion',p_event.edit_version,
    'publishedAt',p_event.published_at,'cancelledAt',p_event.cancelled_at,'updatedAt',p_event.updated_at,
    'goingCount',v_going,'maybeCount',v_maybe,'canManage',v_manager,
    'myRsvp',case when v_mine.event_id is null then null else jsonb_build_object(
      'status',v_mine.status,'answers',v_mine.answers,'formVersion',v_mine.form_version,
      'needsUpdate',private.company_event_rsvp_needs_update(p_event.form_schema, v_mine),
      'updatedAt',v_mine.updated_at) end
  );
  if p_detail then
    v_result := v_result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('userId',u."User_ID",
        'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email")) order by r.updated_at)
      from public.company_event_rsvps r join public."cmp_Users" u on u."User_ID" = r.user_id
      where r.event_id = p_event.id and r.status = 'going' and coalesce(u."User_AccessStatus",'active') = 'active'
    ),'[]'::jsonb));
    if v_manager then
      v_result := v_result || jsonb_build_object('responses', coalesce((
        select jsonb_agg(jsonb_build_object('userId',u."User_ID",
          'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email"),
          'status',r.status,'answers',r.answers,'form',r.form_snapshot,'formVersion',r.form_version,
          'needsUpdate',private.company_event_rsvp_needs_update(p_event.form_schema, r),'updatedAt',r.updated_at) order by r.updated_at desc)
        from public.company_event_rsvps r join public."cmp_Users" u on u."User_ID" = r.user_id
        where r.event_id = p_event.id
      ),'[]'::jsonb));
    end if;
  end if;
  return v_result;
end $$;

update public."sys_AIDexterActions" set
  "AIDexterAction_Description" = 'Set the signed-in colleague''s own RSVP (going, maybe or not going) to one published event. Going to an event with required RSVP questions must be answered in Events.',
  "AIDexterAction_ParametersJSON" = '{"type":"object","properties":{"target_id":{"type":"string"},"status":{"type":"string","enum":["going","maybe","not_going"]},"reason":{"type":"string"}},"required":["target_id","status","reason"],"additionalProperties":false}'::jsonb,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'rsvp_company_event';

revoke all on function private.company_event_rsvp_for_actor(uuid,uuid,uuid,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function private.company_event_json(public.company_events,uuid,boolean) from public, anon, authenticated;

commit;
