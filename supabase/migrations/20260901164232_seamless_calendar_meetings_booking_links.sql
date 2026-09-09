-- Native Multideck calendar, meetings, booking links and attendee management.
-- Each tenant receives these objects inside its own Supabase project. Public
-- callers never receive table access: authenticated and token-scoped HTTP
-- contracts are implemented by Edge Functions with explicit ownership checks.

begin;

create extension if not exists btree_gist with schema extensions;

insert into public."sys_Permissions" (
  "sys_Permission_Value", "sys_Permission_Group", "sys_Permission_Name",
  "sys_Permission_Description", "sys_Permission_IsDangerous"
) values
  ('Calendar.Read', 'Calendar', 'View calendar', 'View personal meetings, permitted operational dates and private provider mirrors.', false),
  ('Calendar.ManageOwn', 'Calendar', 'Manage own meetings', 'Create, reschedule and cancel meetings organised by the signed-in operator.', false),
  ('Calendar.ManageAll', 'Calendar', 'Manage all meetings', 'Manage another operator''s meetings inside this workspace.', true),
  ('Calendar.Connect', 'Calendar', 'Connect personal calendar', 'Connect one personal Google or Microsoft calendar and an optional Zoom account.', false),
  ('Calendar.BookingLinks.Manage', 'Calendar', 'Manage booking links', 'Create and publish personal booking links.', false),
  ('Calendar.Templates.Manage', 'Calendar', 'Manage meeting email templates', 'Change workspace-wide meeting and booking email copy.', true)
on conflict ("sys_Permission_Value") do update set
  "sys_Permission_Group" = excluded."sys_Permission_Group",
  "sys_Permission_Name" = excluded."sys_Permission_Name",
  "sys_Permission_Description" = excluded."sys_Permission_Description",
  "sys_Permission_IsDangerous" = excluded."sys_Permission_IsDangerous";

with assignments(role_name, permission_value) as (values
  ('Administrator', 'Calendar.Read'),
  ('Administrator', 'Calendar.ManageOwn'),
  ('Administrator', 'Calendar.ManageAll'),
  ('Administrator', 'Calendar.Connect'),
  ('Administrator', 'Calendar.BookingLinks.Manage'),
  ('Administrator', 'Calendar.Templates.Manage'),
  ('Company Admin', 'Calendar.Read'),
  ('Company Admin', 'Calendar.ManageOwn'),
  ('Company Admin', 'Calendar.ManageAll'),
  ('Company Admin', 'Calendar.Connect'),
  ('Company Admin', 'Calendar.BookingLinks.Manage'),
  ('Company Admin', 'Calendar.Templates.Manage'),
  ('Company Manager', 'Calendar.Read'),
  ('Company Manager', 'Calendar.ManageOwn'),
  ('Company Manager', 'Calendar.Connect'),
  ('Company Manager', 'Calendar.BookingLinks.Manage'),
  ('Company User', 'Calendar.Read'),
  ('Company User', 'Calendar.ManageOwn'),
  ('Company User', 'Calendar.Connect'),
  ('Company User', 'Calendar.BookingLinks.Manage')
)
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select role."sys_UserRole_ID", permission."sys_Permission_ID"
from assignments
join public."sys_UserRoles" role on role."sys_UserRole_Name" = assignments.role_name
join public."sys_Permissions" permission on permission."sys_Permission_Value" = assignments.permission_value
on conflict ("sys_UserRole_ID", "sys_Permission_ID") do nothing;

insert into public."sys_CRMActivityTypes" (
  "CRMActType_Code", "CRMActType_Name", "CRMActType_Description",
  "CRMActType_ChannelCode", "CRMActType_IsCustomerTouch", "CRMActType_IsActive", "CRMActType_SortOrder"
) values (
  'meeting', 'Meeting', 'A scheduled, rescheduled, completed or cancelled Multideck meeting.',
  null, true, true, 35
)
on conflict ("CRMActType_Code") do update set
  "CRMActType_Name" = excluded."CRMActType_Name",
  "CRMActType_Description" = excluded."CRMActType_Description",
  "CRMActType_IsActive" = true;

insert into public."sys_CRMLeadSources" (
  "CRMLeadSource_Code", "CRMLeadSource_Name", "CRMLeadSource_Description",
  "CRMLeadSource_IsActive", "CRMLeadSource_SortOrder"
) values (
  'booking_link', 'Booking link', 'A verified visitor who booked through a Multideck booking link.', true, 35
)
on conflict ("CRMLeadSource_Code") do update set
  "CRMLeadSource_Name" = excluded."CRMLeadSource_Name",
  "CRMLeadSource_Description" = excluded."CRMLeadSource_Description",
  "CRMLeadSource_IsActive" = true;

create table if not exists public."CAL_UserAvailability" (
  "CALAvailability_ID" uuid primary key default gen_random_uuid(),
  "CALAvailability_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALAvailability_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALAvailability_TimeZone" varchar(100) not null default 'Europe/London',
  "CALAvailability_WorkingHoursJSON" jsonb not null default '{"monday":[["09:00","17:00"]],"tuesday":[["09:00","17:00"]],"wednesday":[["09:00","17:00"]],"thursday":[["09:00","17:00"]],"friday":[["09:00","17:00"]],"saturday":[],"sunday":[]}'::jsonb,
  "CALAvailability_ExceptionsJSON" jsonb not null default '[]'::jsonb,
  "CALAvailability_MinimumNoticeMinutes" integer not null default 120,
  "CALAvailability_BookingHorizonDays" integer not null default 60,
  "CALAvailability_BufferBeforeMinutes" integer not null default 15,
  "CALAvailability_BufferAfterMinutes" integer not null default 15,
  "CALAvailability_SlotIncrementMinutes" integer not null default 15,
  "CALAvailability_UpdatedAt" timestamptz not null default now(),
  unique ("CALAvailability_UserID"),
  constraint "CK_CAL_UserAvailability_hours" check (jsonb_typeof("CALAvailability_WorkingHoursJSON") = 'object'),
  constraint "CK_CAL_UserAvailability_exceptions" check (jsonb_typeof("CALAvailability_ExceptionsJSON") = 'array'),
  constraint "CK_CAL_UserAvailability_notice" check ("CALAvailability_MinimumNoticeMinutes" between 0 and 43200),
  constraint "CK_CAL_UserAvailability_horizon" check ("CALAvailability_BookingHorizonDays" between 1 and 365),
  constraint "CK_CAL_UserAvailability_buffers" check ("CALAvailability_BufferBeforeMinutes" between 0 and 240 and "CALAvailability_BufferAfterMinutes" between 0 and 240),
  constraint "CK_CAL_UserAvailability_increment" check ("CALAvailability_SlotIncrementMinutes" in (5,10,15,20,30,60))
);

create table if not exists public."CAL_ProviderConnections" (
  "CALConnection_ID" uuid primary key default gen_random_uuid(),
  "CALConnection_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALConnection_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALConnection_ProviderCode" varchar(20) not null,
  "CALConnection_IsPrimaryCalendar" boolean not null default false,
  "CALConnection_StatusCode" varchar(24) not null default 'connected',
  "CALConnection_ProviderAccountID" varchar(320),
  "CALConnection_ProviderTenantID" varchar(320),
  "CALConnection_DisplayName" varchar(240),
  "CALConnection_Email" varchar(320),
  "CALConnection_CalendarID" varchar(500),
  "CALConnection_SecretRef" varchar(240) not null,
  "CALConnection_ScopesJSON" jsonb not null default '[]'::jsonb,
  "CALConnection_SyncCursor" text,
  "CALConnection_SubscriptionID" varchar(500),
  "CALConnection_SubscriptionResourceID" varchar(500),
  "CALConnection_SubscriptionSecretRef" varchar(240),
  "CALConnection_SubscriptionExpiresAt" timestamptz,
  "CALConnection_LastSyncedAt" timestamptz,
  "CALConnection_LastError" varchar(500),
  "CALConnection_CreatedAt" timestamptz not null default now(),
  "CALConnection_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CAL_ProviderConnections_provider" check ("CALConnection_ProviderCode" in ('google','microsoft','zoom')),
  constraint "CK_CAL_ProviderConnections_status" check ("CALConnection_StatusCode" in ('connected','syncing','attention','disconnected')),
  constraint "CK_CAL_ProviderConnections_primary" check (not "CALConnection_IsPrimaryCalendar" or "CALConnection_ProviderCode" in ('google','microsoft')),
  constraint "CK_CAL_ProviderConnections_scopes" check (jsonb_typeof("CALConnection_ScopesJSON") = 'array')
);

create unique index if not exists "UX_CAL_ProviderConnections_user_provider"
  on public."CAL_ProviderConnections" ("CALConnection_UserID", "CALConnection_ProviderCode")
  where "CALConnection_StatusCode" <> 'disconnected';
create unique index if not exists "UX_CAL_ProviderConnections_primary"
  on public."CAL_ProviderConnections" ("CALConnection_UserID")
  where "CALConnection_IsPrimaryCalendar" and "CALConnection_StatusCode" <> 'disconnected';

create or replace function public.calendar_put_secret(p_secret text, p_name text default null, p_description text default null)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public, vault
as $$
declare v_secret_id uuid;
begin
  if p_secret is null or length(p_secret) not between 1 and 131072 then
    raise exception 'Calendar secret must be between 1 byte and 128 KiB.' using errcode = '22023';
  end if;
  select vault.create_secret(p_secret,nullif(btrim(p_name),''),coalesce(nullif(btrim(p_description),''),'Multideck Calendar credential')) into v_secret_id;
  if v_secret_id is null then raise exception 'Tenant Vault did not create a Calendar secret.' using errcode = '55000'; end if;
  return 'supabase-vault:'||v_secret_id::text;
end;
$$;

create or replace function public.calendar_get_secret(p_secret_ref text)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, vault
as $$
declare v_secret_id uuid; v_secret text;
begin
  if p_secret_ref is null or p_secret_ref !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Calendar secret reference is invalid.' using errcode = '22023';
  end if;
  v_secret_id := substring(p_secret_ref from 16)::uuid;
  select secret.decrypted_secret into v_secret from vault.decrypted_secrets secret where secret.id=v_secret_id;
  return v_secret;
end;
$$;

create or replace function public.calendar_update_secret(p_secret_ref text, p_secret text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, vault
as $$
declare v_secret_id uuid;
begin
  if p_secret is null or length(p_secret) not between 1 and 131072 then raise exception 'Calendar secret is invalid.' using errcode='22023'; end if;
  if p_secret_ref is null or p_secret_ref !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Calendar secret reference is invalid.' using errcode='22023'; end if;
  v_secret_id := substring(p_secret_ref from 16)::uuid;
  perform vault.update_secret(v_secret_id,p_secret);
  return true;
end;
$$;

create or replace function public.calendar_delete_secret(p_secret_ref text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, vault
as $$
declare v_secret_id uuid;
begin
  if p_secret_ref is null or p_secret_ref !~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  v_secret_id := substring(p_secret_ref from 16)::uuid;
  delete from vault.secrets as secret where secret.id = v_secret_id;
  return true;
end;
$$;

revoke all on function public.calendar_put_secret(text,text,text) from public, anon, authenticated;
revoke all on function public.calendar_get_secret(text) from public, anon, authenticated;
revoke all on function public.calendar_update_secret(text,text) from public, anon, authenticated;
revoke all on function public.calendar_delete_secret(text) from public, anon, authenticated;
grant execute on function public.calendar_put_secret(text,text,text) to service_role;
grant execute on function public.calendar_get_secret(text) to service_role;
grant execute on function public.calendar_update_secret(text,text) to service_role;
grant execute on function public.calendar_delete_secret(text) to service_role;

create table if not exists public."CAL_OAuthStates" (
  "CALOAuthState_ID" uuid primary key default gen_random_uuid(),
  "CALOAuthState_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALOAuthState_UserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALOAuthState_AuthUserID" uuid not null,
  "CALOAuthState_ProviderCode" varchar(20) not null,
  "CALOAuthState_StateHash" varchar(128) not null unique,
  "CALOAuthState_PKCESecretRef" varchar(240) not null,
  "CALOAuthState_ReturnOrigin" varchar(500) not null,
  "CALOAuthState_ReturnPath" varchar(500) not null default '/settings?tab=integrations',
  "CALOAuthState_RequestedScopesJSON" jsonb not null default '[]'::jsonb,
  "CALOAuthState_ExpiresAt" timestamptz not null,
  "CALOAuthState_ConsumedAt" timestamptz,
  "CALOAuthState_CreatedAt" timestamptz not null default now(),
  constraint "CK_CAL_OAuthStates_provider" check ("CALOAuthState_ProviderCode" in ('google','microsoft','zoom')),
  constraint "CK_CAL_OAuthStates_scopes" check (jsonb_typeof("CALOAuthState_RequestedScopesJSON") = 'array')
);

create table if not exists public."CAL_Reservations" (
  "CALReservation_ID" uuid primary key default gen_random_uuid(),
  "CALReservation_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALReservation_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALReservation_SourceCode" varchar(20) not null,
  "CALReservation_SourceID" uuid not null,
  "CALReservation_StartAt" timestamptz not null,
  "CALReservation_EndAt" timestamptz not null,
  "CALReservation_BufferBeforeMinutes" integer not null default 0,
  "CALReservation_BufferAfterMinutes" integer not null default 0,
  "CALReservation_StatusCode" varchar(16) not null default 'active',
  "CALReservation_ExpiresAt" timestamptz,
  "CALReservation_CreatedAt" timestamptz not null default now(),
  constraint "CK_CAL_Reservations_source" check ("CALReservation_SourceCode" in ('meeting','hold')),
  constraint "CK_CAL_Reservations_status" check ("CALReservation_StatusCode" in ('active','released','expired')),
  constraint "CK_CAL_Reservations_range" check ("CALReservation_EndAt" > "CALReservation_StartAt")
);

alter table public."CAL_Reservations"
  drop constraint if exists "EX_CAL_Reservations_owner_overlap";
alter table public."CAL_Reservations"
  add constraint "EX_CAL_Reservations_owner_overlap"
  exclude using gist (
    "CALReservation_OwnerUserID" with =,
    -- timestamptz +/- interval is STABLE because it observes the session time
    -- zone, which PostgreSQL refuses in an index expression. Normalising both
    -- bounds to UTC first makes the indexed expression immutable while keeping
    -- the same absolute-time overlap semantics across DST transitions.
    tsrange(
      timezone('UTC', "CALReservation_StartAt") - make_interval(mins => "CALReservation_BufferBeforeMinutes"),
      timezone('UTC', "CALReservation_EndAt") + make_interval(mins => "CALReservation_BufferAfterMinutes"),
      '[)'
    ) with &&
  ) where ("CALReservation_StatusCode" = 'active');

create index if not exists "IX_CAL_Reservations_owner_range"
  on public."CAL_Reservations" ("CALReservation_OwnerUserID", "CALReservation_StartAt", "CALReservation_EndAt")
  where "CALReservation_StatusCode" = 'active';

create table if not exists public."CAL_Meetings" (
  "CALMeeting_ID" uuid primary key default gen_random_uuid(),
  "CALMeeting_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALMeeting_OrganiserUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALMeeting_ReservationID" uuid unique references public."CAL_Reservations"("CALReservation_ID") on delete set null,
  "CALMeeting_Title" varchar(240) not null,
  "CALMeeting_Agenda" text,
  "CALMeeting_StartAt" timestamptz not null,
  "CALMeeting_EndAt" timestamptz not null,
  "CALMeeting_TimeZone" varchar(100) not null,
  "CALMeeting_StatusCode" varchar(24) not null default 'confirmed',
  "CALMeeting_ProviderCode" varchar(20) not null default 'multideck',
  "CALMeeting_Location" varchar(500),
  "CALMeeting_JoinURL" text,
  "CALMeeting_ProviderEventID" varchar(500),
  "CALMeeting_ProviderRevision" varchar(500),
  "CALMeeting_LeadID" uuid references public."CRM_Leads"("CRMLead_ID") on delete set null,
  "CALMeeting_AccountID" uuid references public."CRM_AccountProfiles"("CRMAccount_ID") on delete set null,
  "CALMeeting_JobID" uuid references public."Job_Header"("Job_ID") on delete set null,
  "CALMeeting_BookingLinkID" uuid,
  "CALMeeting_AllowAttendeeReschedule" boolean not null default true,
  "CALMeeting_RemindersJSON" jsonb not null default '[1440,60]'::jsonb,
  "CALMeeting_SourceCode" varchar(24) not null default 'calendar',
  "CALMeeting_EditVersion" integer not null default 1,
  "CALMeeting_PendingChangeJSON" jsonb,
  "CALMeeting_LastSyncError" varchar(500),
  "CALMeeting_CreatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CALMeeting_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CALMeeting_CreatedAt" timestamptz not null default now(),
  "CALMeeting_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CAL_Meetings_title" check (btrim("CALMeeting_Title") <> ''),
  constraint "CK_CAL_Meetings_range" check ("CALMeeting_EndAt" > "CALMeeting_StartAt"),
  constraint "CK_CAL_Meetings_status" check ("CALMeeting_StatusCode" in ('provisioning','confirmed','sync_pending','sync_failed','cancelled','completed')),
  constraint "CK_CAL_Meetings_provider" check ("CALMeeting_ProviderCode" in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person')),
  constraint "CK_CAL_Meetings_source" check ("CALMeeting_SourceCode" in ('calendar','crm','booking_link','dexter','provider')),
  constraint "CK_CAL_Meetings_reminders" check (jsonb_typeof("CALMeeting_RemindersJSON") = 'array'),
  constraint "CK_CAL_Meetings_pending" check ("CALMeeting_PendingChangeJSON" is null or jsonb_typeof("CALMeeting_PendingChangeJSON") = 'object')
);

create index if not exists "IX_CAL_Meetings_organiser_range"
  on public."CAL_Meetings" ("CALMeeting_OrganiserUserID", "CALMeeting_StartAt", "CALMeeting_EndAt")
  where "CALMeeting_StatusCode" not in ('cancelled','completed');
create index if not exists "IX_CAL_Meetings_crm_lead" on public."CAL_Meetings" ("CALMeeting_LeadID", "CALMeeting_StartAt");
create index if not exists "IX_CAL_Meetings_crm_account" on public."CAL_Meetings" ("CALMeeting_AccountID", "CALMeeting_StartAt");

create table if not exists public."CAL_MeetingParticipants" (
  "CALParticipant_ID" uuid primary key default gen_random_uuid(),
  "CALParticipant_MeetingID" uuid not null references public."CAL_Meetings"("CALMeeting_ID") on delete cascade,
  "CALParticipant_UserID" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CALParticipant_OrgContactID" uuid references public."Org_Contacts"("OrgContact_ID") on delete set null,
  "CALParticipant_Name" varchar(240) not null,
  "CALParticipant_Email" varchar(320) not null,
  "CALParticipant_RoleCode" varchar(20) not null default 'attendee',
  "CALParticipant_ResponseCode" varchar(20) not null default 'needs_action',
  "CALParticipant_IsExternal" boolean not null default true,
  "CALParticipant_CreatedAt" timestamptz not null default now(),
  constraint "CK_CAL_MeetingParticipants_email" check (position('@' in "CALParticipant_Email") > 1),
  constraint "CK_CAL_MeetingParticipants_role" check ("CALParticipant_RoleCode" in ('organiser','attendee','optional')),
  constraint "CK_CAL_MeetingParticipants_response" check ("CALParticipant_ResponseCode" in ('needs_action','accepted','tentative','declined')),
  unique ("CALParticipant_MeetingID", "CALParticipant_Email")
);

create table if not exists public."CAL_ProviderEvents" (
  "CALProviderEvent_ID" uuid primary key default gen_random_uuid(),
  "CALProviderEvent_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALProviderEvent_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALProviderEvent_ConnectionID" uuid not null references public."CAL_ProviderConnections"("CALConnection_ID") on delete cascade,
  "CALProviderEvent_MeetingID" uuid references public."CAL_Meetings"("CALMeeting_ID") on delete cascade,
  "CALProviderEvent_ProviderID" varchar(500) not null,
  "CALProviderEvent_ICalUID" varchar(500),
  "CALProviderEvent_Title" varchar(240),
  "CALProviderEvent_StartAt" timestamptz not null,
  "CALProviderEvent_EndAt" timestamptz not null,
  "CALProviderEvent_IsPrivate" boolean not null default false,
  "CALProviderEvent_IsCancelled" boolean not null default false,
  "CALProviderEvent_Revision" varchar(500),
  "CALProviderEvent_UpdatedAt" timestamptz not null default now(),
  unique ("CALProviderEvent_ConnectionID", "CALProviderEvent_ProviderID"),
  constraint "CK_CAL_ProviderEvents_range" check ("CALProviderEvent_EndAt" > "CALProviderEvent_StartAt")
);

create table if not exists public."CAL_BookingLinks" (
  "CALBookingLink_ID" uuid primary key default gen_random_uuid(),
  "CALBookingLink_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALBookingLink_OwnerUserID" uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  "CALBookingLink_OrganiserSlug" varchar(80) not null,
  "CALBookingLink_Slug" varchar(100) not null,
  "CALBookingLink_Title" varchar(180) not null,
  "CALBookingLink_Description" text,
  "CALBookingLink_DurationMinutes" integer not null default 30,
  "CALBookingLink_ProviderCode" varchar(20) not null default 'multideck',
  "CALBookingLink_Location" varchar(500),
  "CALBookingLink_StatusCode" varchar(16) not null default 'active',
  "CALBookingLink_OverrideAvailabilityJSON" jsonb,
  "CALBookingLink_MinimumNoticeMinutes" integer,
  "CALBookingLink_BookingHorizonDays" integer,
  "CALBookingLink_BufferBeforeMinutes" integer,
  "CALBookingLink_BufferAfterMinutes" integer,
  "CALBookingLink_QuestionsJSON" jsonb not null default '[]'::jsonb,
  "CALBookingLink_RescheduleCutoffMinutes" integer not null default 120,
  "CALBookingLink_CancellationCutoffMinutes" integer not null default 120,
  "CALBookingLink_CreatedAt" timestamptz not null default now(),
  "CALBookingLink_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CAL_BookingLinks_slug" check ("CALBookingLink_OrganiserSlug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and "CALBookingLink_Slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint "CK_CAL_BookingLinks_title" check (btrim("CALBookingLink_Title") <> ''),
  constraint "CK_CAL_BookingLinks_duration" check ("CALBookingLink_DurationMinutes" between 15 and 240 and "CALBookingLink_DurationMinutes" % 5 = 0),
  constraint "CK_CAL_BookingLinks_provider" check ("CALBookingLink_ProviderCode" in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person')),
  constraint "CK_CAL_BookingLinks_status" check ("CALBookingLink_StatusCode" in ('active','paused','archived')),
  constraint "CK_CAL_BookingLinks_questions" check (jsonb_typeof("CALBookingLink_QuestionsJSON") = 'array'),
  unique ("CALBookingLink_CompanyID", "CALBookingLink_OrganiserSlug", "CALBookingLink_Slug")
);

alter table public."CAL_Meetings"
  drop constraint if exists "FK_CAL_Meetings_BookingLink";
alter table public."CAL_Meetings"
  add constraint "FK_CAL_Meetings_BookingLink" foreign key ("CALMeeting_BookingLinkID")
  references public."CAL_BookingLinks"("CALBookingLink_ID") on delete set null;

create table if not exists public."CAL_BookingHolds" (
  "CALBookingHold_ID" uuid primary key default gen_random_uuid(),
  "CALBookingHold_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALBookingHold_BookingLinkID" uuid not null references public."CAL_BookingLinks"("CALBookingLink_ID") on delete cascade,
  "CALBookingHold_ReservationID" uuid unique references public."CAL_Reservations"("CALReservation_ID") on delete cascade,
  "CALBookingHold_MeetingID" uuid unique references public."CAL_Meetings"("CALMeeting_ID") on delete set null,
  "CALBookingHold_Name" varchar(240) not null,
  "CALBookingHold_Email" varchar(320) not null,
  "CALBookingHold_CompanyName" varchar(240),
  "CALBookingHold_Phone" varchar(80),
  "CALBookingHold_TimeZone" varchar(100) not null,
  "CALBookingHold_AnswersJSON" jsonb not null default '{}'::jsonb,
  "CALBookingHold_VerificationHash" varchar(128) not null,
  "CALBookingHold_VerificationAttempts" integer not null default 0,
  "CALBookingHold_VerifiedAt" timestamptz,
  "CALBookingHold_ExpiresAt" timestamptz not null,
  "CALBookingHold_CreatedAt" timestamptz not null default now(),
  constraint "CK_CAL_BookingHolds_email" check (position('@' in "CALBookingHold_Email") > 1),
  constraint "CK_CAL_BookingHolds_answers" check (jsonb_typeof("CALBookingHold_AnswersJSON") = 'object')
);

create table if not exists public."CAL_PublicRateLimits" (
  "CALRateLimit_ID" uuid primary key default gen_random_uuid(),
  "CALRateLimit_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALRateLimit_ActionCode" varchar(32) not null,
  "CALRateLimit_SubjectHash" varchar(128) not null,
  "CALRateLimit_WindowStartedAt" timestamptz not null,
  "CALRateLimit_AttemptCount" integer not null default 1,
  "CALRateLimit_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CAL_PublicRateLimits_action" check ("CALRateLimit_ActionCode" in ('hold','verify','resend','manage')),
  constraint "CK_CAL_PublicRateLimits_count" check ("CALRateLimit_AttemptCount" between 1 and 10000),
  unique ("CALRateLimit_CompanyID", "CALRateLimit_ActionCode", "CALRateLimit_SubjectHash", "CALRateLimit_WindowStartedAt")
);

create table if not exists public."CAL_ManagementTokens" (
  "CALManagementToken_ID" uuid primary key default gen_random_uuid(),
  "CALManagementToken_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALManagementToken_ParticipantID" uuid not null references public."CAL_MeetingParticipants"("CALParticipant_ID") on delete cascade,
  "CALManagementToken_TokenHash" varchar(128) not null unique,
  "CALManagementToken_SecretRef" varchar(240) not null,
  "CALManagementToken_ExpiresAt" timestamptz not null,
  "CALManagementToken_RevokedAt" timestamptz,
  "CALManagementToken_LastUsedAt" timestamptz,
  "CALManagementToken_CreatedAt" timestamptz not null default now()
);

create or replace function public._multideck_calendar_delete_management_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old."CALManagementToken_SecretRef" ~ '^supabase-vault:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    delete from vault.secrets as secret
    where secret.id = substring(old."CALManagementToken_SecretRef" from 16)::uuid;
  end if;
  return old;
end;
$$;

drop trigger if exists "TR_CAL_ManagementTokens_delete_secret" on public."CAL_ManagementTokens";
create trigger "TR_CAL_ManagementTokens_delete_secret"
before delete on public."CAL_ManagementTokens"
for each row execute function public._multideck_calendar_delete_management_secret();

revoke all on function public._multideck_calendar_delete_management_secret() from public, anon, authenticated;

create table if not exists public."CAL_ChangeRequests" (
  "CALChangeRequest_ID" uuid primary key default gen_random_uuid(),
  "CALChangeRequest_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALChangeRequest_MeetingID" uuid not null references public."CAL_Meetings"("CALMeeting_ID") on delete cascade,
  "CALChangeRequest_ParticipantID" uuid not null references public."CAL_MeetingParticipants"("CALParticipant_ID") on delete cascade,
  "CALChangeRequest_ProposedTimesJSON" jsonb not null,
  "CALChangeRequest_StatusCode" varchar(16) not null default 'pending',
  "CALChangeRequest_SelectedStartAt" timestamptz,
  "CALChangeRequest_SelectedEndAt" timestamptz,
  "CALChangeRequest_DecidedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CALChangeRequest_DecidedAt" timestamptz,
  "CALChangeRequest_CreatedAt" timestamptz not null default now(),
  constraint "CK_CAL_ChangeRequests_times" check (jsonb_typeof("CALChangeRequest_ProposedTimesJSON") = 'array' and jsonb_array_length("CALChangeRequest_ProposedTimesJSON") between 1 and 3),
  constraint "CK_CAL_ChangeRequests_selected_range" check (("CALChangeRequest_SelectedStartAt" is null and "CALChangeRequest_SelectedEndAt" is null) or "CALChangeRequest_SelectedEndAt" > "CALChangeRequest_SelectedStartAt"),
  constraint "CK_CAL_ChangeRequests_status" check ("CALChangeRequest_StatusCode" in ('pending','accepted','declined','withdrawn'))
);

create table if not exists public."CAL_EmailTemplates" (
  "CALEmailTemplate_ID" uuid primary key default gen_random_uuid(),
  "CALEmailTemplate_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALEmailTemplate_KindCode" varchar(40) not null,
  "CALEmailTemplate_Subject" varchar(240) not null,
  "CALEmailTemplate_Body" text not null,
  "CALEmailTemplate_EditVersion" integer not null default 1,
  "CALEmailTemplate_UpdatedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  "CALEmailTemplate_UpdatedAt" timestamptz not null default now(),
  constraint "CK_CAL_EmailTemplates_kind" check ("CALEmailTemplate_KindCode" in ('booking_verification','management','standalone_confirmation','reminder','rescheduled','cancelled','group_reschedule_request','group_reschedule_outcome')),
  constraint "CK_CAL_EmailTemplates_copy" check (btrim("CALEmailTemplate_Subject") <> '' and btrim("CALEmailTemplate_Body") <> ''),
  unique ("CALEmailTemplate_CompanyID", "CALEmailTemplate_KindCode")
);

create table if not exists public."CAL_Deliveries" (
  "CALDelivery_ID" uuid primary key default gen_random_uuid(),
  "CALDelivery_CompanyID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CALDelivery_MeetingID" uuid references public."CAL_Meetings"("CALMeeting_ID") on delete cascade,
  "CALDelivery_ParticipantID" uuid references public."CAL_MeetingParticipants"("CALParticipant_ID") on delete cascade,
  "CALDelivery_KindCode" varchar(40) not null,
  "CALDelivery_SendAfter" timestamptz not null default now(),
  "CALDelivery_StatusCode" varchar(16) not null default 'pending',
  "CALDelivery_IdempotencyKey" varchar(240) not null unique,
  "CALDelivery_Attempts" integer not null default 0,
  "CALDelivery_LeaseUntil" timestamptz,
  "CALDelivery_ProviderID" varchar(500),
  "CALDelivery_RenderedJSON" jsonb,
  "CALDelivery_LastError" varchar(500),
  "CALDelivery_CreatedAt" timestamptz not null default now(),
  "CALDelivery_CompletedAt" timestamptz,
  constraint "CK_CAL_Deliveries_kind" check ("CALDelivery_KindCode" in ('provider_create','provider_update','provider_cancel','crm_link','booking_verification','management','standalone_confirmation','reminder','rescheduled','cancelled','group_reschedule_request','group_reschedule_outcome')),
  constraint "CK_CAL_Deliveries_status" check ("CALDelivery_StatusCode" in ('pending','leased','delivered','cancelled','failed')),
  constraint "CK_CAL_Deliveries_rendered" check ("CALDelivery_RenderedJSON" is null or jsonb_typeof("CALDelivery_RenderedJSON") = 'object')
);

create table if not exists public."CAL_WebhookReceipts" (
  "CALWebhookReceipt_ID" uuid primary key default gen_random_uuid(),
  "CALWebhookReceipt_ProviderCode" varchar(20) not null,
  "CALWebhookReceipt_DeliveryKey" varchar(500) not null,
  "CALWebhookReceipt_ConnectionID" uuid references public."CAL_ProviderConnections"("CALConnection_ID") on delete cascade,
  "CALWebhookReceipt_EventType" varchar(120),
  "CALWebhookReceipt_ReceivedAt" timestamptz not null default now(),
  constraint "CK_CAL_WebhookReceipts_provider" check ("CALWebhookReceipt_ProviderCode" in ('google','microsoft','zoom')),
  unique ("CALWebhookReceipt_ProviderCode", "CALWebhookReceipt_DeliveryKey")
);

create index if not exists "IX_CAL_WebhookReceipts_retention"
  on public."CAL_WebhookReceipts" ("CALWebhookReceipt_ReceivedAt");

create index if not exists "IX_CAL_Deliveries_due"
  on public."CAL_Deliveries" ("CALDelivery_SendAfter", "CALDelivery_LeaseUntil", "CALDelivery_CreatedAt")
  where "CALDelivery_StatusCode" in ('pending','leased');

-- Calendar tables are service-only, but their foreign-key cascades and bounded
-- worker/API lookups still need explicit indexes. Equality columns come first,
-- followed by status/range columns used by the real queries above.
create index if not exists "IX_CAL_UserAvailability_company"
  on public."CAL_UserAvailability" ("CALAvailability_CompanyID");
create index if not exists "IX_CAL_ProviderConnections_company_user"
  on public."CAL_ProviderConnections" ("CALConnection_CompanyID", "CALConnection_UserID");
create index if not exists "IX_CAL_ProviderConnections_sync"
  on public."CAL_ProviderConnections" ("CALConnection_StatusCode", "CALConnection_LastSyncedAt", "CALConnection_SubscriptionExpiresAt")
  where "CALConnection_StatusCode" in ('syncing','connected');
create index if not exists "IX_CAL_OAuthStates_company_user_expiry"
  on public."CAL_OAuthStates" ("CALOAuthState_CompanyID", "CALOAuthState_UserID", "CALOAuthState_ExpiresAt");
create index if not exists "IX_CAL_OAuthStates_expiry"
  on public."CAL_OAuthStates" ("CALOAuthState_ExpiresAt");
create index if not exists "IX_CAL_Reservations_company_owner_status"
  on public."CAL_Reservations" ("CALReservation_CompanyID", "CALReservation_OwnerUserID", "CALReservation_StatusCode");
create index if not exists "IX_CAL_Reservations_expiring_holds"
  on public."CAL_Reservations" ("CALReservation_ExpiresAt")
  where "CALReservation_SourceCode"='hold' and "CALReservation_StatusCode"='active';
create index if not exists "IX_CAL_Meetings_company_status_range"
  on public."CAL_Meetings" ("CALMeeting_CompanyID", "CALMeeting_StatusCode", "CALMeeting_StartAt", "CALMeeting_EndAt");
create index if not exists "IX_CAL_Meetings_job"
  on public."CAL_Meetings" ("CALMeeting_JobID", "CALMeeting_StartAt") where "CALMeeting_JobID" is not null;
create index if not exists "IX_CAL_Meetings_booking_link"
  on public."CAL_Meetings" ("CALMeeting_BookingLinkID", "CALMeeting_StartAt") where "CALMeeting_BookingLinkID" is not null;
create index if not exists "IX_CAL_MeetingParticipants_user"
  on public."CAL_MeetingParticipants" ("CALParticipant_UserID") where "CALParticipant_UserID" is not null;
create index if not exists "IX_CAL_MeetingParticipants_contact"
  on public."CAL_MeetingParticipants" ("CALParticipant_OrgContactID") where "CALParticipant_OrgContactID" is not null;
create index if not exists "IX_CAL_ProviderEvents_owner_range"
  on public."CAL_ProviderEvents" ("CALProviderEvent_OwnerUserID", "CALProviderEvent_StartAt", "CALProviderEvent_EndAt")
  where "CALProviderEvent_IsCancelled"=false;
create index if not exists "IX_CAL_ProviderEvents_meeting"
  on public."CAL_ProviderEvents" ("CALProviderEvent_MeetingID") where "CALProviderEvent_MeetingID" is not null;
create index if not exists "IX_CAL_BookingLinks_owner_status"
  on public."CAL_BookingLinks" ("CALBookingLink_OwnerUserID", "CALBookingLink_StatusCode", "CALBookingLink_UpdatedAt");
create index if not exists "IX_CAL_BookingHolds_link_expiry"
  on public."CAL_BookingHolds" ("CALBookingHold_BookingLinkID", "CALBookingHold_ExpiresAt");
create index if not exists "IX_CAL_PublicRateLimits_cleanup"
  on public."CAL_PublicRateLimits" ("CALRateLimit_WindowStartedAt");
create index if not exists "IX_CAL_ManagementTokens_company"
  on public."CAL_ManagementTokens" ("CALManagementToken_CompanyID");
create index if not exists "IX_CAL_ManagementTokens_participant_active"
  on public."CAL_ManagementTokens" ("CALManagementToken_ParticipantID", "CALManagementToken_ExpiresAt")
  where "CALManagementToken_RevokedAt" is null;
create index if not exists "IX_CAL_ChangeRequests_meeting_status"
  on public."CAL_ChangeRequests" ("CALChangeRequest_MeetingID", "CALChangeRequest_StatusCode", "CALChangeRequest_CreatedAt");
create index if not exists "IX_CAL_ChangeRequests_participant"
  on public."CAL_ChangeRequests" ("CALChangeRequest_ParticipantID");
create unique index if not exists "UX_CAL_ChangeRequests_participant_pending"
  on public."CAL_ChangeRequests" ("CALChangeRequest_MeetingID", "CALChangeRequest_ParticipantID")
  where "CALChangeRequest_StatusCode"='pending';
create index if not exists "IX_CAL_Deliveries_company"
  on public."CAL_Deliveries" ("CALDelivery_CompanyID");
create index if not exists "IX_CAL_Deliveries_meeting_status"
  on public."CAL_Deliveries" ("CALDelivery_MeetingID", "CALDelivery_StatusCode", "CALDelivery_SendAfter")
  where "CALDelivery_MeetingID" is not null;
create index if not exists "IX_CAL_Deliveries_participant"
  on public."CAL_Deliveries" ("CALDelivery_ParticipantID") where "CALDelivery_ParticipantID" is not null;
create index if not exists "IX_CAL_WebhookReceipts_connection"
  on public."CAL_WebhookReceipts" ("CALWebhookReceipt_ConnectionID", "CALWebhookReceipt_ReceivedAt")
  where "CALWebhookReceipt_ConnectionID" is not null;

-- Reminders are durable queue entries, regenerated from the canonical meeting
-- whenever its confirmed time/version or participant set changes. Old pending
-- reminders are cancelled before replacements are inserted so a reschedule can
-- never leave an obsolete notification behind.
create or replace function public._multideck_calendar_refresh_reminders(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting public."CAL_Meetings"%rowtype;
  v_participant record;
  v_value text;
  v_minutes integer;
  v_send_after timestamptz;
begin
  select * into v_meeting
  from public."CAL_Meetings"
  where "CALMeeting_ID" = p_meeting_id;

  if not found then return; end if;

  update public."CAL_Deliveries"
  set "CALDelivery_StatusCode" = 'cancelled',
      "CALDelivery_LeaseUntil" = null,
      "CALDelivery_CompletedAt" = now()
  where "CALDelivery_MeetingID" = p_meeting_id
    and "CALDelivery_KindCode" = 'reminder'
    and "CALDelivery_StatusCode" in ('pending','leased');

  if not (
       v_meeting."CALMeeting_StatusCode" = 'confirmed'
       or (v_meeting."CALMeeting_StatusCode" in ('sync_pending','sync_failed') and v_meeting."CALMeeting_ProviderEventID" is not null)
     )
     or v_meeting."CALMeeting_StartAt" <= now() then
    return;
  end if;

  for v_participant in
    select participant."CALParticipant_ID"
    from public."CAL_MeetingParticipants" participant
    where participant."CALParticipant_MeetingID" = p_meeting_id
      and participant."CALParticipant_ResponseCode" <> 'declined'
  loop
    for v_value in
      select value
      from jsonb_array_elements_text(v_meeting."CALMeeting_RemindersJSON") value
    loop
      if v_value ~ '^[0-9]{1,5}$' then
        v_minutes := v_value::integer;
        if v_minutes between 5 and 10080 then
          v_send_after := v_meeting."CALMeeting_StartAt" - make_interval(mins => v_minutes);
          if v_send_after > now() then
            insert into public."CAL_Deliveries" (
              "CALDelivery_CompanyID", "CALDelivery_MeetingID", "CALDelivery_ParticipantID",
              "CALDelivery_KindCode", "CALDelivery_SendAfter", "CALDelivery_IdempotencyKey",
              "CALDelivery_RenderedJSON"
            ) values (
              v_meeting."CALMeeting_CompanyID", p_meeting_id, v_participant."CALParticipant_ID",
              'reminder', v_send_after,
              'meeting:'||p_meeting_id::text||':participant:'||v_participant."CALParticipant_ID"::text||':reminder:v'||v_meeting."CALMeeting_EditVersion"::text||':'||v_minutes::text||':at:'||extract(epoch from v_meeting."CALMeeting_StartAt")::bigint::text,
              jsonb_build_object('meetingVersion',v_meeting."CALMeeting_EditVersion",'reminderMinutes',v_minutes)
            ) on conflict ("CALDelivery_IdempotencyKey") do update set
              "CALDelivery_SendAfter" = excluded."CALDelivery_SendAfter",
              "CALDelivery_RenderedJSON" = excluded."CALDelivery_RenderedJSON",
              "CALDelivery_StatusCode" = case when public."CAL_Deliveries"."CALDelivery_StatusCode" = 'delivered' then 'delivered' else 'pending' end,
              "CALDelivery_LeaseUntil" = null,
              "CALDelivery_CompletedAt" = case when public."CAL_Deliveries"."CALDelivery_StatusCode" = 'delivered' then public."CAL_Deliveries"."CALDelivery_CompletedAt" else null end,
              "CALDelivery_LastError" = null;
          end if;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public._multideck_calendar_meeting_lifecycle_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._multideck_calendar_refresh_reminders(new."CALMeeting_ID");

  update public."CAL_ManagementTokens" token
  set "CALManagementToken_ExpiresAt" = new."CALMeeting_EndAt" + interval '30 days'
  where token."CALManagementToken_RevokedAt" is null
    and token."CALManagementToken_ParticipantID" in (
      select participant."CALParticipant_ID"
      from public."CAL_MeetingParticipants" participant
      where participant."CALParticipant_MeetingID" = new."CALMeeting_ID"
    );

  update public."CRM_Activities"
  set "CRMActivity_Subject" = new."CALMeeting_Title",
      "CRMActivity_Summary" = case
        when new."CALMeeting_StatusCode" = 'cancelled' then 'Meeting cancelled.'
        when new."CALMeeting_StatusCode" = 'confirmed' then 'Meeting confirmed for '||new."CALMeeting_StartAt"::text||'.'
        when new."CALMeeting_StatusCode" = 'sync_failed' then 'The provider could not complete the requested meeting change. The previous confirmed details remain authoritative.'
        else "CRMActivity_Summary"
      end,
      "CRMActivity_ActivityAt" = case when new."CALMeeting_StatusCode" in ('confirmed','cancelled') then new."CALMeeting_StartAt" else "CRMActivity_ActivityAt" end,
      "CRMActivity_DurationMinutes" = greatest(1,round(extract(epoch from (new."CALMeeting_EndAt"-new."CALMeeting_StartAt"))/60)::integer),
      "CRMActivity_MetadataJSON" = coalesce("CRMActivity_MetadataJSON",'{}'::jsonb)
        || jsonb_build_object('status',new."CALMeeting_StatusCode",'provider',new."CALMeeting_ProviderCode",'joinUrl',new."CALMeeting_JoinURL"),
      "CRMActivity_UpdatedBy" = coalesce(new."CALMeeting_UpdatedBy","CRMActivity_UpdatedBy"),
      "CRMActivity_UpdatedAt" = now()
  where "CRMActivity_IsDeleted" = false
    and "CRMActivity_MetadataJSON" @> jsonb_build_object('calendarMeetingId',new."CALMeeting_ID");

  return new;
end;
$$;

create or replace function public._multideck_calendar_participant_lifecycle_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._multideck_calendar_refresh_reminders(coalesce(new."CALParticipant_MeetingID",old."CALParticipant_MeetingID"));
  return coalesce(new,old);
end;
$$;

drop trigger if exists "TR_CAL_Meetings_lifecycle" on public."CAL_Meetings";
create trigger "TR_CAL_Meetings_lifecycle"
after insert or update of "CALMeeting_Title","CALMeeting_StartAt","CALMeeting_EndAt","CALMeeting_StatusCode","CALMeeting_RemindersJSON","CALMeeting_EditVersion","CALMeeting_JoinURL"
on public."CAL_Meetings"
for each row execute function public._multideck_calendar_meeting_lifecycle_trigger();

drop trigger if exists "TR_CAL_MeetingParticipants_reminders_insert" on public."CAL_MeetingParticipants";
create trigger "TR_CAL_MeetingParticipants_reminders_insert"
after insert on public."CAL_MeetingParticipants"
for each row execute function public._multideck_calendar_participant_lifecycle_trigger();

drop trigger if exists "TR_CAL_MeetingParticipants_reminders_update" on public."CAL_MeetingParticipants";
create trigger "TR_CAL_MeetingParticipants_reminders_update"
after update of "CALParticipant_ResponseCode" on public."CAL_MeetingParticipants"
for each row execute function public._multideck_calendar_participant_lifecycle_trigger();

drop trigger if exists "TR_CAL_MeetingParticipants_reminders_delete" on public."CAL_MeetingParticipants";
create trigger "TR_CAL_MeetingParticipants_reminders_delete"
after delete on public."CAL_MeetingParticipants"
for each row execute function public._multideck_calendar_participant_lifecycle_trigger();

revoke all on function public._multideck_calendar_refresh_reminders(uuid) from public, anon, authenticated;
revoke all on function public._multideck_calendar_meeting_lifecycle_trigger() from public, anon, authenticated;
revoke all on function public._multideck_calendar_participant_lifecycle_trigger() from public, anon, authenticated;

create or replace function public.multideck_calendar_claim_deliveries(p_limit integer default 10)
returns setof public."CAL_Deliveries"
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  with due as (
    select delivery."CALDelivery_ID"
    from public."CAL_Deliveries" delivery
    where delivery."CALDelivery_StatusCode" in ('pending','leased')
      and delivery."CALDelivery_SendAfter" <= now()
      and (delivery."CALDelivery_LeaseUntil" is null or delivery."CALDelivery_LeaseUntil" < now())
    order by delivery."CALDelivery_SendAfter", delivery."CALDelivery_CreatedAt"
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,10),50))
  )
  update public."CAL_Deliveries" delivery
  set "CALDelivery_StatusCode"='leased',
      "CALDelivery_LeaseUntil"=now()+interval '2 minutes',
      "CALDelivery_Attempts"="CALDelivery_Attempts"+1
  from due
  where delivery."CALDelivery_ID"=due."CALDelivery_ID"
  returning delivery.*;
end;
$$;

create or replace function public.multideck_calendar_expire_holds()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  update public."CAL_Reservations" reservation
  set "CALReservation_StatusCode"='expired'
  where reservation."CALReservation_SourceCode"='hold'
    and reservation."CALReservation_StatusCode"='active'
    and reservation."CALReservation_ExpiresAt" < now();
  get diagnostics v_count = row_count;
  delete from public."CAL_PublicRateLimits" where "CALRateLimit_WindowStartedAt" < now()-interval '24 hours';
  delete from public."CAL_OAuthStates" where "CALOAuthState_ExpiresAt" < now()-interval '24 hours';
  delete from public."CAL_WebhookReceipts" where "CALWebhookReceipt_ReceivedAt" < now()-interval '30 days';
  return v_count;
end;
$$;

create or replace function public.multideck_calendar_consume_public_rate_limit(
  p_company_id uuid,
  p_action text,
  p_subject_hash text,
  p_window_started_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  if p_company_id is null or p_action not in ('hold','verify','resend','manage')
     or p_subject_hash !~ '^[0-9a-f]{64}$' or p_window_started_at is null then
    raise exception 'The public Calendar rate-limit key is invalid.' using errcode='22023';
  end if;
  insert into public."CAL_PublicRateLimits" (
    "CALRateLimit_CompanyID","CALRateLimit_ActionCode","CALRateLimit_SubjectHash",
    "CALRateLimit_WindowStartedAt","CALRateLimit_AttemptCount","CALRateLimit_UpdatedAt"
  ) values (p_company_id,p_action,p_subject_hash,p_window_started_at,1,now())
  on conflict ("CALRateLimit_CompanyID","CALRateLimit_ActionCode","CALRateLimit_SubjectHash","CALRateLimit_WindowStartedAt")
  do update set
    "CALRateLimit_AttemptCount"=least(10000,public."CAL_PublicRateLimits"."CALRateLimit_AttemptCount"+1),
    "CALRateLimit_UpdatedAt"=now()
  returning "CALRateLimit_AttemptCount" into v_count;
  return v_count;
end;
$$;

create or replace function public.multideck_calendar_record_verification_failure(
  p_hold_id uuid,
  p_booking_link_id uuid,
  p_max_attempts integer default 10
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_hold public."CAL_BookingHolds"%rowtype;
  v_attempts integer;
begin
  if p_hold_id is null or p_booking_link_id is null or p_max_attempts not between 1 and 20 then
    raise exception 'The verification-attempt request is invalid.' using errcode='22023';
  end if;

  select hold.* into v_hold
  from public."CAL_BookingHolds" hold
  where hold."CALBookingHold_ID"=p_hold_id
    and hold."CALBookingHold_BookingLinkID"=p_booking_link_id
  for update;
  if not found then
    raise exception 'That booking hold is not available.' using errcode='P0002';
  end if;

  v_attempts := least(p_max_attempts, v_hold."CALBookingHold_VerificationAttempts"+1);
  update public."CAL_BookingHolds"
  set "CALBookingHold_VerificationAttempts"=v_attempts,
      "CALBookingHold_ExpiresAt"=case when v_attempts >= p_max_attempts then least("CALBookingHold_ExpiresAt",now()) else "CALBookingHold_ExpiresAt" end
  where "CALBookingHold_ID"=p_hold_id;

  if v_attempts >= p_max_attempts and v_hold."CALBookingHold_MeetingID" is null then
    update public."CAL_Reservations"
    set "CALReservation_StatusCode"='expired'
    where "CALReservation_ID"=v_hold."CALBookingHold_ReservationID"
      and "CALReservation_StatusCode"='active';
  end if;
  return v_attempts;
end;
$$;

create or replace function public.multideck_calendar_finalise_verified_hold(
  p_hold_id uuid,
  p_booking_link_id uuid,
  p_verification_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_hold public."CAL_BookingHolds"%rowtype;
  v_link public."CAL_BookingLinks"%rowtype;
  v_reservation public."CAL_Reservations"%rowtype;
  v_meeting public."CAL_Meetings"%rowtype;
  v_status text;
  v_connection_provider text;
begin
  if p_hold_id is null or p_booking_link_id is null or p_verification_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The verified booking request is invalid.' using errcode='22023';
  end if;

  select hold.* into v_hold
  from public."CAL_BookingHolds" hold
  where hold."CALBookingHold_ID"=p_hold_id
    and hold."CALBookingHold_BookingLinkID"=p_booking_link_id
  for update;
  if not found then
    raise exception 'That booking hold is not available.' using errcode='P0002';
  end if;
  if v_hold."CALBookingHold_VerificationHash" <> p_verification_hash then
    raise exception 'The verification code does not match.' using errcode='22023';
  end if;

  if v_hold."CALBookingHold_MeetingID" is not null then
    select meeting.* into v_meeting
    from public."CAL_Meetings" meeting
    where meeting."CALMeeting_ID"=v_hold."CALBookingHold_MeetingID";
    if not found then
      raise exception 'The verified booking meeting is missing.' using errcode='55000';
    end if;
    return to_jsonb(v_meeting);
  end if;

  if v_hold."CALBookingHold_ExpiresAt" <= now() then
    raise exception 'That booking hold has expired.' using errcode='55000';
  end if;

  select link.* into v_link
  from public."CAL_BookingLinks" link
  where link."CALBookingLink_ID"=p_booking_link_id
    and link."CALBookingLink_CompanyID"=v_hold."CALBookingHold_CompanyID"
    and link."CALBookingLink_StatusCode"='active'
  for share;
  if not found then
    raise exception 'That booking link is no longer active.' using errcode='55000';
  end if;

  select reservation.* into v_reservation
  from public."CAL_Reservations" reservation
  where reservation."CALReservation_ID"=v_hold."CALBookingHold_ReservationID"
    and reservation."CALReservation_CompanyID"=v_hold."CALBookingHold_CompanyID"
    and reservation."CALReservation_OwnerUserID"=v_link."CALBookingLink_OwnerUserID"
    and reservation."CALReservation_SourceCode"='hold'
    and reservation."CALReservation_SourceID"=p_hold_id
    and reservation."CALReservation_StatusCode"='active'
    and reservation."CALReservation_ExpiresAt">now()
  for update;
  if not found then
    raise exception 'That booking time is no longer reserved.' using errcode='55000';
  end if;

  if v_link."CALBookingLink_ProviderCode" in ('google_meet','microsoft_teams','zoom') then
    v_connection_provider := case v_link."CALBookingLink_ProviderCode"
      when 'google_meet' then 'google'
      when 'microsoft_teams' then 'microsoft'
      else 'zoom'
    end;
    if not exists (
      select 1
      from public."CAL_ProviderConnections" connection
      where connection."CALConnection_CompanyID"=v_link."CALBookingLink_CompanyID"
        and connection."CALConnection_UserID"=v_link."CALBookingLink_OwnerUserID"
        and connection."CALConnection_ProviderCode"=v_connection_provider
        and connection."CALConnection_StatusCode"='connected'
    ) then
      raise exception 'The selected meeting provider is not connected.' using errcode='55000';
    end if;
    v_status := 'provisioning';
  else
    v_status := 'confirmed';
  end if;

  insert into public."CAL_Meetings" (
    "CALMeeting_CompanyID","CALMeeting_OrganiserUserID","CALMeeting_ReservationID",
    "CALMeeting_Title","CALMeeting_Agenda","CALMeeting_StartAt","CALMeeting_EndAt","CALMeeting_TimeZone",
    "CALMeeting_StatusCode","CALMeeting_ProviderCode","CALMeeting_Location","CALMeeting_BookingLinkID",
    "CALMeeting_SourceCode","CALMeeting_CreatedBy","CALMeeting_UpdatedBy"
  ) values (
    v_link."CALBookingLink_CompanyID",v_link."CALBookingLink_OwnerUserID",v_reservation."CALReservation_ID",
    v_link."CALBookingLink_Title",coalesce(nullif(btrim(v_hold."CALBookingHold_AnswersJSON"->>'notes'),''),v_link."CALBookingLink_Description"),
    v_reservation."CALReservation_StartAt",v_reservation."CALReservation_EndAt",v_hold."CALBookingHold_TimeZone",
    v_status,v_link."CALBookingLink_ProviderCode",v_link."CALBookingLink_Location",v_link."CALBookingLink_ID",
    'booking_link',v_link."CALBookingLink_OwnerUserID",v_link."CALBookingLink_OwnerUserID"
  ) on conflict ("CALMeeting_ReservationID") do nothing
  returning * into v_meeting;

  if v_meeting."CALMeeting_ID" is null then
    select meeting.* into v_meeting
    from public."CAL_Meetings" meeting
    where meeting."CALMeeting_ReservationID"=v_reservation."CALReservation_ID";
    if not found then
      raise exception 'The booking meeting could not be secured.' using errcode='55000';
    end if;
  end if;

  update public."CAL_Reservations"
  set "CALReservation_SourceCode"='meeting',
      "CALReservation_SourceID"=v_meeting."CALMeeting_ID",
      "CALReservation_ExpiresAt"=null
  where "CALReservation_ID"=v_reservation."CALReservation_ID";

  update public."CAL_BookingHolds"
  set "CALBookingHold_VerifiedAt"=coalesce("CALBookingHold_VerifiedAt",now()),
      "CALBookingHold_MeetingID"=v_meeting."CALMeeting_ID"
  where "CALBookingHold_ID"=p_hold_id;

  return to_jsonb(v_meeting);
end;
$$;

create unique index if not exists "UX_CRM_Activities_calendar_meeting"
  on public."CRM_Activities" (("CRMActivity_MetadataJSON" ->> 'calendarMeetingId'))
  where "CRMActivity_MetadataJSON" ? 'calendarMeetingId';

create or replace function public.multideck_calendar_match_or_create_booking_lead(
  p_meeting_id uuid,
  p_organiser_user_id uuid,
  p_booking_link_id uuid,
  p_attendee_name text,
  p_attendee_email text,
  p_attendee_phone text,
  p_company_entered text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(p_attendee_email), ''));
  v_lead_id uuid;
  v_meeting public."CAL_Meetings"%rowtype;
begin
  if v_email is null or position('@' in v_email) <= 1 then
    raise exception 'A valid attendee email is required.' using errcode = '22023';
  end if;

  select meeting.* into v_meeting
  from public."CAL_Meetings" meeting
  where meeting."CALMeeting_ID" = p_meeting_id
    and meeting."CALMeeting_OrganiserUserID" = p_organiser_user_id
    and meeting."CALMeeting_BookingLinkID" = p_booking_link_id;
  if not found then
    raise exception 'That booking meeting is not available for CRM linking.' using errcode = '42501';
  end if;

  -- One workspace-wide lock per normalised email keeps simultaneous booking
  -- links from creating duplicate leads before the second request can re-read.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('multideck-booking-lead:' || v_email, 0));

  select lead."CRMLead_ID" into v_lead_id
  from public."CRM_Leads" lead
  where not lead."CRMLead_IsDeleted"
    and lower(btrim(lead."CRMLead_Email")) = v_email
  order by lead."CRMLead_CreatedAt"
  limit 1;

  if v_lead_id is null then
    insert into public."CRM_Leads" (
      "CRMLead_SourceCode", "CRMLead_StatusCode", "CRMLead_OwnerUserID",
      "CRMLead_CompanyName", "CRMLead_PersonName", "CRMLead_Email", "CRMLead_Phone",
      "CRMLead_MetadataJSON", "CRMLead_CreatedBy", "CRMLead_UpdatedBy"
    ) values (
      'booking_link', 'new', p_organiser_user_id,
      nullif(btrim(p_company_entered), ''), nullif(btrim(p_attendee_name), ''), v_email, nullif(btrim(p_attendee_phone), ''),
      jsonb_build_object(
        'bookingLinkId', p_booking_link_id,
        'companyEntered', nullif(btrim(p_company_entered), ''),
        'reviewCompany', nullif(btrim(p_company_entered), '') is not null
      ),
      p_organiser_user_id, p_organiser_user_id
    ) returning "CRMLead_ID" into v_lead_id;
  end if;

  update public."CAL_Meetings"
  set "CALMeeting_LeadID" = v_lead_id,
      "CALMeeting_UpdatedAt" = now()
  where "CALMeeting_ID" = p_meeting_id
    and "CALMeeting_LeadID" is distinct from v_lead_id;

  insert into public."CRM_Activities" (
    "CRMActivity_ActivityTypeCode", "CRMActivity_LeadID", "CRMActivity_Subject",
    "CRMActivity_Summary", "CRMActivity_ActivityAt", "CRMActivity_DurationMinutes",
    "CRMActivity_OwnerUserID", "CRMActivity_MetadataJSON",
    "CRMActivity_CreatedBy", "CRMActivity_UpdatedBy"
  ) values (
    'meeting', v_lead_id, v_meeting."CALMeeting_Title",
    'Booked through a Multideck booking link.', v_meeting."CALMeeting_StartAt",
    greatest(1, round(extract(epoch from (v_meeting."CALMeeting_EndAt" - v_meeting."CALMeeting_StartAt")) / 60)::integer),
    p_organiser_user_id,
    jsonb_build_object(
      'calendarMeetingId', p_meeting_id,
      'bookingLinkId', p_booking_link_id,
      'provider', v_meeting."CALMeeting_ProviderCode",
      'status', v_meeting."CALMeeting_StatusCode"
    ),
    p_organiser_user_id, p_organiser_user_id
  ) on conflict do nothing;

  return v_lead_id;
end;
$$;

create or replace function public.multideck_calendar_configure_worker_schedule()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_endpoint text; v_secret text; v_job_id bigint;
begin
  select secret.decrypted_secret into v_endpoint from vault.decrypted_secrets secret where secret.name='multideck_calendar_worker_endpoint' limit 1;
  select secret.decrypted_secret into v_secret from vault.decrypted_secrets secret where secret.name='multideck_calendar_worker_secret' limit 1;
  if nullif(btrim(v_endpoint),'') is null or btrim(v_endpoint) !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/calendar-worker$' then
    raise exception 'Calendar worker endpoint is missing or is not an exact tenant Supabase Function URL.' using errcode='55000';
  end if;
  if nullif(btrim(v_secret),'') is null or length(v_secret) < 32 then
    raise exception 'Calendar worker secret is missing or invalid.' using errcode='55000';
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  for v_job_id in select jobid from cron.job where jobname='multideck-calendar-worker' loop perform cron.unschedule(v_job_id); end loop;
  perform cron.schedule('multideck-calendar-worker','* * * * *',$schedule$
    select net.http_post(
      url := (select btrim(secret.decrypted_secret) from vault.decrypted_secrets secret where secret.name='multideck_calendar_worker_endpoint' limit 1),
      headers := jsonb_build_object('Content-Type','application/json','x-multideck-calendar-worker',(select secret.decrypted_secret from vault.decrypted_secrets secret where secret.name='multideck_calendar_worker_secret' limit 1)),
      body := jsonb_build_object('source','cron','requestedAt',now()),
      timeout_milliseconds := 55000
    );
  $schedule$);
  return true;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'CAL_UserAvailability','CAL_ProviderConnections','CAL_OAuthStates','CAL_Reservations',
    'CAL_Meetings','CAL_MeetingParticipants','CAL_ProviderEvents','CAL_BookingLinks',
    'CAL_BookingHolds','CAL_PublicRateLimits','CAL_ManagementTokens','CAL_ChangeRequests','CAL_EmailTemplates','CAL_Deliveries','CAL_WebhookReceipts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

-- Explicit grants are required by the current Data API exposure model. These
-- tables intentionally remain service-only; browser calls use Edge Functions.
grant all on table
  public."CAL_UserAvailability", public."CAL_ProviderConnections", public."CAL_OAuthStates",
  public."CAL_Reservations", public."CAL_Meetings", public."CAL_MeetingParticipants",
  public."CAL_ProviderEvents", public."CAL_BookingLinks", public."CAL_BookingHolds",
  public."CAL_PublicRateLimits", public."CAL_ManagementTokens", public."CAL_ChangeRequests", public."CAL_EmailTemplates",
  public."CAL_Deliveries", public."CAL_WebhookReceipts"
to service_role;
revoke all on function public.multideck_calendar_claim_deliveries(integer) from public, anon, authenticated;
revoke all on function public.multideck_calendar_expire_holds() from public, anon, authenticated;
revoke all on function public.multideck_calendar_consume_public_rate_limit(uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.multideck_calendar_record_verification_failure(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.multideck_calendar_finalise_verified_hold(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.multideck_calendar_match_or_create_booking_lead(uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.multideck_calendar_configure_worker_schedule() from public, anon, authenticated;
grant execute on function public.multideck_calendar_claim_deliveries(integer) to service_role;
grant execute on function public.multideck_calendar_expire_holds() to service_role;
grant execute on function public.multideck_calendar_consume_public_rate_limit(uuid,text,text,timestamptz) to service_role;
grant execute on function public.multideck_calendar_record_verification_failure(uuid,uuid,integer) to service_role;
grant execute on function public.multideck_calendar_finalise_verified_hold(uuid,uuid,text) to service_role;
grant execute on function public.multideck_calendar_match_or_create_booking_lead(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.multideck_calendar_configure_worker_schedule() to service_role;

create or replace function public._multideck_calendar_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public."cmp_Users_Roles" user_role
    join public."sys_UserRole_Permissions" role_permission
      on role_permission."sys_UserRole_ID" = user_role."sys_UserRole_ID"
    join public."sys_Permissions" permission
      on permission."sys_Permission_ID" = role_permission."sys_Permission_ID"
    where user_role."User_ID" = p_user_id
      and permission."sys_Permission_Value" = p_permission
  );
$$;

create or replace function public.multideck_dexter_domain_calendar(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row.data order by row.start_at), '[]'::jsonb)
  from (
    select meeting."CALMeeting_StartAt" as start_at,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', meeting."CALMeeting_ID", 'recordType', 'meeting',
        'title', meeting."CALMeeting_Title", 'startAt', meeting."CALMeeting_StartAt",
        'endAt', meeting."CALMeeting_EndAt", 'timeZone', meeting."CALMeeting_TimeZone",
        'status', meeting."CALMeeting_StatusCode", 'provider', meeting."CALMeeting_ProviderCode",
        'leadId', meeting."CALMeeting_LeadID", 'accountId', meeting."CALMeeting_AccountID",
        'route', '/calendar?meeting=' || meeting."CALMeeting_ID"
      )) as data
    from public."CAL_Meetings" meeting
    where meeting."CALMeeting_CompanyID" = p_company_id
      and meeting."CALMeeting_OrganiserUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and meeting."CALMeeting_StatusCode" <> 'cancelled'
      and (nullif(btrim(coalesce(p_search,'')),'') is null
        or meeting."CALMeeting_Title" ilike '%' || btrim(p_search) || '%')
    order by meeting."CALMeeting_StartAt"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;

create or replace function public.multideck_dexter_domain_booking_links(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(jsonb_agg(row.data order by row.title), '[]'::jsonb)
  from (
    select link."CALBookingLink_Title" as title,
      jsonb_build_object(
        'recordId', link."CALBookingLink_ID", 'recordType', 'booking_link',
        'title', link."CALBookingLink_Title", 'durationMinutes', link."CALBookingLink_DurationMinutes",
        'provider', link."CALBookingLink_ProviderCode", 'status', link."CALBookingLink_StatusCode",
        'path', '/book/' || link."CALBookingLink_OrganiserSlug" || '/' || link."CALBookingLink_Slug"
      ) as data
    from public."CAL_BookingLinks" link
    where link."CALBookingLink_CompanyID" = p_company_id
      and link."CALBookingLink_OwnerUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and (nullif(btrim(coalesce(p_search,'')),'') is null
        or link."CALBookingLink_Title" ilike '%' || btrim(p_search) || '%')
    order by link."CALBookingLink_Title"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;

create or replace function public.multideck_dexter_action_create_meeting(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_start timestamptz := (p_arguments->>'start_at')::timestamptz;
  v_end timestamptz := (p_arguments->>'end_at')::timestamptz;
  v_provider text := coalesce(nullif(p_arguments->>'provider',''),'multideck');
  v_reservation uuid := gen_random_uuid();
  v_meeting public."CAL_Meetings";
  v_participant jsonb;
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageOwn') then
    raise exception 'You do not have permission to create meetings.' using errcode = '42501';
  end if;
  if v_end <= v_start or v_start < now() then
    raise exception 'Choose a future meeting with an end time after its start.' using errcode = '22023';
  end if;
  if v_provider not in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person') then
    raise exception 'Choose a supported meeting type.' using errcode = '22023';
  end if;
  if nullif(btrim(p_arguments->>'title'),'') is null then
    raise exception 'Meeting title is required.' using errcode = '22023';
  end if;
  if v_provider in ('google_meet','microsoft_teams','zoom') and not exists (
    select 1 from public."CAL_ProviderConnections" connection
    where connection."CALConnection_CompanyID"=p_company_id and connection."CALConnection_UserID"=p_user_id
      and connection."CALConnection_ProviderCode"=case when v_provider='google_meet' then 'google' when v_provider='microsoft_teams' then 'microsoft' else 'zoom' end
      and connection."CALConnection_StatusCode"='connected'
  ) then
    raise exception 'Connect the selected meeting provider before scheduling this meeting.' using errcode = '22023';
  end if;
  insert into public."CAL_Reservations" (
    "CALReservation_ID","CALReservation_CompanyID","CALReservation_OwnerUserID",
    "CALReservation_SourceCode","CALReservation_SourceID","CALReservation_StartAt","CALReservation_EndAt"
  ) values (v_reservation,p_company_id,p_user_id,'meeting',v_reservation,v_start,v_end);
  insert into public."CAL_Meetings" (
    "CALMeeting_CompanyID","CALMeeting_OrganiserUserID","CALMeeting_ReservationID",
    "CALMeeting_Title","CALMeeting_Agenda","CALMeeting_StartAt","CALMeeting_EndAt",
    "CALMeeting_TimeZone","CALMeeting_StatusCode","CALMeeting_ProviderCode",
    "CALMeeting_LeadID","CALMeeting_AccountID","CALMeeting_SourceCode",
    "CALMeeting_CreatedBy","CALMeeting_UpdatedBy"
  ) values (
    p_company_id,p_user_id,v_reservation,left(btrim(p_arguments->>'title'),240),
    nullif(btrim(p_arguments->>'agenda'),''),v_start,v_end,
    coalesce(nullif(btrim(p_arguments->>'time_zone'),''),'Europe/London'),
    case when v_provider in ('multideck','phone','in_person') then 'confirmed' else 'provisioning' end,
    v_provider,nullif(p_arguments->>'lead_id','')::uuid,nullif(p_arguments->>'account_id','')::uuid,
    'dexter',p_user_id,p_user_id
  ) returning * into v_meeting;
  update public."CAL_Reservations" set "CALReservation_SourceID" = v_meeting."CALMeeting_ID"
    where "CALReservation_ID" = v_reservation;
  for v_participant in select value from jsonb_array_elements(coalesce(p_arguments->'attendees','[]'::jsonb))
  loop
    if lower(btrim(v_participant->>'email')) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Each attendee needs a valid email address.' using errcode='22023';
    end if;
    insert into public."CAL_MeetingParticipants" (
      "CALParticipant_MeetingID","CALParticipant_Name","CALParticipant_Email","CALParticipant_IsExternal"
    ) values (
      v_meeting."CALMeeting_ID",left(btrim(v_participant->>'name'),240),
      lower(left(btrim(v_participant->>'email'),320)),true
    );
  end loop;
  insert into public."CRM_Activities" (
    "CRMActivity_ActivityTypeCode","CRMActivity_AccountID","CRMActivity_LeadID","CRMActivity_Subject","CRMActivity_Summary",
    "CRMActivity_ActivityAt","CRMActivity_DurationMinutes","CRMActivity_OwnerUserID","CRMActivity_MetadataJSON","CRMActivity_CreatedBy","CRMActivity_UpdatedBy"
  ) values (
    'meeting',nullif(p_arguments->>'account_id','')::uuid,nullif(p_arguments->>'lead_id','')::uuid,left(v_meeting."CALMeeting_Title",240),
    'Meeting scheduled through Dexter.',v_start,round(extract(epoch from (v_end-v_start))/60)::integer,p_user_id,
    jsonb_build_object('calendarMeetingId',v_meeting."CALMeeting_ID",'provider',v_provider,'status',v_meeting."CALMeeting_StatusCode"),p_user_id,p_user_id
  );
  if v_provider in ('google_meet','microsoft_teams','zoom') then
    insert into public."CAL_Deliveries" (
      "CALDelivery_CompanyID","CALDelivery_MeetingID","CALDelivery_KindCode","CALDelivery_IdempotencyKey"
    ) values (p_company_id,v_meeting."CALMeeting_ID",'provider_create','meeting:' || v_meeting."CALMeeting_ID" || ':provider-create:v1');
  else
    insert into public."CAL_Deliveries" (
      "CALDelivery_CompanyID","CALDelivery_MeetingID","CALDelivery_ParticipantID","CALDelivery_KindCode","CALDelivery_IdempotencyKey"
    ) select p_company_id,v_meeting."CALMeeting_ID",participant."CALParticipant_ID",'standalone_confirmation',
      'meeting:' || v_meeting."CALMeeting_ID" || ':participant:' || participant."CALParticipant_ID" || ':confirmation:v1'
    from public."CAL_MeetingParticipants" participant where participant."CALParticipant_MeetingID"=v_meeting."CALMeeting_ID";
  end if;
  return jsonb_build_object('id',v_meeting."CALMeeting_ID",'title',v_meeting."CALMeeting_Title",'status',v_meeting."CALMeeting_StatusCode");
exception when exclusion_violation then
  raise exception 'That time is no longer available.' using errcode = '23P01';
end;
$$;

create or replace function public.multideck_dexter_action_reschedule_meeting(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := (p_arguments->>'target_id')::uuid;
  v_start timestamptz := (p_arguments->>'start_at')::timestamptz;
  v_end timestamptz := (p_arguments->>'end_at')::timestamptz;
  v_meeting public."CAL_Meetings";
begin
  select * into v_meeting from public."CAL_Meetings"
  where "CALMeeting_ID"=v_id and "CALMeeting_CompanyID"=p_company_id and "CALMeeting_StatusCode" <> 'cancelled'
  for update;
  if not found or (v_meeting."CALMeeting_OrganiserUserID" <> p_user_id and not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageAll')) then
    raise exception 'That meeting is not available to change.' using errcode = '42501';
  end if;
  if v_meeting."CALMeeting_ProviderCode" in ('google_meet','microsoft_teams','zoom') then
    update public."CAL_Meetings" set
      "CALMeeting_StatusCode"='sync_pending',
      "CALMeeting_PendingChangeJSON"=jsonb_build_object('kind','reschedule','startAt',v_start,'endAt',v_end),
      "CALMeeting_EditVersion"="CALMeeting_EditVersion"+1,"CALMeeting_UpdatedBy"=p_user_id,"CALMeeting_UpdatedAt"=now()
    where "CALMeeting_ID"=v_id returning * into v_meeting;
  else
    update public."CAL_Reservations" set
      "CALReservation_StartAt"=v_start,"CALReservation_EndAt"=v_end
    where "CALReservation_ID"=v_meeting."CALMeeting_ReservationID";
    update public."CAL_Meetings" set
      "CALMeeting_StartAt"=v_start,"CALMeeting_EndAt"=v_end,"CALMeeting_StatusCode"='confirmed',
      "CALMeeting_PendingChangeJSON"=null,
      "CALMeeting_EditVersion"="CALMeeting_EditVersion"+1,"CALMeeting_UpdatedBy"=p_user_id,"CALMeeting_UpdatedAt"=now()
    where "CALMeeting_ID"=v_id returning * into v_meeting;
  end if;
  update public."CAL_Deliveries" set "CALDelivery_StatusCode"='cancelled'
  where "CALDelivery_MeetingID"=v_id and "CALDelivery_StatusCode"='pending';
  insert into public."CAL_Deliveries" (
    "CALDelivery_CompanyID","CALDelivery_MeetingID","CALDelivery_KindCode","CALDelivery_IdempotencyKey"
  ) values (p_company_id,v_id,
    case when v_meeting."CALMeeting_ProviderCode" in ('google_meet','microsoft_teams','zoom') then 'provider_update' else 'rescheduled' end,
    'meeting:'||v_id||':reschedule:v'||v_meeting."CALMeeting_EditVersion");
  return jsonb_build_object('id',v_id,'startAt',v_meeting."CALMeeting_StartAt",'endAt',v_meeting."CALMeeting_EndAt",'status',v_meeting."CALMeeting_StatusCode");
exception when exclusion_violation then
  raise exception 'That time is no longer available.' using errcode = '23P01';
end;
$$;

create or replace function public.multideck_dexter_action_cancel_meeting(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := (p_arguments->>'target_id')::uuid; v_meeting public."CAL_Meetings";
begin
  select * into v_meeting from public."CAL_Meetings"
  where "CALMeeting_ID"=v_id and "CALMeeting_CompanyID"=p_company_id and "CALMeeting_StatusCode" <> 'cancelled'
  for update;
  if not found or (v_meeting."CALMeeting_OrganiserUserID" <> p_user_id and not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageAll')) then
    raise exception 'That meeting is not available to cancel.' using errcode = '42501';
  end if;
  if v_meeting."CALMeeting_ProviderCode" in ('google_meet','microsoft_teams','zoom') then
    update public."CAL_Meetings" set "CALMeeting_StatusCode"='sync_pending',
      "CALMeeting_PendingChangeJSON"=jsonb_build_object('kind','cancel'),
      "CALMeeting_EditVersion"="CALMeeting_EditVersion"+1,"CALMeeting_UpdatedBy"=p_user_id,"CALMeeting_UpdatedAt"=now()
    where "CALMeeting_ID"=v_id returning * into v_meeting;
  else
    update public."CAL_Meetings" set "CALMeeting_StatusCode"='cancelled',
      "CALMeeting_PendingChangeJSON"=null,
      "CALMeeting_EditVersion"="CALMeeting_EditVersion"+1,"CALMeeting_UpdatedBy"=p_user_id,"CALMeeting_UpdatedAt"=now()
    where "CALMeeting_ID"=v_id returning * into v_meeting;
    update public."CAL_Reservations" set "CALReservation_StatusCode"='released'
    where "CALReservation_ID"=v_meeting."CALMeeting_ReservationID";
  end if;
  update public."CAL_Deliveries" set "CALDelivery_StatusCode"='cancelled'
  where "CALDelivery_MeetingID"=v_id and "CALDelivery_StatusCode"='pending';
  insert into public."CAL_Deliveries" (
    "CALDelivery_CompanyID","CALDelivery_MeetingID","CALDelivery_KindCode","CALDelivery_IdempotencyKey"
  ) values (p_company_id,v_id,
    case when v_meeting."CALMeeting_ProviderCode" in ('google_meet','microsoft_teams','zoom') then 'provider_cancel' else 'cancelled' end,
    'meeting:'||v_id||':cancel:v'||v_meeting."CALMeeting_EditVersion");
  return jsonb_build_object('id',v_id,'status',v_meeting."CALMeeting_StatusCode");
end;
$$;

create or replace function public.multideck_dexter_action_pause_booking_link(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := (p_arguments->>'target_id')::uuid; v_active boolean := coalesce((p_arguments->>'active')::boolean,false); v_link public."CAL_BookingLinks";
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.BookingLinks.Manage') then
    raise exception 'You do not have permission to manage booking links.' using errcode = '42501';
  end if;
  update public."CAL_BookingLinks" set "CALBookingLink_StatusCode"=case when v_active then 'active' else 'paused' end,
    "CALBookingLink_UpdatedAt"=now()
  where "CALBookingLink_ID"=v_id and "CALBookingLink_CompanyID"=p_company_id and "CALBookingLink_OwnerUserID"=p_user_id
  returning * into v_link;
  if not found then raise exception 'That booking link is not available.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id',v_id,'status',v_link."CALBookingLink_StatusCode");
end;
$$;

create or replace function public.multideck_dexter_action_create_booking_link(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider text := coalesce(nullif(p_arguments->>'provider',''),'multideck');
  v_duration integer := coalesce((p_arguments->>'duration_minutes')::integer,30);
  v_title text := nullif(btrim(p_arguments->>'title'),'');
  v_name text; v_organiser_slug text; v_slug text; v_link public."CAL_BookingLinks";
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.BookingLinks.Manage') then raise exception 'You do not have permission to manage booking links.' using errcode='42501'; end if;
  if v_title is null then raise exception 'Booking link title is required.' using errcode='22023'; end if;
  if v_duration < 15 or v_duration > 240 or mod(v_duration,5) <> 0 then raise exception 'Choose a duration between 15 minutes and 4 hours.' using errcode='22023'; end if;
  if v_provider not in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person') then raise exception 'Choose a supported meeting type.' using errcode='22023'; end if;
  if v_provider in ('google_meet','microsoft_teams','zoom') and not exists (
    select 1 from public."CAL_ProviderConnections" connection where connection."CALConnection_CompanyID"=p_company_id and connection."CALConnection_UserID"=p_user_id
      and connection."CALConnection_ProviderCode"=case when v_provider='google_meet' then 'google' when v_provider='microsoft_teams' then 'microsoft' else 'zoom' end and connection."CALConnection_StatusCode"='connected'
  ) then raise exception 'Connect the selected meeting provider before creating this booking link.' using errcode='22023'; end if;
  select coalesce(nullif(btrim(concat_ws(' ',"User_Firstname","User_Lastname")),''),split_part("User_Email",'@',1)) into v_name from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id;
  v_organiser_slug := trim(both '-' from regexp_replace(lower(coalesce(v_name,'meet')),'[^a-z0-9]+','-','g'));
  v_slug := trim(both '-' from regexp_replace(lower(v_title),'[^a-z0-9]+','-','g'));
  if v_slug='' then v_slug:='meeting'; end if;
  if exists (select 1 from public."CAL_BookingLinks" where "CALBookingLink_OrganiserSlug"=v_organiser_slug and "CALBookingLink_Slug"=v_slug) then v_slug:=left(v_slug,50)||'-'||left(replace(gen_random_uuid()::text,'-',''),8); end if;
  insert into public."CAL_BookingLinks" (
    "CALBookingLink_CompanyID","CALBookingLink_OwnerUserID","CALBookingLink_OrganiserSlug","CALBookingLink_Slug","CALBookingLink_Title","CALBookingLink_Description",
    "CALBookingLink_DurationMinutes","CALBookingLink_ProviderCode","CALBookingLink_Location","CALBookingLink_StatusCode","CALBookingLink_QuestionsJSON"
  ) values (p_company_id,p_user_id,v_organiser_slug,v_slug,left(v_title,180),nullif(left(btrim(p_arguments->>'description'),5000),''),v_duration,v_provider,nullif(left(btrim(p_arguments->>'location'),500),''),'active',
    '[{"id":"company","label":"Company","type":"short_text","required":false,"builtIn":true},{"id":"phone","label":"Phone","type":"short_text","required":false,"builtIn":true},{"id":"notes","label":"What would you like to discuss?","type":"long_text","required":false,"builtIn":true}]'::jsonb
  ) returning * into v_link;
  return jsonb_build_object('id',v_link."CALBookingLink_ID",'title',v_link."CALBookingLink_Title",'status',v_link."CALBookingLink_StatusCode",'path','/book/'||v_link."CALBookingLink_OrganiserSlug"||'/'||v_link."CALBookingLink_Slug");
end;
$$;

create or replace function public.multideck_dexter_action_edit_booking_link(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid := (p_arguments->>'target_id')::uuid; v_link public."CAL_BookingLinks"; v_duration integer; v_provider text;
begin
  if not public._multideck_calendar_has_permission(p_user_id,'Calendar.BookingLinks.Manage') then raise exception 'You do not have permission to manage booking links.' using errcode='42501'; end if;
  select * into v_link from public."CAL_BookingLinks" where "CALBookingLink_ID"=v_id and "CALBookingLink_CompanyID"=p_company_id and "CALBookingLink_OwnerUserID"=p_user_id for update;
  if not found then raise exception 'That booking link is not available.' using errcode='P0002'; end if;
  v_duration := coalesce((p_arguments->>'duration_minutes')::integer,v_link."CALBookingLink_DurationMinutes");
  v_provider := coalesce(nullif(p_arguments->>'provider',''),v_link."CALBookingLink_ProviderCode");
  if v_duration < 15 or v_duration > 240 or mod(v_duration,5) <> 0 then raise exception 'Choose a duration between 15 minutes and 4 hours.' using errcode='22023'; end if;
  if v_provider not in ('multideck','google_meet','microsoft_teams','zoom','phone','in_person') then raise exception 'Choose a supported meeting type.' using errcode='22023'; end if;
  if v_provider in ('google_meet','microsoft_teams','zoom') and not exists (
    select 1 from public."CAL_ProviderConnections" connection where connection."CALConnection_CompanyID"=p_company_id and connection."CALConnection_UserID"=p_user_id
      and connection."CALConnection_ProviderCode"=case when v_provider='google_meet' then 'google' when v_provider='microsoft_teams' then 'microsoft' else 'zoom' end and connection."CALConnection_StatusCode"='connected'
  ) then raise exception 'Connect the selected meeting provider before changing this booking link.' using errcode='22023'; end if;
  update public."CAL_BookingLinks" set
    "CALBookingLink_Title"=case when p_arguments ? 'title' then left(btrim(p_arguments->>'title'),180) else "CALBookingLink_Title" end,
    "CALBookingLink_Description"=case when p_arguments ? 'description' then nullif(left(btrim(p_arguments->>'description'),5000),'') else "CALBookingLink_Description" end,
    "CALBookingLink_DurationMinutes"=v_duration,"CALBookingLink_ProviderCode"=v_provider,
    "CALBookingLink_Location"=case when p_arguments ? 'location' then nullif(left(btrim(p_arguments->>'location'),500),'') else "CALBookingLink_Location" end,
    "CALBookingLink_UpdatedAt"=now()
  where "CALBookingLink_ID"=v_id returning * into v_link;
  if btrim(v_link."CALBookingLink_Title")='' then raise exception 'Booking link title is required.' using errcode='22023'; end if;
  return jsonb_build_object('id',v_id,'title',v_link."CALBookingLink_Title",'durationMinutes',v_link."CALBookingLink_DurationMinutes",'provider',v_link."CALBookingLink_ProviderCode",'status',v_link."CALBookingLink_StatusCode");
end;
$$;

create or replace function public.multideck_dexter_action_approve_meeting_change(p_company_id uuid, p_user_id uuid, p_arguments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := (p_arguments->>'target_id')::uuid; v_request_id uuid := (p_arguments->>'request_id')::uuid;
  v_start timestamptz := (p_arguments->>'start_at')::timestamptz; v_end timestamptz;
  v_meeting public."CAL_Meetings"; v_request public."CAL_ChangeRequests"; v_version integer;
begin
  select * into v_meeting from public."CAL_Meetings" where "CALMeeting_ID"=v_id and "CALMeeting_CompanyID"=p_company_id and "CALMeeting_StatusCode"='confirmed' for update;
  if not found or (v_meeting."CALMeeting_OrganiserUserID"<>p_user_id and not public._multideck_calendar_has_permission(p_user_id,'Calendar.ManageAll')) then raise exception 'That meeting is not available to change.' using errcode='42501'; end if;
  select * into v_request from public."CAL_ChangeRequests" where "CALChangeRequest_ID"=v_request_id and "CALChangeRequest_MeetingID"=v_id and "CALChangeRequest_StatusCode"='pending' for update;
  if not found then raise exception 'That reschedule request is no longer pending.' using errcode='P0002'; end if;
  select (candidate->>'endAt')::timestamptz into v_end from jsonb_array_elements(v_request."CALChangeRequest_ProposedTimesJSON") candidate where (candidate->>'startAt')::timestamptz=v_start limit 1;
  if v_end is null or v_end-v_start <> v_meeting."CALMeeting_EndAt"-v_meeting."CALMeeting_StartAt" then raise exception 'Choose one proposed time with the same meeting duration.' using errcode='22023'; end if;
  v_version:=v_meeting."CALMeeting_EditVersion"+1;
  if v_meeting."CALMeeting_ProviderCode" in ('google_meet','microsoft_teams','zoom') then
    update public."CAL_Meetings" set "CALMeeting_StatusCode"='sync_pending',"CALMeeting_PendingChangeJSON"=jsonb_build_object('kind','reschedule','startAt',v_start,'endAt',v_end,'changeRequestId',v_request_id,'decidedBy',p_user_id),"CALMeeting_EditVersion"=v_version,"CALMeeting_UpdatedBy"=p_user_id,"CALMeeting_UpdatedAt"=now() where "CALMeeting_ID"=v_id;
    insert into public."CAL_Deliveries" ("CALDelivery_CompanyID","CALDelivery_MeetingID","CALDelivery_KindCode","CALDelivery_IdempotencyKey") values (p_company_id,v_id,'provider_update','meeting:'||v_id||':change-request:'||v_request_id||':approved');
    return jsonb_build_object('id',v_id,'status','sync_pending','previousTimeRemainsConfirmed',true);
  end if;
  update public."CAL_Reservations" set "CALReservation_StartAt"=v_start,"CALReservation_EndAt"=v_end where "CALReservation_ID"=v_meeting."CALMeeting_ReservationID";
  update public."CAL_Meetings" set "CALMeeting_StartAt"=v_start,"CALMeeting_EndAt"=v_end,"CALMeeting_EditVersion"=v_version,"CALMeeting_UpdatedBy"=p_user_id,"CALMeeting_UpdatedAt"=now() where "CALMeeting_ID"=v_id;
  update public."CAL_ChangeRequests" set "CALChangeRequest_StatusCode"='accepted',"CALChangeRequest_SelectedStartAt"=v_start,"CALChangeRequest_SelectedEndAt"=v_end,"CALChangeRequest_DecidedBy"=p_user_id,"CALChangeRequest_DecidedAt"=now() where "CALChangeRequest_ID"=v_request_id;
  insert into public."CAL_Deliveries" ("CALDelivery_CompanyID","CALDelivery_MeetingID","CALDelivery_ParticipantID","CALDelivery_KindCode","CALDelivery_IdempotencyKey")
  select p_company_id,v_id,participant."CALParticipant_ID",case when participant."CALParticipant_ID"=v_request."CALChangeRequest_ParticipantID" then 'group_reschedule_outcome' else 'rescheduled' end,
    'meeting:'||v_id||':change-request:'||v_request_id||':participant:'||participant."CALParticipant_ID" from public."CAL_MeetingParticipants" participant where participant."CALParticipant_MeetingID"=v_id;
  return jsonb_build_object('id',v_id,'status','confirmed','startAt',v_start,'endAt',v_end);
exception when exclusion_violation then raise exception 'That proposed time is no longer available.' using errcode='23P01';
end;
$$;

revoke all on function public._multideck_calendar_has_permission(uuid,text) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_calendar(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_domain_booking_links(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_create_meeting(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_reschedule_meeting(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_cancel_meeting(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_pause_booking_link(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_create_booking_link(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_edit_booking_link(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.multideck_dexter_action_approve_meeting_change(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public._multideck_calendar_has_permission(uuid,text) to service_role;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction",
  "AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_UpdatedAt",
  "AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy"
) values
  ('calendar','Calendar','The signed-in operator''s Multideck meetings with source identifiers, provider state and confirmed times.','multideck_dexter_domain_calendar',9,true,now(),'["Calendar.Read"]'::jsonb,'["calendar","crm_activity","contact_details"]'::jsonb,'permission'),
  ('booking_links','Booking links','The signed-in operator''s reusable personal booking links and publication state.','multideck_dexter_domain_booking_links',10,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'["calendar","public_link"]'::jsonb,'owner')
on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name"=excluded."AIDexterDomain_Name","AIDexterDomain_Description"=excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder"=excluded."AIDexterDomain_SortOrder",
  "AIDexterDomain_IsActive"=true,"AIDexterDomain_UpdatedAt"=now(),
  "AIDexterDomain_RequiredPermissionsJSON"=excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_DataCategoriesJSON"=excluded."AIDexterDomain_DataCategoriesJSON",
  "AIDexterDomain_ScopeStrategy"=excluded."AIDexterDomain_ScopeStrategy";

insert into public."sys_AIDexterActions" (
  "AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description",
  "AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive",
  "AIDexterAction_UpdatedAt","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy","AIDexterAction_HasExternalEffect"
) values
  ('create_meeting','calendar','Schedule meeting','Create a reviewable meeting and queue provider invitations only after approval.','multideck_dexter_action_create_meeting','{"type":"object","properties":{"title":{"type":"string"},"agenda":{"type":["string","null"]},"start_at":{"type":"string"},"end_at":{"type":"string"},"time_zone":{"type":"string"},"provider":{"type":"string","enum":["multideck","google_meet","microsoft_teams","zoom","phone","in_person"]},"attendees":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string"}},"required":["name","email"],"additionalProperties":false}},"lead_id":{"type":["string","null"]},"account_id":{"type":["string","null"]},"reason":{"type":"string"}},"required":["title","agenda","start_at","end_at","time_zone","provider","attendees","lead_id","account_id","reason"],"additionalProperties":false}'::jsonb,12,true,now(),'["Calendar.ManageOwn"]'::jsonb,'meeting_create','owner',true),
  ('reschedule_meeting','calendar','Reschedule meeting','Change one exact meeting time and notify attendees only after approval.','multideck_dexter_action_reschedule_meeting','{"type":"object","properties":{"target_id":{"type":"string"},"start_at":{"type":"string"},"end_at":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","start_at","end_at","reason"],"additionalProperties":false}'::jsonb,13,true,now(),'["Calendar.ManageOwn"]'::jsonb,'meeting_reschedule','owner',true),
  ('cancel_meeting','calendar','Cancel meeting','Cancel one exact meeting and notify attendees only after approval.','multideck_dexter_action_cancel_meeting','{"type":"object","properties":{"target_id":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","reason"],"additionalProperties":false}'::jsonb,14,true,now(),'["Calendar.ManageOwn"]'::jsonb,'meeting_cancel','owner',true),
  ('approve_meeting_change','calendar','Approve meeting change','Approve one exact attendee-proposed time after checking it remains free.','multideck_dexter_action_approve_meeting_change','{"type":"object","properties":{"target_id":{"type":"string"},"request_id":{"type":"string"},"start_at":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","request_id","start_at","reason"],"additionalProperties":false}'::jsonb,15,true,now(),'["Calendar.ManageOwn"]'::jsonb,'meeting_change_approval','owner',true),
  ('create_booking_link','booking_links','Create booking link','Create a personal booking type with inherited availability after approval.','multideck_dexter_action_create_booking_link','{"type":"object","properties":{"title":{"type":"string"},"description":{"type":["string","null"]},"duration_minutes":{"type":"integer","minimum":15,"maximum":240},"provider":{"type":"string","enum":["multideck","google_meet","microsoft_teams","zoom","phone","in_person"]},"location":{"type":["string","null"]},"reason":{"type":"string"}},"required":["title","description","duration_minutes","provider","location","reason"],"additionalProperties":false}'::jsonb,16,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'booking_link_create','owner',true),
  ('edit_booking_link','booking_links','Edit booking link','Edit the core meeting type fields on one personal booking link after approval.','multideck_dexter_action_edit_booking_link','{"type":"object","properties":{"target_id":{"type":"string"},"title":{"type":["string","null"]},"description":{"type":["string","null"]},"duration_minutes":{"type":["integer","null"],"minimum":15,"maximum":240},"provider":{"type":["string","null"],"enum":["multideck","google_meet","microsoft_teams","zoom","phone","in_person",null]},"location":{"type":["string","null"]},"reason":{"type":"string"}},"required":["target_id","title","description","duration_minutes","provider","location","reason"],"additionalProperties":false}'::jsonb,17,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'booking_link_edit','owner',true),
  ('pause_booking_link','booking_links','Pause booking link','Pause or reactivate one personal booking link after approval.','multideck_dexter_action_pause_booking_link','{"type":"object","properties":{"target_id":{"type":"string"},"active":{"type":"boolean"},"reason":{"type":"string"}},"required":["target_id","active","reason"],"additionalProperties":false}'::jsonb,18,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'booking_link_status','owner',true)
on conflict ("AIDexterAction_Code") do update set
  "AIDexterAction_DomainCode"=excluded."AIDexterAction_DomainCode","AIDexterAction_Name"=excluded."AIDexterAction_Name",
  "AIDexterAction_Description"=excluded."AIDexterAction_Description","AIDexterAction_Function"=excluded."AIDexterAction_Function",
  "AIDexterAction_ParametersJSON"=excluded."AIDexterAction_ParametersJSON","AIDexterAction_SortOrder"=excluded."AIDexterAction_SortOrder",
  "AIDexterAction_IsActive"=true,"AIDexterAction_UpdatedAt"=now(),
  "AIDexterAction_RequiredPermissionsJSON"=excluded."AIDexterAction_RequiredPermissionsJSON",
  "AIDexterAction_IntentFamily"=excluded."AIDexterAction_IntentFamily",
  "AIDexterAction_ScopeStrategy"=excluded."AIDexterAction_ScopeStrategy",
  "AIDexterAction_HasExternalEffect"=true;

insert into public."sys_AIDexterWatchCapabilities" (
  "AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON","AIDexterWatchCapability_SortOrder","AIDexterWatchCapability_IsActive",
  "AIDexterWatchCapability_UpdatedAt","AIDexterWatchCapability_RequiredPermissionsJSON","AIDexterWatchCapability_ScopeStrategy"
) values
  ('calendar','Calendar','Meeting confirmations, changes, attendee responses and provider sync failures.','["status","startAt","endAt","provider","response","syncError","changeRequest"]'::jsonb,9,true,now(),'["Calendar.Read"]'::jsonb,'owner'),
  ('booking_links','Booking links','New verified bookings and booking links paused because a provider needs attention.','["status","bookingCount","providerHealth"]'::jsonb,10,true,now(),'["Calendar.BookingLinks.Manage"]'::jsonb,'owner')
on conflict ("AIDexterWatchCapability_Code") do update set
  "AIDexterWatchCapability_Name"=excluded."AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description"=excluded."AIDexterWatchCapability_Description",
  "AIDexterWatchCapability_FieldsJSON"=excluded."AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_SortOrder"=excluded."AIDexterWatchCapability_SortOrder",
  "AIDexterWatchCapability_IsActive"=true,"AIDexterWatchCapability_UpdatedAt"=now(),
  "AIDexterWatchCapability_RequiredPermissionsJSON"=excluded."AIDexterWatchCapability_RequiredPermissionsJSON",
  "AIDexterWatchCapability_ScopeStrategy"=excluded."AIDexterWatchCapability_ScopeStrategy";

create or replace function public._multideck_calendar_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_company uuid; v_owner uuid; v_source uuid; v_capability text; v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'CAL_Meetings' then
    v_company := new."CALMeeting_CompanyID"; v_owner := new."CALMeeting_OrganiserUserID"; v_source := new."CALMeeting_ID"; v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('status',old."CALMeeting_StatusCode",'startAt',old."CALMeeting_StartAt",'endAt',old."CALMeeting_EndAt",'syncError',old."CALMeeting_LastSyncError"); end if;
    v_new := jsonb_build_object('status',new."CALMeeting_StatusCode",'startAt',new."CALMeeting_StartAt",'endAt',new."CALMeeting_EndAt",'syncError',new."CALMeeting_LastSyncError");
  elsif tg_table_name = 'CAL_BookingLinks' then
    v_company := new."CALBookingLink_CompanyID"; v_owner := new."CALBookingLink_OwnerUserID"; v_source := new."CALBookingLink_ID"; v_capability := 'booking_links';
    if tg_op='UPDATE' then v_old := jsonb_build_object('status',old."CALBookingLink_StatusCode"); end if;
    v_new := jsonb_build_object('status',new."CALBookingLink_StatusCode");
  elsif tg_table_name = 'CAL_MeetingParticipants' then
    select meeting."CALMeeting_CompanyID",meeting."CALMeeting_OrganiserUserID",meeting."CALMeeting_ID" into v_company,v_owner,v_source
    from public."CAL_Meetings" meeting where meeting."CALMeeting_ID"=new."CALParticipant_MeetingID";
    v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('response',old."CALParticipant_ResponseCode"); end if;
    v_new := jsonb_build_object('response',new."CALParticipant_ResponseCode",'participantId',new."CALParticipant_ID");
  elsif tg_table_name = 'CAL_ChangeRequests' then
    select meeting."CALMeeting_CompanyID",meeting."CALMeeting_OrganiserUserID",meeting."CALMeeting_ID" into v_company,v_owner,v_source
    from public."CAL_Meetings" meeting where meeting."CALMeeting_ID"=new."CALChangeRequest_MeetingID";
    v_capability := 'calendar';
    if tg_op='UPDATE' then v_old := jsonb_build_object('changeRequest',old."CALChangeRequest_StatusCode"); end if;
    v_new := jsonb_build_object('changeRequest',new."CALChangeRequest_StatusCode",'requestId',new."CALChangeRequest_ID");
  else return new; end if;
  insert into public."AI_DexterWatchSignals" (
    "AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable",
    "AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON"
  ) select v_company,v_capability,tg_table_name,v_source,v_old,v_new
  where exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_OwnerUserID"=v_owner
      and watch."AIDexterWatch_CapabilityCode"=v_capability and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=v_source)
  );
  return new;
end;
$$;

drop trigger if exists "CAL_Meetings_WatchSignal" on public."CAL_Meetings";
create trigger "CAL_Meetings_WatchSignal" after insert or update on public."CAL_Meetings"
for each row execute function public._multideck_calendar_watch_signal();
drop trigger if exists "CAL_BookingLinks_WatchSignal" on public."CAL_BookingLinks";
create trigger "CAL_BookingLinks_WatchSignal" after insert or update on public."CAL_BookingLinks"
for each row execute function public._multideck_calendar_watch_signal();
drop trigger if exists "CAL_MeetingParticipants_WatchSignal" on public."CAL_MeetingParticipants";
create trigger "CAL_MeetingParticipants_WatchSignal" after insert or update on public."CAL_MeetingParticipants"
for each row execute function public._multideck_calendar_watch_signal();
drop trigger if exists "CAL_ChangeRequests_WatchSignal" on public."CAL_ChangeRequests";
create trigger "CAL_ChangeRequests_WatchSignal" after insert or update on public."CAL_ChangeRequests"
for each row execute function public._multideck_calendar_watch_signal();
revoke all on function public._multideck_calendar_watch_signal() from public, anon, authenticated;

commit;
