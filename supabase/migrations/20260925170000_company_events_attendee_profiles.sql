-- Company Events: show who answered Yes, Maybe and No with their name and
-- profile photo. Photos are read through the existing profile-photos policy,
-- which already limits them to colleagues in the same company.

begin;

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
    -- Everyone who has answered, with their answer and profile photo, so the
    -- event can show Going, Maybe and Not going as people rather than numbers.
    -- Answers to RSVP questions stay organiser-only (responses below).
    v_result := v_result || jsonb_build_object('attendees', coalesce((
      select jsonb_agg(jsonb_build_object('userId',u."User_ID",
        'name',coalesce(nullif(btrim(concat_ws(' ',u."User_Firstname",u."User_Lastname")),''),u."User_Email"),
        'status',r.status,
        'photoPath',case when u."User_ProfilePhotoBucket" = 'profile-photos' then u."User_ProfilePhotoPath" end)
        order by case r.status when 'going' then 0 when 'maybe' then 1 else 2 end, r.updated_at)
      from public.company_event_rsvps r join public."cmp_Users" u on u."User_ID" = r.user_id
      where r.event_id = p_event.id and coalesce(u."User_AccessStatus",'active') = 'active'
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

revoke all on function private.company_event_json(public.company_events,uuid,boolean) from public, anon, authenticated;

commit;
