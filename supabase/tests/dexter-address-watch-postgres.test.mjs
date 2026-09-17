import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const foundation = read('20260802140000_dexter_watching_for_you')
const tableStart = foundation.indexOf('create table if not exists public."sys_AIDexterWatchCapabilities"')
const tables = foundation.slice(tableStart, foundation.indexOf('create index if not exists'))
function extract(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0)
  return source.slice(start, source.indexOf('$$;', source.indexOf('as $$', start)) + 3)
}
const evaluator = extract(read('20260802150818_dexter_email_watch_reliability'), '_multideck_dexter_evaluate_watch_signal')
const matcher = extract(read('20260802153000_dexter_email_sender_attachment_watches'), '_multideck_dexter_watch_matches')
const cargo = read('20260905112211_dexter_booking_cargo_parity')
const patchStart = cargo.indexOf('do $$\ndeclare definition text; previous text')
const cargoPatch = cargo.slice(patchStart, cargo.indexOf('end $$;', patchStart) + 7)
const migration = read('20260909205603_dexter_deal_watch_evaluation')
const addresses = read('20260909222531_dexter_address_watch_events')
test('address event adapter covers postcode, no-op audit updates, deletion, repeated changes and access boundaries', {skip: !available}, () => {
  const dir=mkdtempSync(join(tmpdir(),'dexter-deal-watch-')); const data=join(dir,'data');let started=false
  const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`);return r.stdout}
  try {
    run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
    run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
      create table public."cmp_Company" ("Company_ID" uuid primary key);
      create table public."cmp_Users" ("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text,allowed boolean,"Auth_User_ID" uuid);
      create table deals(id uuid primary key,company uuid,visible boolean);
      create function public._multideck_crm_deal_is_operator_visible(uuid,uuid) returns boolean language sql as $$select exists(select 1 from deals where id=$1 and company=$2 and visible)$$;
      create function public._multideck_crm_has_permission(uuid,text) returns boolean language sql as $$select allowed from public."cmp_Users" where "User_ID"=$1$$;
      create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
      ${tables}
      alter table public."AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
      create table public."Comm_Notifications" ("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
      ${matcher}
      ${evaluator}
      create schema booking_api;create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select false$$;
      ${cargoPatch}
      ${migration}
      create role anon;create role authenticated;
      create table public."Org_Addresses"("OrgAdd_ID" uuid primary key,"Org_ID" uuid,"OrgAdd_PostZipCode" text,"OrgAdd_UpdatedAt" timestamptz,"OrgAdd_CountyState" text);
      create table accounts(id uuid,company uuid,visible boolean);
      create function public.multideck_crm_accessible_account_ids(uuid) returns table(account_id uuid) language sql as $$select id from accounts where company=$1 and visible$$;
      ${addresses}
      ${read('20260909222710_dexter_address_county_watch')}
      create trigger evaluate after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
      create function signal(c uuid,d uuid,old_stage text,new_stage text) returns void language sql as $$insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")values(c,'deals','CRM_Opportunities',d,jsonb_build_object('stage',old_stage),jsonb_build_object('stage',new_stage))$$;
      create function check_events(expected integer) returns void language plpgsql as $$begin
        if (select count(*) from public."AI_DexterWatchEvents")<>expected or (select count(*) from public."Comm_Notifications")<>expected then raise exception 'Event/notification count: expected %, actual %',expected,(select count(*) from public."AI_DexterWatchEvents");end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Evaluator swallowed an error';end if;
      end $$;
      do $$declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();w uuid;begin
        insert into public."cmp_Company" values(c),(other_c);
        insert into public."cmp_Users" values(u,c,'active',true,u),(other_u,other_c,'active',true,other_u);
        insert into accounts values(d,c,true);
        insert into public."Org_Addresses" values(a,d,'B4 6QE',now(),'West Midlands');
        insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description") values('customers','Companies','Companies');
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")values(c,u,'customers','QA','QA','QA',d,'{"field":"addresses","operator":"changed"}') returning "AIDexterWatch_ID" into w;
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QF';perform check_events(1);
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QG';perform check_events(2);
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QG',"OrgAdd_UpdatedAt"=clock_timestamp();perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QH';perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QI';perform check_events(3);
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QJ';perform check_events(3);
        update public."cmp_Users" set allowed=true,"User_AccessStatus"='inactive' where "User_ID"=u;
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QK';perform check_events(3);
        update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=u;
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=other_u;
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QL';perform check_events(3);
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=u;
        update accounts set visible=false;
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QM';perform check_events(3);
        update accounts set visible=true;
        update public."Org_Addresses" set "OrgAdd_CountyState"='Warwickshire';perform check_events(4);
        delete from public."Org_Addresses";perform check_events(5);
        if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Body" like '%OrgAdd%') then raise exception 'Raw JSON leaked into notification';end if;
        if not exists(select 1 from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_OldJSON"#>>'{addresses,OrgAdd_PostZipCode}'='B4 6QE') then raise exception 'Missing address evidence';end if;
      end $$;
      create table public."Org_AddressTypes"("OrgAdd_ID" uuid,"OrgAddType_Type" text,"OrgAddType_IsDefault" boolean);
      create table public."Org_AddressOpeningHours"("OrgAddHours_ID" uuid default gen_random_uuid(),"OrgAddHours_OrgAddID" uuid,"OrgAddHours_DayOfWeek" integer,"OrgAddHours_OpensAt" time,"OrgAddHours_ClosesAt" time,"OrgAddHours_SortOrder" integer);
      create table public."Org_AddressOpeningOverrides"("OrgAddOverride_ID" uuid default gen_random_uuid(),"OrgAddOverride_OrgAddID" uuid,"OrgAddOverride_Date" date,"OrgAddOverride_IsClosed" boolean,"OrgAddOverride_OpensAt" time,"OrgAddOverride_ClosesAt" time,"OrgAddOverride_Note" text);
      ${read('20260909232519_dexter_address_watch_transactions')}
      truncate public."AI_DexterWatchEvents",public."Comm_Notifications";
      do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();a uuid:=gen_random_uuid();begin
        insert into public."cmp_Company" values(c);
        insert into public."cmp_Users" values(u,c,'active',true,u);
        insert into accounts values(d,c,true);
        insert into public."Org_Addresses" values(a,d,'B4 6QE',now(),null);
        insert into public."Org_AddressTypes" values(a,'Main',true);
        insert into public."Org_AddressOpeningHours" values(default,a,1,'09:00','17:00',0),(default,a,2,'09:00','17:00',0);
        execute 'set constraints all immediate';execute 'set constraints all deferred';
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")values(c,u,'customers','QA','QA','QA',d,'{"field":"addresses","operator":"changed"}');
        -- The real editor replaces child rows, including generated IDs, on save.
        delete from public."Org_AddressOpeningHours" where "OrgAddHours_OrgAddID"=a;
        insert into public."Org_AddressOpeningHours" values(default,a,2,'09:00','17:00',0),(default,a,1,'09:00','17:00',0);
        delete from public."Org_AddressTypes" where "OrgAdd_ID"=a;
        insert into public."Org_AddressTypes" values(a,'Main',true);
        execute 'set constraints all immediate';execute 'set constraints all deferred';perform check_events(0);
        update public."Org_AddressOpeningHours" set "OrgAddHours_ClosesAt"='18:00' where "OrgAddHours_OrgAddID"=a;
        update public."Org_Addresses" set "OrgAdd_PostZipCode"='B4 6QF' where "OrgAdd_ID"=a;
        insert into public."Org_AddressOpeningOverrides" values(default,a,'2026-12-25',true,null,null,'Closed');
        execute 'set constraints all immediate';execute 'set constraints all deferred';perform check_events(1);
        if exists(select 1 from public."AI_DexterAddressWatchChanges") then raise exception 'Pending changes leaked';end if;
        update public."Org_AddressTypes" set "OrgAddType_IsDefault"=false where "OrgAdd_ID"=a;
        execute 'set constraints all immediate';execute 'set constraints all deferred';perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_TargetID"=d;
        delete from public."Org_AddressOpeningOverrides" where "OrgAddOverride_OrgAddID"=a;
        execute 'set constraints all immediate';execute 'set constraints all deferred';perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_TargetID"=d;
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        update public."Org_AddressOpeningHours" set "OrgAddHours_ClosesAt"='19:00' where "OrgAddHours_OrgAddID"=a;
        execute 'set constraints all immediate';execute 'set constraints all deferred';perform check_events(2);
        update public."cmp_Users" set allowed=true where "User_ID"=u;
        delete from public."Org_Addresses" where "OrgAdd_ID"=a;
        execute 'set constraints all immediate';perform check_events(3);
        if has_table_privilege('authenticated','public."AI_DexterAddressWatchChanges"','select') then raise exception 'Pending snapshot readable';end if;
      end $$;
      create table public."Org_Master"("Org_id" uuid,"Org_AccCode" text);
      create table public."CRM_AccountProfiles"("CRMAccount_OrgID" uuid,"CRMAccount_CompanyID" uuid,"CRMAccount_ScopeCode" text);
      ${read('20260909233312_dexter_company_setup_watch')}
      truncate public."AI_DexterWatchEvents",public."Comm_Notifications";
      do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();begin
        insert into public."cmp_Company" values(c);insert into public."cmp_Users" values(u,c,'active',true,u);insert into accounts values(d,c,true);
        insert into public."Org_Master" values(d,'CUS001');insert into public."CRM_AccountProfiles" values(d,c,'standard');
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")values(c,u,'customers','Code','Code','Code',d,'{"field":"accountCode","operator":"changed"}'),(c,u,'customers','Scope','Scope','Scope',d,'{"field":"scopeCode","operator":"changed"}');
        update public."Org_Master" set "Org_AccCode"='CUS002' where "Org_id"=d;perform check_events(1);
        update public."Org_Master" set "Org_AccCode"='CUS003' where "Org_id"=d;perform check_events(2);
        update public."Org_Master" set "Org_AccCode"='CUS003' where "Org_id"=d;perform check_events(2);
        update public."CRM_AccountProfiles" set "CRMAccount_ScopeCode"='office' where "CRMAccount_OrgID"=d;perform check_events(3);
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        update public."CRM_AccountProfiles" set "CRMAccount_ScopeCode"='standard' where "CRMAccount_OrgID"=d;perform check_events(3);
        update public."cmp_Users" set allowed=true where "User_ID"=u;
        update accounts set visible=false where id=d;
        update public."Org_Master" set "Org_AccCode"='CUS004' where "Org_id"=d;perform check_events(3);
      end $$;
      alter table public."CRM_AccountProfiles" add column "CRMAccount_ID" uuid default gen_random_uuid(),add column "CRMAccount_IsDeleted" boolean default false;
      create table public."CRM_AccountOfficeAssignments"("CRMAccountOffice_ID" uuid default gen_random_uuid(),"CRMAccountOffice_AccountID" uuid,"CRMAccountOffice_CompanyID" uuid,"CRMAccountOffice_OrgOfficeID" uuid,"CRMAccountOffice_IsPrimary" boolean);
      ${read('20260909234424_dexter_office_watch_transactions')}
      truncate public."AI_DexterWatchEvents",public."Comm_Notifications";
      do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();p uuid:=gen_random_uuid();o1 uuid:=gen_random_uuid();o2 uuid:=gen_random_uuid();begin
        insert into public."cmp_Company" values(c);insert into public."cmp_Users" values(u,c,'active',true,u);insert into accounts values(d,c,true);
        insert into public."CRM_AccountProfiles" values(d,c,'standard',p,false);
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")values(c,u,'customers','Offices','Offices','Offices',d,'{"field":"responsibleOffices","operator":"changed"}');
        insert into public."CRM_AccountOfficeAssignments" values(gen_random_uuid(),p,c,o1,true),(gen_random_uuid(),p,c,o2,false);
        set constraints all immediate;set constraints all deferred;perform check_events(1);
        delete from public."CRM_AccountOfficeAssignments" where "CRMAccountOffice_AccountID"=p;
        insert into public."CRM_AccountOfficeAssignments" values(gen_random_uuid(),p,c,o2,false),(gen_random_uuid(),p,c,o1,true);
        set constraints all immediate;set constraints all deferred;perform check_events(1);
        update public."CRM_AccountOfficeAssignments" set "CRMAccountOffice_IsPrimary"=("CRMAccountOffice_OrgOfficeID"=o2) where "CRMAccountOffice_AccountID"=p;
        set constraints all immediate;set constraints all deferred;perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_TargetID"=d;
        delete from public."CRM_AccountOfficeAssignments" where "CRMAccountOffice_AccountID"=p and "CRMAccountOffice_OrgOfficeID"=o1;
        set constraints all immediate;set constraints all deferred;perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_TargetID"=d;
        insert into public."CRM_AccountOfficeAssignments" values(gen_random_uuid(),p,c,o1,false);
        set constraints all immediate;set constraints all deferred;perform check_events(3);
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        delete from public."CRM_AccountOfficeAssignments" where "CRMAccountOffice_AccountID"=p and "CRMAccountOffice_OrgOfficeID"=o1;
        set constraints all immediate;set constraints all deferred;perform check_events(3);
        update public."cmp_Users" set allowed=true where "User_ID"=u;
        update accounts set visible=false where id=d;
        delete from public."CRM_AccountOfficeAssignments" where "CRMAccountOffice_AccountID"=p;
        set constraints all immediate;set constraints all deferred;perform check_events(3);
        if exists(select 1 from public."AI_DexterOfficeWatchChanges") then raise exception 'Office queue not drained';end if;
        if has_table_privilege('authenticated','public."AI_DexterOfficeWatchChanges"','select') then raise exception 'Office queue readable';end if;
        if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Body" not like '%Responsible offices updated.%') then raise exception 'Unreadable office event';end if;
      end $$;
      create table public."Org_RelatedPartyDefaults"("OrgRelatedDefault_ID" uuid primary key,"OrgRelatedDefault_CompanyID" uuid,"OrgRelatedDefault_SourceOrgID" uuid,"OrgRelatedDefault_TargetOrgID" uuid,"OrgRelatedDefault_Priority" integer,"OrgRelatedDefault_IsActive" boolean,"OrgRelatedDefault_DestinationCountryCode" text,"OrgRelatedDefault_UpdatedAt" timestamptz);
      ${read('20260910003058_dexter_related_party_watch')}
      truncate public."AI_DexterWatchEvents",public."Comm_Notifications";
      do $$declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();rule_id uuid:=gen_random_uuid();begin
        insert into public."cmp_Company" values(c),(other_c);insert into public."cmp_Users" values(u,c,'active',true,u);insert into accounts values(d,c,true);
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")values(c,u,'customers','Related parties','Related parties','Related parties',d,'{"field":"relatedPartyDefaults","operator":"changed"}');
        insert into public."Org_RelatedPartyDefaults" values(rule_id,c,d,gen_random_uuid(),100,true,'NL',now());perform check_events(1);
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_Priority"=90 where "OrgRelatedDefault_ID"=rule_id;perform check_events(2);
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_Priority"=90,"OrgRelatedDefault_UpdatedAt"=now()+interval '1 second' where "OrgRelatedDefault_ID"=rule_id;perform check_events(2);
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_IsActive"=false where "OrgRelatedDefault_ID"=rule_id;perform check_events(3);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_TargetID"=d;
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_DestinationCountryCode"='GB' where "OrgRelatedDefault_ID"=rule_id;perform check_events(3);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_TargetID"=d;
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_DestinationCountryCode"='FR' where "OrgRelatedDefault_ID"=rule_id;perform check_events(4);
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_Priority"=80 where "OrgRelatedDefault_ID"=rule_id;perform check_events(4);
        update public."cmp_Users" set allowed=true,"Company_ID"=other_c where "User_ID"=u;
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_Priority"=70 where "OrgRelatedDefault_ID"=rule_id;perform check_events(4);
        update public."cmp_Users" set "Company_ID"=c where "User_ID"=u;update accounts set visible=false where id=d;
        update public."Org_RelatedPartyDefaults" set "OrgRelatedDefault_Priority"=60 where "OrgRelatedDefault_ID"=rule_id;perform check_events(4);
        update accounts set visible=true where id=d;
        delete from public."Org_RelatedPartyDefaults" where "OrgRelatedDefault_ID"=rule_id;perform check_events(5);
        if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Body" not like '%Related-party defaults updated.%') then raise exception 'Unreadable related-party event';end if;
      end $$;
      create table public."CRM_ContactOrganisationAssignments"("CRMContactOrg_ID" uuid primary key,"CRMContactOrg_CompanyID" uuid,"CRMContactOrg_OrgID" uuid,"CRMContactOrg_ContactID" uuid,"CRMContactOrg_JobTitle" text,"CRMContactOrg_IsCurrent" boolean,"CRMContactOrg_EndedAt" date,"CRMContactOrg_CreatedAt" timestamptz);
      ${read('20260910005253_dexter_contact_employment_watch')}
      truncate public."AI_DexterWatchEvents",public."Comm_Notifications";
      do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();assignment uuid:=gen_random_uuid();begin
        insert into public."cmp_Company" values(c);insert into public."cmp_Users" values(u,c,'active',true,u);insert into accounts values(a,c,true),(b,c,true);
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON") select c,u,'customers','Employment','Employment','Employment',id,'{"field":"contactEmployment","operator":"changed"}'::jsonb from accounts where id in(a,b);
        insert into public."CRM_ContactOrganisationAssignments" values(assignment,c,a,contact,'Operator',true,null,now());perform check_events(1);
        update public."CRM_ContactOrganisationAssignments" set "CRMContactOrg_CreatedAt"=now()+interval '1 second' where "CRMContactOrg_ID"=assignment;perform check_events(1);
        update public."CRM_ContactOrganisationAssignments" set "CRMContactOrg_JobTitle"='Manager' where "CRMContactOrg_ID"=assignment;perform check_events(2);
        update public."CRM_ContactOrganisationAssignments" set "CRMContactOrg_IsCurrent"=false,"CRMContactOrg_EndedAt"=current_date where "CRMContactOrg_ID"=assignment;perform check_events(3);
        insert into public."CRM_ContactOrganisationAssignments" values(gen_random_uuid(),c,b,contact,'Manager',true,null,now());perform check_events(4);
        if (select count(*) from public."AI_DexterWatchEvents" e join public."AI_DexterWatches" w on w."AIDexterWatch_ID"=e."AIDexterWatchEvent_WatchID" where w."AIDexterWatch_TargetID"=a)<>3 then raise exception 'Old employer not notified';end if;
        if (select count(*) from public."AI_DexterWatchEvents" e join public."AI_DexterWatches" w on w."AIDexterWatch_ID"=e."AIDexterWatchEvent_WatchID" where w."AIDexterWatch_TargetID"=b)<>1 then raise exception 'New employer not notified';end if;
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        update public."CRM_ContactOrganisationAssignments" set "CRMContactOrg_JobTitle"='Director' where "CRMContactOrg_OrgID"=b;perform check_events(4);
        update public."cmp_Users" set allowed=true where "User_ID"=u;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_TargetID"=b;
        update public."CRM_ContactOrganisationAssignments" set "CRMContactOrg_JobTitle"='Chief' where "CRMContactOrg_OrgID"=b;perform check_events(4);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_TargetID"=b;
        update accounts set visible=false where id=b;delete from public."CRM_ContactOrganisationAssignments" where "CRMContactOrg_OrgID"=b;perform check_events(4);
        delete from public."CRM_ContactOrganisationAssignments" where "CRMContactOrg_ID"=assignment;perform check_events(5);
        if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Body" not like '%Contact employment updated.%') then raise exception 'Unreadable contact employment event';end if;
      end $$;
      create table public."Org_Contacts"("OrgContact_ID" uuid primary key,"Org_ID" uuid);
      create table public."OrgContact_Emails"("OrgContactEmail_ID" uuid primary key,"OrgContact_ID" uuid,"OrgContactEmail_Email" text,"OrgContactEmail_Type" integer,"OrgContactEmail_IsActive" boolean,"OrgContactEmail_IsPrimary" boolean,"OrgContactEmail_ValidFrom" timestamptz,"OrgContactEmail_ValidTo" timestamptz,"OrgContactEmail_SupersededBy" uuid);
      ${read('20260910005629_dexter_contact_email_watch')}
      truncate public."AI_DexterWatchEvents",public."Comm_Notifications";
      do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();a uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();old_email uuid:=gen_random_uuid();new_email uuid:=gen_random_uuid();begin
        insert into public."cmp_Company" values(c);insert into public."cmp_Users" values(u,c,'active',true,u);insert into accounts values(a,c,true);
        insert into public."CRM_AccountProfiles" values(a,c,'standard',gen_random_uuid(),false);
        insert into public."Org_Contacts" values(contact,a);
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON") values(c,u,'customers','Email','Email','Email',a,'{"field":"contactEmails","operator":"changed"}');
        insert into public."OrgContact_Emails" values(old_email,contact,'old@example.test',1,true,true,now(),null,null);
        set constraints all immediate;set constraints all deferred;perform check_events(1);
        update public."OrgContact_Emails" set "OrgContactEmail_IsActive"=false,"OrgContactEmail_IsPrimary"=false,"OrgContactEmail_ValidTo"=now() where "OrgContactEmail_ID"=old_email;
        insert into public."OrgContact_Emails" values(new_email,contact,'new@example.test',1,true,true,now(),null,null);
        update public."OrgContact_Emails" set "OrgContactEmail_SupersededBy"=new_email where "OrgContactEmail_ID"=old_email;
        set constraints all immediate;set constraints all deferred;perform check_events(2);
        update public."OrgContact_Emails" set "OrgContactEmail_IsPrimary"=true where "OrgContactEmail_ID"=new_email;
        set constraints all immediate;set constraints all deferred;perform check_events(2);
        update public."OrgContact_Emails" set "OrgContactEmail_Email"=' NEW@example.test ' where "OrgContactEmail_ID"=new_email;
        set constraints all immediate;set constraints all deferred;perform check_events(2);
        update public."OrgContact_Emails" set "OrgContactEmail_Email"='next@example.test' where "OrgContactEmail_ID"=new_email;
        set constraints all immediate;set constraints all deferred;perform check_events(3);
        update public."cmp_Users" set allowed=false where "User_ID"=u;
        update public."OrgContact_Emails" set "OrgContactEmail_Email"='hidden@example.test' where "OrgContactEmail_ID"=new_email;
        set constraints all immediate;set constraints all deferred;perform check_events(3);
        update public."cmp_Users" set allowed=true where "User_ID"=u;
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_TargetID"=a;
        update public."OrgContact_Emails" set "OrgContactEmail_Email"='paused@example.test' where "OrgContactEmail_ID"=new_email;
        set constraints all immediate;set constraints all deferred;perform check_events(3);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_TargetID"=a;
        delete from public."OrgContact_Emails" where "OrgContactEmail_ID"=old_email;
        set constraints all immediate;set constraints all deferred;perform check_events(4);
        update accounts set visible=false where id=a;delete from public."OrgContact_Emails" where "OrgContactEmail_ID"=new_email;
        set constraints all immediate;set constraints all deferred;perform check_events(4);
        if exists(select 1 from public."AI_DexterContactEmailWatchChanges") then raise exception 'Email queue not drained';end if;
        if has_table_privilege('authenticated','public."AI_DexterContactEmailWatchChanges"','select') then raise exception 'Email queue readable';end if;
        if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Body" not like '%Contact email details updated.%' or "AIDexterWatchEvent_Body" like '%@%') then raise exception 'Unreadable/private email event';end if;
      end $$;
    `)
  } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
