-- The provider-removal RPC refreshes thread summaries after deleting a
-- provider-owned message. Restore that private helper for tenant projects
-- provisioned before the bounded-retention migration landed.

create or replace function public._multideck_refresh_retained_email_threads(
  p_thread_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_id uuid;
  v_latest public."Comm_Messages";
begin
  foreach v_thread_id in array coalesce(p_thread_ids, '{}'::uuid[])
  loop
    select message.*
    into v_latest
    from public."Comm_Messages" message
    where message."CommMessage_ThreadID" = v_thread_id
      and not message."CommMessage_IsDeleted"
    order by coalesce(
      message."CommMessage_MessageDate",
      message."CommMessage_ReceivedAt",
      message."CommMessage_SentAt",
      message."CommMessage_CreatedAt"
    ) desc, message."CommMessage_ID" desc
    limit 1;

    if found then
      update public."Comm_Threads"
      set "CommThread_LastMessageID" = v_latest."CommMessage_ID",
          "CommThread_LastMessageAt" = coalesce(
            v_latest."CommMessage_MessageDate",
            v_latest."CommMessage_ReceivedAt",
            v_latest."CommMessage_SentAt",
            v_latest."CommMessage_CreatedAt"
          ),
          "CommThread_Subject" = coalesce(
            v_latest."CommMessage_Subject",
            "CommThread_Subject"
          ),
          "CommThread_IsDeleted" = false,
          "CommThread_UpdatedAt" = now()
      where "CommThread_ID" = v_thread_id;
    else
      update public."Comm_Threads"
      set "CommThread_LastMessageID" = null,
          "CommThread_LastMessageAt" = null,
          "CommThread_IsDeleted" = case
            when "CommThread_SourceTypeCode" = 'provider_sync' then true
            else "CommThread_IsDeleted"
          end,
          "CommThread_UpdatedAt" = now()
      where "CommThread_ID" = v_thread_id;
    end if;
  end loop;
end;
$$;

revoke all on function public._multideck_refresh_retained_email_threads(uuid[])
  from public, anon, authenticated;
