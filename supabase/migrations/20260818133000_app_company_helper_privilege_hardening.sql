-- Company/office resolution helpers are RLS implementation details for signed-
-- in operators. They must not remain callable through the anonymous API role,
-- and their security-definer lookup path must exclude caller-controlled temp
-- schemas. Service-role access is retained for the reviewed Edge boundaries.
-- Dexter parity is unchanged because its server-side adapter keeps service-role
-- execution and the same company-scoped helper results.

begin;

alter function public.app_current_company_id()
  set search_path = pg_catalog, public, auth;
alter function public.app_current_workspace_user_id()
  set search_path = pg_catalog, public, auth;
alter function public.app_user_can_access_office(uuid)
  set search_path = pg_catalog, public, auth;
alter function public.app_user_can_access_organisation(uuid)
  set search_path = pg_catalog, public, auth;

revoke all privileges on function public.app_current_company_id()
  from public, anon, authenticated;
revoke all privileges on function public.app_current_workspace_user_id()
  from public, anon, authenticated;
revoke all privileges on function public.app_user_can_access_office(uuid)
  from public, anon, authenticated;
revoke all privileges on function public.app_user_can_access_organisation(uuid)
  from public, anon, authenticated;

grant execute on function public.app_current_company_id()
  to authenticated, service_role;
grant execute on function public.app_current_workspace_user_id()
  to authenticated, service_role;
grant execute on function public.app_user_can_access_office(uuid)
  to authenticated, service_role;
grant execute on function public.app_user_can_access_organisation(uuid)
  to authenticated, service_role;

commit;
