-- Canonical workspace departments and developer/admin broadcast delivery.
-- Browser code never receives provider credentials. Broadcast rows are private
-- to the service-role Edge Function; the narrow Dexter reader below is both
-- tenant-scoped and permission-gated.

begin;

create table if not exists public."cmp_Departments" (
  "Department_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Department_Name" text not null,
  "Department_IsActive" boolean not null default true,
  "Department_CreatedAt" timestamptz not null default now(),
  "Department_UpdatedAt" timestamptz not null default now(),
  constraint "CK_cmp_Departments_name" check (char_length(btrim("Department_Name")) between 1 and 80)
);

create unique index if not exists "UX_cmp_Departments_company_name"
  on public."cmp_Departments" ("Company_ID", lower(btrim("Department_Name")));

create table if not exists public."cmp_Users_Departments" (
  "User_ID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "Department_ID" uuid not null references public."cmp_Departments"("Department_ID") on delete cascade,
  "Department_AssignedAt" timestamptz not null default now(),
  "Department_AssignedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  primary key ("User_ID", "Department_ID")
);

create index if not exists "IX_cmp_Users_Departments_department"
  on public."cmp_Users_Departments" ("Department_ID", "User_ID");

create table if not exists public."DEV_Broadcasts" (
  "Broadcast_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Broadcast_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "Broadcast_Subject" varchar(200) not null,
  "Broadcast_Body" text not null,
  "Broadcast_AudienceMode" varchar(20) not null,
  "Broadcast_AudienceJSON" jsonb not null default '{}'::jsonb,
  "Broadcast_StatusCode" varchar(24) not null default 'draft',
  "Broadcast_IdempotencyKey" uuid not null default gen_random_uuid(),
  "Broadcast_RecipientCount" integer not null default 0,
  "Broadcast_ExcludedCount" integer not null default 0,
  "Broadcast_DeliveredCount" integer not null default 0,
  "Broadcast_FailedCount" integer not null default 0,
  "Broadcast_DeliveryMode" varchar(12),
  "Broadcast_ConfirmedAt" timestamptz,
  "Broadcast_SentAt" timestamptz,
  "Broadcast_Error" text,
  "Broadcast_CreatedAt" timestamptz not null default now(),
  "Broadcast_UpdatedAt" timestamptz not null default now(),
  constraint "CK_DEV_Broadcasts_subject" check (char_length(btrim("Broadcast_Subject")) between 1 and 200),
  constraint "CK_DEV_Broadcasts_body" check (char_length(btrim("Broadcast_Body")) between 1 and 20000),
  constraint "CK_DEV_Broadcasts_audience" check ("Broadcast_AudienceMode" in ('all','departments','users')),
  constraint "CK_DEV_Broadcasts_audience_json" check (jsonb_typeof("Broadcast_AudienceJSON") = 'object'),
  constraint "CK_DEV_Broadcasts_status" check ("Broadcast_StatusCode" in ('draft','sending','sent','partially_failed','failed')),
  constraint "CK_DEV_Broadcasts_counts" check (
    "Broadcast_RecipientCount" >= 0 and "Broadcast_ExcludedCount" >= 0 and
    "Broadcast_DeliveredCount" >= 0 and "Broadcast_FailedCount" >= 0
  ),
  unique ("Company_ID", "Broadcast_IdempotencyKey")
);

create table if not exists public."DEV_BroadcastRecipients" (
  "BroadcastRecipient_ID" uuid primary key default gen_random_uuid(),
  "Broadcast_ID" uuid not null references public."DEV_Broadcasts"("Broadcast_ID") on delete cascade,
  "BroadcastRecipient_UserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "BroadcastRecipient_EmailSnapshot" varchar(320) not null,
  "BroadcastRecipient_NameSnapshot" varchar(240) not null,
  "BroadcastRecipient_DepartmentsJSON" jsonb not null default '[]'::jsonb,
  "BroadcastRecipient_StatusCode" varchar(24) not null,
  "BroadcastRecipient_ExclusionReason" text,
  "BroadcastRecipient_ProviderID" varchar(180),
  "BroadcastRecipient_Error" text,
  "BroadcastRecipient_DeliveredAt" timestamptz,
  "BroadcastRecipient_CreatedAt" timestamptz not null default now(),
  constraint "CK_DEV_BroadcastRecipients_departments" check (jsonb_typeof("BroadcastRecipient_DepartmentsJSON") = 'array'),
  constraint "CK_DEV_BroadcastRecipients_status" check ("BroadcastRecipient_StatusCode" in ('ready','excluded','sending','delivered','failed')),
  unique ("Broadcast_ID", "BroadcastRecipient_EmailSnapshot")
);

create index if not exists "IX_DEV_Broadcasts_company_created"
  on public."DEV_Broadcasts" ("Company_ID", "Broadcast_CreatedAt" desc);
create index if not exists "IX_DEV_BroadcastRecipients_broadcast_status"
  on public."DEV_BroadcastRecipients" ("Broadcast_ID", "BroadcastRecipient_StatusCode");

create table if not exists public."DEV_BroadcastAudit" (
  "BroadcastAudit_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "Broadcast_ID" uuid references public."DEV_Broadcasts"("Broadcast_ID") on delete set null,
  "BroadcastAudit_ActorUserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "BroadcastAudit_EventCode" varchar(40) not null,
  "BroadcastAudit_MetadataJSON" jsonb not null default '{}'::jsonb,
  "BroadcastAudit_CreatedAt" timestamptz not null default now(),
  constraint "CK_DEV_BroadcastAudit_metadata" check (jsonb_typeof("BroadcastAudit_MetadataJSON") = 'object')
);

create index if not exists "IX_DEV_BroadcastAudit_company_created"
  on public."DEV_BroadcastAudit" ("Company_ID", "BroadcastAudit_CreatedAt" desc);

alter table public."cmp_Departments" enable row level security;
alter table public."cmp_Users_Departments" enable row level security;
alter table public."DEV_Broadcasts" enable row level security;
alter table public."DEV_BroadcastRecipients" enable row level security;
alter table public."DEV_BroadcastAudit" enable row level security;

revoke all on table public."cmp_Departments", public."cmp_Users_Departments",
  public."DEV_Broadcasts", public."DEV_BroadcastRecipients", public."DEV_BroadcastAudit"
  from public, anon, authenticated;
grant select, insert, update, delete on table public."cmp_Departments", public."cmp_Users_Departments",
  public."DEV_Broadcasts", public."DEV_BroadcastRecipients", public."DEV_BroadcastAudit" to service_role;

insert into public."sys_Permissions" (
  "sys_Permission_Value", "sys_Permission_Group", "sys_Permission_Name",
  "sys_Permission_Description", "sys_Permission_IsDangerous"
) values
  ('Broadcasts.Read', 'Developer broadcasts', 'View broadcasts', 'View workspace broadcast drafts, audience evidence and delivery history.', true),
  ('Broadcasts.Manage', 'Developer broadcasts', 'Manage broadcasts', 'Create and edit reviewed workspace broadcast drafts.', true),
  ('Broadcasts.Send', 'Developer broadcasts', 'Send broadcasts', 'Confirm and dispatch a broadcast to active workspace users.', true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group"=excluded."sys_Permission_Group",
  "sys_Permission_Name"=excluded."sys_Permission_Name",
  "sys_Permission_Description"=excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous"=excluded."sys_Permission_IsDangerous";

with assignments(role_name, permission_value) as (
  values
    ('Administrator','Broadcasts.Read'), ('Administrator','Broadcasts.Manage'), ('Administrator','Broadcasts.Send'),
    ('System Admin','Broadcasts.Read'), ('System Admin','Broadcasts.Manage'), ('System Admin','Broadcasts.Send')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from assignments
join public."sys_UserRoles" role on role."sys_UserRole_Name"=assignments.role_name
join public."sys_Permissions" permission on permission."sys_Permission_Value"=assignments.permission_value
on conflict do nothing;

-- Dexter chat may inspect history only for a signed-in user who already has
-- the same Broadcasts.Read permission as the Developer screen.
create or replace function public.multideck_dexter_domain_broadcasts(p_company_id uuid, p_search text, p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select case when not exists (
    select 1 from public."cmp_Users" actor
    join public."cmp_Users_Roles" ur on ur."User_ID"=actor."User_ID"
    join public."sys_UserRole_Permissions" rp on rp."sys_UserRole_ID"=ur."sys_UserRole_ID"
    join public."sys_Permissions" permission on permission."sys_Permission_ID"=rp."sys_Permission_ID"
    where actor."Auth_User_ID"=auth.uid() and actor."Company_ID"=p_company_id
      and permission."sys_Permission_Value"='Broadcasts.Read'
  ) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'recordId', broadcast."Broadcast_ID", 'subject', broadcast."Broadcast_Subject",
      'audienceMode', broadcast."Broadcast_AudienceMode", 'audience', broadcast."Broadcast_AudienceJSON",
      'status', broadcast."Broadcast_StatusCode", 'recipientCount', broadcast."Broadcast_RecipientCount",
      'excludedCount', broadcast."Broadcast_ExcludedCount", 'deliveredCount', broadcast."Broadcast_DeliveredCount",
      'failedCount', broadcast."Broadcast_FailedCount", 'deliveryMode', broadcast."Broadcast_DeliveryMode",
      'sentAt', broadcast."Broadcast_SentAt", 'createdAt', broadcast."Broadcast_CreatedAt",
      'evidence', jsonb_build_object('sourceTable','DEV_Broadcasts','sourceId',broadcast."Broadcast_ID")
    ) order by broadcast."Broadcast_CreatedAt" desc)
    from (select * from public."DEV_Broadcasts" b where b."Company_ID"=p_company_id
      and (nullif(btrim(p_search),'') is null or b."Broadcast_Subject" ilike '%'||btrim(p_search)||'%')
      order by b."Broadcast_CreatedAt" desc limit greatest(1,least(coalesce(p_take,10),25))) broadcast
  ), '[]'::jsonb) end;
$$;
revoke all on function public.multideck_dexter_domain_broadcasts(uuid,text,integer) from public,anon,authenticated;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt"
) values ('broadcasts','Developer broadcasts','Permission-gated broadcast drafts, audience counts and immutable delivery history.','multideck_dexter_domain_broadcasts',85,true,now())
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name"=excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description"=excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now();

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_SortOrder","AIDexterWatchCapability_IsActive","AIDexterWatchCapability_UpdatedAt"
) values ('broadcasts','Developer broadcasts','Delivery status and recipient-count changes for administrator broadcasts.',
  '["status","recipientCount","excludedCount","deliveredCount","failedCount","sentAt"]'::jsonb,85,true,now())
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name"=excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description"=excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON"=excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_UpdatedAt"=now();

create or replace function public._multideck_broadcast_watch_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new."AIDexterWatch_CapabilityCode"='broadcasts' and not public._multideck_dexter_has_permission(new."AIDexterWatch_OwnerUserID",'Broadcasts.Read') then
    raise exception 'You do not have permission to watch developer broadcasts.' using errcode='42501';
  end if;
  return new;
end; $$;
drop trigger if exists "TR_AI_DexterWatches_broadcast_guard" on public."AI_DexterWatches";
create trigger "TR_AI_DexterWatches_broadcast_guard" before insert or update on public."AI_DexterWatches"
for each row execute function public._multideck_broadcast_watch_guard();

create or replace function public._multideck_broadcast_watch_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_data jsonb:='{}'::jsonb; new_data jsonb;
begin
  if tg_op='UPDATE' then old_data=jsonb_build_object('status',old."Broadcast_StatusCode",'recipientCount',old."Broadcast_RecipientCount",'excludedCount',old."Broadcast_ExcludedCount",'deliveredCount',old."Broadcast_DeliveredCount",'failedCount',old."Broadcast_FailedCount",'sentAt',old."Broadcast_SentAt"); end if;
  new_data=jsonb_build_object('status',new."Broadcast_StatusCode",'recipientCount',new."Broadcast_RecipientCount",'excludedCount',new."Broadcast_ExcludedCount",'deliveredCount',new."Broadcast_DeliveredCount",'failedCount',new."Broadcast_FailedCount",'sentAt',new."Broadcast_SentAt");
  if exists (select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=new."Company_ID" and w."AIDexterWatch_CapabilityCode"='broadcasts' and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new."Broadcast_ID")) then
    insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(new."Company_ID",'broadcasts','DEV_Broadcasts',new."Broadcast_ID",old_data,new_data);
  end if;
  return new;
end; $$;
drop trigger if exists "TR_DEV_Broadcasts_dexter_watch" on public."DEV_Broadcasts";
create trigger "TR_DEV_Broadcasts_dexter_watch" after insert or update of "Broadcast_StatusCode","Broadcast_RecipientCount","Broadcast_ExcludedCount","Broadcast_DeliveredCount","Broadcast_FailedCount","Broadcast_SentAt" on public."DEV_Broadcasts"
for each row execute function public._multideck_broadcast_watch_signal();

commit;
