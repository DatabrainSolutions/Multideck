import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { cargoDexterFixture, cargoProjection, cargoDexterMigration, cargoDexterAssertions } from './booking-cargo-dexter-fixture.mjs'
import { mutateBookingCargo } from './booking-cargo-client-fixture.mjs'
import { cargoDecimalAssertions } from './booking-cargo-decimal-fixture.mjs'
import { containerDexterFixture, containerDexterAssertions } from './booking-container-dexter-fixture.mjs'
import { routeDexterFixture, routeDexterAssertions } from './booking-route-dexter-fixture.mjs'
import { routeModeDexterFixture, routeModeDexterAssertions } from './booking-route-mode-dexter-fixture.mjs'
import { evidenceEnvelopeMigration, documentEvidenceAssertions } from './dexter-document-evidence-postgres-fixture.mjs'
import { shipmentValueDexterFixture, shipmentValueDexterAssertions } from './booking-shipment-value-dexter-fixture.mjs'
import { quoteCargoDexterFixture, quoteCargoDexterAssertions } from './quote-cargo-dexter-fixture.mjs'
import { allocationDexterMigration, allocationDexterAssertions } from './booking-allocation-dexter-fixture.mjs'

// Executes the actual save function against disposable PostgreSQL, never a tenant.
// PG_TEST_BIN can point to a PostgreSQL bin directory in CI.
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/20260905110317_booking_stable_cargo_equipment_identity.sql', import.meta.url), 'utf8')
const decimalMigration = readFileSync(new URL('../migrations/20260905172223_booking_cargo_decimal_boundary.sql', import.meta.url), 'utf8')
const allocationMigration = readFileSync(new URL('../migrations/20260905223353_booking_cargo_equipment_allocation_boundary.sql', import.meta.url), 'utf8')
const allocationWorkspaceMigration = readFileSync(new URL('../migrations/20260905224722_booking_cargo_allocation_workspace.sql', import.meta.url), 'utf8')
const safetyEdit = mutateBookingCargo({ cargo: [{ description: 'First edited', grossWeightKg: 10,
  isHazardous: true, isTemperatureControlled: true, knownCargo: 'Hazardous; Temperature controlled; Fragile' }] }, 0, 'isHazardous', 'No').cargo[0]
function table(name) {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0)
  return baseline.slice(start, baseline.indexOf('\n);', start) + 3)
}

test('PostgreSQL: stable items, approved Dexter cargo/container/route lifecycle, watches and isolation', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-stable-items-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    const sql = `
      create role anon; create role authenticated; create role service_role;
      create schema booking_api; create schema quote_api;
      create table public."cmp_Users" ("User_ID" uuid, "Company_ID" uuid, "Auth_User_ID" uuid, "User_AccessStatus" text);
      create table public."cmp_Offices" ("Office_ID" uuid, "Company_ID" uuid);
      create table public."Org_Master" ("Org_id" uuid);
      create table public."sys_JobStatuses" ("JS_Code" text, "JS_IsActive" boolean);
      ${table('Job_Header')}
      alter table public."Job_Header"
        add column "Job_BookingReference" text, add column "Job_CustomerDeadline" date,
        add column "Job_IncotermsCode" text, add column "Job_IncotermsLocation" text,
        add column "Job_FreightChargeAmount" numeric, add column "Job_FreightChargeCurrencyCode" text,
        add column "Job_CollectionAddress" text, add column "Job_DeliveryAddress" text;
      ${table('Job_Cargo')}
      ${table('Job_Containers')}
      alter table public."Job_Cargo" add primary key ("JobCargo_ID");
      alter table public."Job_Containers" add primary key ("JobContainers_ID");
      create unique index cargo_line on public."Job_Cargo" ("JobCargo_JobID", "JobCargo_LineNo") where not "JobCargo_IsDeleted";
      ${table('Job_CargoDangerousGoods')}
      ${table('Job_ContainerSeals')}
      alter table public."Job_CargoDangerousGoods" add foreign key ("JobCargoDG_JobCargoID") references public."Job_Cargo";
      alter table public."Job_ContainerSeals" add foreign key ("JobContainerSeal_JobContainerID") references public."Job_Containers";
      create table booking_api.events (company_id uuid, job_id uuid, event_type text, summary text, metadata jsonb, actor_user_id uuid);
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select $1 = '10000000-0000-4000-8000-000000000001'::uuid$$;
      create function booking_api.workspace(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function booking_api.normalise_direction(text) returns text language sql as $$select lower($1)$$;
      create function booking_api.normalise_mode(text) returns text language sql as $$select lower($1)$$;
      create function quote_api.jsonb_has_content(jsonb) returns boolean language sql as $$select $1 <> '{}'::jsonb$$;
      ${migration}
      do $test$
      declare
        actor uuid := '10000000-0000-4000-8000-000000000001';
        company uuid := gen_random_uuid(); office uuid := gen_random_uuid(); customer uuid := gen_random_uuid();
        job uuid := gen_random_uuid(); other_job uuid := gen_random_uuid();
        c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); other_cargo uuid := gen_random_uuid();
        e1 uuid := gen_random_uuid(); other_equipment uuid := gen_random_uuid();
        saved jsonb; before_events integer; before_state jsonb; after_state jsonb;
      begin
        if has_function_privilege('anon','booking_api.save_booking(uuid,uuid,jsonb)','EXECUTE')
          or has_function_privilege('authenticated','booking_api.save_booking(uuid,uuid,jsonb)','EXECUTE') then
          raise exception 'Privileged save exposed to browser roles';
        end if;
        insert into public."cmp_Users" values(actor, company, actor, 'active');
        insert into public."cmp_Offices" values(office, company);
        insert into public."Org_Master" values(customer);
        insert into public."sys_JobStatuses" values('open',true);
        insert into public."Job_Header" ("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_BookingReference")
          values(job,1,'202609',actor,customer,office,'TEST1'),(other_job,2,'202609',actor,customer,office,'TEST2');
        insert into public."Job_Cargo" ("JobCargo_ID","JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_Length","JobCargo_CargoJSON")
          values(c1,job,1,'First',22,'{"unexposed":"retained"}'),(c2,job,2,'Second',33,'{}'),(other_cargo,other_job,1,'Other job',44,'{}');
        insert into public."Job_Containers" ("JobContainers_ID","Job_ID","JobContainer_Number","JobContainer_VGMKilos")
          values(e1,job,'TEST123',12345),(other_equipment,other_job,'OTHER456',45678);
        insert into public."Job_CargoDangerousGoods" ("JobCargoDG_JobCargoID","JobCargoDG_UNNumber") values(c1,'1234');
        insert into public."Job_ContainerSeals" ("JobContainerSeal_JobContainerID","JobContainerSeal_Number") values(e1,'SEAL1');
        saved := jsonb_build_object('cargo',jsonb_build_array(
          jsonb_build_object('id',c2,'description','Second edited','grossWeightKg',20),
          jsonb_build_object('id',c1,'description','First edited','grossWeightKg',10)),
          'containers',jsonb_build_array(jsonb_build_object('id',e1,'number','TEST123','type','40GP','grossWeightKg',12000)));
        perform booking_api.save_booking(actor,job,saved);
        perform booking_api.save_booking(actor,job,saved);
        if (select count(*) from public."Job_Cargo" where "JobCargo_JobID"=job) <> 2 then raise exception 'Ordinary save replaced cargo'; end if;
        if (select "JobCargo_LineNo" from public."Job_Cargo" where "JobCargo_ID"=c1) <> 2 then raise exception 'Reordering failed'; end if;
        if (select "JobCargo_Length" from public."Job_Cargo" where "JobCargo_ID"=c1) <> 22 then raise exception 'Unedited typed value lost'; end if;
        if (select "JobCargo_CargoJSON"->>'unexposed' from public."Job_Cargo" where "JobCargo_ID"=c1) <> 'retained' then raise exception 'JSON compatibility lost'; end if;
        if (select count(*) from public."Job_CargoDangerousGoods" dg join public."Job_Cargo" c on c."JobCargo_ID"=dg."JobCargoDG_JobCargoID" where not c."JobCargo_IsDeleted") <> 1 then raise exception 'DG relationship detached'; end if;
        if (select count(*) from public."Job_ContainerSeals" s join public."Job_Containers" e on e."JobContainers_ID"=s."JobContainerSeal_JobContainerID" where not e."JobContainer_IsDeleted") <> 1 then raise exception 'Seal detached'; end if;
        if (select "JobContainer_VGMKilos" from public."Job_Containers" where "JobContainers_ID"=e1) <> 12345 then raise exception 'VGM lost'; end if;
        perform booking_api.save_booking(actor,job,jsonb_set(saved,'{cargo,1,isHazardous}','true'));
        if not (select "JobCargo_IsHazardous" from public."Job_Cargo" where "JobCargo_ID"=c1) then raise exception 'Safety setup failed'; end if;
        perform booking_api.save_booking(actor,job,jsonb_set(saved,'{cargo,1}',
          '${JSON.stringify(safetyEdit)}'::jsonb || jsonb_build_object('id',c1)));
        if (select "JobCargo_IsHazardous" from public."Job_Cargo" where "JobCargo_ID"=c1)
          or not (select "JobCargo_IsTemperatureControlled" from public."Job_Cargo" where "JobCargo_ID"=c1)
          or (select "JobCargo_CargoJSON"->>'knownCargo' from public."Job_Cargo" where "JobCargo_ID"=c1) <> 'Temperature controlled; Fragile'
          then raise exception 'Client safety edit did not persist exactly'; end if;
        if not exists(select 1 from public."Job_CargoDangerousGoods" where "JobCargoDG_JobCargoID"=c1 and "JobCargoDG_UNNumber"='1234') then raise exception 'Safety edit lost DG evidence'; end if;
        select count(*) into before_events from booking_api.events;
        select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into before_state from public."Job_Cargo" c;
        begin
          perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object('id',other_cargo,'description','Wrong'))));
          raise exception 'Cross-job cargo accepted';
        exception when insufficient_privilege then null; end;
        begin
          perform booking_api.save_booking(actor,job,jsonb_build_object('containers',jsonb_build_array(jsonb_build_object('id',other_equipment,'number','Wrong'))));
          raise exception 'Cross-job equipment accepted';
        exception when insufficient_privilege then null; end;
        begin
          perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object('id',c1,'description','One'),jsonb_build_object('id',c1,'description','Duplicate'))));
          raise exception 'Duplicate identity accepted';
        exception when invalid_parameter_value then null; end;
        begin
          perform booking_api.save_booking(actor,job,'{"cargo":[{"description":""}]}'::jsonb);
          raise exception 'Blank description accepted';
        exception when invalid_parameter_value then null; end;
        begin
          perform booking_api.save_booking(gen_random_uuid(),job,saved);
          raise exception 'Unauthorised caller accepted';
        exception when insufficient_privilege then null; end;
        select jsonb_agg(to_jsonb(c) order by "JobCargo_ID") into after_state from public."Job_Cargo" c;
        if before_state <> after_state or before_events <> (select count(*) from booking_api.events) then raise exception 'Rejected save partially mutated data'; end if;
        perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object('id',c2,'description','Keep second'),jsonb_build_object('description','New line'))));
        if not (select "JobCargo_IsDeleted" from public."Job_Cargo" where "JobCargo_ID"=c1) then raise exception 'Omitted cargo not archived'; end if;
        if (select count(*) from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted") <> 2 then raise exception 'New cargo missing'; end if;
        if not exists(select 1 from public."Job_CargoDangerousGoods" where "JobCargoDG_JobCargoID"=c1) then raise exception 'Archived history removed'; end if;
        begin
          perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object('id',c1,'description','Stale client'))));
          raise exception 'Archived cargo resurrected';
        exception when insufficient_privilege then null; end;
        if not exists(select 1 from booking_api.events where actor_user_id=actor and metadata->'fields' ? 'cargo') then raise exception 'Save audit missing'; end if;
      end $test$;
    `
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      cargoProjection + cargoDexterFixture(table) + cargoDexterMigration + decimalMigration + cargoDexterAssertions + cargoDecimalAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      containerDexterFixture + containerDexterAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      routeDexterFixture(table) + `
        alter table public."Job_Header" add primary key("Job_ID");
        ${table('Job_PackCargoContainer')}
      ` + allocationMigration + allocationWorkspaceMigration + routeDexterAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      routeModeDexterFixture(table) + routeModeDexterAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      documentEvidenceAssertions(false) + evidenceEnvelopeMigration + documentEvidenceAssertions(true) + routeModeDexterAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      shipmentValueDexterFixture + shipmentValueDexterAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      quoteCargoDexterFixture + quoteCargoDexterAssertions)
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      allocationDexterMigration + allocationDexterAssertions)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
