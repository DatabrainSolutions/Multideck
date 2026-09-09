-- Minimal schema fixture for executable migration/denial tests, never production data.
create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
create schema auth;
create table auth.users(id uuid primary key, email text, encrypted_password text, phone text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
create table auth.identities(id uuid primary key, user_id uuid references auth.users, provider text, identity_data jsonb);
create table auth.mfa_factors(id uuid primary key, user_id uuid references auth.users);
create table auth.webauthn_credentials(id uuid primary key, user_id uuid references auth.users);
create table public."cmp_Company"("Company_ID" uuid primary key);
create table public."cmp_Offices"("Office_ID" uuid primary key, "Company_ID" uuid references public."cmp_Company");
create table public."cmp_Users"("User_ID" uuid primary key, "Auth_User_ID" uuid unique references auth.users, "Company_ID" uuid references public."cmp_Company", "User_Email" varchar(320) not null, "User_Firstname" varchar(50), "User_Lastname" varchar(50), "User_AccessStatus" text, "User_ThemeMode" text);
create table public."sys_UserRoles"("sys_UserRole_ID" uuid primary key, "sys_UserRole_Name" varchar(50));
create table public."sys_Permissions"("sys_Permission_ID" uuid primary key, "sys_Permission_Value" text unique);
create table public."sys_UserRole_Permissions"("sys_UserRole_ID" uuid references public."sys_UserRoles", "sys_Permission_ID" uuid references public."sys_Permissions", primary key("sys_UserRole_ID", "sys_Permission_ID"));
create table public."cmp_Users_Roles"("User_ID" uuid references public."cmp_Users", "sys_UserRole_ID" uuid references public."sys_UserRoles", primary key("User_ID", "sys_UserRole_ID"));
create table public."cmp_Users_Offices"("User_ID" uuid references public."cmp_Users", "Office_ID" uuid references public."cmp_Offices", primary key("User_ID", "Office_ID"));
create table public."sys_AuditEventTypes"("AuditEventType_Code" text primary key, "AuditEventType_Name" text, "AuditEventType_Description" text);
create table public."Audit_Events"("AuditEvent_EventTypeCode" text references public."sys_AuditEventTypes"("AuditEventType_Code"), "AuditEvent_ActorTypeCode" text, "AuditEvent_UserID" uuid, "AuditEvent_AuthUserID" uuid, "AuditEvent_SourceApp" text, "AuditEvent_SourceModule" text, "AuditEvent_Action" text, "AuditEvent_Title" text, "AuditEvent_MetadataJSON" jsonb);

-- Reproduce the existing hosted Auth-to-profile trigger, including its generated
-- profile ID. The bridge must preserve it on Main and bypass it on Training.
create function public.sync_cmp_user_from_auth_user() returns trigger
language plpgsql security definer as $$ begin
  insert into public."cmp_Users" ("User_ID", "Auth_User_ID", "User_Email", "User_AccessStatus")
  values (gen_random_uuid(), new.id, new.email, 'active')
  on conflict ("Auth_User_ID") do update set "User_Email" = excluded."User_Email";
  return new;
end $$;
create trigger on_auth_user_changed_sync_cmp_user
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_cmp_user_from_auth_user();
