import { readFileSync } from 'node:fs'
import { currentFunction } from './operational-access-source.mjs'
const nativeFunction = name => currentFunction('public', name).sql
export function createMileageFixture(sql, ok) {
 ok(sql(`
 create schema auth;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table "cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_Firstname" text,"User_Lastname" text,"User_AccessStatus" text default 'active');
 create table "cmp_Users_Roles"("User_ID" uuid,"sys_UserRole_ID" uuid);
 create table "sys_UserRoles"("sys_UserRole_ID" uuid,"sys_UserRole_Name" text);
 create table "sys_UserRole_Permissions"("sys_UserRole_ID" uuid,"sys_Permission_ID" uuid);
 create table "sys_Permissions"("sys_Permission_ID" uuid,"sys_Permission_Value" text);
 create table "sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_RequiredPermissionsJSON" jsonb,"AIDexterDomain_DataCategoriesJSON" jsonb,"AIDexterDomain_ScopeStrategy" text,"AIDexterDomain_IsActive" boolean default true);
 create table "Org_Master"("Org_id" uuid primary key,"Org_Name" text);
 create table "CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_IsDeleted" boolean default false,"CRMAccount_MetadataJSON" jsonb default '{}');
 create table "Job_Header"("Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_Customer" uuid);
 create table "cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
 create table "CusQuote_Header"("CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid,"CusQuoteHeader_CustomerID" uuid);
 create table "Comm_Notifications"("CommNotif_ID" uuid default gen_random_uuid(),"CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
 create function public.multideck_cloud_product_access(text) returns boolean language sql stable as $$select false$$;
 ${nativeFunction('_multideck_crm_has_permission')}
 ${nativeFunction('multideck_crm_company_can_access_account')}
 ${nativeFunction('_multideck_dexter_context')}
 ${nativeFunction('_multideck_dexter_has_permission')}
 ${nativeFunction('_multideck_dexter_has_permissions')}
 ${nativeFunction('multideck_dexter_query_domain')}
 `))
 ok(sql(readFileSync(new URL('../migrations/20260921184526_mileage_claims.sql', import.meta.url), 'utf8')))
 ok(sql(readFileSync(new URL('../migrations/20260921190326_mileage_company_name.sql', import.meta.url), 'utf8')))
 ok(sql(readFileSync(new URL('../migrations/20260921192805_mileage_review_submission.sql', import.meta.url), 'utf8')))
 ok(sql(`
 create function query_mileage() returns jsonb language sql security definer as $$select multideck_dexter_query_domain('mileage',null,10)->'data'$$;
 create function test_assert(b boolean,m text) returns void language plpgsql as $$begin if b is distinct from true then raise exception 'ASSERTION: %',m;end if;end$$;
 create function login(n integer) returns void language sql as $$select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-'||lpad(n::text,12,'0'),false)::text is not null$$;
 create function denied(action text,data jsonb default '{}') returns void language plpgsql as $$begin
   begin perform public.multideck_mileage(action,data); exception when others then return;end;
   raise exception 'Expected denial for %',action;
 end$$;
 insert into "cmp_Users" select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  case when n=5 then '20000000-0000-0000-0000-000000000002' else '20000000-0000-0000-0000-000000000001' end::uuid,'Employee',n::text,'active' from generate_series(1,6) n;
 insert into "sys_UserRoles" values('30000000-0000-0000-0000-000000000001','Sales'),('30000000-0000-0000-0000-000000000002','Finance'),('30000000-0000-0000-0000-000000000003','Administrator');
 insert into "sys_Permissions" values('40000000-0000-0000-0000-000000000001','CRM.Read'),('40000000-0000-0000-0000-000000000002','Finance.ReviewAndPost');
 insert into "sys_UserRole_Permissions" values('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002'),('30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001');
 insert into "cmp_Users_Roles" select "User_ID",'30000000-0000-0000-0000-000000000001' from "cmp_Users";
 insert into "cmp_Users_Roles" values('00000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000003');
 insert into "Org_Master" values('50000000-0000-0000-0000-000000000001','Customer'),('50000000-0000-0000-0000-000000000002','Foreign customer');
 insert into "CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID") values('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
 create table fixture_trip(data jsonb);
 insert into fixture_trip values('{"id":"60000000-0000-0000-0000-000000000001","account_id":"50000000-0000-0000-0000-000000000001","trip_date":"2026-09-20","origin":"WF10 5YL","destination":"LS1 1UR","purpose":"Customer review","waypoints":[],"round_trip":true,"vehicle_type":"car","vehicle_name":"Ford Focus","company_car":false,"distance_source":"manual","distance_miles":40,"distance_reason":"Odometer 1000 to 1040"}');
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 grant select on fixture_trip to authenticated;
 `))
}
