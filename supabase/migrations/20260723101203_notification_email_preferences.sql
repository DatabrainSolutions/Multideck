begin;

revoke all on table public."Comm_UserNotificationPreferences" from anon;
revoke all on table public."Comm_Notifications" from anon;

grant select, insert, update, delete on table public."Comm_UserNotificationPreferences" to authenticated;
grant select on table public."Comm_Notifications" to authenticated;
grant update (
  "CommNotif_StatusCode",
  "CommNotif_ReadAt",
  "CommNotif_DismissedAt",
  "CommNotif_ActionedAt"
) on table public."Comm_Notifications" to authenticated;

drop policy if exists "Users can read their notification preferences" on public."Comm_UserNotificationPreferences";
create policy "Users can read their notification preferences"
on public."Comm_UserNotificationPreferences"
for select
to authenticated
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can create their notification preferences" on public."Comm_UserNotificationPreferences";
create policy "Users can create their notification preferences"
on public."Comm_UserNotificationPreferences"
for insert
to authenticated
with check (
  "CommNotifPref_ChannelCode" = 'email'
  and exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can update their notification preferences" on public."Comm_UserNotificationPreferences";
create policy "Users can update their notification preferences"
on public."Comm_UserNotificationPreferences"
for update
to authenticated
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
)
with check (
  "CommNotifPref_ChannelCode" = 'email'
  and exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can delete their notification preferences" on public."Comm_UserNotificationPreferences";
create policy "Users can delete their notification preferences"
on public."Comm_UserNotificationPreferences"
for delete
to authenticated
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can read their notifications" on public."Comm_Notifications";
create policy "Users can read their notifications"
on public."Comm_Notifications"
for select
to authenticated
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_Notifications"."CommNotif_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can update their notification state" on public."Comm_Notifications";
create policy "Users can update their notification state"
on public."Comm_Notifications"
for update
to authenticated
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_Notifications"."CommNotif_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_Notifications"."CommNotif_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

insert into public."Comm_UserNotificationPreferences" (
  "CommNotifPref_UserID",
  "CommNotifPref_ChannelCode",
  "CommNotifPref_EventType",
  "CommNotifPref_IsEnabled",
  "CommNotifPref_DeliveryChannelsJSON",
  "CommNotifPref_QuietHoursJSON"
)
select
  workspace_user."User_ID",
  'email',
  preference."EventType",
  preference."IsEnabled",
  jsonb_build_object('email', preference."IsEnabled", 'in_app', true),
  case
    when preference."EventType" = 'daily_digest'
      then jsonb_build_object('delivery_time', '07:30', 'timezone', 'Europe/London')
    else '{}'::jsonb
  end
from public."cmp_Users" as workspace_user
cross join (
  values
    ('customs_hold'::varchar, true),
    ('eta_delay'::varchar, true),
    ('customer_message'::varchar, true),
    ('document_parse'::varchar, false),
    ('daily_digest'::varchar, true),
    ('quote_reminder'::varchar, true),
    ('product_updates'::varchar, true)
) as preference("EventType", "IsEnabled")
on conflict ("CommNotifPref_UserID", "CommNotifPref_ChannelCode", "CommNotifPref_EventType") do nothing;

commit;
