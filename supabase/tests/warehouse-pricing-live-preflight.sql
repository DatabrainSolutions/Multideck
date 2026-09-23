-- Read-only business-data probe before/after pricing installation. No rates are
-- saved. Role impersonation is transaction-local and rolled back. Output is
-- limited to installation state and permission/role counts, never rate values.
begin;
set local statement_timeout='20s';
do $probe$
declare actor record; result jsonb; permitted boolean; writable boolean; customer_visible boolean; checked integer:=0;
begin
  if to_regprocedure('public.warehouse_pricing_card(uuid,jsonb,integer,integer)') is null then return; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='booking_api' and c.relname='warehouse_pricing_cards' and c.relrowsecurity)
    or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='booking_api' and c.relname='warehouse_pricing_audit' and c.relrowsecurity) then
    raise exception 'Pricing RLS is missing';
  end if;
  if has_table_privilege('authenticated','booking_api.warehouse_pricing_cards','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','booking_api.warehouse_pricing_cards','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','booking_api.warehouse_pricing_audit','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','booking_api.warehouse_pricing_audit','SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('anon','public.warehouse_pricing_card(uuid,jsonb,integer,integer)','EXECUTE') then
    raise exception 'Direct or anonymous pricing access was granted';
  end if;
  for actor in select "Auth_User_ID", "Company_ID", "User_AccessStatus" from public."cmp_Users"
    where "Auth_User_ID" is not null loop
    writable:=coalesce(booking_api.has_permission(actor."Auth_User_ID",'Warehouse.Write'),false);
    permitted:=actor."User_AccessStatus"='active' and actor."Company_ID" is not null
      and (writable or coalesce(booking_api.has_permission(actor."Auth_User_ID",'Warehouse.Read'),false));
    customer_visible:=public.multideck_crm_company_can_access_account(actor."Company_ID",'de1000c1-5eed-4ead-8000-000000000004');
    perform set_config('request.jwt.claim.sub',actor."Auth_User_ID"::text,true);
    set local role authenticated;
    if coalesce(permitted,false) then
      result:=public.warehouse_pricing_card();
      if (result->>'canManage')::boolean is distinct from writable then raise exception 'Pricing write permission mismatch'; end if;
      -- The requested account either belongs to this company, or must be denied.
      if customer_visible then
        perform public.warehouse_pricing_card('de1000c1-5eed-4ead-8000-000000000004');
      else
        begin perform public.warehouse_pricing_card('de1000c1-5eed-4ead-8000-000000000004');
          raise exception 'Foreign account pricing was visible'; exception when insufficient_privilege then null; end;
      end if;
      checked:=checked+1;
    else
      begin perform public.warehouse_pricing_card(); raise exception 'Inactive or unprivileged pricing access'; exception when insufficient_privilege then null; end;
    end if;
    reset role;
  end loop;
  if checked=0 then raise exception 'No permitted internal operators tested'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  set local role authenticated;
  begin perform public.warehouse_pricing_card(); raise exception 'Unlinked pricing access'; exception when insufficient_privilege then null; end;
  reset role;
end $probe$;
select jsonb_build_object(
  'pricingInstalled',to_regprocedure('public.warehouse_pricing_card(uuid,jsonb,integer,integer)') is not null,
  'migrationVersions',(select coalesce(jsonb_agg(version order by version),'[]') from supabase_migrations.schema_migrations where version in ('20260922160000','20260922160100')),
  'activeWarehouseReaders',(select count(*) from public."cmp_Users" where "User_AccessStatus"='active' and "Company_ID" is not null and "Auth_User_ID" is not null and (booking_api.has_permission("Auth_User_ID",'Warehouse.Read') or booking_api.has_permission("Auth_User_ID",'Warehouse.Write'))),
  'assignedRoles',(select jsonb_agg(row_to_json(summary)) from (
    select r."sys_UserRole_Name" as role_name,count(*) as active_users,
      count(*) filter(where booking_api.has_permission(u."Auth_User_ID",'Warehouse.Read')) as readers,
      count(*) filter(where booking_api.has_permission(u."Auth_User_ID",'Warehouse.Write')) as writers
    from public."cmp_Users" u join public."cmp_Users_Roles" ur on ur."User_ID"=u."User_ID"
    join public."sys_UserRoles" r using("sys_UserRole_ID")
    where u."User_AccessStatus"='active' and u."Auth_User_ID" is not null group by r."sys_UserRole_Name"
  ) summary)
) as pricing_preflight;
rollback;
