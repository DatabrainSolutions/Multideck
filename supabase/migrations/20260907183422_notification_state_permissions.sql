begin;

-- Earlier column grants did not remove inherited table-wide UPDATE privileges.
-- The recipient may manage receipt state, never rewrite the message or its link.
revoke all on table public."Comm_Notifications" from anon, authenticated;
grant select on table public."Comm_Notifications" to authenticated;
grant update ("CommNotif_StatusCode", "CommNotif_ReadAt", "CommNotif_DismissedAt", "CommNotif_ActionedAt")
  on table public."Comm_Notifications" to authenticated;

create index if not exists "Comm_Notifications_RecipientFeed"
  on public."Comm_Notifications" ("CommNotif_UserID", "CommNotif_CreatedAt" desc, "CommNotif_ID" desc)
  where "CommNotif_DismissedAt" is null;
create index if not exists "Comm_Notifications_RecipientUnread"
  on public."Comm_Notifications" ("CommNotif_UserID")
  where "CommNotif_DismissedAt" is null and "CommNotif_StatusCode" = 'unread';

commit;
