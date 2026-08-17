-- Dexter security hardening.
--
-- Authority is now server-owned. The browser may select a conversation mode and
-- approve an opaque prepared-action ID, but it can no longer supply executable
-- action names or arguments. Full access is an expiring conversation/session
-- grant and every write is bound to a clean operator-intent plan.

begin;

insert into public."sys_Permissions" (
  "sys_Permission_Value",
  "sys_Permission_Group",
  "sys_Permission_Name",
  "sys_Permission_Description",
  "sys_Permission_IsDangerous"
)
values
  ('AgentDexter.Manage', 'AI & Agents', 'Manage Dexter', 'Use Dexter and manage its approved workspace actions.', true),
  ('Customers.Read', 'Customers', 'Read customer records', 'Read customer records through product and Dexter workflows.', false),
  ('Email.Read', 'Email', 'Read email', 'Read messages in authorised connected mailboxes.', false),
  ('Email.AIRead', 'Email', 'Use email with AI', 'Use authorised email evidence in approved AI workflows.', false),
  ('Email.Send', 'Email', 'Send email', 'Create drafts and send messages through authorised connected mailboxes.', true),
  ('CRM.Read', 'Sales & CRM', 'Read CRM records', 'Read CRM records through product and Dexter workflows.', false),
  ('CRM.Write', 'Sales & CRM', 'Change CRM records', 'Create and update CRM records through validated product workflows.', true),
  ('Quotes.Read', 'Quotes', 'Read quotes', 'Read customer quotes and commercial context.', false),
  ('Quotes.Write', 'Quotes', 'Change quotes', 'Create and update quotes through validated product workflows.', true),
  ('Bookings.Read', 'Bookings', 'Read bookings', 'Read freight bookings and routing records.', false),
  ('Bookings.Write', 'Bookings', 'Change bookings', 'Create and update freight bookings through validated product workflows.', true),
  ('Customs.Read', 'Customs', 'Read Customs declarations', 'Read operator-owned Customs declarations and filing evidence.', false),
  ('Customs.Write', 'Customs', 'Change Customs declarations', 'Create, update and submit operator-owned Customs declarations through validated workflows.', true),
  ('Warehouse.Read', 'Warehouse', 'Read Warehouse records', 'Read warehouse facilities, orders, stock and exceptions.', false),
  ('Warehouse.Write', 'Warehouse', 'Change Warehouse records', 'Change warehouse master data, orders and stock through the Warehouse boundary.', true)
on conflict ("sys_Permission_Value") do update
set "sys_Permission_Group" = excluded."sys_Permission_Group",
    "sys_Permission_Name" = excluded."sys_Permission_Name",
    "sys_Permission_Description" = excluded."sys_Permission_Description",
    "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

-- Older schema-only tenant baselines predate the access-lifecycle migration.
-- The executor must still be able to invalidate grants when an operator is no
-- longer active, so fail closed around the same canonical status column.
alter table public."cmp_Users"
  add column if not exists "User_AccessStatus" text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public."cmp_Users"'::regclass
      and conname = 'CK_cmp_Users_access_status'
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_access_status"
      check ("User_AccessStatus" in ('active', 'deactivated', 'deleted')) not valid;
  end if;
end $$;

alter table public."sys_AIDexterDataDomains"
  add column if not exists "AIDexterDomain_RequiredPermissionsJSON" jsonb not null default '[]'::jsonb,
  add column if not exists "AIDexterDomain_DataCategoriesJSON" jsonb not null default '[]'::jsonb,
  add column if not exists "AIDexterDomain_ScopeStrategy" text not null default 'company';

alter table public."sys_AIDexterActions"
  add column if not exists "AIDexterAction_RequiredPermissionsJSON" jsonb not null default '[]'::jsonb,
  add column if not exists "AIDexterAction_IntentFamily" text,
  add column if not exists "AIDexterAction_ScopeStrategy" text not null default 'canonical',
  add column if not exists "AIDexterAction_HasExternalEffect" boolean not null default false;

alter table public."sys_AIDexterWatchCapabilities"
  add column if not exists "AIDexterWatchCapability_RequiredPermissionsJSON" jsonb not null default '[]'::jsonb,
  add column if not exists "AIDexterWatchCapability_ScopeStrategy" text not null default 'owner';

-- Provider email effects participate in the same opaque prepared-action
-- lifecycle as database and warehouse writes. Their placeholder function names
-- satisfy the registry contract; execution remains at the canonical Inbox Edge
-- boundary and never falls through to dynamic SQL.
insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name",
  "AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON",
  "AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_UpdatedAt"
) values
  ('create_email_draft','customers','Create email draft','Create one exact provider email draft from the operator-reviewed Dexter draft.','multideck_dexter_action_create_email_draft','{"type":"object","properties":{},"additionalProperties":false}'::jsonb,910,true,now()),
  ('send_email','customers','Send email','Send one exact operator-reviewed email through an authorised connected mailbox.','multideck_dexter_action_send_email','{"type":"object","properties":{},"additionalProperties":false}'::jsonb,920,true,now())
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_Name"=excluded."AIDexterAction_Name",
  "AIDexterAction_Description"=excluded."AIDexterAction_Description",
  "AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON",
  "AIDexterAction_IsActive"=true,
  "AIDexterAction_UpdatedAt"=now();

alter table public."AI_DexterUploads"
  add column if not exists "AIDexterUpload_LastUsedAt" timestamptz not null default now(),
  add column if not exists "AIDexterUpload_ExpiresAt" timestamptz not null default (now() + interval '30 days'),
  add column if not exists "AIDexterUpload_ScanStatusCode" text not null default 'quarantined';

alter table public."AI_DexterUploads"
  alter column "AIDexterUpload_ScanStatusCode" set default 'quarantined';

do $$ declare v_constraint text;
begin
  for v_constraint in
    select constraint_name from information_schema.constraint_column_usage
    where table_schema='public' and table_name='AI_DexterUploads' and column_name='AIDexterUpload_ScanStatusCode'
  loop
    execute format('alter table public."AI_DexterUploads" drop constraint if exists %I',v_constraint);
  end loop;
end $$;

alter table public."AI_DexterUploads"
  add constraint "CK_AI_DexterUploads_scan_status"
  check ("AIDexterUpload_ScanStatusCode" in ('quarantined','clean','rejected'));

update public."AI_DexterUploads"
set "AIDexterUpload_ScanStatusCode"='quarantined'
where "AIDexterUpload_ScanStatusCode"='signature_checked';

create index if not exists "IX_AI_DexterUploads_retention"
  on public."AI_DexterUploads" ("AIDexterUpload_ExpiresAt")
  where "AIDexterUpload_StatusCode" = 'active';

create table if not exists public."AI_DexterUploadReservations" (
  "AIDexterUploadReservation_ID" uuid primary key default gen_random_uuid(),
  "AIDexterUploadReservation_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterUploadReservation_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterUploadReservation_ByteCount" bigint not null check ("AIDexterUploadReservation_ByteCount">0),
  "AIDexterUploadReservation_Status" text not null default 'reserved'
    check ("AIDexterUploadReservation_Status" in ('reserved','settled','released')),
  "AIDexterUploadReservation_CreatedAt" timestamptz not null default now(),
  "AIDexterUploadReservation_ExpiresAt" timestamptz not null default (now()+interval '10 minutes'),
  "AIDexterUploadReservation_CompletedAt" timestamptz
);

alter table public."AI_DexterUploadReservations" enable row level security;
revoke all on public."AI_DexterUploadReservations" from public,anon,authenticated;
grant select,insert,update,delete on public."AI_DexterUploadReservations" to service_role;

create or replace function public.multideck_dexter_reserve_upload(
  p_company_id uuid,p_user_id uuid,p_byte_count bigint
) returns uuid language plpgsql volatile security definer set search_path=pg_catalog,public,auth as $$
declare v_id uuid:=gen_random_uuid(); v_recent integer; v_daily bigint; v_workspace bigint;
begin
  if auth.role()<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if p_byte_count<=0 or p_byte_count>25*1024*1024 then raise exception 'upload_too_large' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_user_id::text,731));
  if not exists(select 1 from public."cmp_Users" u where u."User_ID"=p_user_id and u."Company_ID"=p_company_id
    and coalesce(u."User_AccessStatus",'active')='active') then raise exception 'operator_unavailable' using errcode='42501'; end if;
  select
    (select count(*) from public."AI_DexterUploads" u where u."AIDexterUpload_CompanyID"=p_company_id
      and u."AIDexterUpload_UserID"=p_user_id and u."AIDexterUpload_CreatedAt">=now()-interval '10 minutes')
    +(select count(*) from public."AI_DexterUploadReservations" r where r."AIDexterUploadReservation_CompanyID"=p_company_id
      and r."AIDexterUploadReservation_UserID"=p_user_id and r."AIDexterUploadReservation_Status"='reserved'
      and r."AIDexterUploadReservation_ExpiresAt">now() and r."AIDexterUploadReservation_CreatedAt">=now()-interval '10 minutes')
  into v_recent;
  if v_recent>=10 then raise exception 'upload_rate_limited' using errcode='P0001'; end if;
  select
    coalesce((select sum(u."AIDexterUpload_FileSizeBytes") from public."AI_DexterUploads" u
      where u."AIDexterUpload_CompanyID"=p_company_id and u."AIDexterUpload_UserID"=p_user_id
        and u."AIDexterUpload_CreatedAt">=now()-interval '24 hours'),0)
    +coalesce((select sum(r."AIDexterUploadReservation_ByteCount") from public."AI_DexterUploadReservations" r
      where r."AIDexterUploadReservation_CompanyID"=p_company_id and r."AIDexterUploadReservation_UserID"=p_user_id
        and r."AIDexterUploadReservation_Status"='reserved' and r."AIDexterUploadReservation_ExpiresAt">now()),0)
  into v_daily;
  if v_daily+p_byte_count>250*1024*1024 then raise exception 'upload_daily_limit' using errcode='P0001'; end if;
  select
    coalesce((select sum(u."AIDexterUpload_FileSizeBytes") from public."AI_DexterUploads" u
      where u."AIDexterUpload_CompanyID"=p_company_id and u."AIDexterUpload_StatusCode"='active'),0)
    +coalesce((select sum(r."AIDexterUploadReservation_ByteCount") from public."AI_DexterUploadReservations" r
      where r."AIDexterUploadReservation_CompanyID"=p_company_id and r."AIDexterUploadReservation_Status"='reserved'
        and r."AIDexterUploadReservation_ExpiresAt">now()),0)
  into v_workspace;
  if v_workspace+p_byte_count>2::bigint*1024*1024*1024 then raise exception 'upload_workspace_limit' using errcode='P0001'; end if;
  insert into public."AI_DexterUploadReservations"(
    "AIDexterUploadReservation_ID","AIDexterUploadReservation_CompanyID","AIDexterUploadReservation_UserID",
    "AIDexterUploadReservation_ByteCount"
  ) values(v_id,p_company_id,p_user_id,p_byte_count);
  return v_id;
end $$;

create or replace function public.multideck_dexter_settle_upload_reservation(
  p_reservation_id uuid,p_company_id uuid,p_user_id uuid,p_succeeded boolean
) returns void language plpgsql volatile security definer set search_path=pg_catalog,public,auth as $$
begin
  if auth.role()<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  update public."AI_DexterUploadReservations" set
    "AIDexterUploadReservation_Status"=case when p_succeeded then 'settled' else 'released' end,
    "AIDexterUploadReservation_CompletedAt"=now()
  where "AIDexterUploadReservation_ID"=p_reservation_id
    and "AIDexterUploadReservation_CompanyID"=p_company_id
    and "AIDexterUploadReservation_UserID"=p_user_id
    and "AIDexterUploadReservation_Status"='reserved';
end $$;

revoke all on function public.multideck_dexter_reserve_upload(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.multideck_dexter_settle_upload_reservation(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.multideck_dexter_reserve_upload(uuid,uuid,bigint) to service_role;
grant execute on function public.multideck_dexter_settle_upload_reservation(uuid,uuid,uuid,boolean) to service_role;

update public."sys_AIDexterDataDomains"
set "AIDexterDomain_RequiredPermissionsJSON" = case
  when "AIDexterDomain_Code" in ('leads', 'deals') then '["CRM.Read"]'::jsonb
  when "AIDexterDomain_Code" = 'quotes' then '["Quotes.Read"]'::jsonb
  when "AIDexterDomain_Code" = 'customers' then '["Customers.Read"]'::jsonb
  when "AIDexterDomain_Code" in ('bookings', 'booking') then '["Bookings.Read"]'::jsonb
  when "AIDexterDomain_Code" in ('customs_declarations', 'customs') then '["Customs.Read"]'::jsonb
  when "AIDexterDomain_Code" in ('warehouse', 'warehouse_reference', 'purchase_orders') then '["Warehouse.Read"]'::jsonb
  else "AIDexterDomain_RequiredPermissionsJSON"
end,
"AIDexterDomain_DataCategoriesJSON" = case
  when "AIDexterDomain_Code" in ('leads','deals','customers') then '["business_record","contact_details"]'::jsonb
  when "AIDexterDomain_Code"='quotes' then '["business_record","commercial_amounts"]'::jsonb
  when "AIDexterDomain_Code" in ('bookings','booking') then '["business_record","route_details"]'::jsonb
  when "AIDexterDomain_Code" in ('customs_declarations','customs') then '["business_record","customs_details","commercial_amounts"]'::jsonb
  when "AIDexterDomain_Code" in ('warehouse','warehouse_reference','purchase_orders') then '["business_record","warehouse_details","commercial_amounts"]'::jsonb
  else "AIDexterDomain_DataCategoriesJSON"
end;

update public."sys_AIDexterActions"
set
  "AIDexterAction_RequiredPermissionsJSON" = case
    when "AIDexterAction_Code" in ('create_email_draft','send_email') then '["Email.Send"]'::jsonb
    when "AIDexterAction_DomainCode" in ('leads', 'deals') then '["CRM.Write"]'::jsonb
    when "AIDexterAction_DomainCode" = 'quotes' then '["Quotes.Write"]'::jsonb
    when "AIDexterAction_DomainCode" = 'customers' then '["Customers.Write"]'::jsonb
    when "AIDexterAction_DomainCode" in ('bookings', 'booking') then '["Bookings.Write"]'::jsonb
    when "AIDexterAction_DomainCode" in ('customs_declarations', 'customs') then '["Customs.Write"]'::jsonb
    when "AIDexterAction_DomainCode" in ('warehouse', 'warehouse_reference', 'purchase_orders') then '["Warehouse.Write"]'::jsonb
    else "AIDexterAction_RequiredPermissionsJSON"
  end,
  "AIDexterAction_IntentFamily" = coalesce("AIDexterAction_IntentFamily", "AIDexterAction_Code"),
  "AIDexterAction_HasExternalEffect" = "AIDexterAction_Code" in (
    'create_email_draft', 'send_email', 'attach_email_document_to_customer', 'submit_customs_declaration',
    'receive_warehouse_order', 'dispatch_warehouse_order', 'cancel_warehouse_order',
    'quarantine_inventory', 'change_warehouse_inventory_status', 'move_warehouse_inventory',
    'move_warehouse_handling_unit', 'report_warehouse_location_empty'
  );

update public."sys_AIDexterActions"
set "AIDexterAction_Description"='Submit one exact validated provider draft. Approve mode prepares it for review; Full access may submit once only when the operator explicitly requests submission in the current conversation.'
where "AIDexterAction_Code"='submit_customs_declaration';

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_RequiredPermissionsJSON" = case
  when "AIDexterWatchCapability_Code" = 'email' then '["Email.Read","Email.AIRead"]'::jsonb
  when "AIDexterWatchCapability_Code" in ('leads', 'deals', 'customers') then '["CRM.Read"]'::jsonb
  when "AIDexterWatchCapability_Code" = 'quotes' then '["Quotes.Read"]'::jsonb
  when "AIDexterWatchCapability_Code" in ('bookings', 'booking') then '["Bookings.Read"]'::jsonb
  when "AIDexterWatchCapability_Code" in ('customs_declarations', 'customs') then '["Customs.Read"]'::jsonb
  when "AIDexterWatchCapability_Code" in ('warehouse', 'warehouse_reference', 'purchase_orders') then '["Warehouse.Read"]'::jsonb
  else "AIDexterWatchCapability_RequiredPermissionsJSON"
end;

create or replace function public._multideck_dexter_has_permissions(p_user_id uuid, p_permissions jsonb)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_typeof(coalesce(p_permissions, '[]'::jsonb)) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(p_permissions, '[]'::jsonb)) required(permission)
      where not public._multideck_dexter_has_permission(p_user_id, required.permission)
    );
$$;

revoke all on function public._multideck_dexter_has_permissions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._multideck_dexter_has_permissions(uuid, jsonb) to service_role;

create table if not exists public."AI_DexterConversationGrants" (
  "AIDexterGrant_ID" uuid primary key default gen_random_uuid(),
  "AIDexterGrant_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterGrant_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterGrant_ConversationID" uuid references public."AI_Conversations"("AICNV_ID") on delete cascade,
  "AIDexterGrant_ClientSessionID" uuid not null,
  "AIDexterGrant_Mode" text not null check ("AIDexterGrant_Mode" in ('full')),
  "AIDexterGrant_Status" text not null default 'active' check ("AIDexterGrant_Status" in ('active','revoked','expired')),
  "AIDexterGrant_ExpiresAt" timestamptz not null,
  "AIDexterGrant_CreatedAt" timestamptz not null default now(),
  "AIDexterGrant_RevokedAt" timestamptz
);

create unique index if not exists "AI_DexterConversationGrants_active_session"
  on public."AI_DexterConversationGrants" ("AIDexterGrant_UserID", "AIDexterGrant_ClientSessionID")
  where "AIDexterGrant_Status" = 'active';

create table if not exists public."AI_DexterIntentPlans" (
  "AIDexterIntent_ID" uuid primary key default gen_random_uuid(),
  "AIDexterIntent_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterIntent_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterIntent_ConversationID" uuid references public."AI_Conversations"("AICNV_ID") on delete cascade,
  "AIDexterIntent_ClientSessionID" uuid not null,
  "AIDexterIntent_PromptSHA256" text not null check ("AIDexterIntent_PromptSHA256" ~ '^[0-9a-f]{64}$'),
  "AIDexterIntent_AllowedActionsJSON" jsonb not null default '[]'::jsonb,
  "AIDexterIntent_TargetConstraintsJSON" jsonb not null default '[]'::jsonb,
  "AIDexterIntent_RecipientConstraintsJSON" jsonb not null default '[]'::jsonb,
  "AIDexterIntent_Specialist" text not null,
  "AIDexterIntent_AccessMode" text not null check ("AIDexterIntent_AccessMode" in ('approve','full')),
  "AIDexterIntent_ExpiresAt" timestamptz not null,
  "AIDexterIntent_CreatedAt" timestamptz not null default now()
);

create table if not exists public."AI_DexterPreparedActions" (
  "AIDexterPrepared_ID" uuid primary key default gen_random_uuid(),
  "AIDexterPrepared_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterPrepared_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterPrepared_ConversationID" uuid references public."AI_Conversations"("AICNV_ID") on delete cascade,
  "AIDexterPrepared_ClientSessionID" uuid not null,
  "AIDexterPrepared_IntentID" uuid not null references public."AI_DexterIntentPlans"("AIDexterIntent_ID") on delete cascade,
  "AIDexterPrepared_GrantID" uuid references public."AI_DexterConversationGrants"("AIDexterGrant_ID") on delete set null,
  "AIDexterPrepared_ActionCode" text not null references public."sys_AIDexterActions"("AIDexterAction_Code"),
  "AIDexterPrepared_ArgumentsJSON" jsonb not null,
  "AIDexterPrepared_TargetID" uuid,
  "AIDexterPrepared_TargetJSON" jsonb not null default '{}'::jsonb,
  "AIDexterPrepared_Title" text not null,
  "AIDexterPrepared_Description" text not null,
  "AIDexterPrepared_ChangesJSON" jsonb not null default '[]'::jsonb,
  "AIDexterPrepared_AccessMode" text not null check ("AIDexterPrepared_AccessMode" in ('approve','full')),
  "AIDexterPrepared_Status" text not null default 'prepared' check ("AIDexterPrepared_Status" in ('prepared','executing','succeeded','failed','declined','expired')),
  "AIDexterPrepared_IdempotencyKey" uuid not null default gen_random_uuid(),
  "AIDexterPrepared_ResultJSON" jsonb,
  "AIDexterPrepared_ErrorCode" text,
  "AIDexterPrepared_ErrorMessage" text,
  "AIDexterPrepared_ExpiresAt" timestamptz not null,
  "AIDexterPrepared_CreatedAt" timestamptz not null default now(),
  "AIDexterPrepared_AttemptedAt" timestamptz,
  "AIDexterPrepared_CompletedAt" timestamptz,
  unique ("AIDexterPrepared_IdempotencyKey")
);

alter table public."AI_DexterIntentPlans"
  add column if not exists "AIDexterIntent_RecipientConstraintsJSON" jsonb not null default '[]'::jsonb;

alter table public."AI_DexterPreparedActions"
  add column if not exists "AIDexterPrepared_TargetJSON" jsonb not null default '{}'::jsonb;

create index if not exists "IX_AI_DexterPreparedActions_owner_status"
  on public."AI_DexterPreparedActions" ("AIDexterPrepared_CompanyID", "AIDexterPrepared_UserID", "AIDexterPrepared_Status", "AIDexterPrepared_CreatedAt" desc);

create table if not exists public."AI_DexterModelEgressAudit" (
  "AIDexterEgress_ID" uuid primary key default gen_random_uuid(),
  "AIDexterEgress_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterEgress_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "AIDexterEgress_ConversationID" uuid references public."AI_Conversations"("AICNV_ID") on delete set null,
  "AIDexterEgress_Provider" text not null,
  "AIDexterEgress_Model" text not null,
  "AIDexterEgress_Purpose" text not null,
  "AIDexterEgress_DataCategoriesJSON" jsonb not null default '[]'::jsonb,
  "AIDexterEgress_RecordCount" integer not null default 0,
  "AIDexterEgress_ByteCount" bigint not null default 0,
  "AIDexterEgress_InputUnits" integer not null default 0,
  "AIDexterEgress_OutputUnits" integer not null default 0,
  "AIDexterEgress_EstimatedCostGBP" numeric(12,6) not null default 0,
  "AIDexterEgress_ActualCostGBP" numeric(12,6),
  "AIDexterEgress_ProviderRequestID" text,
  "AIDexterEgress_Outcome" text not null check ("AIDexterEgress_Outcome" in ('attempted','succeeded','failed','denied')),
  "AIDexterEgress_ErrorCode" text,
  "AIDexterEgress_CreatedAt" timestamptz not null default now(),
  "AIDexterEgress_CompletedAt" timestamptz
);

create table if not exists public."AI_DexterSecurityEvents" (
  "AIDexterSecurityEvent_ID" uuid primary key default gen_random_uuid(),
  "AIDexterSecurityEvent_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "AIDexterSecurityEvent_UserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "AIDexterSecurityEvent_Kind" text not null,
  "AIDexterSecurityEvent_Severity" text not null check ("AIDexterSecurityEvent_Severity" in ('info','warning','high')),
  "AIDexterSecurityEvent_MetadataJSON" jsonb not null default '{}'::jsonb,
  "AIDexterSecurityEvent_CreatedAt" timestamptz not null default now()
);

alter table public."AI_DexterActionAudit"
  add column if not exists "AIDexterAudit_PreparedActionID" uuid references public."AI_DexterPreparedActions"("AIDexterPrepared_ID") on delete set null,
  add column if not exists "AIDexterAudit_IntentID" uuid references public."AI_DexterIntentPlans"("AIDexterIntent_ID") on delete set null,
  add column if not exists "AIDexterAudit_ConversationID" uuid references public."AI_Conversations"("AICNV_ID") on delete set null,
  add column if not exists "AIDexterAudit_Status" text not null default 'succeeded',
  add column if not exists "AIDexterAudit_IdempotencyKey" uuid,
  add column if not exists "AIDexterAudit_ErrorCode" text,
  add column if not exists "AIDexterAudit_ErrorMessage" text,
  add column if not exists "AIDexterAudit_AttemptedAt" timestamptz,
  add column if not exists "AIDexterAudit_CompletedAt" timestamptz;

alter table public."AI_DexterConversationGrants" enable row level security;
alter table public."AI_DexterIntentPlans" enable row level security;
alter table public."AI_DexterPreparedActions" enable row level security;
alter table public."AI_DexterModelEgressAudit" enable row level security;
alter table public."AI_DexterSecurityEvents" enable row level security;
revoke all on public."AI_DexterConversationGrants", public."AI_DexterIntentPlans", public."AI_DexterPreparedActions", public."AI_DexterModelEgressAudit", public."AI_DexterSecurityEvents" from public, anon, authenticated;
grant select, insert, update, delete on public."AI_DexterConversationGrants", public."AI_DexterIntentPlans", public."AI_DexterPreparedActions", public."AI_DexterModelEgressAudit", public."AI_DexterSecurityEvents" to service_role;

create or replace function public._multideck_dexter_security_event_notify()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if new."AIDexterSecurityEvent_Severity" in ('warning','high') then
    perform pg_notify('dexter_security_alert',jsonb_build_object('id',new."AIDexterSecurityEvent_ID",'companyId',new."AIDexterSecurityEvent_CompanyID",'kind',new."AIDexterSecurityEvent_Kind",'severity',new."AIDexterSecurityEvent_Severity")::text);
  end if;
  return new;
end $$;
drop trigger if exists "TR_AI_DexterSecurityEvents_notify" on public."AI_DexterSecurityEvents";
create trigger "TR_AI_DexterSecurityEvents_notify" after insert on public."AI_DexterSecurityEvents" for each row execute function public._multideck_dexter_security_event_notify();

create or replace function public._multideck_dexter_egress_anomaly_alert()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if new."AIDexterEgress_ByteCount">5*1024*1024 or new."AIDexterEgress_RecordCount">100 then
    insert into public."AI_DexterSecurityEvents"(
      "AIDexterSecurityEvent_CompanyID","AIDexterSecurityEvent_UserID","AIDexterSecurityEvent_Kind",
      "AIDexterSecurityEvent_Severity","AIDexterSecurityEvent_MetadataJSON"
    ) values(new."AIDexterEgress_CompanyID",new."AIDexterEgress_UserID",'abnormal_provider_egress','high',
      jsonb_build_object('egressId',new."AIDexterEgress_ID",'provider',new."AIDexterEgress_Provider",'purpose',new."AIDexterEgress_Purpose",
        'recordCount',new."AIDexterEgress_RecordCount",'byteCount',new."AIDexterEgress_ByteCount"));
  end if;
  return new;
end $$;
drop trigger if exists "TR_AI_DexterModelEgressAudit_anomaly" on public."AI_DexterModelEgressAudit";
create trigger "TR_AI_DexterModelEgressAudit_anomaly" after insert on public."AI_DexterModelEgressAudit"
for each row execute function public._multideck_dexter_egress_anomaly_alert();

create or replace function public._multideck_dexter_action_volume_alert()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_count integer;
begin
  if new."AIDexterAudit_Status"='attempted' then
    select count(*) into v_count from public."AI_DexterActionAudit" a
    where a."AIDexterAudit_CompanyID"=new."AIDexterAudit_CompanyID" and a."AIDexterAudit_UserID"=new."AIDexterAudit_UserID"
      and a."AIDexterAudit_Status"='attempted' and a."AIDexterAudit_AttemptedAt">now()-interval '10 minutes';
    if v_count>=25 and (v_count=25 or mod(v_count,25)=0) then
      insert into public."AI_DexterSecurityEvents"(
        "AIDexterSecurityEvent_CompanyID","AIDexterSecurityEvent_UserID","AIDexterSecurityEvent_Kind",
        "AIDexterSecurityEvent_Severity","AIDexterSecurityEvent_MetadataJSON"
      ) values(new."AIDexterAudit_CompanyID",new."AIDexterAudit_UserID",'unusual_action_volume','high',
        jsonb_build_object('actionCount',v_count,'windowMinutes',10));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists "TR_AI_DexterActionAudit_volume" on public."AI_DexterActionAudit";
create trigger "TR_AI_DexterActionAudit_volume" after insert on public."AI_DexterActionAudit"
for each row execute function public._multideck_dexter_action_volume_alert();

create or replace function public.multideck_dexter_reserve_model_egress(
  p_company_id uuid, p_user_id uuid, p_conversation_id uuid, p_provider text, p_model text,
  p_purpose text, p_data_categories jsonb, p_record_count integer, p_byte_count bigint,
  p_estimated_input_units integer, p_estimated_output_units integer
) returns uuid language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_id uuid:=gen_random_uuid(); v_state jsonb; v_estimated numeric; v_remaining numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 719));
  if not exists (select 1 from public."cmp_Users" u where u."User_ID"=p_user_id and u."Company_ID"=p_company_id and coalesce(u."User_AccessStatus",'active')='active') then
    raise exception 'operator_unavailable' using errcode='42501';
  end if;
  if p_purpose in ('document_ocr','invoice_ocr') and (select count(*) from public."AI_DexterModelEgressAudit"
    where "AIDexterEgress_UserID"=p_user_id and "AIDexterEgress_Purpose" in ('document_ocr','invoice_ocr')
      and "AIDexterEgress_Outcome"='attempted' and "AIDexterEgress_CreatedAt">now()-interval '3 minutes') >= 2 then
    raise exception 'ocr_concurrency_limit' using errcode='P0001';
  end if;
  v_estimated:=case when lower(p_provider)='mistral' then greatest(p_estimated_input_units,1)*0.002
    else public._multideck_dexter_estimated_usage_gbp(case when lower(p_model) like '%terra%' then 'worker' else 'fast' end,p_estimated_input_units,p_estimated_output_units) end;
  v_state:=public._multideck_dexter_allowance_state(p_company_id);
  if not coalesce((v_state->>'usageAllowed')::boolean,false) then raise exception 'usage_allowance_reached' using errcode='P0001'; end if;
  v_remaining:=greatest(coalesce((v_state->>'includedUsageRemainingGbp')::numeric,0),0)
    + case when coalesce((v_state->>'extraUsageEnabled')::boolean,false)
      then coalesce((v_state->>'extraUsageRemainingGbp')::numeric,1000000000) else 0 end;
  if v_estimated>v_remaining then raise exception 'usage_allowance_reached' using errcode='P0001'; end if;
  insert into public."AI_DexterModelEgressAudit"(
    "AIDexterEgress_ID","AIDexterEgress_CompanyID","AIDexterEgress_UserID","AIDexterEgress_ConversationID",
    "AIDexterEgress_Provider","AIDexterEgress_Model","AIDexterEgress_Purpose","AIDexterEgress_DataCategoriesJSON",
    "AIDexterEgress_RecordCount","AIDexterEgress_ByteCount","AIDexterEgress_InputUnits","AIDexterEgress_OutputUnits",
    "AIDexterEgress_EstimatedCostGBP","AIDexterEgress_Outcome"
  ) values(v_id,p_company_id,p_user_id,p_conversation_id,lower(p_provider),left(p_model,120),left(p_purpose,80),coalesce(p_data_categories,'[]'),
    greatest(coalesce(p_record_count,0),0),greatest(coalesce(p_byte_count,0),0),greatest(coalesce(p_estimated_input_units,0),0),
    greatest(coalesce(p_estimated_output_units,0),0),v_estimated,'attempted');
  return v_id;
end $$;

create or replace function public.multideck_dexter_settle_model_egress(
  p_reservation_id uuid,p_company_id uuid,p_user_id uuid,p_outcome text,p_provider_request_id text,
  p_input_units integer,p_output_units integer,p_error_code text
) returns void language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_row public."AI_DexterModelEgressAudit"; v_cost numeric;
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  select * into v_row from public."AI_DexterModelEgressAudit" where "AIDexterEgress_ID"=p_reservation_id
    and "AIDexterEgress_CompanyID"=p_company_id and "AIDexterEgress_UserID"=p_user_id for update;
  if not found or v_row."AIDexterEgress_Outcome" <> 'attempted' then return; end if;
  if v_row."AIDexterEgress_Provider"='mistral' then v_cost:=greatest(coalesce(p_input_units,0),0)*0.002;
  else v_cost:=public._multideck_dexter_estimated_usage_gbp(case when lower(v_row."AIDexterEgress_Model") like '%terra%' then 'worker' else 'fast' end,p_input_units,p_output_units); end if;
  update public."AI_DexterModelEgressAudit" set
    "AIDexterEgress_InputUnits"=greatest(coalesce(p_input_units,0),0),"AIDexterEgress_OutputUnits"=greatest(coalesce(p_output_units,0),0),
    "AIDexterEgress_ActualCostGBP"=v_cost,"AIDexterEgress_ProviderRequestID"=nullif(left(p_provider_request_id,240),''),
    "AIDexterEgress_Outcome"=case when p_outcome in ('succeeded','failed','denied') then p_outcome else 'failed' end,
    "AIDexterEgress_ErrorCode"=nullif(left(p_error_code,120),''),"AIDexterEgress_CompletedAt"=now()
  where "AIDexterEgress_ID"=p_reservation_id;
end $$;

revoke all on function public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer) from public,anon,authenticated;
revoke all on function public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer) to service_role;
grant execute on function public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text) to service_role;

-- The immutable provider egress ledger, not browser-supplied message token
-- fields, is the commercial allowance source of truth.
create or replace function public._multideck_dexter_allowance_state(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_plan text:='25'; v_included numeric:=350; v_payg_configured boolean:=false; v_billing_ready boolean:=false;
  v_payg_enabled boolean:=false; v_payg_limit numeric:=null; v_payg_rate numeric:=1; v_usage numeric:=0;
  v_extra numeric:=0; v_percent numeric:=0; v_allowed boolean:=true; v_status text:='included';
begin
  select p."AIUsagePolicy_PlanCode",p."AIUsagePolicy_IncludedGbp",p."AIUsagePolicy_PayAsYouGoEnabled",p."AIUsagePolicy_BillingReady",
    p."AIUsagePolicy_ExtraUsageLimitGbp",p."AIUsagePolicy_ExtraUsageRateMultiplier"
  into v_plan,v_included,v_payg_configured,v_billing_ready,v_payg_limit,v_payg_rate
  from public."AI_DexterUsagePolicies" p where p."AIUsagePolicy_CompanyID"=p_company_id;
  v_plan:=coalesce(v_plan,'25'); v_included:=coalesce(v_included,350); v_payg_configured:=coalesce(v_payg_configured,false);
  v_billing_ready:=coalesce(v_billing_ready,false); v_payg_rate:=coalesce(v_payg_rate,1); v_payg_enabled:=v_payg_configured and v_billing_ready;
  select coalesce(sum(coalesce(e."AIDexterEgress_ActualCostGBP",e."AIDexterEgress_EstimatedCostGBP")),0) into v_usage
  from public."AI_DexterModelEgressAudit" e where e."AIDexterEgress_CompanyID"=p_company_id
    and e."AIDexterEgress_CreatedAt">=date_trunc('month',now()) and e."AIDexterEgress_CreatedAt"<date_trunc('month',now())+interval '1 month';
  v_usage:=round(coalesce(v_usage,0),6); v_extra:=round(greatest(v_usage-v_included,0)*v_payg_rate,6);
  v_percent:=case when v_included>0 then round((v_usage/v_included)*100,2) else 100 end;
  v_allowed:=v_usage<v_included or (v_payg_enabled and (v_payg_limit is null or v_extra<v_payg_limit));
  v_status:=case when v_usage<=0 then 'unused' when v_usage<v_included*0.8 then 'included' when v_usage<v_included then 'near_limit'
    when not v_payg_enabled then 'paused' when v_payg_limit is not null and v_extra>=v_payg_limit then 'extra_limit_reached' else 'extra_usage' end;
  return jsonb_build_object('planCode',v_plan,'currency','GBP','includedUsageGbp',v_included,'usageGbp',v_usage,
    'includedUsageRemainingGbp',greatest(v_included-v_usage,0),'includedUsagePercent',v_percent,'extraUsageConfigured',v_payg_configured,
    'billingReady',v_billing_ready,'extraUsageEnabled',v_payg_enabled,'extraUsageGbp',v_extra,'extraUsageLimitGbp',v_payg_limit,
    'extraUsageRemainingGbp',case when v_payg_limit is null then null else greatest(v_payg_limit-v_extra,0) end,
    'usageStatus',v_status,'usageAllowed',v_allowed);
end $$;

create or replace function public.multideck_dexter_list_domains()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', domain."AIDexterDomain_Code", 'name', domain."AIDexterDomain_Name",
    'description', domain."AIDexterDomain_Description", 'dataCategories', domain."AIDexterDomain_DataCategoriesJSON"
  ) order by domain."AIDexterDomain_SortOrder", domain."AIDexterDomain_Name"), '[]'::jsonb)
  into v_result from public."sys_AIDexterDataDomains" domain
  where domain."AIDexterDomain_IsActive"
    and public._multideck_dexter_has_permissions(v_context.user_id, domain."AIDexterDomain_RequiredPermissionsJSON");
  return v_result;
end; $$;

create or replace function public.multideck_dexter_query_domain(p_domain text, p_search text default null, p_take integer default 10)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_code text:=lower(btrim(coalesce(p_domain,''))); v_query_function text; v_required jsonb; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select domain."AIDexterDomain_QueryFunction", domain."AIDexterDomain_RequiredPermissionsJSON"
  into v_query_function, v_required from public."sys_AIDexterDataDomains" domain
  where domain."AIDexterDomain_Code"=v_code and domain."AIDexterDomain_IsActive";
  if v_query_function is null then raise exception 'That Dexter data domain is not available in this workspace.' using errcode='22023'; end if;
  if not public._multideck_dexter_has_permissions(v_context.user_id, v_required) then
    raise exception 'You do not have permission to read that workspace data.' using errcode='42501';
  end if;
  execute format('select public.%I($1,$2,$3)', v_query_function) into v_result
    using v_context.company_id, nullif(btrim(p_search),''), greatest(1,least(coalesce(p_take,10),25));
  return jsonb_build_object('domain',v_code,'data',coalesce(v_result,'[]'::jsonb));
end; $$;

create or replace function public.multideck_dexter_list_actions()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_can_manage(v_context.user_id) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',action."AIDexterAction_Code", 'domain',action."AIDexterAction_DomainCode",
    'name',action."AIDexterAction_Name", 'description',action."AIDexterAction_Description",
    'parameters',action."AIDexterAction_ParametersJSON", 'intentFamily',action."AIDexterAction_IntentFamily",
    'externalEffect',action."AIDexterAction_HasExternalEffect"
  ) order by action."AIDexterAction_SortOrder",action."AIDexterAction_Name"), '[]'::jsonb)
  into v_result from public."sys_AIDexterActions" action
  join public."sys_AIDexterDataDomains" domain on domain."AIDexterDomain_Code"=action."AIDexterAction_DomainCode" and domain."AIDexterDomain_IsActive"
  where action."AIDexterAction_IsActive"
    and public._multideck_dexter_has_permissions(v_context.user_id, domain."AIDexterDomain_RequiredPermissionsJSON")
    and public._multideck_dexter_has_permissions(v_context.user_id, action."AIDexterAction_RequiredPermissionsJSON");
  return v_result;
end; $$;

create or replace function public.multideck_dexter_list_watch_capabilities()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',capability."AIDexterWatchCapability_Code", 'name',capability."AIDexterWatchCapability_Name",
    'description',capability."AIDexterWatchCapability_Description", 'fields',capability."AIDexterWatchCapability_FieldsJSON"
  ) order by capability."AIDexterWatchCapability_SortOrder"), '[]'::jsonb)
  into v_result from public."sys_AIDexterWatchCapabilities" capability
  where capability."AIDexterWatchCapability_IsActive"
    and public._multideck_dexter_has_permissions(v_context.user_id, capability."AIDexterWatchCapability_RequiredPermissionsJSON");
  return v_result;
end; $$;

create or replace function public.multideck_dexter_create_watch(
  p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,auth as $$
declare v_context record; v_watch public."AI_DexterWatches"; v_capability text:=lower(btrim(p_capability)); v_fields jsonb; v_required jsonb; v_field text;
begin
  select * into v_context from public._multideck_dexter_context();
  select c."AIDexterWatchCapability_FieldsJSON",c."AIDexterWatchCapability_RequiredPermissionsJSON" into v_fields,v_required
  from public."sys_AIDexterWatchCapabilities" c where c."AIDexterWatchCapability_Code"=v_capability and c."AIDexterWatchCapability_IsActive";
  if v_fields is null then raise exception 'That source cannot be watched yet.' using errcode='22023'; end if;
  if not public._multideck_dexter_has_permissions(v_context.user_id,v_required) then raise exception 'You do not have permission to watch that source.' using errcode='42501'; end if;
  if v_capability='customs_declarations' and (p_target_id is null or not exists(
    select 1 from public."Customs_Declarations" d where d."CUST_id"=p_target_id and d."CUST_CreatedBy"=auth.uid() and not d."CUST_IsDeleted"
  )) then raise exception 'Choose an exact Customs declaration that you own before creating this watch.' using errcode='42501'; end if;
  if jsonb_typeof(p_rule)<>'object' then raise exception 'The watch rule is invalid.' using errcode='22023'; end if;
  v_field:=p_rule->>'field';
  if v_field is null or not v_fields?v_field then raise exception 'That field cannot be watched.' using errcode='22023'; end if;
  if coalesce(p_rule->>'operator','') not in ('changed','eq','neq','contains','contains_all','gt','gte','lt','lte') then raise exception 'That watch condition is not supported.' using errcode='22023'; end if;
  if p_action is not null and not exists(
    select 1 from public."sys_AIDexterActions" a where a."AIDexterAction_Code"=p_action->>'action'
      and a."AIDexterAction_DomainCode"=v_capability and a."AIDexterAction_IsActive"
      and public._multideck_dexter_has_permissions(v_context.user_id,a."AIDexterAction_RequiredPermissionsJSON")
  ) then raise exception 'That prepared action is not available for this watch.' using errcode='42501'; end if;
  insert into public."AI_DexterWatches"(
    "AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title",
    "AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_TargetLabel","AIDexterWatch_RuleJSON","AIDexterWatch_ActionJSON"
  ) values(v_context.company_id,v_context.user_id,v_capability,left(btrim(p_title),180),left(btrim(p_summary),2000),left(btrim(p_request),4000),
    p_target_id,nullif(left(btrim(p_target_label),240),''),p_rule,p_action) returning * into v_watch;
  return jsonb_build_object('id',v_watch."AIDexterWatch_ID",'title',v_watch."AIDexterWatch_Title",'summary',v_watch."AIDexterWatch_Summary",
    'capability',v_watch."AIDexterWatch_CapabilityCode",'status',v_watch."AIDexterWatch_StatusCode",'targetLabel',v_watch."AIDexterWatch_TargetLabel",
    'rule',v_watch."AIDexterWatch_RuleJSON",'action',v_watch."AIDexterWatch_ActionJSON",'createdAt',v_watch."AIDexterWatch_CreatedAt",
    'updatedAt',v_watch."AIDexterWatch_UpdatedAt",'triggerCount',v_watch."AIDexterWatch_TriggerCount");
end $$;

revoke all on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.multideck_dexter_create_watch(text,text,text,text,uuid,text,jsonb,jsonb) to authenticated;

-- The legacy argument-taking execution functions are no longer browser APIs.
-- Older tenant projects may never have received one or both legacy functions.
-- Keep the hardening migration portable without widening the rollout to unrelated
-- historical migrations.
do $$
begin
  if to_regprocedure('public.multideck_dexter_execute_action(text,jsonb,text)') is not null then
    execute 'revoke execute on function public.multideck_dexter_execute_action(text,jsonb,text) from authenticated';
  end if;
  if to_regprocedure('public.multideck_dexter_record_external_action(text,jsonb,text,jsonb)') is not null then
    execute 'revoke execute on function public.multideck_dexter_record_external_action(text,jsonb,text,jsonb) from authenticated';
  end if;
end $$;

create or replace function public._multideck_dexter_deny_prepared_action(
  p_prepared_action_id uuid,p_company_id uuid,p_user_id uuid,p_code text,p_message text,p_event_kind text
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_prepared public."AI_DexterPreparedActions";
begin
  select * into v_prepared from public."AI_DexterPreparedActions" p
  where p."AIDexterPrepared_ID"=p_prepared_action_id
    and p."AIDexterPrepared_CompanyID"=p_company_id and p."AIDexterPrepared_UserID"=p_user_id;
  insert into public."AI_DexterSecurityEvents"(
    "AIDexterSecurityEvent_CompanyID","AIDexterSecurityEvent_UserID","AIDexterSecurityEvent_Kind",
    "AIDexterSecurityEvent_Severity","AIDexterSecurityEvent_MetadataJSON"
  ) values(p_company_id,p_user_id,left(coalesce(p_event_kind,'prepared_action_denied'),80),
    case when p_event_kind in ('target_substitution_denied','recipient_substitution_denied','cross_scope_action_denied') then 'high' else 'warning' end,
    jsonb_build_object('preparedActionId',p_prepared_action_id,'actionCode',v_prepared."AIDexterPrepared_ActionCode",'code',left(coalesce(p_code,'denied'),100)));
  if v_prepared."AIDexterPrepared_ID" is not null then
    insert into public."AI_DexterActionAudit"(
      "AIDexterAudit_CompanyID","AIDexterAudit_UserID","AIDexterAudit_ActionCode","AIDexterAudit_AccessMode",
      "AIDexterAudit_ArgumentsJSON","AIDexterAudit_ResultJSON","AIDexterAudit_PreparedActionID","AIDexterAudit_IntentID",
      "AIDexterAudit_ConversationID","AIDexterAudit_Status","AIDexterAudit_IdempotencyKey","AIDexterAudit_ErrorCode",
      "AIDexterAudit_ErrorMessage","AIDexterAudit_AttemptedAt","AIDexterAudit_CompletedAt"
    ) values(p_company_id,p_user_id,v_prepared."AIDexterPrepared_ActionCode",v_prepared."AIDexterPrepared_AccessMode",
      '{}'::jsonb,'{}'::jsonb,p_prepared_action_id,v_prepared."AIDexterPrepared_IntentID",v_prepared."AIDexterPrepared_ConversationID",
      'denied',v_prepared."AIDexterPrepared_IdempotencyKey",left(coalesce(p_code,'denied'),100),left(coalesce(p_message,'Action denied.'),500),now(),now());
  end if;
  return jsonb_build_object('ok',false,'error',jsonb_build_object('code',left(coalesce(p_code,'denied'),100),'message',left(coalesce(p_message,'Action denied.'),500)));
end $$;

revoke all on function public._multideck_dexter_deny_prepared_action(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;

create or replace function public.multideck_dexter_claim_external_prepared_action(
  p_prepared_action_id uuid,p_company_id uuid,p_user_id uuid,p_conversation_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,auth as $$
declare
  v_prepared public."AI_DexterPreparedActions";
  v_intent public."AI_DexterIntentPlans";
  v_required jsonb; v_domain_required jsonb; v_recipient_count integer:=0; v_recipients_allowed boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  select * into v_prepared from public."AI_DexterPreparedActions" p
  where p."AIDexterPrepared_ID"=p_prepared_action_id and p."AIDexterPrepared_CompanyID"=p_company_id
    and p."AIDexterPrepared_UserID"=p_user_id
    and p."AIDexterPrepared_ConversationID" is not distinct from p_conversation_id for update;
  if not found then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'prepared_action_unavailable','That prepared action is unavailable.','prepared_action_missing');
  end if;
  if v_prepared."AIDexterPrepared_Status"<>'prepared' then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'prepared_action_replayed','That prepared action has already been used.','prepared_action_replay_denied');
  end if;
  if v_prepared."AIDexterPrepared_ExpiresAt"<=now() then
    update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='expired',"AIDexterPrepared_CompletedAt"=now()
    where "AIDexterPrepared_ID"=p_prepared_action_id;
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'prepared_action_expired','That prepared action has expired.','prepared_action_replay_denied');
  end if;
  if not exists(select 1 from public."cmp_Users" u where u."User_ID"=p_user_id and u."Company_ID"=p_company_id
    and coalesce(u."User_AccessStatus",'active')='active') or not public._multideck_dexter_can_manage(p_user_id) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'permission_denied','You no longer have permission to let Dexter change workspace data.','permission_denied');
  end if;
  if v_prepared."AIDexterPrepared_ConversationID" is not null and not exists(
    select 1 from public."AI_Conversations" c where c."AICNV_ID"=v_prepared."AIDexterPrepared_ConversationID"
      and c."AICNV_CompanyID"=p_company_id and c."AICNV_OwnerUserID"=p_user_id and c."AICNV_Channel"='chat' and c."AICNV_EndedAt" is null
  ) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'conversation_unavailable','That conversation is no longer active.','cross_scope_action_denied');
  end if;
  select * into v_intent from public."AI_DexterIntentPlans" i where i."AIDexterIntent_ID"=v_prepared."AIDexterPrepared_IntentID"
    and i."AIDexterIntent_CompanyID"=p_company_id and i."AIDexterIntent_UserID"=p_user_id
    and i."AIDexterIntent_ClientSessionID"=v_prepared."AIDexterPrepared_ClientSessionID"
    and i."AIDexterIntent_ConversationID" is not distinct from v_prepared."AIDexterPrepared_ConversationID"
    and i."AIDexterIntent_AccessMode"=v_prepared."AIDexterPrepared_AccessMode" and i."AIDexterIntent_ExpiresAt">now();
  if not found or not coalesce(v_intent."AIDexterIntent_AllowedActionsJSON",'[]'::jsonb)?v_prepared."AIDexterPrepared_ActionCode" then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'intent_mismatch','That action no longer matches the operator request.','intent_mismatch');
  end if;
  if v_prepared."AIDexterPrepared_AccessMode"='full' and v_prepared."AIDexterPrepared_TargetID" is not null
    and not coalesce(v_intent."AIDexterIntent_TargetConstraintsJSON",'[]'::jsonb)?v_prepared."AIDexterPrepared_TargetID"::text then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'target_outside_operator_intent','That target was not authorised by the operator.','target_substitution_denied');
  end if;
  if v_prepared."AIDexterPrepared_AccessMode"='full' and v_prepared."AIDexterPrepared_ActionCode" in ('create_email_draft','send_email') then
    select count(*),coalesce(bool_and(coalesce(v_intent."AIDexterIntent_RecipientConstraintsJSON",'[]'::jsonb)?lower(btrim(item->>'address'))),false)
    into v_recipient_count,v_recipients_allowed from (
      select item from jsonb_array_elements(case when jsonb_typeof(v_prepared."AIDexterPrepared_ArgumentsJSON"#>'{draft,to}')='array' then v_prepared."AIDexterPrepared_ArgumentsJSON"#>'{draft,to}' else '[]'::jsonb end) item
      union all select item from jsonb_array_elements(case when jsonb_typeof(v_prepared."AIDexterPrepared_ArgumentsJSON"#>'{draft,cc}')='array' then v_prepared."AIDexterPrepared_ArgumentsJSON"#>'{draft,cc}' else '[]'::jsonb end) item
      union all select item from jsonb_array_elements(case when jsonb_typeof(v_prepared."AIDexterPrepared_ArgumentsJSON"#>'{draft,bcc}')='array' then v_prepared."AIDexterPrepared_ArgumentsJSON"#>'{draft,bcc}' else '[]'::jsonb end) item
    ) recipients where nullif(btrim(item->>'address'),'') is not null;
    if v_recipient_count=0 or not v_recipients_allowed then
      return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'recipient_outside_operator_intent','That recipient was not authorised by the operator.','recipient_substitution_denied');
    end if;
  end if;
  if v_prepared."AIDexterPrepared_AccessMode"='full' and not exists(
    select 1 from public."AI_DexterConversationGrants" g where g."AIDexterGrant_ID"=v_prepared."AIDexterPrepared_GrantID"
      and g."AIDexterGrant_CompanyID"=p_company_id and g."AIDexterGrant_UserID"=p_user_id
      and g."AIDexterGrant_ClientSessionID"=v_prepared."AIDexterPrepared_ClientSessionID" and g."AIDexterGrant_Status"='active'
      and g."AIDexterGrant_ExpiresAt">now() and g."AIDexterGrant_ConversationID" is not distinct from v_prepared."AIDexterPrepared_ConversationID"
  ) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'full_access_expired','Full access is no longer active for this conversation.','full_access_replay_denied');
  end if;
  select a."AIDexterAction_RequiredPermissionsJSON",d."AIDexterDomain_RequiredPermissionsJSON"
  into v_required,v_domain_required from public."sys_AIDexterActions" a
  join public."sys_AIDexterDataDomains" d on d."AIDexterDomain_Code"=a."AIDexterAction_DomainCode" and d."AIDexterDomain_IsActive"
  where a."AIDexterAction_Code"=v_prepared."AIDexterPrepared_ActionCode" and a."AIDexterAction_IsActive";
  if not found or not public._multideck_dexter_has_permissions(p_user_id,v_required)
    or not public._multideck_dexter_has_permissions(p_user_id,v_domain_required) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,p_company_id,p_user_id,'permission_denied','You no longer have permission to run that Dexter action.','permission_denied');
  end if;
  update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='executing',"AIDexterPrepared_AttemptedAt"=now()
  where "AIDexterPrepared_ID"=p_prepared_action_id returning * into v_prepared;
  insert into public."AI_DexterActionAudit"(
    "AIDexterAudit_CompanyID","AIDexterAudit_UserID","AIDexterAudit_ActionCode","AIDexterAudit_AccessMode",
    "AIDexterAudit_ArgumentsJSON","AIDexterAudit_ResultJSON","AIDexterAudit_PreparedActionID","AIDexterAudit_IntentID",
    "AIDexterAudit_ConversationID","AIDexterAudit_Status","AIDexterAudit_IdempotencyKey","AIDexterAudit_AttemptedAt"
  ) values(p_company_id,p_user_id,v_prepared."AIDexterPrepared_ActionCode",v_prepared."AIDexterPrepared_AccessMode",
    case when v_prepared."AIDexterPrepared_ActionCode" in ('create_email_draft','send_email') then v_prepared."AIDexterPrepared_TargetJSON" else v_prepared."AIDexterPrepared_ArgumentsJSON" end,
    '{}'::jsonb,p_prepared_action_id,v_prepared."AIDexterPrepared_IntentID",v_prepared."AIDexterPrepared_ConversationID",'attempted',v_prepared."AIDexterPrepared_IdempotencyKey",now());
  return jsonb_build_object('ok',true,'prepared',to_jsonb(v_prepared));
end $$;

revoke all on function public.multideck_dexter_claim_external_prepared_action(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_dexter_claim_external_prepared_action(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.multideck_dexter_execute_prepared_action(
  p_prepared_action_id uuid,p_company_id uuid,p_user_id uuid,p_conversation_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, public, auth as $$
declare v_context record; v_prepared public."AI_DexterPreparedActions"; v_intent public."AI_DexterIntentPlans";
  v_action_function text; v_required jsonb; v_domain_required jsonb; v_result jsonb; v_error_code text; v_error_message text;
begin
  if auth.role()<>'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  select p_company_id as company_id,p_user_id as user_id into v_context;
  select * into v_prepared from public."AI_DexterPreparedActions" prepared
  where prepared."AIDexterPrepared_ID"=p_prepared_action_id
    and prepared."AIDexterPrepared_CompanyID"=v_context.company_id
    and prepared."AIDexterPrepared_UserID"=v_context.user_id
    and prepared."AIDexterPrepared_ConversationID" is not distinct from p_conversation_id
  for update;
  if not found then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'prepared_action_unavailable','That prepared action is unavailable.','prepared_action_missing');
  end if;
  if v_prepared."AIDexterPrepared_Status"='succeeded' then
    insert into public."AI_DexterSecurityEvents"("AIDexterSecurityEvent_CompanyID","AIDexterSecurityEvent_UserID","AIDexterSecurityEvent_Kind","AIDexterSecurityEvent_Severity","AIDexterSecurityEvent_MetadataJSON")
    values(v_context.company_id,v_context.user_id,'prepared_action_safe_retry','info',jsonb_build_object('preparedActionId',p_prepared_action_id));
    return jsonb_build_object('action',v_prepared."AIDexterPrepared_ActionCode",'updated',true,'result',coalesce(v_prepared."AIDexterPrepared_ResultJSON",'{}'::jsonb),'replayed',true);
  end if;
  if v_prepared."AIDexterPrepared_Status"<>'prepared' then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'prepared_action_replayed','That prepared action has already been used.','prepared_action_replay_denied');
  end if;
  if v_prepared."AIDexterPrepared_ExpiresAt"<=now() then
    update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='expired',"AIDexterPrepared_CompletedAt"=now() where "AIDexterPrepared_ID"=p_prepared_action_id;
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'prepared_action_expired','That prepared action has expired.','prepared_action_replay_denied');
  end if;
  if v_prepared."AIDexterPrepared_ConversationID" is not null and not exists(
    select 1 from public."AI_Conversations" c where c."AICNV_ID"=v_prepared."AIDexterPrepared_ConversationID"
      and c."AICNV_CompanyID"=v_context.company_id and c."AICNV_OwnerUserID"=v_context.user_id and c."AICNV_Channel"='chat' and c."AICNV_EndedAt" is null
  ) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'conversation_unavailable','That conversation is no longer active.','cross_scope_action_denied');
  end if;
  select * into v_intent from public."AI_DexterIntentPlans" i where i."AIDexterIntent_ID"=v_prepared."AIDexterPrepared_IntentID"
    and i."AIDexterIntent_CompanyID"=v_context.company_id and i."AIDexterIntent_UserID"=v_context.user_id
    and i."AIDexterIntent_ClientSessionID"=v_prepared."AIDexterPrepared_ClientSessionID"
    and i."AIDexterIntent_ConversationID" is not distinct from v_prepared."AIDexterPrepared_ConversationID"
    and i."AIDexterIntent_AccessMode"=v_prepared."AIDexterPrepared_AccessMode" and i."AIDexterIntent_ExpiresAt">now();
  if not found or not coalesce(v_intent."AIDexterIntent_AllowedActionsJSON",'[]'::jsonb)?v_prepared."AIDexterPrepared_ActionCode" then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'intent_mismatch','That action no longer matches the operator request.','intent_mismatch');
  end if;
  if v_prepared."AIDexterPrepared_AccessMode"='full' and v_prepared."AIDexterPrepared_TargetID" is not null
    and not coalesce(v_intent."AIDexterIntent_TargetConstraintsJSON",'[]'::jsonb)?v_prepared."AIDexterPrepared_TargetID"::text then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'target_outside_operator_intent','That target was not authorised by the operator.','target_substitution_denied');
  end if;
  if v_prepared."AIDexterPrepared_AccessMode"='full' and not exists(
    select 1 from public."AI_DexterConversationGrants" g where g."AIDexterGrant_ID"=v_prepared."AIDexterPrepared_GrantID"
      and g."AIDexterGrant_CompanyID"=v_context.company_id and g."AIDexterGrant_UserID"=v_context.user_id
      and g."AIDexterGrant_ClientSessionID"=v_prepared."AIDexterPrepared_ClientSessionID" and g."AIDexterGrant_Status"='active'
      and g."AIDexterGrant_ExpiresAt">now() and g."AIDexterGrant_ConversationID" is not distinct from v_prepared."AIDexterPrepared_ConversationID"
  ) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'full_access_expired','Full access is no longer active for this conversation.','full_access_replay_denied');
  end if;
  if not public._multideck_dexter_can_manage(v_context.user_id) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'permission_denied','You no longer have permission to let Dexter change workspace data.','permission_denied');
  end if;
  select action."AIDexterAction_Function",action."AIDexterAction_RequiredPermissionsJSON",domain."AIDexterDomain_RequiredPermissionsJSON"
  into v_action_function,v_required,v_domain_required from public."sys_AIDexterActions" action
  join public."sys_AIDexterDataDomains" domain on domain."AIDexterDomain_Code"=action."AIDexterAction_DomainCode" and domain."AIDexterDomain_IsActive"
  where action."AIDexterAction_Code"=v_prepared."AIDexterPrepared_ActionCode" and action."AIDexterAction_IsActive";
  if v_action_function is null or not public._multideck_dexter_has_permissions(v_context.user_id,v_required)
    or not public._multideck_dexter_has_permissions(v_context.user_id,v_domain_required) then
    return public._multideck_dexter_deny_prepared_action(p_prepared_action_id,v_context.company_id,v_context.user_id,'permission_denied','You no longer have permission to run that Dexter action.','permission_denied');
  end if;
  update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='executing',"AIDexterPrepared_AttemptedAt"=now() where "AIDexterPrepared_ID"=p_prepared_action_id;
  insert into public."AI_DexterActionAudit"(
    "AIDexterAudit_CompanyID","AIDexterAudit_UserID","AIDexterAudit_ActionCode","AIDexterAudit_AccessMode",
    "AIDexterAudit_ArgumentsJSON","AIDexterAudit_ResultJSON","AIDexterAudit_PreparedActionID","AIDexterAudit_IntentID",
    "AIDexterAudit_ConversationID","AIDexterAudit_Status","AIDexterAudit_IdempotencyKey","AIDexterAudit_AttemptedAt"
  ) values(v_context.company_id,v_context.user_id,v_prepared."AIDexterPrepared_ActionCode",v_prepared."AIDexterPrepared_AccessMode",
    v_prepared."AIDexterPrepared_ArgumentsJSON",'{}'::jsonb,p_prepared_action_id,v_prepared."AIDexterPrepared_IntentID",
    v_prepared."AIDexterPrepared_ConversationID",'attempted',v_prepared."AIDexterPrepared_IdempotencyKey",now());
  begin
    execute format('select public.%I($1,$2,$3)',v_action_function) into v_result
      using v_context.company_id,v_context.user_id,v_prepared."AIDexterPrepared_ArgumentsJSON";
    update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='succeeded',"AIDexterPrepared_ResultJSON"=coalesce(v_result,'{}'::jsonb),"AIDexterPrepared_CompletedAt"=now() where "AIDexterPrepared_ID"=p_prepared_action_id;
    insert into public."AI_DexterActionAudit" (
      "AIDexterAudit_CompanyID","AIDexterAudit_UserID","AIDexterAudit_ActionCode","AIDexterAudit_AccessMode",
      "AIDexterAudit_ArgumentsJSON","AIDexterAudit_ResultJSON","AIDexterAudit_PreparedActionID","AIDexterAudit_IntentID",
      "AIDexterAudit_ConversationID","AIDexterAudit_Status","AIDexterAudit_IdempotencyKey","AIDexterAudit_AttemptedAt","AIDexterAudit_CompletedAt"
    ) values (v_context.company_id,v_context.user_id,v_prepared."AIDexterPrepared_ActionCode",v_prepared."AIDexterPrepared_AccessMode",
      v_prepared."AIDexterPrepared_ArgumentsJSON",coalesce(v_result,'{}'::jsonb),p_prepared_action_id,v_prepared."AIDexterPrepared_IntentID",
      v_prepared."AIDexterPrepared_ConversationID",'succeeded',v_prepared."AIDexterPrepared_IdempotencyKey",now(),now());
    return jsonb_build_object('action',v_prepared."AIDexterPrepared_ActionCode",'updated',true,'result',v_result);
  exception when others then
    get stacked diagnostics v_error_code=returned_sqlstate,v_error_message=message_text;
    update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='failed',"AIDexterPrepared_ErrorCode"=v_error_code,"AIDexterPrepared_ErrorMessage"=left(v_error_message,500),"AIDexterPrepared_CompletedAt"=now() where "AIDexterPrepared_ID"=p_prepared_action_id;
    insert into public."AI_DexterActionAudit" (
      "AIDexterAudit_CompanyID","AIDexterAudit_UserID","AIDexterAudit_ActionCode","AIDexterAudit_AccessMode",
      "AIDexterAudit_ArgumentsJSON","AIDexterAudit_ResultJSON","AIDexterAudit_PreparedActionID","AIDexterAudit_IntentID",
      "AIDexterAudit_ConversationID","AIDexterAudit_Status","AIDexterAudit_IdempotencyKey","AIDexterAudit_ErrorCode","AIDexterAudit_ErrorMessage","AIDexterAudit_AttemptedAt","AIDexterAudit_CompletedAt"
    ) values (v_context.company_id,v_context.user_id,v_prepared."AIDexterPrepared_ActionCode",v_prepared."AIDexterPrepared_AccessMode",
      v_prepared."AIDexterPrepared_ArgumentsJSON",'{}'::jsonb,p_prepared_action_id,v_prepared."AIDexterPrepared_IntentID",
      v_prepared."AIDexterPrepared_ConversationID",'failed',v_prepared."AIDexterPrepared_IdempotencyKey",v_error_code,left(v_error_message,500),now(),now());
    return jsonb_build_object('action',v_prepared."AIDexterPrepared_ActionCode",'updated',false,'error',jsonb_build_object('code',v_error_code,'message',left(v_error_message,500)));
  end;
end; $$;

revoke all on function public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='multideck-dexter-retention-cleanup-daily';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  if exists(select 1 from vault.decrypted_secrets where name='multideck_dexter_retention_cleanup_url')
    and exists(select 1 from vault.decrypted_secrets where name='multideck_dexter_retention_cleanup_secret') then
    perform cron.schedule('multideck-dexter-retention-cleanup-daily','27 2 * * *',$schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='multideck_dexter_retention_cleanup_url' limit 1),
        headers := jsonb_build_object('Content-Type','application/json','x-multideck-retention-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='multideck_dexter_retention_cleanup_secret' limit 1)),
        body := '{}'::jsonb, timeout_milliseconds := 120000
      );
    $schedule$);
  end if;
end $$;

commit;
