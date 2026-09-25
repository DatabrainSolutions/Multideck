import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction } from './operational-access-source.mjs'

// Real PostgreSQL proof for Company Events: company switch, organiser role,
// draft privacy, RSVP validation and idempotency, form-change protection,
// private image policies, Dexter reads/actions and deterministic watches.
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const foundation = read('20260802140000_dexter_watching_for_you')
const tables = foundation.slice(foundation.indexOf('create table if not exists'), foundation.indexOf('create index if not exists'))
const cargo = read('20260905112211_dexter_booking_cargo_parity')
const patchStart = cargo.indexOf('do $$\ndeclare definition text; previous text')
const cargoPatch = cargo.slice(patchStart, cargo.indexOf('end $$;', patchStart) + 7)
const migration = read('20260925103452_company_events').replace(/^begin;$/m, '').replace(/^commit;$/m, '')
const maybeMigration = read('20260925160000_company_events_rsvp_maybe').replace(/^begin;$/m, '').replace(/^commit;$/m, '')
const attendeeMigration = read('20260925170000_company_events_attendee_profiles').replace(/^begin;$/m, '').replace(/^commit;$/m, '')
const invitationMigration = read('20260925180000_company_event_invitations').replace(/^begin;$/m, '').replace(/^commit;$/m, '')
const notificationMigration = read('20260925190000_company_event_publish_notifications').replace(/^begin;$/m, '').replace(/^commit;$/m, '')

const fixture = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage; create schema booking_api;
  create function booking_api.has_permission(uuid,text) returns boolean language sql stable as $$select false$$;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
  alter table storage.objects enable row level security;
  grant select, insert on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
  grant execute on function storage.foldername(text) to authenticated;
  create table public."cmp_Company"("Company_ID" uuid primary key,"Company_Name" text);
  create table public."cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_Firstname" text,"User_Lastname" text,"User_Email" text,"User_AccessStatus" text default 'active',"User_ProfilePhotoBucket" text,"User_ProfilePhotoPath" text,"User_JobTitle" text);
  create table public."cmp_Departments"("Department_ID" uuid primary key,"Company_ID" uuid,"Department_Name" text,"Department_IsActive" boolean default true);
  create table public."cmp_Users_Departments"("User_ID" uuid,"Department_ID" uuid);
  create table public."sys_UserRoles"("sys_UserRole_ID" uuid primary key default gen_random_uuid(),"sys_UserRole_Name" text);
  create table public."sys_Permissions"("sys_Permission_ID" uuid primary key default gen_random_uuid(),"sys_Permission_Value" text unique,"sys_Permission_Group" text,"sys_Permission_Name" text,"sys_Permission_Description" text);
  create table public."sys_UserRole_Permissions"("sys_UserRole_ID" uuid,"sys_Permission_ID" uuid,primary key("sys_UserRole_ID","sys_Permission_ID"));
  create table public."cmp_Users_Roles"("User_ID" uuid,"sys_UserRole_ID" uuid);
  insert into public."sys_UserRoles"("sys_UserRole_Name") values('Administrator'),('Company User');
  create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
  ${currentFunction('public', '_multideck_dexter_context').sql}
  ${tables}
  alter table public."AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
  alter table public."sys_AIDexterWatchCapabilities" add column "AIDexterWatchCapability_RequiredPermissionsJSON" jsonb,add column "AIDexterWatchCapability_ScopeStrategy" text;
  create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text primary key,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_SortOrder" int,"AIDexterDomain_IsActive" boolean,"AIDexterDomain_UpdatedAt" timestamptz,"AIDexterDomain_RequiredPermissionsJSON" jsonb,"AIDexterDomain_DataCategoriesJSON" jsonb,"AIDexterDomain_ScopeStrategy" text);
  create table public."sys_AIDexterActions"("AIDexterAction_Code" text primary key,"AIDexterAction_DomainCode" text,"AIDexterAction_Name" text,"AIDexterAction_Description" text,"AIDexterAction_Function" text,"AIDexterAction_ParametersJSON" jsonb,"AIDexterAction_SortOrder" int,"AIDexterAction_IsActive" boolean,"AIDexterAction_UpdatedAt" timestamptz,"AIDexterAction_RequiredPermissionsJSON" jsonb,"AIDexterAction_IntentFamily" text,"AIDexterAction_ScopeStrategy" text,"AIDexterAction_HasExternalEffect" boolean);
  create table public."Comm_Notifications"("CommNotif_ID" uuid primary key default gen_random_uuid(),"CommNotif_StatusCode" text not null default 'unread',"CommNotif_PriorityCode" text not null default 'normal',"CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb not null default '{}'::jsonb,"CommNotif_CreatedBy" uuid,"CommNotif_CreatedAt" timestamptz not null default now());
  ${currentFunction('public', '_multideck_dexter_watch_matches').sql}
  ${currentFunction('public', '_multideck_dexter_evaluate_watch_signal').sql}
  ${cargoPatch}
  create trigger evaluate after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
  -- Stand-in for the earlier watch creator this migration wraps.
  create function public.multideck_dexter_create_watch(p_capability text,p_title text,p_summary text,p_request text,p_target_id uuid,p_target_label text,p_rule jsonb,p_action jsonb default null)
  returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
  declare ctx record; id uuid;
  begin select * into ctx from public._multideck_dexter_context();
    insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")
    values(ctx.company_id,ctx.user_id,p_capability,p_title,p_summary,p_request,p_target_id,p_rule) returning "AIDexterWatch_ID" into id;
    return jsonb_build_object('id',id);
  end $$;
  ${migration}
  ${maybeMigration}
  ${attendeeMigration}
  ${invitationMigration}
  ${notificationMigration}
  grant usage on schema public to authenticated;
`

// Helpers run as the calling user so every check crosses the real grants.
const scenario = `
create function pg_temp.as_user(p uuid) returns void language plpgsql as $$begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text,''), false); execute 'set role authenticated';
end$$;
create function pg_temp.reset() returns void language plpgsql as $$begin execute 'reset role'; end$$;
create function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'Expected "%" from %, got "%"', p_fragment, p_sql, sqlerrm; end if;
    return;
  end;
  raise exception 'Expected failure "%" from %', p_fragment, p_sql;
end$$;
grant execute on all functions in schema pg_temp to authenticated;

do $$
declare
  c uuid := gen_random_uuid(); foreign_c uuid := gen_random_uuid();
  admin uuid := gen_random_uuid(); organiser uuid := gen_random_uuid(); colleague uuid := gen_random_uuid();
  second uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  ev jsonb; ev_id uuid; other_id uuid; away_id uuid; dept uuid := gen_random_uuid(); foreign_dept uuid := gen_random_uuid(); people_id uuid; dept_id uuid; req uuid := gen_random_uuid(); version int; img text; w uuid; n int;
begin
  insert into public."cmp_Company" values (c,'Jenkar'),(foreign_c,'Elsewhere');
  insert into public."cmp_Users"("User_ID","Auth_User_ID","Company_ID","User_Firstname","User_Lastname","User_Email") values
    (admin,admin,c,'Ada','Admin','ada@example.test'),(organiser,organiser,c,'Olu','Organiser','olu@example.test'),
    (colleague,colleague,c,'Cam','Colleague','cam@example.test'),(second,second,c,'Sam','Second','sam@example.test'),
    (outsider,outsider,foreign_c,'Fay','Foreign','fay@example.test');
  insert into public."cmp_Users_Roles" select admin,"sys_UserRole_ID" from public."sys_UserRoles" where "sys_UserRole_Name"='Administrator';
  insert into public."cmp_Users_Roles" select organiser,"sys_UserRole_ID" from public."sys_UserRoles" where "sys_UserRole_Name"='Event Organiser';
  insert into public."cmp_Users_Roles" select u,"sys_UserRole_ID" from public."sys_UserRoles", unnest(array[colleague,second,organiser]) u where "sys_UserRole_Name"='Company User';
  if (select count(*) from public."sys_UserRole_Permissions" rp join public."sys_Permissions" p using("sys_Permission_ID") where p."sys_Permission_Value"='Events.Manage') <> 2 then
    raise exception 'Events.Manage must map to Administrator and Event Organiser only';
  end if;

  -- Off by default: hidden server-side, and only an administrator may switch it on.
  perform pg_temp.as_user(colleague);
  if (public.company_events_settings()->>'enabled')::boolean then raise exception 'Events must start off'; end if;
  perform pg_temp.expect_error('select public.company_events_list()', 'turned off');
  perform pg_temp.expect_error('select public.company_events_set_enabled(true)', 'administrators');
  perform pg_temp.as_user(organiser);
  perform pg_temp.expect_error('select public.company_events_set_enabled(true)', 'administrators');
  perform pg_temp.as_user(admin);
  if not (public.company_events_set_enabled(true)->>'enabled')::boolean then raise exception 'Enable failed'; end if;

  -- Tables are never reachable directly from the browser role.
  perform pg_temp.as_user(colleague);
  perform pg_temp.expect_error('select * from public.company_events', 'permission denied');
  perform pg_temp.expect_error('select * from public.company_event_rsvps', 'permission denied');
  perform pg_temp.expect_error('select private.company_event_save_for_actor(null,null,null,0,''{}'')', 'permission denied');

  -- Only organisers and administrators create; colleagues cannot see drafts.
  perform pg_temp.expect_error($q$select public.company_event_save(null,0,'{"title":"Summer party","startsAt":"2099-07-01T18:00:00Z","location":"Roof"}')$q$, 'Event organiser');
  perform pg_temp.as_user(organiser);
  perform pg_temp.expect_error($q$select public.company_event_save(null,0,'{"title":"Bad","startsAt":"2099-07-01T18:00:00Z","location":"Roof","form":[{"id":"q1","type":"single_choice","label":"Meal","options":[{"id":"a","label":"Fish"}]}]}')$q$, 'between 2 and 20');
  perform pg_temp.expect_error($q$select public.company_event_save(null,0,'{"title":"Bad","startsAt":"2099-07-01T18:00:00Z","endsAt":"2099-07-01T17:00:00Z","location":"Roof"}')$q$, 'end must be after');
  ev := public.company_event_save(null,0,$j$ {"title":"Summer party","startsAt":"2099-07-01T18:00:00Z","location":"Roof terrace","details":"Food and music.",
    "form":[{"id":"meal","type":"single_choice","label":"Meal","required":true,"options":[{"id":"fish","label":"Fish"},{"id":"veg","label":"Vegetarian"}]},
            {"id":"notes","type":"long_text","label":"Dietary notes"}]}$j$);
  ev_id := (ev->>'id')::uuid; version := (ev->>'editVersion')::int;
  other_id := (public.company_event_save(null,0,'{"title":"Quiz","startsAt":"2099-08-01T18:00:00Z","location":"Canteen"}')->>'id')::uuid;
  perform pg_temp.as_user(colleague);
  if jsonb_array_length(public.company_events_list()) <> 0 then raise exception 'Drafts leaked to colleague'; end if;
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', ev_id), 'not available');
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''going'',''{}'',null)', ev_id), 'not available');

  perform pg_temp.as_user(organiser);
  perform pg_temp.expect_error(format('select public.company_event_set_status(%L,''published'',%s)', ev_id, version + 5), 'changed while');
  version := (public.company_event_set_status(ev_id,'published',version)->>'editVersion')::int;
  perform public.company_event_set_status(other_id,'published',null);

  -- Colleagues read published events but never other people's answers.
  perform pg_temp.as_user(colleague);
  if jsonb_array_length(public.company_events_list()) <> 2 then raise exception 'Published events missing'; end if;
  ev := public.company_event_get(ev_id);
  if ev ? 'responses' then raise exception 'Responses leaked to colleague'; end if;
  perform pg_temp.expect_error(format('select public.company_event_save(%L,%s,''{"title":"x","startsAt":"2099-07-01T18:00:00Z","location":"y"}'')', ev_id, version), 'Event organiser');
  perform pg_temp.expect_error(format('select public.company_event_set_status(%L,''cancelled'',null)', ev_id), 'Event organiser');

  -- Going needs a valid form submission; retries do not write twice.
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''going'',''{}'',null)', ev_id), 'Answer "Meal"');
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''going'',''{"meal":"beef"}'',null)', ev_id), 'Choose one of the options');
  ev := public.company_event_rsvp(ev_id,'going','{"meal":"veg","notes":"No nuts","ignored":"x"}',req);
  if ev#>>'{myRsvp,status}' <> 'going' or (ev->>'goingCount')::int <> 1 or ev#>'{myRsvp,answers}' ? 'ignored' then raise exception 'RSVP not saved: %', ev; end if;
  perform public.company_event_rsvp(ev_id,'going','{"meal":"fish"}',req);
  perform pg_temp.reset();
  if (select count(*) from public.company_event_audit where kind='rsvp_going') <> 1 then raise exception 'Duplicate submission wrote twice'; end if;
  if (select answers->>'meal' from public.company_event_rsvps where user_id=colleague) <> 'veg' then raise exception 'Retry overwrote answers'; end if;

  -- Form edits keep saved answers and never change an answered question's type.
  perform pg_temp.as_user(organiser);
  perform pg_temp.expect_error(format($q$select public.company_event_save(%L,%s,'{"title":"Summer party","startsAt":"2099-07-01T18:00:00Z","location":"Roof terrace","form":[{"id":"meal","type":"short_text","label":"Meal"}]}')$q$, ev_id, version), 'cannot change type');
  ev := public.company_event_save(ev_id,version,$j$ {"title":"Summer party","startsAt":"2099-07-01T19:00:00Z","location":"Roof terrace",
    "form":[{"id":"meal","type":"single_choice","label":"Main course","required":true,"options":[{"id":"fish","label":"Fish"},{"id":"veg","label":"Vegetarian"}]},
            {"id":"plus_one","type":"yes_no","label":"Bringing a guest?","required":true}]}$j$);
  version := (ev->>'editVersion')::int;
  if (ev->>'formVersion')::int <> 2 then raise exception 'Form version not advanced'; end if;
  if ev#>>'{responses,0,form,1,label}' <> 'Dietary notes' or ev#>>'{responses,0,answers,notes}' <> 'No nuts' then raise exception 'Response snapshot lost: %', ev->'responses'; end if;
  perform pg_temp.as_user(colleague);
  ev := public.company_event_get(ev_id);
  if not (ev#>>'{myRsvp,needsUpdate}')::boolean or ev#>>'{myRsvp,status}' <> 'going' then raise exception 'Existing response not preserved as needing update'; end if;
  ev := public.company_event_rsvp(ev_id,'going','{"meal":"veg","plus_one":true}',gen_random_uuid());
  if (ev#>>'{myRsvp,needsUpdate}')::boolean then raise exception 'Updated response still flagged'; end if;
  ev := public.company_event_rsvp(ev_id,'not_going',null,gen_random_uuid());
  if ev#>>'{myRsvp,status}' <> 'not_going' or (ev->>'goingCount')::int <> 0 then raise exception 'Status change failed'; end if;
  -- Maybe needs no form answers, keeps earlier answers and is not counted as going.
  ev := public.company_event_rsvp(ev_id,'maybe',null,gen_random_uuid());
  if ev#>>'{myRsvp,status}' <> 'maybe' or (ev->>'goingCount')::int <> 0 or (ev->>'maybeCount')::int <> 1 or ev#>>'{myRsvp,answers,meal}' <> 'veg' then raise exception 'Maybe RSVP failed: %', ev; end if;
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''tentative'',null,null)', ev_id), 'yes, maybe or no');
  -- Colleagues see who answered, with the answer and photo path, but never the answers themselves.
  if ev#>>'{attendees,0,status}' <> 'maybe' or ev#>>'{attendees,0,name}' <> 'Cam Colleague' or ev->'attendees'->0 ? 'answers' then raise exception 'Attendee list wrong: %', ev->'attendees'; end if;
  perform public.company_event_rsvp(ev_id,'going','{"meal":"veg","plus_one":false}',gen_random_uuid());

  -- Foreign, inactive and unlinked callers are denied; revocation is immediate.
  perform pg_temp.as_user(outsider);
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', ev_id), 'turned off');
  perform pg_temp.reset();
  insert into public.company_event_settings(company_id,enabled) values(foreign_c,true);
  perform pg_temp.as_user(outsider);
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', ev_id), 'not available');
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''going'',''{"meal":"veg","plus_one":true}'',null)', ev_id), 'not available');
  if jsonb_array_length(public.company_events_list()) <> 0 then raise exception 'Foreign list leaked'; end if;
  perform pg_temp.as_user(stranger);
  perform pg_temp.expect_error('select public.company_events_list()', 'not linked');
  perform pg_temp.as_user(null);
  perform pg_temp.expect_error('select public.company_events_list()', 'Sign in');
  perform pg_temp.reset();
  update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=second;
  perform pg_temp.as_user(second);
  perform pg_temp.expect_error('select public.company_events_list()', 'active access');
  perform pg_temp.reset();
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=second;

  -- Private images: organisers upload under their own prefix; colleagues read only referenced, visible images.
  img := organiser::text || '/' || gen_random_uuid()::text || '.jpg';
  perform pg_temp.as_user(colleague);
  perform pg_temp.expect_error(format('insert into storage.objects values(''company-event-images'',%L)', colleague::text || '/' || gen_random_uuid()::text || '.jpg'), 'row-level security');
  perform pg_temp.as_user(organiser);
  perform pg_temp.expect_error(format('insert into storage.objects values(''company-event-images'',%L)', colleague::text || '/' || gen_random_uuid()::text || '.jpg'), 'row-level security');
  execute format('insert into storage.objects values(''company-event-images'',%L)', img);
  perform pg_temp.as_user(colleague);
  if exists(select 1 from storage.objects where name = img) then raise exception 'Unreferenced image readable'; end if;
  perform pg_temp.as_user(organiser);
  ev := public.company_event_save(ev_id,version,jsonb_build_object('title','Summer party','startsAt','2099-07-01T19:00:00Z','location','Roof terrace','imagePath',img,'form',ev->'form'));
  version := (ev->>'editVersion')::int;
  perform pg_temp.as_user(colleague);
  if not exists(select 1 from storage.objects where name = img) then raise exception 'Published image not readable'; end if;
  perform pg_temp.as_user(outsider);
  if exists(select 1 from storage.objects where name = img) then raise exception 'Image leaked to foreign company'; end if;

  -- Dexter: reads respect visibility; RSVP action refuses required forms; draft action needs the role.
  perform pg_temp.as_user(colleague);
  perform pg_temp.reset();
  perform set_config('request.jwt.claim.sub', colleague::text, false);
  if jsonb_array_length(public.multideck_dexter_domain_company_events(c,'party',10)) <> 1 then raise exception 'Dexter read missing'; end if;
  perform pg_temp.expect_error(format('select public.multideck_dexter_action_rsvp_company_event(%L,%L,''{"target_id":"%s","status":"going","reason":"x"}'')', c, colleague, ev_id), 'Open it in Events');
  if public.multideck_dexter_action_rsvp_company_event(c,second,jsonb_build_object('target_id',other_id,'status','going','reason','x'))#>>'{myRsvp,status}' <> 'going' then raise exception 'Dexter RSVP failed'; end if;
  perform pg_temp.expect_error(format('select public.multideck_dexter_action_create_company_event_draft(%L,%L,''{"title":"x","starts_at":"2099-01-01T10:00:00Z","location":"y"}'')', c, colleague), 'Event organiser');
  ev := public.multideck_dexter_action_create_company_event_draft(c,organiser,'{"title":"Away day","starts_at":"2099-09-01T09:00:00Z","location":"Lake"}');
  if ev->>'status' <> 'draft' then raise exception 'Dexter draft not a draft'; end if;
  away_id := (ev->>'id')::uuid; ev := public.company_event_get(ev_id);
  perform pg_temp.as_user(colleague);
  perform pg_temp.expect_error('select public.multideck_dexter_domain_company_events(null,null,1)', 'permission denied');

  -- Watching for you: exact visible event, fires once per real change, pause and access re-checked.
  perform pg_temp.expect_error(format('select public.multideck_dexter_create_watch(''company_events'',''t'',''s'',''r'',%L,''Away'',''{"field":"status","operator":"changed"}'')', away_id), 'Choose an event');
  w := (public.multideck_dexter_create_watch('company_events','Party','Party','Tell me if the party changes',ev_id,'Summer party','{"field":"location","operator":"changed"}')->>'id')::uuid;
  perform pg_temp.as_user(organiser);
  version := (public.company_event_save(ev_id,version,jsonb_build_object('title','Summer party','startsAt','2099-07-01T19:00:00Z','location','Garden','imagePath',img,'form',ev->'form'))->>'editVersion')::int;
  version := (public.company_event_save(ev_id,version,jsonb_build_object('title','Summer party!','startsAt','2099-07-01T19:00:00Z','location','Garden','imagePath',img,'form',ev->'form'))->>'editVersion')::int;
  perform pg_temp.reset();
  select edit_version into n from public.company_events where id=other_id;
  perform pg_temp.as_user(organiser);
  perform public.company_event_save(other_id,n,'{"title":"Quiz","startsAt":"2099-08-01T18:00:00Z","location":"Bar"}');
  perform pg_temp.reset();
  select count(*) into n from public."AI_DexterWatchEvents"; if n <> 1 then raise exception 'Expected one watch event, got %', n; end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=w;
  update public.company_events set location='Hall' where id=ev_id;
  select count(*) into n from public."AI_DexterWatchEvents"; if n <> 1 then raise exception 'Paused watch fired'; end if;
  update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active',"AIDexterWatch_RuleJSON"='{"field":"goingCount","operator":"changed"}' where "AIDexterWatch_ID"=w;
  update public.company_event_rsvps set status='not_going' where user_id=colleague and event_id=ev_id;
  select count(*) into n from public."AI_DexterWatchEvents"; if n <> 2 then raise exception 'Going count watch did not fire (%)', n; end if;
  update public.company_event_settings set enabled=false where company_id=c;
  update public.company_event_rsvps set status='going' where user_id=colleague and event_id=ev_id;
  select count(*) into n from public."AI_DexterWatchEvents"; if n <> 2 then raise exception 'Watch fired while Events off'; end if;
  update public.company_event_settings set enabled=true where company_id=c;
  update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"=colleague;
  update public.company_event_rsvps set status='not_going' where user_id=colleague and event_id=ev_id;
  select count(*) into n from public."AI_DexterWatchEvents"; if n <> 2 then raise exception 'Watch fired for inactive owner'; end if;
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=colleague;
  if exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetTable"='AI_DexterWatches' and "CommNotif_UserID"<>colleague) then raise exception 'Watch recipient leaked'; end if;

  -- Invitations are the visibility boundary: only invited colleagues (and organisers) see, open or RSVP.
  perform pg_temp.reset();
  insert into public."cmp_Departments" values (dept,c,'Warehouse',true),(foreign_dept,foreign_c,'Elsewhere',true);
  insert into public."cmp_Users_Departments" values (second,dept),(outsider,foreign_dept);
  perform pg_temp.as_user(colleague);
  perform pg_temp.expect_error('select public.company_events_directory()', 'Event organiser');
  perform pg_temp.as_user(organiser);
  ev := public.company_events_directory();
  if jsonb_array_length(ev->'people') <> 4 or ev#>>'{departments,0,name}' <> 'Warehouse' or (ev#>>'{departments,0,memberCount}')::int <> 1 then raise exception 'Directory wrong: %', ev; end if;
  if ev::text like '%Fay%' or ev::text like '%Elsewhere%' then raise exception 'Directory leaked another company'; end if;
  perform pg_temp.expect_error($q$select public.company_event_save(null,0,'{"title":"Lunch","startsAt":"2099-10-01T12:00:00Z","location":"Deli","audience":"people","invitees":[]}')$q$, 'at least one person');
  perform pg_temp.expect_error(format($q$select public.company_event_save(null,0,'{"title":"Lunch","startsAt":"2099-10-01T12:00:00Z","location":"Deli","audience":"people","invitees":["%s"]}')$q$, outsider), 'no longer available');
  perform pg_temp.expect_error(format($q$select public.company_event_save(null,0,'{"title":"Lunch","startsAt":"2099-10-01T12:00:00Z","location":"Deli","audience":"departments","invitees":["%s"]}')$q$, foreign_dept), 'department you invited');
  ev := public.company_event_save(null,0,jsonb_build_object('title','Team lunch','startsAt','2099-10-01T12:00:00Z','location','Deli','audience','people','invitees',jsonb_build_array(colleague)));
  people_id := (ev->>'id')::uuid;
  if (ev->>'invitedCount')::int <> 1 or ev#>>'{invitees,0,kind}' <> 'user' then raise exception 'People invite not saved: %', ev; end if;
  perform public.company_event_set_status(people_id,'published',null);
  perform pg_temp.reset();
  if (select count(*) from public."Comm_Notifications" where "CommNotif_TargetTable"='company_events' and "CommNotif_TargetID"=people_id) <> 1 then raise exception 'People invitation notification count wrong'; end if;
  if not exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=people_id and "CommNotif_UserID"=colleague and "CommNotif_MetadataJSON"->>'in_app_only'='true' and "CommNotif_MetadataJSON"->>'action_url'='/events/'||people_id) then raise exception 'People invitation notification wrong'; end if;
  if exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=people_id and "CommNotif_UserID" in (organiser,second,outsider)) then raise exception 'People invitation notification leaked'; end if;
  perform pg_temp.as_user(organiser);
  ev := public.company_event_save(null,0,jsonb_build_object('title','Warehouse breakfast','startsAt','2099-10-02T08:00:00Z','location','Yard','audience','departments','invitees',jsonb_build_array(dept)));
  dept_id := (ev->>'id')::uuid;
  if (ev->>'invitedCount')::int <> 1 then raise exception 'Department invite count wrong: %', ev->'invitedCount'; end if;
  perform public.company_event_set_status(dept_id,'published',null);
  perform pg_temp.reset();
  if (select count(*) from public."Comm_Notifications" where "CommNotif_TargetTable"='company_events' and "CommNotif_TargetID"=dept_id) <> 1 then raise exception 'Department invitation notification count wrong'; end if;
  if not exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=dept_id and "CommNotif_UserID"=second) then raise exception 'Department invitation notification missing'; end if;
  perform pg_temp.as_user(colleague);
  if public.company_event_get(people_id)->>'invitedCount' <> '1' or public.company_event_get(people_id) ? 'invitees' then raise exception 'Invitee view wrong'; end if;
  perform public.company_event_rsvp(people_id,'going',null,gen_random_uuid());
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', dept_id), 'not available');
  if exists(select 1 from jsonb_array_elements(public.company_events_list()) e where e->>'id' = dept_id::text) then raise exception 'Uninvited colleague sees department event'; end if;
  perform pg_temp.as_user(second);
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', people_id), 'not available');
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''going'',null,null)', people_id), 'not available');
  perform public.company_event_rsvp(dept_id,'maybe',null,gen_random_uuid());
  perform pg_temp.expect_error(format('select public.multideck_dexter_create_watch(''company_events'',''t'',''s'',''r'',%L,''Lunch'',''{"field":"status","operator":"changed"}'')', people_id), 'Choose an event');
  perform pg_temp.reset();
  perform set_config('request.jwt.claim.sub', second::text, false);
  if exists(select 1 from jsonb_array_elements(public.multideck_dexter_domain_company_events(c,'lunch',10)) e where e->>'recordId' = people_id::text) then raise exception 'Dexter read broadened invitations'; end if;
  -- Leaving the department or deactivating it removes access straight away.
  update public."cmp_Departments" set "Department_IsActive" = false where "Department_ID" = dept;
  perform pg_temp.as_user(second);
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', dept_id), 'not available');
  perform pg_temp.reset();
  update public."cmp_Departments" set "Department_IsActive" = true where "Department_ID" = dept;

  -- Cancelled events refuse RSVPs; organiser role removal takes effect immediately.
  perform pg_temp.as_user(organiser);
  perform public.company_event_set_status(ev_id,'cancelled',null,'Weather');
  perform pg_temp.as_user(colleague);
  perform pg_temp.expect_error(format('select public.company_event_rsvp(%L,''going'',''{"meal":"veg","plus_one":true}'',null)', ev_id), 'cancelled');
  if public.company_event_get(ev_id)->>'status' <> 'cancelled' then raise exception 'Cancelled event hidden'; end if;
  perform pg_temp.reset();
  delete from public."cmp_Users_Roles" where "User_ID"=organiser and "sys_UserRole_ID"=(select "sys_UserRole_ID" from public."sys_UserRoles" where "sys_UserRole_Name"='Event Organiser');
  perform pg_temp.as_user(organiser);
  perform pg_temp.expect_error(format('select public.company_event_set_status(%L,''published'',null)', away_id), 'Event organiser');
  if jsonb_array_length(public.company_events_list()) <> 2 then raise exception 'Former organiser still sees drafts'; end if;

  -- Turning Events off hides everything again.
  perform pg_temp.as_user(admin);
  perform public.company_events_set_enabled(false);
  perform pg_temp.as_user(colleague);
  perform pg_temp.expect_error(format('select public.company_event_get(%L)', ev_id), 'turned off');
  perform pg_temp.reset();
end $$;
`

test('company events enforce the switch, organiser role, private data, RSVP forms and Dexter boundaries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'company-events-')), data = join(dir, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 60_000 })
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}\n${result.stdout}`)
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], fixture + scenario)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
