-- Quote collaboration presence is intentionally ephemeral and tightly scoped.
-- Operators may see who else is on the same quote, while IP addresses, user
-- agents and wider workspace activity remain administrator-only evidence.

begin;

create index if not exists "IX_Admin_UserPresence_quote_editors"
  on public."Admin_UserPresence" (
    "Presence_CompanyID",
    "Presence_LastRoute",
    "Presence_LastSeenAt" desc,
    "Presence_UserID"
  )
  where "Presence_LastRoute" like '/quotes/%';

comment on table public."Admin_UserPresence" is
  'Short-lived workspace presence evidence. A tenant-safe Edge Function may disclose only colleague identity and last-seen time for the exact same quote; full route, IP address and user-agent evidence remains tenant-administrator-only. Presence is not a Dexter data domain or Watching for you source.';

commit;
