begin;

create or replace function public.quote_workflow_bind_customer_response_mailbox(
  requested_response_link_id uuid,
  requested_company_id uuid,
  requested_user_id uuid,
  requested_mailbox_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_link_id uuid;
begin
  if not exists (
    select 1
    from public."cmp_Users" app_user
    where app_user."User_ID" = requested_user_id
      and app_user."Company_ID" = requested_company_id
      and app_user."User_AccessStatus" = 'active'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public."Comm_Mailboxes" mailbox
    where mailbox."CommMailbox_ID" = requested_mailbox_id
      and not mailbox."CommMailbox_IsDeleted"
      and mailbox."CommMailbox_OutboundEnabled"
      and (
        mailbox."CommMailbox_UserID" = requested_user_id
        or exists (
          select 1
          from public."Comm_MailboxAccess" access
          where access."CommMailboxAccess_MailboxID" = mailbox."CommMailbox_ID"
            and access."CommMailboxAccess_UserID" = requested_user_id
            and access."CommMailboxAccess_CanSend"
            and access."CommMailboxAccess_RevokedAt" is null
            and (access."CommMailboxAccess_ExpiresAt" is null or access."CommMailboxAccess_ExpiresAt" > now())
        )
      )
  ) then
    return false;
  end if;

  update quote_api.customer_response_links link
  set delivery_mailbox_id = requested_mailbox_id
  where link.response_link_id = requested_response_link_id
    and link.company_id = requested_company_id
    and link.created_by = requested_user_id
    and link.delivery_status_code = 'pending'
  returning link.response_link_id into updated_link_id;

  return updated_link_id is not null;
end;
$$;

revoke all on function public.quote_workflow_bind_customer_response_mailbox(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_bind_customer_response_mailbox(uuid, uuid, uuid, uuid)
  to service_role;

commit;
