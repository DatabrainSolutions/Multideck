import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync,mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {mutateBookingRoute} from './booking-route-client-fixture.mjs'
import {routeSaveFixture,routeSaveMigration,routeSaveAssertions} from './booking-route-save-fixture.mjs'
import {routeModeAssertions} from './booking-route-mode-fixture.mjs'

const initial={booking:{mode:'multimodal',sourceQuoteVersionId:'accepted-version'},routes:[
  {mode:'road',origin:'Depot',destination:'Port',vehicleRegistration:'AB12 CDE',routeData:{originalEvidence:'preserve'}},
  {mode:'sea',origin:'Port',destination:'Transhipment',vessel:'Vessel A'},
  {mode:'air',origin:'Transhipment',destination:'Airport',flightNumber:'BA123'},
  {mode:'rail',origin:'Airport',destination:'Depot',railService:'Rail 45'},
]}
let edited=structuredClone(initial)
for(const [index,field,value] of [[0,'masterTransportReference','CMR-1'],[0,'trailerNumber','TR-2'],[1,'masterTransportReference','MBL-1'],
  [1,'houseTransportReference','HBL-2'],[1,'voyageNumber','VOY-3'],[2,'masterTransportReference','125-12345675'],[2,'houseTransportReference','HAWB-1'],
  [3,'masterTransportReference','CIM-1'],[3,'houseTransportReference','RAIL-FWD-1'],[3,'serviceLevel','Block train']]) {
  edited=mutateBookingRoute(edited,index,field,value)
}
test('actual route updater keeps mode-specific references on the selected leg and preserves source evidence',()=>{
  assert.equal(edited.routes[0].trailerNumber,'TR-2')
  assert.equal(edited.routes[1].voyageNumber,'VOY-3')
  assert.equal(edited.routes[2].masterTransportReference,'125-12345675')
  assert.equal(edited.routes[3].serviceLevel,'Block train')
  assert.equal(edited.routes[0].routeData.originalEvidence,'preserve')
  assert.deepEqual(edited.booking,initial.booking)
  assert.equal(initial.routes[0].trailerNumber,undefined)
  const switched=mutateBookingRoute(edited,1,'mode','air')
  assert.equal(switched.routes[1].vessel,'Vessel A')
  assert.equal(switched.routes[1].voyageNumber,'VOY-3')
  assert.equal(switched.routes[1].masterTransportReference,'')
  assert.equal(switched.routes[1].houseTransportReference,'')
  assert.equal(mutateBookingRoute(switched,1,'mode','sea').routes[1].houseTransportReference,'')
  assert.equal(edited.routes[1].houseTransportReference,'HBL-2')
  assert.equal(mutateBookingRoute(edited,0,'trailerNumber','').routes[0].trailerNumber,'')
  for(const index of [-1,4,1.5,NaN]) assert.equal(mutateBookingRoute(edited,index,'voyageNumber','bad'),edited)
})

const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const read=name=>readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8')
const routing=read('20260902153715_booking_multi_leg_routes_and_cargo_dimensions.sql')
const baseline=readFileSync(new URL('../baseline/public-schema.sql',import.meta.url),'utf8')
function table(name){const start=baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`);assert.ok(start>=0);return baseline.slice(start,baseline.indexOf('\n);',start)+3)}
function sqlFunction(source,name){const start=source.indexOf(`create or replace function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n$$;',start)+4)}
const readSource=read('20260820150500_booking_workspace_rpc.sql')
const projectionStart=readSource.lastIndexOf('  select coalesce',readSource.indexOf("'id', route.\"JobRoute_ID\""))
const projectionEnd=readSource.indexOf(';',readSource.indexOf('  into routes_value',projectionStart))+1
const readProjection=readSource.slice(projectionStart,projectionEnd)
assert.ok(readProjection.includes('JobRoute_MasterTransportReference'))
const payload=JSON.stringify({routes:edited.routes}).replaceAll("'","''")

test('PostgreSQL: real route save and workspace projection round-trip per-mode fields, stable IDs and access refusal',{skip:!available},()=>{
  const directory=mkdtempSync(join(tmpdir(),'multideck-route-ops-'));const data=join(directory,'data');let started=false
  const run=(command,args,input)=>{const result=spawnSync(join(bin,command),args,{input,encoding:'utf8',timeout:30_000});assert.equal(result.status,0,`${result.stderr}\n${result.stdout}`);return result.stdout}
  try {
    run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${directory} -c listen_addresses=''`,'-w','start']);started=true
    run('psql',['-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
      create role anon;create role authenticated;create role service_role;create schema booking_api;
      create table public."cmp_Users"("User_ID" uuid,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      ${table('Job_Header')}
      ${table('Job_Routing')}
      alter table public."Job_Routing" add primary key("JobRoute_ID");
      -- Identity/permission resolution is a fixture. The route save, table
      -- definitions and workspace field projection are production source.
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$ select $2='Bookings.Write' and exists(select 1 from public."cmp_Users" where "Auth_User_ID"=$1 and "User_AccessStatus"='active') $$;
      create function booking_api.normalise_mode(text) returns text language sql as $$ select lower($1) $$;
      ${sqlFunction(routing,'booking_api.save_booking_route_legs')}
      ${routing.split('\n').filter(line=>/^(revoke|grant)/.test(line)&&line.includes('booking_api.save_booking_route_legs(')).join('\n')}
      create function booking_api.test_read_routes(target uuid) returns jsonb language plpgsql as $$
        declare job_row record;routes_value jsonb;
        begin select * into strict job_row from public."Job_Header" where "Job_ID"=target;
          ${readProjection} return routes_value;end;$$;
      do $test$
      declare actor uuid:=gen_random_uuid();foreign_actor uuid:=gen_random_uuid();company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();
        job uuid:=gen_random_uuid();other_job uuid:=gen_random_uuid();source jsonb:='${payload}'::jsonb;result jsonb;before_rows jsonb;route_id uuid;
      begin
        insert into public."cmp_Users" values(actor,actor,company,'active'),(foreign_actor,foreign_actor,gen_random_uuid(),'active');
        insert into public."cmp_Offices" values(office,company);
        insert into public."Job_Header"("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_TransportModeSummary")
          values(job,1,'202609',actor,gen_random_uuid(),office,'multimodal'),(other_job,2,'202609',actor,gen_random_uuid(),office,'road');
        perform booking_api.save_booking_route_legs(actor,job,source);
        result:=booking_api.test_read_routes(job);
        if jsonb_array_length(result)<>4 or result#>>'{0,trailerNumber}' is distinct from 'TR-2'
          or result#>>'{1,voyageNumber}' is distinct from 'VOY-3' or result#>>'{1,houseTransportReference}' is distinct from 'HBL-2'
          or result#>>'{2,masterTransportReference}' is distinct from '125-12345675'
          or result#>>'{3,masterTransportReference}' is distinct from 'CIM-1'
          or result#>>'{3,serviceLevel}' is distinct from 'Block train' then raise exception 'Operational values lost: %',result;end if;
        source:=jsonb_build_object('routes',result);before_rows:=result;
        perform booking_api.save_booking_route_legs(actor,job,source);
        if booking_api.test_read_routes(job) is distinct from before_rows then raise exception 'Save/reload changed route values or IDs';end if;
        route_id:=(result#>>'{1,id}')::uuid;
        source:=jsonb_set(source,'{routes,1,mode}','"air"');
        perform booking_api.save_booking_route_legs(actor,job,source);
        if booking_api.test_read_routes(job)#>>'{1,voyageNumber}' is distinct from 'VOY-3'
          or booking_api.test_read_routes(job)#>>'{1,id}' is distinct from route_id::text then raise exception 'Mode switch lost saved evidence';end if;
        source:=jsonb_set(source,'{routes,0,trailerNumber}','""');
        perform booking_api.save_booking_route_legs(actor,job,source);
        if booking_api.test_read_routes(job)->0 ? 'trailerNumber' then raise exception 'Explicit clear was ignored';end if;
        before_rows:=booking_api.test_read_routes(job);
        begin perform booking_api.save_booking_route_legs(foreign_actor,job,source);raise exception 'Foreign company accepted';exception when insufficient_privilege then null;end;
        begin perform booking_api.save_booking_route_legs(null,job,source);raise exception 'Missing actor accepted';exception when insufficient_privilege then null;end;
        begin perform booking_api.save_booking_route_legs(actor,other_job,source);raise exception 'Foreign route IDs accepted';exception when insufficient_privilege then null;end;
        -- A later invalid route must roll back earlier updates in that call.
        source:=jsonb_set(source,'{routes,0,trailerNumber}','"CHANGED"');source:=jsonb_set(source,'{routes,3,destination}','""');
        begin perform booking_api.save_booking_route_legs(actor,job,source);raise exception 'Invalid later route accepted';exception when invalid_parameter_value then null;end;
        if booking_api.test_read_routes(job) is distinct from before_rows then raise exception 'Invalid save partially persisted';end if;
        if has_function_privilege('anon','booking_api.save_booking_route_legs(uuid,uuid,jsonb)','EXECUTE')
          or has_function_privilege('authenticated','booking_api.save_booking_route_legs(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Privileged route save exposed';end if;
      end;$test$;
    `)
    const args=['-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
    run('psql',args,routeSaveFixture)
    const regression=spawnSync(join(bin,'psql'),args,{input:routeSaveAssertions,encoding:'utf8',timeout:30_000})
    assert.notEqual(regression.status,0,'Regression must reproduce before the migration')
    assert.match(regression.stderr,/Legacy summary duplicated or overwrote the real first leg/)
    run('psql',args,routeSaveMigration+routeSaveAssertions)
    const modeRegression=spawnSync(join(bin,'psql'),args,{input:routeModeAssertions,encoding:'utf8',timeout:30_000})
    assert.notEqual(modeRegression.status,0,'Mode evidence regression must fail without the new trigger')
    assert.match(modeRegression.stderr,/Original mode evidence or actor lost/)
    run('psql',args,read('20260905183528_booking_route_mode_reference_history.sql')+routeModeAssertions)
  } finally {
    if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'])
    rmSync(directory,{recursive:true,force:true})
  }
})
