-- Read-only tenant release probe. Temporary results roll back; employee data and source records are never changed.
begin;
create temporary table admin_release_probe(company_id uuid, administrators integer default 0, colleagues_denied integer default 0, verified_bookings integer, summary jsonb);
do $probe$
declare actor record; result jsonb; expected integer; allowed boolean;
begin
 for actor in select u."User_ID",u."Auth_User_ID",u."Company_ID",private.is_tenant_administrator(u."User_ID") as administrator
 from public."cmp_Users" u where u."Auth_User_ID" is not null and u."Company_ID" is not null and u."User_AccessStatus"='active'
 loop
  perform set_config('request.jwt.claim.sub',actor."Auth_User_ID"::text,true);
  set local role authenticated;
  begin
   result:=public.multideck_admin_dashboard(current_date-30,current_date-1);
   if not actor.administrator then raise exception 'Non-administrator accessed Admin analytics'; end if;
  exception when insufficient_privilege then
   if actor.administrator then raise exception 'Administrator cannot read Admin analytics';end if;
   result:=null;
  end;
  reset role;
  if not exists(select 1 from admin_release_probe where company_id=actor."Company_ID") then insert into admin_release_probe(company_id) values(actor."Company_ID");end if;
  if actor.administrator then
   select count(*) into expected from public."Job_Header" j
   join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
   join public."Admin_BookingPlaced" b on b.job_id=j."Job_ID" and b.company_id=actor."Company_ID"
   where (result#>>'{permissions,bookings}')::boolean and o."Company_ID"=actor."Company_ID" and not j."Job_IsDeleted"
   and lower(j."Job_Status") not in ('draft','provisional','cancelled','canceled','voided')
   and (b.placed_at at time zone 'UTC')::date between current_date-30 and current_date-1
   and not exists(select 1 from public."CRM_AccountProfiles" f where f."CRMAccount_OrgID"=j."Job_Customer" and lower(f."CRMAccount_MetadataJSON"->>'developmentFixture')='true');
   if (result#>>'{summary,bookings}')::integer<>expected then raise exception 'Company-scoped source count mismatch';end if;
   update admin_release_probe set administrators=administrators+1,verified_bookings=expected,summary=result->'summary' where company_id=actor."Company_ID";
  else update admin_release_probe set colleagues_denied=colleagues_denied+1 where company_id=actor."Company_ID";end if;
 end loop;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',true);
 set local role authenticated;
 begin
  perform public.multideck_admin_dashboard(current_date-30,current_date-1);
  raise exception 'Unlinked foreign actor accessed Admin';
 exception when insufficient_privilege then null;
 end;
 begin
  perform count(*) from public."Admin_UsageEvents";
  raise exception 'Browser role accessed private employee telemetry';
 exception when insufficient_privilege then null;
 end;
 reset role;
 if has_function_privilege('anon','public.multideck_admin_dashboard(date,date)','execute') then raise exception 'Anonymous report access granted';end if;
 if has_function_privilege('authenticated','public.multideck_admin_usage_maintenance()','execute') then raise exception 'Browser retention access granted';end if;
end $probe$;
select jsonb_build_object(
'companyReports',(select jsonb_agg(to_jsonb(p)) from admin_release_probe p),
'financeRoles',(select jsonb_agg(r."sys_UserRole_Name") from public."sys_UserRole_Permissions" l join public."sys_UserRoles" r using("sys_UserRole_ID") join public."sys_Permissions" p using("sys_Permission_ID") where p."sys_Permission_Value"='Finance.Director.Dashboard.View'),
'retention',(select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)) from cron.job where jobname='multideck-admin-usage-retention')
) as verified;
rollback;

