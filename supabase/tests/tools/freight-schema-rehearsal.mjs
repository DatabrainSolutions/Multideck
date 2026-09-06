// Schema-only or synthetic populated rehearsal, never hosted certification.
// Usage: node .../freight-schema-rehearsal.mjs /absolute/schema-only-dump.sql [--populated]
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,isAbsolute} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const [schemaPath,fixtureMode]=process.argv.slice(2)
assert.ok(!fixtureMode||fixtureMode==='--populated','Only --populated is supported')
assert.ok(schemaPath&&isAbsolute(schemaPath),'Provide an absolute schema-only dump path')
const schema=readFileSync(schemaPath,'utf8')
assert.ok(schema.includes('-- PostgreSQL database dump'),'Expected a pg_dump schema file')
assert.ok(!/^COPY .* FROM stdin;|^INSERT INTO /m.test(schema),'Business data must not be included')
const root=new URL('../../',import.meta.url)
const manifest=JSON.parse(readFileSync(new URL('../../../docs/release/2026-09-06-freight-supabase-parity.json',import.meta.url)))
const files=manifest.pendingFreightMigrations.map(item=>item.file)
assert.deepEqual(files,[...new Set(files)].sort(),'Migration plan must be unique and chronological')
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
  }
  for(const {file} of manifest.pendingFreightMigrations){
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
  if(fixtureMode){
    stage='populated preservation assertions'
    sql(readFileSync(new URL('../fixtures/freight-chain-after.sql',import.meta.url),'utf8'))
  }
  console.log(JSON.stringify({status:fixtureMode?'populated_rehearsal_passed':'structural_rehearsal_passed',schemaSha256:createHash('sha256').update(schema).digest('hex'),applied,
    migrationHashes:files.map(file=>({file,sha256:createHash('sha256').update(readFileSync(new URL('migrations/'+file,root))).digest('hex')})),
    postChainChecks:['typed cargo tables','typed cargo RLS','finalization service boundary','allocation action service boundary','quote revision service boundary'],
    populatedChecks:fixtureMode?['Quote version and header preservation','Booking cargo equipment route and membership preservation',
      'no invented financial values or allocations','exact typed projection with zero and unknown distinctions',
      'existing cargo registry conflict update','unrelated registry and watch signal preservation','submitted mutation and deletion denial','invalid draft cargo rejection']:[],
    fixtureHashes:fixtureMode?['before','after'].map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL('../fixtures/freight-chain-'+name+'.sql',import.meta.url))).digest('hex')})):[],
    hostedLifecycleVerified:false}))
}catch(error){
  console.error(JSON.stringify({status:'stopped',stage,applied,error:error.message}))
  process.exitCode=1
}finally{
  if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'])
  rmSync(directory,{recursive:true,force:true})
}
