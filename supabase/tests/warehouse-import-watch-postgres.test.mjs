import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { currentFunction } from './operational-access-source.mjs'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const foundation = read('20260802140000_dexter_watching_for_you')
const tables = foundation.slice(foundation.indexOf('create table if not exists'), foundation.indexOf('create index if not exists'))
const cargo = read('20260905112211_dexter_booking_cargo_parity')
const patchStart = cargo.indexOf('do $$\ndeclare definition text; previous text')
const cargoPatch = cargo.slice(patchStart, cargo.indexOf('end $$;', patchStart) + 7)

test('warehouse imports reuse deterministic owner-private watches with pause, repeat and immediate access revocation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-import-watch-')), data = join(dir, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}\n${result.stdout}`)
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create schema booking_api;
      create table public."cmp_Company"("Company_ID" uuid primary key);
      create table public."cmp_Users"("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text,can_read boolean);
      create function booking_api.has_permission(caller uuid, permission text) returns boolean language sql stable as $$select can_read and permission='Warehouse.Read' from public."cmp_Users" where "Auth_User_ID"=caller$$;
      create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
      ${tables}
      alter table public."AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
      create table public."Comm_Notifications"("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
      ${currentFunction('public', '_multideck_dexter_watch_matches').sql}
      ${currentFunction('public', '_multideck_dexter_evaluate_watch_signal').sql}
      ${cargoPatch}
      ${read('20260922170100_warehouse_watch_owner_access')}
      create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Description" text,"AIDexterDomain_UpdatedAt" timestamptz);
      insert into public."sys_AIDexterDataDomains" values('warehouse_reference','Warehouse setup',now());
      insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description") values('warehouse','Warehouse','Warehouse records');
      ${read('20260922170000_warehouse_import_dexter_boundary')}
      create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table public."WMS_Facilities"("WMSFacility_ID" uuid,"WMSFacility_OrgOfficeID" uuid);
      create table public."WMS_Items"("WMSItem_ID" uuid,"WMSItem_DefaultFacilityID" uuid,"WMSItem_SKU" text,"WMSItem_Description" text,"WMSItem_IsActive" boolean);
      create table public."WMS_Locations"("WMSLocation_ID" uuid,"WMSLocation_FacilityID" uuid,"WMSLocation_Code" text,"WMSLocation_StatusCode" text,"WMSLocation_IsActive" boolean);
      ${currentFunction('public', '_multideck_dexter_watch_warehouse_master_change').sql}
      create trigger item_change after insert or update on public."WMS_Items" for each row execute function public._multideck_dexter_watch_warehouse_master_change();
      create trigger location_change after insert or update on public."WMS_Locations" for each row execute function public._multideck_dexter_watch_warehouse_master_change();
      create trigger evaluate after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
      create function check_events(expected integer) returns void language plpgsql as $$begin
        if (select count(*) from public."AI_DexterWatchEvents")<>expected or (select count(*) from public."Comm_Notifications")<>expected then raise exception 'Expected % events, actual %',expected,(select count(*) from public."AI_DexterWatchEvents");end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Watch error: %',(select "AIDexterWatch_LastHealthError" from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error' limit 1);end if;
      end$$;
      do $$declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();office uuid:=gen_random_uuid();f uuid:=gen_random_uuid();other_f uuid:=gen_random_uuid();i uuid:=gen_random_uuid();l uuid:=gen_random_uuid();w uuid;begin
        insert into public."cmp_Company" values(c),(other_c);
        insert into public."cmp_Users" values(u,u,c,'active',true),(other_u,other_u,other_c,'active',true);
        insert into public."cmp_Offices" values(office,c),(other_c,other_c);
        insert into public."WMS_Facilities" values(f,office),(other_f,other_c);
        insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_RuleJSON")
          values(c,u,'warehouse','New items','New items','New items','{"field":"recordType","operator":"eq","value":"item"}') returning "AIDexterWatch_ID" into w;
        -- Each imported row fires through the same physical table trigger.
        insert into public."WMS_Items" values(i,f,'SKU-01','First imported item',true),(gen_random_uuid(),f,'SKU-02','Second imported item',true);perform check_events(2);
        insert into public."WMS_Locations" values(l,f,'A-01','available',true);perform check_events(2);
        update public."WMS_Items" set "WMSItem_Description"='Description update' where "WMSItem_ID"=i;perform check_events(2);
        insert into public."WMS_Items" values(gen_random_uuid(),other_f,'FOREIGN','Foreign item',true);perform check_events(2);
        update public."AI_DexterWatches" set "AIDexterWatch_RuleJSON"='{"field":"status","operator":"changed"}',"AIDexterWatch_TargetID"=l where "AIDexterWatch_ID"=w;
        update public."WMS_Locations" set "WMSLocation_StatusCode"='blocked';perform check_events(3);
        update public."WMS_Locations" set "WMSLocation_StatusCode"='reserved';perform check_events(4);
        update public."WMS_Locations" set "WMSLocation_StatusCode"='reserved';perform check_events(4);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused';
        update public."WMS_Locations" set "WMSLocation_StatusCode"='available';perform check_events(4);
        update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';
        update public."WMS_Locations" set "WMSLocation_StatusCode"='blocked';perform check_events(5);
        update public."cmp_Users" set can_read=false where "User_ID"=u;
        update public."WMS_Locations" set "WMSLocation_StatusCode"='available';perform check_events(5);
        update public."cmp_Users" set can_read=true,"User_AccessStatus"='inactive' where "User_ID"=u;
        update public."WMS_Locations" set "WMSLocation_StatusCode"='blocked';perform check_events(5);
        update public."cmp_Users" set "User_AccessStatus"='active',"Auth_User_ID"=null where "User_ID"=u;
        update public."WMS_Locations" set "WMSLocation_StatusCode"='available';perform check_events(5);
        update public."cmp_Users" set "Auth_User_ID"=u where "User_ID"=u;
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=other_u;
        update public."WMS_Locations" set "WMSLocation_StatusCode"='blocked';perform check_events(5);
        update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=u;
        update public."WMS_Locations" set "WMSLocation_StatusCode"='available';perform check_events(6);
        if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_OwnerUserID"<>u) or exists(select 1 from public."Comm_Notifications" where "CommNotif_UserID"<>u) then raise exception 'Watch recipient leaked';end if;
        if not exists(select 1 from public."sys_AIDexterDataDomains" where "AIDexterDomain_Description" like '%bulk imports through chat are unsupported%') then raise exception 'Chat import boundary missing';end if;
        if not exists(select 1 from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Description" like '%batch-completion watches are unsupported%') then raise exception 'Watch import boundary missing';end if;
      end$$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
