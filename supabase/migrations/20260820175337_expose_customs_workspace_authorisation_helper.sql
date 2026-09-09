begin;

-- Edge Functions use the service role and must pass the authenticated caller
-- explicitly. Keep this helper private to the service role while reusing the
-- same company and permission boundary as browser RLS.
create or replace function public.customs_declaration_authorised(
  caller_auth_user_id uuid,
  requested_declaration_id uuid,
  require_write boolean default false,
  require_draft boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select booking_api.customs_access(
    caller_auth_user_id,
    requested_declaration_id,
    require_write
  )
  and (
    not require_draft
    or exists (
      select 1
      from public."Customs_Declarations" declaration
      where declaration."CUST_id" = requested_declaration_id
        and declaration."CUST_Status" = 'draft'
        and not declaration."CUST_IsDeleted"
    )
  )
$$;

revoke all on function public.customs_declaration_authorised(uuid, uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.customs_declaration_authorised(uuid, uuid, boolean, boolean)
  to service_role;

commit;
