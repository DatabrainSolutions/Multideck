import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')
const baseline = read('../baseline/public-schema.sql')
const migration = read('../migrations/20260905223353_booking_cargo_equipment_allocation_boundary.sql')
const { bookingCargoAllocationPayload } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(read('../../multideck.client/src/lib/booking-cargo-allocations.ts'))).toString('base64')}`)
const routingMigration = read('../migrations/20260902153715_booking_multi_leg_routes_and_cargo_dimensions.sql')
function routingFunction(name) {
  const start = routingMigration.indexOf(`create or replace function ${name}(`)
  assert.ok(start >= 0, name)
  return routingMigration.slice(start, routingMigration.indexOf('\n$$;', start) + 4)
}
function table(name) {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0, name)
  return baseline.slice(start, baseline.indexOf('\n);', start) + 3)
}

// Actual typed baseline tables, allocation migration and stable Booking save.
// Auth/permission resolution, dictionary normalisation and the older broad
// workspace assembly are explicit fixtures, not a hosted tenant simulation.
test('PostgreSQL: precise cargo/equipment allocations, leg scope, canonical save conflicts and isolation', { skip: !available }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-cargo-allocation-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  const args = ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
  const sql = text => run('psql', args, text)
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create schema booking_api; create schema quote_api;
      create table public."cmp_Users" ("User_ID" uuid,"Company_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
      create table public."cmp_Offices" ("Office_ID" uuid,"Company_ID" uuid);
      create table public."Org_Master" ("Org_id" uuid);
      create table public."sys_JobStatuses" ("JS_Code" text,"JS_IsActive" boolean);
      ${table('Job_Header')}
      alter table public."Job_Header" add primary key("Job_ID"),
        add "Job_BookingReference" text, add "Job_CustomerDeadline" date, add "Job_IncotermsCode" text,
        add "Job_IncotermsLocation" text, add "Job_FreightChargeAmount" numeric, add "Job_FreightChargeCurrencyCode" text,
        add "Job_CollectionAddress" text, add "Job_DeliveryAddress" text, add "Job_SourceSnapshotJSON" jsonb;
      ${table('Job_Cargo')}
      ${table('Job_Containers')}
      ${table('Job_Routing')}
      ${table('Job_PackCargoContainer')}
      alter table public."Job_Cargo" add primary key("JobCargo_ID");
      alter table public."Job_Containers" add primary key("JobContainers_ID");
      alter table public."Job_Routing" add primary key("JobRoute_ID");
      alter table public."Job_PackCargoContainer" add primary key("JobCargo_ID","JobContainer_ID"),
        add foreign key("JobCargo_ID") references public."Job_Cargo",
        add foreign key("JobContainer_ID") references public."Job_Containers";
      create table booking_api.events (company_id uuid,job_id uuid,event_type text,summary text,metadata jsonb,actor_user_id uuid);
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$
        select $1='10000000-0000-4000-8000-000000000001'::uuid and coalesce(current_setting('test.access',true),'on')<>'off'$$;
      create function booking_api.workspace(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function booking_api.normalise_direction(text) returns text language sql as $$select lower($1)$$;
      create function booking_api.normalise_mode(text) returns text language sql as $$select lower($1)$$;
      create function quote_api.jsonb_has_content(jsonb) returns boolean language sql as $$select $1<>'{}'::jsonb$$;
      ${read('../migrations/20260905110317_booking_stable_cargo_equipment_identity.sql')}
      ${migration}
      ${routingFunction('booking_api.save_booking_route_legs')}
      ${routingFunction('booking_api.save_booking_cargo_measurements')}
      create function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) returns void language sql as $$select$$;
      create function booking_api.workspace_extended(uuid,text) returns jsonb language sql stable as $$
        select jsonb_build_object('booking',jsonb_build_object('jobId',"Job_ID",'updatedAt',"Job_UpdatedAt"))
          from public."Job_Header" where "Job_BookingReference"=$2$$;
      ${routingFunction('public.booking_workflow_save')}
      ${read('../migrations/20260905224722_booking_cargo_allocation_workspace.sql')}
      insert into public."cmp_Users" values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active');
      insert into public."cmp_Offices" values
        ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
        ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
      insert into public."sys_JobStatuses" values('open',true);
      insert into public."Org_Master" values('40000000-0000-4000-8000-000000000001');
      insert into public."Job_Header"("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_OfficeID","Job_Customer","Job_BookingReference","Job_SourceSnapshotJSON") values
        ('50000000-0000-4000-8000-000000000001',1,'202609','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','ALLOC1','{"version":"accepted original"}'),
        ('50000000-0000-4000-8000-000000000002',2,'202609','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','FOREIGN','{}');
      insert into public."Job_Cargo"("JobCargo_ID","JobCargo_JobID","JobCargo_LineNo","JobCargo_Description","JobCargo_PackageQty","JobCargo_GrossKilos","JobCargo_VolumeCBM") values
        ('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,'Parts',100,1000,10),
        ('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',1,'Other company goods',999,999,999);
      insert into public."Job_Containers"("JobContainers_ID","Job_ID","JobContainer_Number","JobContainer_VGMKilos") values
        ('70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','FIRST',4321),
        ('70000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','SECOND',5432),
        ('70000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002','FOREIGN',6543);
      insert into public."Job_Routing"("JobRoute_ID","Job_ID","JobRoute_OrderNo","JobRoute_ModeCode") values
        ('80000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,'sea'),
        ('80000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',2,'road'),
        ('80000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002',1,'sea');
      insert into public."Job_PackCargoContainer" values('60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
      create function booking_api.test_save(lines jsonb) returns jsonb language sql as $$
        select booking_api.replace_cargo_allocations('10000000-0000-4000-8000-000000000001',"Job_ID",
          jsonb_build_object('expectedUpdatedAt',"Job_UpdatedAt",'allocations',lines))
        from public."Job_Header" where "Job_BookingReference"='ALLOC1'$$;
    `)
    sql(`do $test$
      declare actor uuid:='10000000-0000-4000-8000-000000000001';job uuid:='50000000-0000-4000-8000-000000000001';
        cargo uuid:='60000000-0000-4000-8000-000000000001';first uuid:='70000000-0000-4000-8000-000000000001';
        second uuid:='70000000-0000-4000-8000-000000000002';a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
        line jsonb;lines jsonb;result jsonb;prior jsonb;before_events integer;before_header jsonb;bad jsonb;field text;
      begin
        result:=booking_api.cargo_allocation_state(actor,job);
        if result->'allocations'<>'[]' or jsonb_array_length(result->'legacyUnquantifiedLinks')<>1 then raise exception 'Legacy link was lost or guessed';end if;
        line:=jsonb_build_object('id',a,'cargoId',cargo,'containerId',first,'packageQuantity','40','grossWeightKg','400.01','volumeCbm','4.123456');
        lines:=jsonb_build_array(line,jsonb_build_object('id',b,'cargoId',cargo,'containerId',second,'packageQuantity','60','grossWeightKg','599.99','volumeCbm','5.876544'));
        result:=booking_api.test_save(lines);prior:=result;
        if not(result->>'changed')::boolean or result#>>'{balances,0,remainingPackages}'<>'0.000000'
          or result#>>'{balances,0,remainingGrossWeightKg}'<>'0.00' or result#>>'{balances,0,remainingVolumeCbm}'<>'0.000000'
          or result#>>'{allocations,0,volumeCbm}'<>'4.123456' then raise exception 'Exact allocation/read failed: %',result;end if;
        result:=booking_api.test_save(jsonb_build_array(line||jsonb_build_object('containerId',second),lines->1||jsonb_build_object('containerId',first)));
        if result#>>'{allocations,0,id}'<>a::text or result#>>'{allocations,0,containerId}'<>second::text then raise exception 'Atomic equipment swap changed identity';end if;
        prior:=booking_api.test_save(lines);
        select count(*) into before_events from booking_api.events;
        result:=booking_api.test_save(lines);
        if (result->>'changed')::boolean or result->'updatedAt'<>prior->'updatedAt' or (select count(*) from booking_api.events)<>before_events then raise exception 'No-op changed audit/header';end if;
        select to_jsonb(j) into before_header from public."Job_Header" j where "Job_ID"=job;
        for bad in select value from jsonb_array_elements('[{"packageQuantity":"61"},{"grossWeightKg":"600"},{"volumeCbm":"6"}]') loop
          begin perform booking_api.test_save(jsonb_build_array(line,lines->1||bad));raise exception 'Over-allocation accepted';
          exception when check_violation then null;end;
        end loop;
        for bad in select value from jsonb_array_elements('[{"grossWeightKg":"-1"},{"grossWeightKg":"NaN"},{"grossWeightKg":"1.001"},{"volumeCbm":"1.0000001"},{"packageQuantity":"1000000000000"},{"packageQuantity":5},{"volumeCbm":true},{"notes":[]},{"profit":"20"},{"id":""},{"routeId":"00000000-0000-0000-0000-000000000000"}]') loop
          begin perform booking_api.test_save(jsonb_build_array(line,lines->1||bad));raise exception 'Invalid allocation accepted: %',bad;
          exception when invalid_parameter_value then null;end;
        end loop;
        foreach field in array array['cargoId','containerId','routeId'] loop
          bad:=jsonb_set(lines->1,array[field],to_jsonb(case field when 'cargoId' then '60000000-0000-4000-8000-000000000002' when 'containerId' then '70000000-0000-4000-8000-000000000003' else '80000000-0000-4000-8000-000000000003' end));
          begin perform booking_api.test_save(jsonb_build_array(line,bad));raise exception 'Foreign allocation member accepted';
          exception when insufficient_privilege then null;end;
        end loop;
        begin perform booking_api.test_save(jsonb_build_array(line,line));raise exception 'Duplicate ID accepted';exception when invalid_parameter_value then null;end;
        begin perform booking_api.test_save(jsonb_build_array(line,jsonb_set(line,'{id}',to_jsonb(b))));raise exception 'Duplicate slot accepted';exception when invalid_parameter_value then null;end;
        if (select count(*) from booking_api.events)<>before_events or before_header is distinct from (select to_jsonb(j) from public."Job_Header" j where "Job_ID"=job)
          or booking_api.cargo_allocation_state(actor,job)->'allocations' is distinct from prior->'allocations' then raise exception 'Rejected batch leaked writes';end if;

        -- Same cargo can travel once on each successive leg, not twice on one.
        lines:=jsonb_build_array(line||jsonb_build_object('routeId','80000000-0000-4000-8000-000000000001','packageQuantity','100','grossWeightKg','1000','volumeCbm','10'),
          lines->1||jsonb_build_object('routeId','80000000-0000-4000-8000-000000000002','packageQuantity','100','grossWeightKg','1000','volumeCbm','10'));
        result:=booking_api.test_save(lines);
        if jsonb_array_length(result->'balances')<>2 then raise exception 'Successive leg cargo counted twice';end if;
        begin perform booking_api.test_save(jsonb_build_array(lines->0,(lines->1)-'routeId'));raise exception 'Mixed whole journey scope accepted';exception when check_violation then null;end;

        -- A real canonical Booking edit may not quietly leave impossible totals.
        begin
          perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object('id',cargo,'description','Reduced','grossWeightKg',900))));
          set constraints all immediate;
          raise exception 'Canonical reduction bypassed allocations';
        exception when check_violation then null;end;
        if (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=cargo)<>1000 then raise exception 'Rejected cargo edit persisted';end if;
        begin perform booking_api.save_booking(actor,job,'{"cargo":[]}'::jsonb);set constraints all immediate;raise exception 'Allocated cargo retired';exception when check_violation then null;end;
        begin perform booking_api.save_booking(actor,job,'{"containers":[]}'::jsonb);set constraints all immediate;raise exception 'Allocated container retired';exception when check_violation then null;end;
        -- Resolve allocations and cargo together, rather than a non-atomic gap.
        perform booking_api.test_save(jsonb_build_array(lines->0||'{"grossWeightKg":"800"}',lines->1||'{"grossWeightKg":"800"}'));
        perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',jsonb_build_array(jsonb_build_object('id',cargo,'description','Parts','grossWeightKg',800))));
        set constraints all immediate;set constraints all deferred;

        -- Unknown is not zero, and explicit zero remains a measured value.
        result:=booking_api.test_save(jsonb_build_array(lines->0||'{"packageQuantity":null,"grossWeightKg":null,"volumeCbm":"0"}'));
        if result#>'{balances,0,remainingPackages}'<>'null'::jsonb or result#>'{balances,0,remainingGrossWeightKg}'<>'null'::jsonb
          or result#>>'{allocations,0,volumeCbm}'<>'0.000000' then raise exception 'Unknown/zero allocation confused';end if;
        if not exists(select 1 from booking_api.cargo_equipment_allocations where id=b and is_deleted and package_quantity=100) then raise exception 'Removed allocation evidence lost';end if;
        begin perform booking_api.test_save(lines);raise exception 'Archived allocation resurrected';exception when insufficient_privilege then null;end;
        if (select "Job_SourceSnapshotJSON" from public."Job_Header" where "Job_ID"=job)<>'{"version":"accepted original"}'::jsonb
          or (select "JobContainer_VGMKilos" from public."Job_Containers" where "JobContainers_ID"=first)<>4321
          or (select count(*) from public."Job_PackCargoContainer")<>1 then raise exception 'Allocation changed Quote, VGM or legacy membership';end if;
        if exists(select 1 from booking_api.events where event_type='cargo_allocation_changed' and (actor_user_id<>actor or metadata->'after' is null)) then raise exception 'Audit actor/evidence missing';end if;
        begin perform booking_api.replace_cargo_allocations(actor,job,jsonb_build_object('expectedUpdatedAt',prior->'updatedAt','allocations','[]'::jsonb));raise exception 'Stale allocation save accepted';exception when serialization_failure then null;end;
        begin perform booking_api.cargo_allocation_state(actor,'50000000-0000-4000-8000-000000000002');raise exception 'Foreign Booking read';exception when insufficient_privilege then null;end;
        begin perform booking_api.replace_cargo_allocations(actor,'50000000-0000-4000-8000-000000000002',jsonb_build_object('expectedUpdatedAt',now(),'allocations','[]'::jsonb));raise exception 'Foreign Booking write';exception when insufficient_privilege then null;end;
        -- Exact text remains exact beyond JavaScript's safe integer range.
        update public."Job_Cargo" set "JobCargo_PackageQty"=999999999999.999999,"JobCargo_GrossKilos"=9999999999999999.99,"JobCargo_VolumeCBM"=999999999999.999999 where "JobCargo_ID"=cargo;
        result:=booking_api.test_save(jsonb_build_array(line||jsonb_build_object('id',gen_random_uuid(),
          'packageQuantity','999999999999.999999','grossWeightKg','9999999999999999.99','volumeCbm','999999999999.999999')));
        if result#>>'{allocations,0,grossWeightKg}'<>'9999999999999999.99' or result#>>'{allocations,0,packageQuantity}'<>'999999999999.999999'
          or result#>>'{balances,0,remainingGrossWeightKg}'<>'0.00' then raise exception 'Large exact allocation lost precision';end if;
        update public."Job_Cargo" set "JobCargo_GrossKilos"=null where "JobCargo_ID"=cargo;
        if booking_api.cargo_allocation_state(actor,job)#>'{balances,0,remainingGrossWeightKg}'<>'null'::jsonb then raise exception 'Unknown cargo total became a remainder';end if;
        begin update public."Job_Cargo" set "JobCargo_JobID"='50000000-0000-4000-8000-000000000002' where "JobCargo_ID"=cargo;
          raise exception 'Allocated goods moved to a foreign Booking';exception when check_violation then null;end;
        -- This migration does not add a new ownership rule to unrelated rows.
        update public."Job_Cargo" set "JobCargo_JobID"=job where "JobCargo_ID"='60000000-0000-4000-8000-000000000002';
        update public."Job_Cargo" set "JobCargo_JobID"='50000000-0000-4000-8000-000000000002' where "JobCargo_ID"='60000000-0000-4000-8000-000000000002';
      end $test$;
    `)
    sql(`do $test$
      declare actor uuid:='10000000-0000-4000-8000-000000000001';job uuid:='50000000-0000-4000-8000-000000000001';
        saved jsonb;allocation jsonb;payload jsonb;before_state jsonb;before_cargo jsonb;before_events integer;
      begin
        saved:=booking_api.workspace_extended(actor,'ALLOC1');
        if jsonb_array_length(saved#>'{cargoAllocationState,allocations}')<>1 then raise exception 'Workspace allocation read missing';end if;
        allocation:=((saved#>'{cargoAllocationState,allocations,0}')-'archived')||'{"packageQuantity":"10","grossWeightKg":"30","volumeCbm":"1"}'::jsonb;
        payload:=jsonb_build_object('expectedUpdatedAt',saved#>'{booking,updatedAt}','cargoAllocations',jsonb_build_array(allocation),
          'cargo',jsonb_build_array(jsonb_build_object('id',allocation->'cargoId','description','Reduced together','packageQuantity','10','grossWeightKg','30','volumeCbm','1')));
        -- Full real save orchestration: old allocations temporarily exceed the
        -- new cargo amount, but the final transaction is balanced and valid.
        saved:=public.booking_workflow_save(actor,job,payload);
        set constraints all immediate;set constraints all deferred;
        if saved#>>'{cargoAllocationState,balances,0,remainingGrossWeightKg}'<>'0.00' then raise exception 'Atomic cargo/allocation reconciliation failed';end if;
        before_state:=saved#>'{cargoAllocationState,allocations}';
        select to_jsonb(c) into before_cargo from public."Job_Cargo" c where "JobCargo_ID"=(allocation->>'cargoId')::uuid;
        select count(*) into before_events from booking_api.events;
        begin
          perform public.booking_workflow_save(actor,job,payload||jsonb_build_object('expectedUpdatedAt',saved#>'{booking,updatedAt}',
            'cargoAllocations',jsonb_build_array(allocation||'{"grossWeightKg":"31"}'::jsonb)));
          raise exception 'Workflow accepted invalid final allocation';
        exception when check_violation then null;end;
        if before_cargo is distinct from (select to_jsonb(c) from public."Job_Cargo" c where "JobCargo_ID"=(allocation->>'cargoId')::uuid)
          or before_events<>(select count(*) from booking_api.events) then raise exception 'Failed allocation did not roll back canonical cargo/audit';end if;
        -- Allocation-only no-op avoids the older generic save and its audit.
        saved:=public.booking_workflow_save(actor,job,jsonb_build_object('expectedUpdatedAt',saved#>'{booking,updatedAt}',
          'cargoAllocations',jsonb_build_array(allocation)));
        if before_events<>(select count(*) from booking_api.events) then raise exception 'Allocation-only no-op created a generic save event';end if;
        -- Existing clients preserve allocations when they omit the new key.
        saved:=public.booking_workflow_save(actor,job,'{"internalNotes":"Ordinary operator update"}'::jsonb);
        if saved#>'{cargoAllocationState,allocations}' is distinct from before_state then raise exception 'Older client cleared allocations';end if;
        begin perform public.booking_workflow_save(actor,job,payload);raise exception 'Stale workflow review accepted';exception when serialization_failure then null;end;
        begin perform public.booking_workflow_save(actor,job,'{"cargoAllocations":[]}'::jsonb);raise exception 'Missing review timestamp accepted';exception when invalid_parameter_value then null;end;
        if not has_function_privilege('service_role','public.booking_workflow_save(uuid,uuid,jsonb)','EXECUTE')
          or has_function_privilege('authenticated','public.booking_workflow_save(uuid,uuid,jsonb)','EXECUTE')
          or has_function_privilege('service_role','public.booking_workflow_save_before_allocations_20260905(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Workflow grant boundary wrong';end if;
      end $test$;
    `)
    sql(`
      set test.access='off';
      do $$begin
        begin perform booking_api.cargo_allocation_state('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');raise exception 'Revoked read allowed';exception when insufficient_privilege then null;end;
        begin perform booking_api.test_save('[]');raise exception 'Revoked write allowed';exception when insufficient_privilege then null;end;
      end $$;
      do $$declare role_name text;function_name text;begin
        foreach role_name in array array['anon','authenticated','service_role'] loop
          if has_table_privilege(role_name,'booking_api.cargo_equipment_allocations','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Private allocation table exposed';end if;
          foreach function_name in array array['booking_api.allocation_values(booking_api.cargo_equipment_allocations)','booking_api.cargo_allocation_state(uuid,uuid)','booking_api.replace_cargo_allocations(uuid,uuid,jsonb)','booking_api.assert_cargo_allocations(uuid)','booking_api.lock_allocation_job()','booking_api.check_allocation_job()','booking_api.audit_cargo_allocation()'] loop
            if has_function_privilege(role_name,function_name,'EXECUTE') then raise exception 'Private allocation helper exposed: %',function_name;end if;
          end loop;
        end loop;
        if not(select relrowsecurity from pg_class where oid='booking_api.cargo_equipment_allocations'::regclass) then raise exception 'RLS missing';end if;
      end $$;
    `)

    // Two real connections: wait for the writer to announce its acquired lock,
    // then submit another save using the previously read timestamp.
    const timestamp = sql(`select "Job_UpdatedAt" from public."Job_Header" where "Job_BookingReference"='ALLOC1';`).trim()
    const writer = spawn(join(bin, 'psql'), args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const completion = new Promise((resolve, reject) => {
      let error = '';writer.stderr.on('data', chunk => { error += chunk })
      writer.on('error', reject);writer.on('exit', code => code === 0 ? resolve() : reject(new Error(error)))
    })
    const locked = new Promise((resolve, reject) => {
      writer.stdout.on('data', chunk => { if (String(chunk).includes('lock-acquired')) resolve() })
      writer.on('exit', code => reject(new Error(`Writer exited before lock: ${code}`)))
    })
    writer.stdin.end(`begin;select 1 from public."Job_Header" where "Job_BookingReference"='ALLOC1' for update;
      select 'lock-acquired';
      select booking_api.test_save(jsonb_agg((booking_api.allocation_values(a)-'archived')||'{"notes":"Concurrent approved operator edit"}'::jsonb))
        from booking_api.cargo_equipment_allocations a where not is_deleted;
      select pg_sleep(1);commit;`)
    await locked
    const competing = spawnSync(join(bin, 'psql'), args, { input: `select booking_api.replace_cargo_allocations('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',jsonb_build_object('expectedUpdatedAt','${timestamp}','allocations','[]'::jsonb));`, encoding: 'utf8', timeout: 5000 })
    await completion
    assert.notEqual(competing.status, 0)
    assert.match(competing.stderr, /Booking changed\. Reload/)
    assert.equal(sql('select count(*) from booking_api.cargo_equipment_allocations where not is_deleted;').trim(), '1')

    // The real client serializer submits to the canonical RPC, not a substitute
    // allocation writer. Workspace assembly/Auth remain the declared fixtures.
    const actor = '10000000-0000-4000-8000-000000000001', job = '50000000-0000-4000-8000-000000000001'
    const saved = JSON.parse(sql(`select booking_api.workspace_extended('${actor}','ALLOC1');`).trim())
    const draft = structuredClone(saved)
    draft.cargoAllocationState.allocations[0].notes = "Operator's exact saved allocation"
    const payload = bookingCargoAllocationPayload(draft, saved)
    const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
    const updated = JSON.parse(sql(`select public.booking_workflow_save('${actor}','${job}',${literal(payload)});`).trim())
    assert.equal(updated.cargoAllocationState.allocations[0].notes, "Operator's exact saved allocation")
    assert.notEqual(updated.booking.updatedAt, saved.booking.updatedAt)
    const stale = spawnSync(join(bin, 'psql'), args, { input: `select public.booking_workflow_save('${actor}','${job}',${literal(payload)});`, encoding: 'utf8', timeout: 5000 })
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /Booking changed\. Reload/)
    const cleared = structuredClone(updated)
    cleared.cargoAllocationState.allocations = []
    const removal = bookingCargoAllocationPayload(cleared, updated)
    const final = JSON.parse(sql(`select public.booking_workflow_save('${actor}','${job}',${literal(removal)});`).trim())
    assert.deepEqual(final.cargoAllocationState.allocations, [])
    assert.equal(sql(`select count(*) from booking_api.cargo_equipment_allocations where id='${updated.cargoAllocationState.allocations[0].id}' and is_deleted;`).trim(), '1')
    assert.equal(sql(`select "Job_SourceSnapshotJSON"->>'version' from public."Job_Header" where "Job_ID"='${job}';`).trim(), 'accepted original')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
