import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const migration=readFileSync(new URL('../migrations/20260909224007_dexter_booking_count_summary.sql',import.meta.url),'utf8')
test('booking summary counts beyond page size, scopes offices and preserves status distinctions', {skip: !available}, () => {
  const dir=mkdtempSync(join(tmpdir(),'dexter-deal-watch-')); const data=join(dir,'data');let started=false
  const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`);return r.stdout}
  try {
    run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
    run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
      create role anon;create role authenticated;create role service_role;
      create table public."Job_Header"("Job_ID" uuid,"Job_Status" text,"Job_ClosedDate" timestamptz,"Job_IsDeleted" boolean,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid);
      create table public."cmp_Offices"("Office_ID" uuid primary key,"Company_ID" uuid);
      create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Name" text,"AIDexterDomain_Description" text,"AIDexterDomain_QueryFunction" text,"AIDexterDomain_RequiredPermissionsJSON" jsonb,"AIDexterDomain_DataCategoriesJSON" jsonb);
      ${migration}
      do $$declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();o uuid:=gen_random_uuid();other_o uuid:=gen_random_uuid();result jsonb;begin
        insert into public."cmp_Offices" values(o,c),(other_o,other_c);
        insert into public."Job_Header" select gen_random_uuid(),'Open',null,false,o,null from generate_series(1,31);
        insert into public."Job_Header" values(gen_random_uuid(),'Booked',null,false,null,o),(gen_random_uuid(),'Open',now(),false,o,null),(gen_random_uuid(),'Draft',null,false,o,null),(gen_random_uuid(),'Open',null,true,o,null),(gen_random_uuid(),'Open',null,false,other_o,o),(gen_random_uuid(),'Open',null,false,null,null);
        result:=public.multideck_dexter_domain_booking_summary(c,null,1);
        if (result->>'totalCount')::int<>34 then raise exception 'Wrong total %',result;end if;
        if not exists(select 1 from jsonb_array_elements(result->'byStatus') g where g->>'status'='Open' and g->>'hasClosedDate'='false' and g->>'count'='31') then raise exception 'Open count incorrect';end if;
        if public.multideck_dexter_domain_booking_summary(other_c,null,25)->>'totalCount'<>'1' then raise exception 'Foreign scope incorrect';end if;
        if public.multideck_dexter_domain_booking_summary(gen_random_uuid(),null,25)->>'totalCount'<>'0' then raise exception 'Empty scope incorrect';end if;
        if not public.multideck_dexter_domain_booking_summary(c,'active',25)?'error' then raise exception 'Search silently ignored';end if;
        if has_function_privilege('authenticated','public.multideck_dexter_domain_booking_summary(uuid,text,integer)','execute') then raise exception 'Browser bypass';end if;
        if (select "AIDexterDomain_RequiredPermissionsJSON" from public."sys_AIDexterDataDomains")<>'["Bookings.Read"]'::jsonb then raise exception 'Missing read permission';end if;
      end $$;
    `)
  } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
