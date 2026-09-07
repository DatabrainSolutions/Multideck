// Schema-only or synthetic populated rehearsal, never hosted certification.
// Usage: node .../freight-schema-rehearsal.mjs /absolute/schema-only-dump.sql [--populated] [--release-plan=/absolute/plan.json]
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,isAbsolute} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const [schemaPath,...options]=process.argv.slice(2)
assert.ok(options.every(option=>option==='--populated'||option.startsWith('--release-plan=')),'Unsupported option')
assert.equal(new Set(options.map(option=>option.split('=')[0])).size,options.length,'Duplicate option')
const fixtureMode=options.includes('--populated')
const releasePlanPath=options.find(option=>option.startsWith('--release-plan='))?.slice('--release-plan='.length)
if(releasePlanPath)assert.ok(isAbsolute(releasePlanPath),'Release plan path must be absolute')
assert.ok(schemaPath&&isAbsolute(schemaPath),'Provide an absolute schema-only dump path')
const schema=readFileSync(schemaPath,'utf8')
assert.ok(schema.includes('-- PostgreSQL database dump'),'Expected a pg_dump schema file')
assert.ok(!/^COPY .* FROM stdin;|^INSERT INTO /m.test(schema),'Business data must not be included')
const root=new URL('../../',import.meta.url)
const manifest=JSON.parse(readFileSync(new URL('../../../docs/release/2026-09-06-freight-supabase-parity.json',import.meta.url)))
const plan=releasePlanPath?JSON.parse(readFileSync(releasePlanPath,'utf8')):null
const migrations=plan?.migrations??manifest.pendingFreightMigrations
assert.ok(Array.isArray(migrations)&&migrations.length>0,'Migration plan must not be empty')
const files=migrations.map(item=>item.file)
const roadOpenFixture=fixtureMode&&files.length===1&&files[0]==='20260907114906_booking_road_draft_atomic_open.sql'
const screeningFixture=fixtureMode&&files.includes('20260906082224_screening_active_source_freshness.sql')
const milestoneFixture=fixtureMode&&files.length===2&&files.includes('20260906182852_booking_route_milestone_foundation.sql')&&files.includes('20260907075838_dexter_booking_milestone_parity.sql')
const dangerousGoodsFixture=fixtureMode&&files.length===2&&files.includes('20260907102754_booking_cargo_dangerous_goods_evidence.sql')&&files.includes('20260907103421_dexter_booking_dangerous_goods_parity.sql')
assert.deepEqual(files,[...new Set(files)].sort(),'Migration plan must be unique and chronological')
for(const migration of migrations){
  assert.match(migration.file,/^\d{14}_[a-z0-9_]+\.sql$/)
  if(plan)assert.equal(createHash('sha256').update(readFileSync(new URL('migrations/'+migration.file,root))).digest('hex'),migration.sha256,'Release migration changed since review')
}
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const directory=mkdtempSync(join(tmpdir(),'multideck-freight-chain-')),data=join(directory,'data')
let started=false,stage='initialise';const applied=[]
const run=(command,args,input)=>{
  const r=spawnSync(join(bin,command),args,{input,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024})
  if(r.status!==0)throw Error(r.stderr.slice(0,2000)||'Process did not complete')
  return r.stdout
}
const sql=input=>run('psql',['-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input)
try{
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-k ${directory} -c listen_addresses=''`,'-w','start']);started=true
  // Empty managed Auth/Storage identities are explicit local fixtures. No real
  // user, secret, file, provider or tenant configuration is copied.
  stage='managed boundary fixtures'
  sql(`drop schema public;
    create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create role supabase_admin;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function auth.role() returns text language sql as $$select current_user::text$$;
    create schema storage;create table storage.objects(id uuid primary key);
    create schema extensions;create extension pg_trgm with schema extensions;
    create extension pgcrypto with schema extensions;
    create extension btree_gist with schema extensions;`)
  stage='current application schema'
  sql(schema)
  console.log('Current application schema restored; managed-service fixtures remain explicit.')
  if(fixtureMode){
    stage='synthetic populated fixtures'
    sql(readFileSync(new URL('../fixtures/freight-chain-before.sql',import.meta.url),'utf8'))
    if(roadOpenFixture)sql(readFileSync(new URL('../fixtures/freight-road-open-before.sql',import.meta.url),'utf8'))
    if(milestoneFixture||dangerousGoodsFixture)sql(readFileSync(new URL('../fixtures/freight-milestone-before.sql',import.meta.url),'utf8'))
    if(dangerousGoodsFixture)sql(readFileSync(new URL('../fixtures/freight-dangerous-goods-before.sql',import.meta.url),'utf8'))
    if(screeningFixture)sql(readFileSync(new URL('../fixtures/freight-screening-before.sql',import.meta.url),'utf8'))
  }
  for(const {file} of migrations){
    assert.match(file,/^\d{14}_[a-z0-9_]+\.sql$/)
    stage=file;sql(readFileSync(new URL('migrations/'+file,root),'utf8'));applied.push(file)
    console.log('Applied locally: '+file)
  }
  stage='post-chain structural assertions'
  sql(`do $$declare signature text;begin
    if to_regclass('quote_api.version_cargo_lines') is null
      or to_regclass('booking_api.cargo_equipment_allocations') is null then raise exception 'Typed cargo tables missing';end if;
    if exists(select 1 from pg_class where oid in ('quote_api.version_cargo_lines'::regclass,'booking_api.cargo_equipment_allocations'::regclass) and not relrowsecurity)
      then raise exception 'Typed cargo RLS missing';end if;
    foreach signature in array array[
      'public.quote_workflow_finalize_customer_response_v4(uuid,text)',
      'public.multideck_dexter_action_replace_booking_allocations(uuid,uuid,jsonb)',
      'public.booking_workflow_apply_quote_sync_v2(uuid,uuid,uuid,jsonb,text,boolean)'] loop
      if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
        or not has_function_privilege('service_role',signature,'execute') then raise exception 'Service boundary incorrect: %',signature;end if;
    end loop;
  end $$;`)
  const milestoneFoundation = files.includes('20260906182852_booking_route_milestone_foundation.sql')
  const milestoneParity = files.includes('20260907075838_dexter_booking_milestone_parity.sql')
  if(milestoneFoundation){
    stage='milestone structural assertions'
    sql(`do $$begin
      if not (select relrowsecurity from pg_class where oid='public."Job_RouteMilestones"'::regclass)
        then raise exception 'Milestone RLS missing';end if;
      if has_function_privilege('anon','public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)','execute')
        or has_function_privilege('authenticated','public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)','execute')
        or not has_function_privilege('service_role','public.booking_workflow_save_route_milestone(uuid,uuid,jsonb)','execute')
        or has_function_privilege('service_role','booking_api.save_route_milestone(uuid,uuid,jsonb)','execute')
        then raise exception 'Milestone service boundary incorrect';end if;
      if booking_api.parse_milestone_time('"2026-09-01T09:00+01:00"')<>'2026-09-01T08:00Z'::timestamptz
        or booking_api.parse_milestone_time('null') is not null then raise exception 'Milestone date conversion failed';end if;
    end $$;`)
  }
  if(fixtureMode){
    stage='populated preservation assertions'
    sql(readFileSync(new URL(roadOpenFixture?'../fixtures/freight-road-open-after.sql':dangerousGoodsFixture?'../fixtures/freight-dangerous-goods-after.sql':milestoneFixture?'../fixtures/freight-milestone-after.sql':'../fixtures/freight-chain-after.sql',import.meta.url),'utf8'))
    if(screeningFixture)sql(readFileSync(new URL('../fixtures/freight-screening-after.sql',import.meta.url),'utf8'))
  }
  if(milestoneParity){
    stage='milestone parity structural assertions'
    sql(`do $$declare signature text;begin
      foreach signature in array array['public.multideck_dexter_domain_booking_milestones(uuid,text,integer)',
        'public.multideck_dexter_domain_booking_milestone_types(uuid,text,integer)',
        'public.multideck_dexter_action_record_booking_milestone(uuid,uuid,jsonb)'] loop
        if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
          or not has_function_privilege('service_role',signature,'execute') then raise exception 'Milestone adapter exposed: %',signature;end if;
      end loop;
      if not exists(select 1 from public."sys_AIDexterActions" where "AIDexterAction_Code"='record_booking_milestone'
        and "AIDexterAction_AlwaysRequiresApproval") then raise exception 'Milestone approval registry missing';end if;
      if not exists(select 1 from pg_trigger where tgrelid='public."Job_RouteMilestones"'::regclass
        and tgname='TR_Job_RouteMilestones_dexter_watch' and tgenabled='O') then raise exception 'Milestone watch trigger missing';end if;
    end $$;`)
  }
  console.log(JSON.stringify({status:fixtureMode?'populated_rehearsal_passed':'structural_rehearsal_passed',schemaSha256:createHash('sha256').update(schema).digest('hex'),applied,
    migrationHashes:files.map(file=>({file,sha256:createHash('sha256').update(readFileSync(new URL('migrations/'+file,root))).digest('hex')})),
    postChainChecks:['typed cargo tables','typed cargo RLS','finalization service boundary','allocation action service boundary','quote revision service boundary'],
    milestoneChecks:milestoneFoundation?['existing table RLS retained','service-only milestone save','private mutation helper','explicit-offset conversion and clear']:[],
    milestoneParityChecks:milestoneParity?['service-only domain/action adapters','mandatory approval registry','enabled deterministic watch trigger']:[],
    roadOpenFixtureHashes:roadOpenFixture?['before','after'].map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL('../fixtures/freight-road-open-'+name+'.sql',import.meta.url))).digest('hex')})):[],
    populatedChecks:roadOpenFixture?['exact full-row Quote Booking cargo equipment route membership and registry preservation',
      'existing DG and milestone rows unchanged','existing canonical open/save bodies and ACL unchanged','new Road wrapper service-only and empty search path']:dangerousGoodsFixture?['all existing Quote Booking and milestone fields preserved exactly','complete legacy dangerous-goods values preserved',
      'legacy evidence read-only without invented attribution','new unknown flags remain null','direct table access denied and adapters service-only',
      'mandatory Dexter approval and enabled deterministic watch trigger','unrelated registries finance function and watch signals unchanged']:milestoneFixture?['all existing Quote and Booking fields preserved exactly','legacy milestone fields and precision preserved',
      'legacy operator provider and unknown evidence read-only','no invented recorded mode or operator attribution',
      'unrelated registries and watch signals unchanged']:fixtureMode?['Quote version and header preservation','Booking cargo equipment route and membership preservation',
      'no invented financial values or allocations','exact typed projection with zero and unknown distinctions',
      'existing cargo registry conflict update','unrelated registry and watch signal preservation','submitted mutation and deletion denial','invalid draft cargo rejection']:[],
    fixtureHashes:fixtureMode?((milestoneFixture||dangerousGoodsFixture||roadOpenFixture)?['before']:['before','after']).map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL('../fixtures/freight-chain-'+name+'.sql',import.meta.url))).digest('hex')})):[],
    milestoneFixtureHashes:(milestoneFixture||dangerousGoodsFixture)?(dangerousGoodsFixture?['before']:['before','after']).map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL('../fixtures/freight-milestone-'+name+'.sql',import.meta.url))).digest('hex')})):[],
    dangerousGoodsFixtureHashes:dangerousGoodsFixture?['before','after'].map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL('../fixtures/freight-dangerous-goods-'+name+'.sql',import.meta.url))).digest('hex')})):[],
    screeningChecks:screeningFixture?['existing source and snapshot preservation','entry preservation','unrelated source preservation',
      'no invented feed provenance or freshness','service-only refresh boundary']:[],
    screeningFixtureHashes:screeningFixture?['before','after'].map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL('../fixtures/freight-screening-'+name+'.sql',import.meta.url))).digest('hex')})):[],
    hostedLifecycleVerified:false}))
}catch(error){
  console.error(JSON.stringify({status:'stopped',stage,applied,error:error.message}))
  process.exitCode=1
}finally{
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'])
  rmSync(directory,{recursive:true,force:true})
}
