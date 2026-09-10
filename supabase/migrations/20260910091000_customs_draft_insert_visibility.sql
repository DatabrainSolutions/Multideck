begin;

-- INSERT ... RETURNING also evaluates SELECT policies. Looking up CUST_id
-- through a STABLE function cannot see the row being inserted in that command.
-- Authorise its creator directly using the same workspace/role restrictions.
create or replace function public.customs_declaration_creator_current_user_authorised(
  creator_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" creator
    join public."cmp_Users" caller
      on caller."Auth_User_ID" = (select auth.uid())
    where creator."Auth_User_ID" = creator_auth_user_id
      and caller."Company_ID" is not null
      and caller."Company_ID" = creator."Company_ID"
      and coalesce(caller."User_AccessStatus", 'active') = 'active'
      and coalesce(creator."User_AccessStatus", 'active') <> 'deleted'
      and booking_api.has_permission((select auth.uid()), 'Customs.Read')
  )
$$;

revoke all on function public.customs_declaration_creator_current_user_authorised(uuid) from public, anon;
grant execute on function public.customs_declaration_creator_current_user_authorised(uuid) to authenticated, service_role;

drop policy "Workspace users can read company Customs declarations" on public."Customs_Declarations";
create policy "Workspace users can read company Customs declarations"
  on public."Customs_Declarations" for select to authenticated
  using (
    not "CUST_IsDeleted"
    and public.customs_declaration_creator_current_user_authorised("CUST_CreatedBy")
  );

commit;
