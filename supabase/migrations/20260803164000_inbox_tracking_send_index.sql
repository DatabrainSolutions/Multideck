-- Keep tracking-token cleanup and per-send lookups indexed without exposing
-- the server-only token table to browser roles.

begin;

create index if not exists "IX_Comm_MessageTrackingTokens_send"
  on public."Comm_MessageTrackingTokens" ("CommTrack_SendID")
  where "CommTrack_SendID" is not null;

commit;
