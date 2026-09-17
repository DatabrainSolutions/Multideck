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
test('real deterministic evaluator repeats changed events, keeps thresholds edge-triggered and rejects revoked or foreign access', {skip: !available}, () => {
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
      create trigger evaluate after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
      create function signal(c uuid,d uuid,old_stage text,new_stage text) returns void language sql as $$insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")values(c,'deals','CRM_Opportunities',d,jsonb_build_object('stage',old_stage),jsonb_build_object('stage',new_stage))$$;
      create function check_events(expected integer) returns void language plpgsql as $$begin
        if (select count(*) from public."AI_DexterWatchEvents")<>expected or (select count(*) from public."Comm_Notifications")<>expected then raise exception 'Event/notification count: expected %, actual %',expected,(select count(*) from public."AI_DexterWatchEvents");end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Evaluator swallowed an error';end if;
      end $$;
      do $$declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();d uuid:=gen_random_uuid();w uuid;begin
        insert into public."cmp_Company" values(c),(other_c);
        insert into public."cmp_Users" values(u,c,'active',true,u),(other_u,other_c,'active',true,other_u);
        insert into deals values(d,c,true);
        insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description")values('deals','Deals','Deals');
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")values(c,u,'deals','QA','QA','QA',d,'{"field":"stage","operator":"changed"}')returning "AIDexterWatch_ID" into w;
        perform signal(c,d,'A','B');perform check_events(1);
        perform signal(c,d,'B','C');perform check_events(2);
        perform signal(c,d,'C','C');perform check_events(2);
        perform signal(other_c,d,'C','D');perform signal(c,gen_random_uuid(),'C','D');perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';perform signal(c,d,'C','D');perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';perform signal(c,d,'D','E');perform check_events(3);
        update public."cmp_Users" set allowed=false where "User_ID"=u;perform signal(c,d,'E','F');perform check_events(3);
        update public."cmp_Users" set allowed=true,"User_AccessStatus"='inactive' where "User_ID"=u;perform signal(c,d,'E','F');perform check_events(3);
        update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=u;
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=other_u;perform signal(c,d,'E','F');perform check_events(3);
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=u;update deals set visible=false;perform signal(c,d,'E','F');perform check_events(3);
        update deals set visible=true;update public."AI_DexterWatches" set "AIDexterWatch_RuleJSON"='{"field":"stage","operator":"eq","value":"Won"}';
        perform signal(c,d,'E','F');perform signal(c,d,'F','Won');perform check_events(4);
        perform signal(c,d,'Won','Won');perform check_events(4);
        perform signal(c,d,'Won','F');perform signal(c,d,'F','Won');perform check_events(5);
      end $$;
    `)
  } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
