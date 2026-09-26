-- Company Events: email the invitation when an organiser publishes.
--
-- Forward-only. Invitations created by earlier publishes keep in_app_only and
-- are never replayed; drafts stay quiet because the publish trigger still only
-- acts on draft -> published. Delivery goes through send-notification-email,
-- which re-checks the recipient's email preference, the invitation boundary
-- (private.company_event_visible + private.company_event_invited) and the
-- notification's email receipt before anything is sent.
--
-- Some tenants have no workspace-wide notification email dispatcher. This
-- migration does not install one: the trigger below posts company event
-- invitations only, and stands down wherever the established
-- "Comm_Notifications_DispatchEmail" trigger already posts every notification.
-- Without both vault secrets it queues nothing, and a queueing failure never
-- blocks the publish.
--
-- Dexter: sending invitation emails is a side effect of publishing, which
-- Dexter does not perform. The self-addressed test send is an explicit Events tool,
-- not a Dexter action; Dexter keeps answering that publishing happens in Events.

begin;

create or replace function private.company_event_publish_notifications()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.status <> 'draft' or new.status <> 'published' then
    return new;
  end if;

  insert into public."Comm_Notifications" (
    "CommNotif_UserID",
    "CommNotif_Title",
    "CommNotif_Body",
    "CommNotif_TargetTable",
    "CommNotif_TargetID",
    "CommNotif_MetadataJSON",
    "CommNotif_CreatedBy"
  )
  select
    colleague."User_ID",
    'You''re invited: ' || new.title,
    'Open Events to see the details and RSVP.',
    'company_events',
    new.id,
    jsonb_build_object(
      'event_type', 'company_event_invitation',
      'action_url', '/events/' || new.id,
      'action_label', 'View event',
      'eyebrow', 'Company event',
      'published_at', new.published_at
    ),
    new.updated_by
  from public."cmp_Users" colleague
  where colleague."Company_ID" = new.company_id
    and colleague."Auth_User_ID" is not null
    and coalesce(colleague."User_AccessStatus", 'active') = 'active'
    and colleague."User_ID" <> new.updated_by
    and private.company_event_invited(new, colleague."User_ID")
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.company_event_publish_notifications() from public, anon, authenticated;

-- send-notification-email authenticates database posts with this secret. Add
-- the reader only where the earlier dispatcher migration never ran.
do $secret$
begin
  if to_regprocedure('public."Comm_GetNotificationWebhookSecret"()') is not null
    or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute $fn$
    create function public."Comm_GetNotificationWebhookSecret"()
    returns text
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'multideck_notification_webhook_secret'
      limit 1;
    $body$
  $fn$;
  revoke all on function public."Comm_GetNotificationWebhookSecret"() from public, anon, authenticated;
  grant execute on function public."Comm_GetNotificationWebhookSecret"() to service_role;
end;
$secret$;

create function private.company_event_invitation_email_dispatch()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_secret text;
begin
  if exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public."Comm_Notifications"'::regclass
      and t.tgname = 'Comm_Notifications_DispatchEmail'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) then
    return new;
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return new;
  end if;

  select decrypted_secret into v_endpoint
  from vault.decrypted_secrets where name = 'multideck_notification_email_endpoint' limit 1;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'multideck_notification_webhook_secret' limit 1;
  if v_endpoint is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('action', 'dispatch', 'notificationId', new."CommNotif_ID"),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-multideck-notification-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'Company event invitation email was not queued (%)', sqlstate;
  return new;
end;
$$;

revoke all on function private.company_event_invitation_email_dispatch() from public, anon, authenticated;

drop trigger if exists company_event_invitation_email on public."Comm_Notifications";
create trigger company_event_invitation_email
after insert on public."Comm_Notifications"
for each row
when (
  new."CommNotif_TargetTable" = 'company_events'
  and new."CommNotif_MetadataJSON" ->> 'event_type' = 'company_event_invitation'
  and coalesce((new."CommNotif_MetadataJSON" ->> 'in_app_only')::boolean, false) = false
)
execute function private.company_event_invitation_email_dispatch();

-- What the invitation email may show, decided by the same visibility and
-- invitation functions as every other Events read. 'invitation' requires a
-- published event the recipient is still invited to; 'test' renders, to the
-- caller's own mailbox only, a draft or published event they organise or a
-- published event they are invited to.
create function public.company_event_invitation_email_context(p_event_id uuid, p_user_id uuid, p_purpose text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  e public.company_events;
begin
  if p_purpose is null or p_purpose not in ('invitation', 'test') then
    raise exception 'Unsupported invitation email purpose.' using errcode = '22023';
  end if;
  select * into e from public.company_events where id = p_event_id;
  if e.id is null or not private.company_event_visible(e, p_user_id) then
    return null;
  end if;
  if p_purpose = 'invitation' and (e.status <> 'published' or not private.company_event_invited(e, p_user_id)) then
    return null;
  end if;
  if p_purpose = 'test' and not (
    (e.status in ('draft', 'published') and private.company_events_can_manage(p_user_id))
    or (e.status = 'published' and private.company_event_invited(e, p_user_id))
  ) then
    return null;
  end if;

  return jsonb_build_object(
    'id', e.id,
    'companyId', e.company_id,
    'companyName', (select c."Company_Name" from public."cmp_Company" c where c."Company_ID" = e.company_id),
    'title', e.title,
    'startsAt', e.starts_at,
    'endsAt', e.ends_at,
    'timezone', e.timezone,
    'location', e.location,
    'details', e.details,
    'imagePath', e.image_path,
    'imageGenerationStatus', e.image_generation_status,
    'status', e.status,
    'editVersion', e.edit_version,
    'formFieldCount', jsonb_array_length(e.form_schema),
    'hostName', (
      select coalesce(nullif(btrim(concat_ws(' ', u."User_Firstname", u."User_Lastname")), ''), u."User_Email")
      from public."cmp_Users" u where u."User_ID" = e.created_by
    )
  );
end;
$$;

revoke all on function public.company_event_invitation_email_context(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.company_event_invitation_email_context(uuid, uuid, text) to service_role;

commit;
