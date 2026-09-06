import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const previous = read('20260820221145_quote_pdf_document_and_branding.sql')
const start = previous.indexOf('create or replace function quote_api.customer_response_view(')
const end = previous.indexOf('create or replace function public.quote_workflow_bind_customer_response_document', start)
assert.ok(start >= 0 && end > start)
const sourceView = previous.slice(start, end)
const migration = read('20260906101833_quote_response_public_boundary.sql')

test('PostgreSQL: real token/origin view preserves lifecycle while containing internal data', {skip:spawnSync(join(bin,'initdb'),['--version']).status!==0}, () => {
  const dir = mkdtempSync(join(tmpdir(),'multideck-public-quote-'))
  const data = join(dir,'data')
  let started = false
  function run(command,args,input) {
    const r=spawnSync(join(bin,command),args,{input,encoding:'utf8',timeout:30000})
    assert.equal(r.status,0,`${command}: ${r.stderr}\n${r.stdout}`)
    return r.stdout
  }
  try {
    run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
    run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']); started=true
    run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
      create role anon; create role authenticated; create role service_role;
      create schema quote_api;
      create table public."CusQuote_Header" (
        "CusQuoteHeader_ID" uuid primary key, "CusQuoteHeader_CustomerReference" text,
        "CusQuoteHeader_Number" integer,"CusQuoteHeader_CustomerNameSnapshot" text,"CusQuoteHeader_ContactNameSnapshot" text);
      create table public."CusQuote_Versions" (
        "CusQuoteVersion_ID" uuid primary key,"CusQuoteVersion_Number" integer,"CusQuoteVersion_SnapshotJSON" jsonb);
      create table quote_api.customer_response_links (
        response_link_id uuid primary key,company_id uuid,quote_id uuid,quote_version_id uuid,
        token_hash text unique,response_origin text,status_code text,expires_at timestamptz,
        recipient_name text,recipient_email text,quote_document_id uuid);
      create table quote_api.customer_responses (response_link_id uuid,decision_code text,created_at timestamptz);
      ${sourceView}
      revoke all on function quote_api.customer_response_view(text,text) from public,anon,authenticated;
      ${migration}
      do $test$
      declare q uuid:=gen_random_uuid();v uuid:=gen_random_uuid();l uuid:=gen_random_uuid();c uuid:=gen_random_uuid();
        original jsonb; result jsonb; bad text; state text;
      begin
        original:='{"savedAt":"PRIVATE","quote":{"currency":"GBP","loadingPoint":"GBFXT","dischargePoint":"NLRTM","validTo":"2026-09-20","supplierId":"PRIVATE","payer":{"bank":"PRIVATE"},"shipmentFacts":{"supplierOptions":"PRIVATE"},"charges":[{"sellCurrency":"GBP","sellAmount":100,"costAmount":80,"margin":20,"supplierId":"PRIVATE"},{"sellCurrency":"GBP","sellAmount":"10.125000","internalNotes":"PRIVATE"},{"sellAmount":999,"showToCustomer":false},null,"PRIVATE",{"sellAmount":{"costAmount":"PRIVATE"}}]}}';
        insert into public."CusQuote_Header" values(q,'JQ-TEST',22,'PRIVATE CUSTOMER','PRIVATE CONTACT');
        insert into public."CusQuote_Versions" values(v,1,original);
        insert into quote_api.customer_response_links values(l,c,q,v,repeat('a',64),'https://dev.multideck.app','active',now()+interval '1 day','PRIVATE','PRIVATE',gen_random_uuid());
        result:=public.quote_customer_response_view(repeat('a',64),'https://dev.multideck.app');
        if result::text ~ 'PRIVATE|costAmount|margin|supplier|999' then raise exception 'Internal data leaked: %',result;end if;
        if result#>>'{quote,snapshot,quote,charges,0,sellAmount}'<>'100'
          or result#>>'{quote,snapshot,quote,charges,1,sellAmount}'<>'10.125000'
          or result#>>'{quote,snapshot,quote,loadingPoint}'<>'GBFXT'
          or (result->>'_brandingCompanyId')::uuid<>c
          or (result#>>'{quote,id}')::uuid<>q then raise exception 'Customer summary or scoped brand context lost';end if;
        if jsonb_array_length(result#>'{quote,snapshot,quote,charges}')<>3 then raise exception 'Hidden/scalar lines included';end if;
        if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v)<>original then raise exception 'Original snapshot changed';end if;
        foreach bad in array array['',repeat('b',64),'INVALID'] loop
          begin perform public.quote_customer_response_view(bad,'https://dev.multideck.app');raise exception 'Invalid token allowed';exception when no_data_found then null;end;
        end loop;
        begin perform public.quote_customer_response_view(repeat('a',64),'https://other.multideck.app');raise exception 'Foreign origin allowed';exception when no_data_found then null;end;
        update quote_api.customer_response_links set expires_at=now()-interval '1 day' where response_link_id=l;
        result:=public.quote_customer_response_view(repeat('a',64),'https://dev.multideck.app');
        if result-'_brandingCompanyId'<>'{"state":"expired"}'::jsonb then raise exception 'Expired link leaked history';end if;
        update quote_api.customer_response_links set status_code='revoked' where response_link_id=l;
        result:=public.quote_customer_response_view(repeat('a',64),'https://dev.multideck.app');
        if result-'_brandingCompanyId'<>'{"state":"revoked"}'::jsonb then raise exception 'Revoked link leaked history';end if;
        update quote_api.customer_response_links set status_code='responded' where response_link_id=l;
        insert into quote_api.customer_responses values(l,'accepted',now());
        result:=public.quote_customer_response_view(repeat('a',64),'https://dev.multideck.app');
        if result->>'state'<>'responded' or result->>'decision'<>'accepted' or result ? 'quote' then raise exception 'Responded state lost or leaked';end if;
        if has_function_privilege('anon','public.quote_customer_response_view(text,text)','execute')
          or has_function_privilege('authenticated','public.quote_customer_response_view(text,text)','execute')
          or not has_function_privilege('service_role','public.quote_customer_response_view(text,text)','execute') then raise exception 'Incorrect RPC grants';end if;
      end $test$;
      set role anon;
      do $deny$ begin
        begin perform public.quote_customer_response_view(repeat('a',64),'https://dev.multideck.app');raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
      end $deny$;
      reset role;
    `)
  } finally {
    if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
