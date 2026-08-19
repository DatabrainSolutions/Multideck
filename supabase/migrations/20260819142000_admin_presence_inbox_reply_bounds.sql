-- Keep small supporting reads proportional to the UI instead of letting active
-- presence or one unusually long email thread grow the Edge Function payload.

create index if not exists "IX_Admin_UserPresence_company_recent"
  on public."Admin_UserPresence" (
    "Presence_CompanyID",
    "Presence_LastSeenAt" desc,
    "Presence_UserID"
  );

create index if not exists "IX_Comm_Messages_reply_candidates"
  on public."Comm_Messages" (
    "CommMessage_ThreadID",
    "CommMessage_MailboxID",
    "CommMessage_CreatedAt" desc,
    "CommMessage_ID"
  )
  include ("CommMessage_InternetMessageID")
  where not "CommMessage_IsInbound"
    and not "CommMessage_IsDeleted";
