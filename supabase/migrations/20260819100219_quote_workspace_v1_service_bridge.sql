-- Public service-role bridges for the private quote workflow API.
-- PostgREST does not expose private schemas.

begin;

create or replace function public.quote_workflow_has_permission(
  caller_auth_user_id uuid,
  permission_value text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select quote_api.has_permission(caller_auth_user_id, permission_value);
$$;

create or replace function public.quote_workflow_save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.save_quote(caller_auth_user_id, requested_quote_id, payload);
$$;

create or replace function public.quote_workflow_transition_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  requested_transition text,
  requested_note text default null,
  requested_follow_up_at timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select quote_api.transition_quote(
    caller_auth_user_id, requested_quote_id, requested_transition,
    requested_note, requested_follow_up_at
  );
$$;

revoke all on function public.quote_workflow_has_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function public.quote_workflow_save_quote(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.quote_workflow_transition_quote(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_has_permission(uuid, text) to service_role;
grant execute on function public.quote_workflow_save_quote(uuid, uuid, jsonb) to service_role;
grant execute on function public.quote_workflow_transition_quote(uuid, uuid, text, text, timestamptz) to service_role;

commit;

