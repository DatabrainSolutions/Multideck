import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction } from './operational-access-source.mjs'

const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const foundation = read('20260802140000_dexter_watching_for_you')
const tables = foundation.slice(foundation.indexOf('create table if not exists'), foundation.indexOf('create index if not exists'))
const migration = read('20260929135845_receivables_exception_approvals')
const guard = migration.slice(migration.indexOf('do $approval_watch_access$'), migration.indexOf('end $approval_watch_access$;') + 'end $approval_watch_access$;'.length)

test('receivables exception watches notify once, ignore non-matches, and enforce each recipient access', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'receivables-watch-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  }
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    run('psql', ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create table public."cmp_Company"("Company_ID" uuid primary key);
      create table public."cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text,"Auth_User_ID" uuid,can_read boolean);
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
      create table public."FIN_Documents"("FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid,"FINDoc_MetadataJSON" jsonb default '{}');
      create function public._multideck_dexter_has_permission(actor uuid,permission text) returns boolean language sql stable as $$
        select can_read and "User_AccessStatus"='active' and "Auth_User_ID" is not null and permission='Finance.Receivables.View'
        from public."cmp_Users" where "User_ID"=actor $$;
      create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
      ${tables}
      alter table public."AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,
        add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
      create table public."Comm_Notifications"("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,
        "CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
      ${currentFunction('public', '_multideck_dexter_watch_matches').sql}
      ${currentFunction('public', '_multideck_dexter_evaluate_watch_signal').sql}
      ${guard}
      ${currentFunction('public', '_multideck_receivables_decision_watch_change').sql}
      create trigger document_decision after update of "FINDoc_MetadataJSON" on public."FIN_Documents"
        for each row execute function public._multideck_receivables_decision_watch_change();
      create trigger evaluate after insert on public."AI_DexterWatchSignals"
        for each row execute function public._multideck_dexter_evaluate_watch_signal();
      create function check_events(expected integer) returns void language plpgsql as $$begin
        if (select count(*) from public."AI_DexterWatchEvents")<>expected or (select count(*) from public."Comm_Notifications")<>expected then
          raise exception 'Expected % notifications, got %',expected,(select count(*) from public."AI_DexterWatchEvents"); end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then
          raise exception 'Watch evaluator error: %',(select "AIDexterWatch_LastHealthError" from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error' limit 1); end if;
      end$$;
      create function submit_decision(document_id uuid,reason text) returns void language sql as $$
        update public."FIN_Documents" set "FINDoc_MetadataJSON"=jsonb_build_object('approvalPolicyDecision',jsonb_build_object(
          'workflow','receivables','canAuto',reason='within_policy','reason',reason,'revision',1,'reasons',jsonb_build_array(reason)))
        where "FINDoc_ID"=document_id $$;
      do $$declare c uuid:=gen_random_uuid(); foreign_c uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); denied uuid:=gen_random_uuid();
        foreign_u uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); foreign_e uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
        other_d uuid:=gen_random_uuid(); foreign_d uuid:=gen_random_uuid(); w uuid;
      begin
        insert into public."cmp_Company" values(c),(foreign_c);
        insert into public."cmp_Users" values(u,c,'active',u,true),(denied,c,'active',denied,false),(foreign_u,foreign_c,'active',foreign_u,true);
        insert into public."cmp_LegalEntities" values(e,c,true),(foreign_e,foreign_c,true);
        insert into public."FIN_Documents" values(d,e,'{}'),(other_d,e,'{}'),(foreign_d,foreign_e,'{}');
        insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description") values('finance','Finance','Finance');
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode",
          "AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")
          values(c,u,'finance','Expected job losses','Expected job losses','Watch this job loss',d,'{"field":"approvalReason","operator":"eq","value":"expected_job_loss"}') returning "AIDexterWatch_ID" into w;
        -- Another watcher has no finance access; an authorised watcher must not carry them through.
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode",
          "AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_TargetID","AIDexterWatch_RuleJSON")
          values(c,denied,'finance','Denied','Denied','Denied',d,'{"field":"approvalRequired","operator":"eq","value":true}');
        perform submit_decision(d,'within_policy'); perform check_events(0);
        perform submit_decision(d,'amount_limit'); perform check_events(0);
        perform submit_decision(d,'expected_job_loss'); perform check_events(1);
        perform submit_decision(d,'expected_job_loss'); perform check_events(1);
        perform submit_decision(other_d,'expected_job_loss'); perform submit_decision(foreign_d,'expected_job_loss'); perform check_events(1);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=w;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(1);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=w;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(2);
        update public."cmp_Users" set can_read=false where "User_ID"=u;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(2);
        update public."cmp_Users" set can_read=true,"User_AccessStatus"='inactive' where "User_ID"=u;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(2);
        update public."cmp_Users" set "User_AccessStatus"='active',"Auth_User_ID"=null where "User_ID"=u;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(2);
        update public."cmp_Users" set "Auth_User_ID"=u where "User_ID"=u;
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=foreign_u where "AIDexterWatch_ID"=w;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=u where "AIDexterWatch_ID"=w;
        perform submit_decision(d,'within_policy'); perform submit_decision(d,'expected_job_loss'); perform check_events(3);
        if exists(select 1 from public."Comm_Notifications" where "CommNotif_UserID"<>u) then raise exception 'Private notification leaked'; end if;
      end$$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
