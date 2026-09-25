-- Company Events: notify each invited colleague when an organiser publishes.
--
-- These are personal, in-app notifications. Publishing never sends email: the
-- notification metadata is checked both by the database dispatcher and the
-- Edge Function. The partial unique index makes a retried publish idempotent.

begin;

create unique index if not exists "UX_Comm_Notifications_company_event_invitation"
  on public."Comm_Notifications" ("CommNotif_UserID", "CommNotif_TargetID")
  where "CommNotif_TargetTable" = 'company_events'
    and "CommNotif_MetadataJSON" ->> 'event_type' = 'company_event_invitation';

create function private.company_event_publish_notifications()
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
      'in_app_only', true,
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

drop trigger if exists company_events_publish_notifications on public.company_events;
create trigger company_events_publish_notifications
after update of status on public.company_events
for each row
execute function private.company_event_publish_notifications();

-- Do not enqueue an email webhook for explicitly in-app-only notifications.
-- Patch the established dispatcher in place so this migration remains
-- compatible with tenants where email delivery has not been configured.
do $patch$
declare
  definition text;
  marker text := E'begin\n  select decrypted_secret';
  guard text := E'begin\n  if coalesce((new."CommNotif_MetadataJSON" ->> ''in_app_only'')::boolean, false) then\n    return new;\n  end if;\n\n  select decrypted_secret';
begin
  if to_regprocedure('public."Comm_DispatchNotificationEmail"()') is null then
    return;
  end if;

  definition := pg_get_functiondef('public."Comm_DispatchNotificationEmail"()'::regprocedure);
  if position('in_app_only' in definition) > 0 then
    return;
  end if;
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review the notification email dispatcher before enabling event invitations';
  end if;
  execute replace(definition, marker, guard);
end;
$patch$;

commit;
