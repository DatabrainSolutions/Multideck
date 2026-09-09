begin;
set local lock_timeout = '5s';

-- Reuse canonical permissions, numbering, audit and save in one transaction.
-- Never reinitialise reused drafts: the operator may have changed their mode.
create function public.booking_workflow_open_road(
  caller_auth_user_id uuid,
  requested_idempotency_key uuid,
  requested_sequence_key text default 'default'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare opened jsonb;
begin
  opened := booking_api.open_booking(caller_auth_user_id, requested_idempotency_key, requested_sequence_key);
  if (opened->>'reused')::boolean is false then
    perform public.booking_workflow_save(caller_auth_user_id, (opened->>'jobId')::uuid, '{"mode":"road"}'::jsonb);
  end if;
  return opened;
end $$;

revoke all on function public.booking_workflow_open_road(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.booking_workflow_open_road(uuid,uuid,text) to service_role;
comment on function public.booking_workflow_open_road(uuid,uuid,text) is
  'Atomic operator Road draft opening through canonical open/save; no transport instruction or customer acceptance.';
commit;
