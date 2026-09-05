import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const read = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const foundation = read('20260905115938_quote_version_structured_cargo.sql')
const readiness = read('20260904160000_quote_incoterm_scope_decision.sql')
const migration = read('20260905123223_quote_cargo_issue_readiness.sql')
const issue = read('20260904120100_quote_submission_document_boundary.sql')
const start = issue.indexOf('create or replace function public.quote_workflow_prepare_customer_response_v4(')
const end = issue.indexOf('create or replace function public.quote_workflow_bind_pending_customer_response_document_v4(', start)
assert.ok(start >= 0 && end > start)

// Execute actual readiness, cargo validation/projection and pre-send prepare
// functions. Minimal tables and permission resolution are explicit fixtures;
// no live email, broad tenant schema or provider lifecycle is simulated.
test('PostgreSQL: every saved Quote cargo line is checked before a response link is prepared', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-quote-readiness-'))
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
    run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema quote_api; create schema booking_api;
      grant usage on schema quote_api,booking_api to anon,authenticated,service_role;
      create table public."CusQuote_Header" (
        "CusQuoteHeader_ID" uuid primary key, "CusQuoteHeader_IsDeleted" boolean default false,
        "CusQuoteHeader_ShipmentFactsJSON" jsonb, "CusQuoteHeader_Incoterm" text default 'N/A',
        "CusQuoteHeader_ModeCode" text default 'Air', "CusQuoteHeader_ShipmentTypeCode" text default 'AIR',
        "CusQuoteHeader_ServiceLevel" text default 'Standard', "CusQuoteHeader_CustomerID" uuid default gen_random_uuid(),
        "CusQuoteHeader_ContactEmailSnapshot" text default 'customer@example.test',
        "CusQuoteHeader_LoadingPoint" text default 'GBLHR', "CusQuoteHeader_DischargePoint" text default 'USJFK',
        "CusQuoteHeader_CreatedDate" date default current_date, "CusQuoteHeader_ValidFrom" date default current_date,
        "CusQuoteHeader_ValidTo" date default current_date+14, "CusQuoteHeader_CollectionAddress" text,
        "CusQuoteHeader_DeliveryAddress" text, "CusQuoteHeader_OrgOfficeID" uuid, "OrgOffice_ID" uuid,
        "CusQuoteHeader_CustomerReference" text default 'JQTEST', "CusQuoteHeader_Number" integer default 1
      );
      create table public."CusQuote_Versions" (
        "CusQuoteVersion_ID" uuid primary key default gen_random_uuid(), "CusQuoteHeader_ID" uuid,
        "CusQuoteVersion_SnapshotJSON" jsonb, "CusQuoteVersion_IsSubmitted" boolean default false,
        "CusQuoteVersion_IsCurrent" boolean default true, "CusQuoteVersion_Number" integer default 1,
        "CusQuoteVersion_StatusCode" text default 'draft'
      );
      create table public."CusQuote_Lines" ("CusQuoteHeader_ID" uuid,"CusQuoteLine_ShowToCustomer" boolean,"CusQuoteLine_RevenueAmountLocal" numeric);
      create table public."sys_AIDexterDataDomains" ("AIDexterDomain_Code" text,"AIDexterDomain_Description" text,"AIDexterDomain_UpdatedAt" timestamptz);
      create table public."sys_AIDexterWatchCapabilities" ("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text,"AIDexterWatchCapability_UpdatedAt" timestamptz);
      create table public."cmp_Users" ("Auth_User_ID" uuid,"User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table public."cmp_Offices" ("Office_ID" uuid,"Company_ID" uuid);
      create function quote_api.has_permission(actor uuid,permission text) returns boolean language sql as $$
        select permission='Quotes.Write' and exists(select 1 from public."cmp_Users" where "Auth_User_ID"=actor and "User_AccessStatus"='active')
      $$;
      create table quote_api.customer_response_links (
        response_link_id uuid default gen_random_uuid(),company_id uuid,quote_id uuid,quote_version_id uuid,
        recipient_name text,recipient_email text,response_origin text,token_hash text,status_code text,
        expires_at timestamptz,revoked_at timestamptz,delivery_status_code text,delivery_mode_code text,
        recipient_source_code text,created_by uuid
      );
      ${foundation}
      ${readiness}
      ${migration}
      ${issue.slice(start,end)}
      do $test$
      declare
        q uuid := gen_random_uuid(); v uuid := gen_random_uuid(); actor uuid := gen_random_uuid();
        company uuid := gen_random_uuid(); office uuid := gen_random_uuid(); lines jsonb; changed jsonb;
        facts jsonb := '{"collectionRequired":false,"deliveryRequired":false,"customsIncluded":false}';
        result jsonb; before_result jsonb; mode_code text; messages text[];
      begin
        insert into public."cmp_Users" values(actor,gen_random_uuid(),company,'active');
        insert into public."cmp_Offices" values(office,company);
        -- Legacy quotes keep their existing rules; no cargo allocation invented.
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_ShipmentFactsJSON")
          values(q,office,facts || '{"knownCargo":"Legacy goods","packageQuantity":2,"packageType":"Cartons","grossWeightKg":10}');
        insert into public."CusQuote_Lines" values(q,true,100);
        if not (booking_api.quote_readiness(q)->>'ready')::boolean then raise exception 'Legacy readiness regressed'; end if;
        lines := jsonb_build_array(
          jsonb_build_object('id',gen_random_uuid(),'description','Machinery','packageQuantity','2','packageType','Crates','grossWeightKg','1200.50','countryOfOrigin','gb'),
          jsonb_build_object('id',gen_random_uuid(),'description','Spares','packageQuantity',3,'packageType','Cartons','grossWeightKg',75)
        );
        update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=facts||jsonb_build_object('cargoLines',lines) where "CusQuoteHeader_ID"=q;
        if (booking_api.quote_readiness(q)->>'ready')::boolean then raise exception 'Unsaved structured version allowed'; end if;
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON")
          values(v,q,jsonb_build_object('quote',jsonb_build_object('shipmentFacts',jsonb_build_object('cargoLines',lines))));
        if not (booking_api.quote_readiness(q)->>'ready')::boolean then raise exception 'Normalised equivalent cargo blocked: %',booking_api.quote_readiness(q); end if;
        -- A valid old summary cannot hide a blank second line.
        changed := jsonb_set(lines,'{1,description}','null');
        update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=facts||jsonb_build_object('cargoLines',changed)||'{"knownCargo":"Stale summary"}' where "CusQuoteHeader_ID"=q;
        update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=jsonb_build_object('quote',jsonb_build_object('shipmentFacts',jsonb_build_object('cargoLines',changed))) where "CusQuoteVersion_ID"=v;
        result := booking_api.quote_readiness(q);
        if not result->'missing' ? 'Cargo line 2: goods description' then raise exception 'Second line not identified: %',result; end if;
        before_result := (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v);
        begin
          perform public.quote_workflow_prepare_customer_response_v4(actor,q,'Customer','customer@example.test','saved','standard','http://localhost:3000',repeat('a',64),null);
          raise exception 'Incomplete cargo reached send preparation';
        exception when invalid_parameter_value then null; end;
        if exists(select 1 from quote_api.customer_response_links) then raise exception 'Blocked issue created a link'; end if;
        if before_result<>(select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v) then raise exception 'Readiness rewrote draft'; end if;
        -- Header/version divergence and explicit empty lists fail closed.
        update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=facts||jsonb_build_object('cargoLines',lines) where "CusQuoteHeader_ID"=q;
        if not booking_api.quote_readiness(q)->'missing' ? 'Save cargo changes to the current quote version before sending' then raise exception 'Version divergence hidden'; end if;
        update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"=jsonb_build_object('quote',jsonb_build_object('shipmentFacts',jsonb_build_object('cargoLines',lines))) where "CusQuoteVersion_ID"=v;
        -- Existing non-cargo blockers are retained.
        update public."CusQuote_Header" set "CusQuoteHeader_Incoterm"='FOB' where "CusQuoteHeader_ID"=q;
        if not booking_api.quote_readiness(q)->'missing' ? 'Incoterm named place / port' then raise exception 'Incoterm protection removed'; end if;
        update public."CusQuote_Header" set "CusQuoteHeader_Incoterm"='N/A' where "CusQuoteHeader_ID"=q;
        delete from public."CusQuote_Lines" where "CusQuoteHeader_ID"=q;
        if not booking_api.quote_readiness(q)->'missing' ? 'At least one customer charge' then raise exception 'Charge protection removed'; end if;
        insert into public."CusQuote_Lines" values(q,true,100);
        result := public.quote_workflow_prepare_customer_response_v4(actor,q,'Customer','customer@example.test','saved','standard','http://localhost:3000',repeat('a',64),null);
        if (select count(*) from quote_api.customer_response_links)<>1 or (result->>'quoteVersionId')::uuid<>v then raise exception 'Correct cargo cannot prepare version-bound link'; end if;
        -- Existing caller/office guard runs before readiness and retains isolation.
        update public."cmp_Offices" set "Company_ID"=gen_random_uuid() where "Office_ID"=office;
        begin
          perform public.quote_workflow_prepare_customer_response_v4(actor,q,'Customer','customer@example.test','saved','standard','http://localhost:3000',repeat('b',64),null);
          raise exception 'Cross-workspace send allowed';
        exception when insufficient_privilege then null; end;
        if (select count(*) from quote_api.customer_response_links)<>1 then raise exception 'Denied send added link'; end if;
        -- Validate mode-specific alternatives independently, without guessing totals.
        changed := jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Goods','packageQuantity',1,'packageType','Cartons','grossWeightKg',0));
        foreach mode_code in array array['Air','Courier','Sea','Ocean','Road','Rail'] loop
          if cardinality(quote_api.cargo_issue_missing(changed,mode_code,'Loose'))<>1 then raise exception 'Missing positive measurement for %',mode_code; end if;
        end loop;
        if cardinality(quote_api.cargo_issue_missing(jsonb_set(changed,'{0,chargeableWeightKg}','10'),'Air','AIR'))<>0 then raise exception 'Air weight alternative failed'; end if;
        if cardinality(quote_api.cargo_issue_missing(jsonb_set(changed,'{0,volumeCbm}','0.5'),'Rail','Loose'))<>0 then raise exception 'Rail volume alternative failed'; end if;
        if cardinality(quote_api.cargo_issue_missing(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description','Container goods')),'Sea','FCL'))<>0 then raise exception 'FCL gained mandatory per-line allocation'; end if;
        if quote_api.cargo_issue_missing('[]','Air','AIR')<>array['At least one cargo line'] then raise exception 'Empty cargo issue allowed'; end if;
        if cardinality(quote_api.cargo_issue_missing('null','Air','AIR'))=0 then raise exception 'Null cargo issue allowed'; end if;
        if cardinality(quote_api.cargo_issue_missing(jsonb_set(changed,'{0,grossWeightKg}','"NaN"'),'Air','AIR'))=0 then raise exception 'Malformed measurement allowed'; end if;
        if cardinality(quote_api.cargo_issue_missing(jsonb_set(changed,'{0,packageQuantity}','0'),'Air','AIR'))<>2 then raise exception 'Zero packages treated as complete'; end if;
        if cardinality(quote_api.cargo_issue_missing(jsonb_set(changed,'{0,packageType}','null'),'Air','AIR'))<>2 then raise exception 'Missing package type ignored'; end if;
        -- Structural and header-only errors are visible rather than falling back
        -- to an unrelated legacy summary or silently repairing saved evidence.
        update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=facts||'{"cargoLines":null}' where "CusQuoteHeader_ID"=q;
        if (booking_api.quote_readiness(q)->>'ready')::boolean then raise exception 'Malformed header accepted'; end if;
        update public."CusQuote_Header" set "CusQuoteHeader_ShipmentFactsJSON"=facts||'{"knownCargo":"Old summary"}' where "CusQuoteHeader_ID"=q;
        if not booking_api.quote_readiness(q)->'missing' ? 'Save cargo lines to the current quote version before sending' then raise exception 'Snapshot cargo silently ignored'; end if;
        if has_function_privilege('authenticated','booking_api.quote_readiness(uuid)','EXECUTE')
          or has_function_privilege('anon','booking_api.quote_readiness(uuid)','EXECUTE')
          or has_function_privilege('authenticated','quote_api.cargo_issue_missing(jsonb,text,text)','EXECUTE')
          or has_function_privilege('anon','quote_api.cargo_issue_missing(jsonb,text,text)','EXECUTE') then raise exception 'Private readiness exposed'; end if;
        if not has_function_privilege('service_role','booking_api.quote_readiness(uuid)','EXECUTE')
          or not has_function_privilege('service_role','quote_api.cargo_issue_missing(jsonb,text,text)','EXECUTE') then raise exception 'Server capability lost'; end if;
        if not (select prosecdef and coalesce('search_path=""'=any(proconfig),false) from pg_proc where oid='booking_api.quote_readiness(uuid)'::regprocedure)
          or (select prosecdef from pg_proc where oid='quote_api.cargo_issue_missing(jsonb,text,text)'::regprocedure) then raise exception 'Unsafe function boundary'; end if;
      end $test$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
