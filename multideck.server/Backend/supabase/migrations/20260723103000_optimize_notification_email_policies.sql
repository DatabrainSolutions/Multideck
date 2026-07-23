begin;

alter policy "Users can read their notification preferences"
on public."Comm_UserNotificationPreferences"
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

alter policy "Users can create their notification preferences"
on public."Comm_UserNotificationPreferences"
with check (
  "CommNotifPref_ChannelCode" = 'email'
  and exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

alter policy "Users can update their notification preferences"
on public."Comm_UserNotificationPreferences"
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

alter policy "Users can delete their notification preferences"
on public."Comm_UserNotificationPreferences"
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_UserNotificationPreferences"."CommNotifPref_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

alter policy "Users can read their notifications"
on public."Comm_Notifications"
using (
  exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."User_ID" = "Comm_Notifications"."CommNotif_UserID"
      and workspace_user."Auth_User_ID" = (select auth.uid())
  )
);

alter policy "Users can update their notification state"
on public."Comm_Notifications"
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

commit;
