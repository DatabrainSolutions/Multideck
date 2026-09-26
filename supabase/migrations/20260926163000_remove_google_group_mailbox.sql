create or replace function public.comm_remove_group_mailbox(
  p_mailbox_id uuid,
  p_connection_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  update public."Comm_Mailboxes" as mailbox
  set "CommMailbox_InboundEnabled" = false,
      "CommMailbox_OutboundEnabled" = false,
      "CommMailbox_IsDeleted" = true,
      "CommMailbox_UpdatedAt" = v_now,
      "CommMailbox_UpdatedBy" = p_user_id
  from public."Comm_ProviderConnections" as connection
  where mailbox."CommMailbox_ID" = p_mailbox_id
    and mailbox."CommMailbox_ConnectionID" = p_connection_id
    and mailbox."CommMailbox_TypeCode" = 'group'
    and not mailbox."CommMailbox_IsDeleted"
    and connection."CommConn_ID" = p_connection_id
    and connection."CommConn_UserID" = p_user_id
    and connection."CommConn_ProviderTypeCode" = 'google_workspace'
    and not connection."CommConn_IsDeleted";

  if not found then
    return false;
  end if;

  update public."Comm_MailboxAccess"
  set "CommMailboxAccess_RevokedAt" = v_now,
      "CommMailboxAccess_UpdatedAt" = v_now
  where "CommMailboxAccess_MailboxID" = p_mailbox_id
    and "CommMailboxAccess_RevokedAt" is null;

  return true;
end;
$$;

revoke all on function public.comm_remove_group_mailbox(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.comm_remove_group_mailbox(uuid, uuid, uuid) to service_role;
