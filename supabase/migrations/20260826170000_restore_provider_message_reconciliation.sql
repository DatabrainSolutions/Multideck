-- Restore the provider-removal reconciliation contract used by the live
-- mailbox worker. Some provisioned projects predate the retention migration
-- that originally introduced this RPC, so a deleted provider message could
-- otherwise stop every later Gmail change from being persisted.

create or replace function public.comm_remove_provider_messages(
  p_mailbox_id uuid,
  p_provider_message_ids text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_thread_ids uuid[];
  v_deleted integer := 0;
begin
  perform set_config('multideck.retention_cleanup', 'on', true);

  with deleted as (
    delete from public."Comm_Messages" message
    where message."CommMessage_MailboxID" = p_mailbox_id
      and message."CommMessage_SourceTypeCode" = 'provider_sync'
      and message."CommMessage_ProviderMessageID" = any(
        coalesce(p_provider_message_ids, '{}'::text[])
      )
    returning message."CommMessage_ThreadID"
  )
  select
    count(*),
    coalesce(array_agg(distinct "CommMessage_ThreadID"), '{}'::uuid[])
  into v_deleted, v_thread_ids
  from deleted;

  perform public._multideck_refresh_retained_email_threads(v_thread_ids);

  return jsonb_build_object('deleted', v_deleted);
end;
$$;

revoke all on function public.comm_remove_provider_messages(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.comm_remove_provider_messages(uuid, text[])
  to service_role;
