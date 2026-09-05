import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { quoteCargoReviewFixture } from './quote-cargo-review-fixture.mjs'
import { bookingShipmentValueFixture } from './booking-shipment-value-fixture.mjs'
import { quoteRoutingModeReviewFixture } from './quote-routing-mode-review-fixture.mjs'
import { quoteSingleLegRoutingFixture } from './quote-single-leg-routing-fixture.mjs'
import { quoteOverallModeFixture } from './quote-overall-mode-fixture.mjs'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const read = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const foundation = read('20260905115938_quote_version_structured_cargo.sql')
const cargoOpening = read('20260905160621_quote_open_structured_cargo.sql')
const precisionChange = cargoOpening.slice(cargoOpening.indexOf('do $migration$'), cargoOpening.indexOf('end $migration$;') + 'end $migration$;'.length)
assert.ok(precisionChange.startsWith('do $migration$') && precisionChange.endsWith('end $migration$;'))
const readiness = read('20260904160000_quote_incoterm_scope_decision.sql')
const migration = read('20260905123223_quote_cargo_issue_readiness.sql')
const issue = read('20260904120100_quote_submission_document_boundary.sql')
const handover = read('20260905123929_quote_booking_cargo_handover.sql')
const bookingSave = read('20260905110317_booking_stable_cargo_equipment_identity.sql')
const cargoRevision = read('20260905125327_quote_cargo_revision_comparison.sql')
const cargoPersistence = read('20260905130449_quote_cargo_revision_persistence.sql')
const cargoWatch = read('20260905112211_dexter_booking_cargo_parity.sql')
function sqlFunction(source, name) {
  const start = source.indexOf(`create or replace function ${name}(`)
  assert.ok(start >= 0)
  const end = source.indexOf('\n$$;', start) + 4
  assert.ok(end > start)
  return source.slice(start, end)
}
const conversionSource = read('20260828135847_reconcile_directional_quote_booking_references.sql')
const conversionStart = conversionSource.indexOf('create or replace function booking_api.convert_accepted_quote(')
const conversionEnd = conversionSource.indexOf('\n$$;', conversionStart) + 4
assert.ok(conversionStart >= 0 && conversionEnd > conversionStart)
const conversion = conversionSource.slice(conversionStart, conversionEnd).replace(
  'function booking_api.convert_accepted_quote(', 'function booking_api.convert_accepted_quote_before_sync_review_20260904(')
const baseline = readFileSync(new URL('../baseline/public-schema.sql', import.meta.url), 'utf8')
function table(name) {
  const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
  assert.ok(start >= 0)
  return baseline.slice(start, baseline.indexOf('\n);', start) + 3)
}
const start = issue.indexOf('create or replace function public.quote_workflow_prepare_customer_response_v4(')
const end = issue.indexOf('create or replace function public.quote_workflow_bind_pending_customer_response_document_v4(', start)
assert.ok(start >= 0 && end > start)

// Execute actual readiness, cargo validation/projection and pre-send prepare
// functions. Minimal tables and permission resolution are explicit fixtures;
// no live email, broad tenant schema or provider lifecycle is simulated.
test('PostgreSQL: Quote cargo issue, initial handover and selective revision persistence', { skip: !available }, () => {
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
      ${['Job_Header','Job_Cargo','Job_Parties','Job_Routing','Job_Containers','Job_Costing_Lines'].map(table).join('\n')}
      -- Fixture supplies numbering; production's reference allocator/trigger
      -- remains unchanged and is not claimed as covered by this test.
      create sequence test_job_numbers;
      alter table public."Job_Header" alter column "Job_Number" set default nextval('test_job_numbers'),
        add column "Job_BookingReference" text, add column "Job_BookingReferenceSequenceKey" text,
        add column "Job_SourceQuoteID" uuid, add column "Job_SourceQuoteVersionID" uuid,
        add column "Job_SourceQuoteResponseID" uuid, add column "Job_SourceSnapshotJSON" jsonb,
        add column "Job_IncotermsCode" text, add column "Job_IncotermsLocation" text,
        add column "Job_CollectionAddress" text, add column "Job_DeliveryAddress" text,
        add column "Job_CustomerDeadline" date,add column "Job_FreightChargeAmount" numeric,add column "Job_FreightChargeCurrencyCode" text;
      alter table public."Job_Cargo" add primary key ("JobCargo_ID");
      alter table public."CusQuote_Header" add column "CusQuoteHeader_LifecycleCode" text default 'draft',
        add column "CusQuoteHeader_AcceptedVersionID" uuid,add column "CusQuoteHeader_SalesOwnerID" uuid,
        add column "CusQuoteHeader_LastEditedBy" uuid,add column "CusQuoteHeader_CreatedBy" uuid,
        add column "CusQuoteHeader_Direction" text,add column "CusQuoteHeader_CarrierID" uuid,
        add column "CusQuoteHeader_SupplierID" uuid,add column "CusQuoteHeader_CustomerNameSnapshot" text,
        add column "CusQuoteHeader_ContactNameSnapshot" text,add column "CusQuoteHeader_JobID" uuid,
        add column "CusQuoteHeader_LastEditedDate" timestamptz;
      create table booking_api.events(company_id uuid,job_id uuid,event_type text,summary text,metadata jsonb,actor_user_id uuid);
      alter table public."Job_Header" add column "Job_PendingQuoteVersionID" uuid,add column "Job_PendingQuoteResponseID" uuid,
        add column "Job_QuoteSyncStatus" text default 'in_sync',add column "Job_QuoteSyncDetectedAt" timestamptz;
      create table booking_api.quote_sync_reviews (
        review_id uuid primary key,company_id uuid,job_id uuid,quote_id uuid,applied_version_id uuid,proposed_version_id uuid,
        proposed_response_id uuid,status_code text default 'pending',differences jsonb,applied_fields jsonb default '[]',
        decided_by uuid,decided_at timestamptz
      );
      ${table('Job_CargoDangerousGoods')}
      alter table public."Job_CargoDangerousGoods" add foreign key ("JobCargoDG_JobCargoID") references public."Job_Cargo"("JobCargo_ID");
      create function booking_api.normalise_direction(text) returns text language sql as $$select lower($1)$$;
      create function booking_api.normalise_mode(text) returns text language sql as $$select lower($1)$$;
      create function booking_api.allocate_reference(uuid,text,text) returns text language sql as $$select 'TEST-'||gen_random_uuid()$$;
      create function quote_api.jsonb_has_content(jsonb) returns boolean language sql as $$select coalesce($1<>'{}'::jsonb,false)$$;
      create table public."Org_Master" ("Org_id" uuid);
      create table public."sys_JobStatuses" ("JS_Code" text,"JS_IsActive" boolean);
      insert into public."sys_JobStatuses" values('open',true);
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$select $2='Bookings.Write' and exists(select 1 from public."cmp_Users" where "Auth_User_ID"=$1 and "User_AccessStatus"='active')$$;
      -- The broad workspace response is outside this mutation test.
      create function booking_api.workspace(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
      ${foundation}
      ${precisionChange}
      ${readiness}
      ${migration}
      ${issue.slice(start,end)}
      ${conversion}
      ${handover}
      ${bookingSave}
      ${cargoRevision}
      ${cargoPersistence}
      create table public."AI_DexterWatches" ("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
      create table public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,
        "AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
      ${sqlFunction(cargoWatch,'booking_api.cargo_public_values')}
      ${sqlFunction(cargoWatch,'public._multideck_dexter_cargo_watch_change')}
      create trigger cargo_watch after insert or update on public."Job_Cargo" for each row execute function public._multideck_dexter_cargo_watch_change();
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
      do $handover_test$
      declare q uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
        company uuid:=gen_random_uuid(); office uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
        lines jsonb; result jsonb; job uuid; saved_cargo uuid; original_snapshot jsonb; event_count integer; wrong_version uuid:=gen_random_uuid();
        bad_quote uuid:=gen_random_uuid(); bad_version uuid:=gen_random_uuid(); legacy_quote uuid:=gen_random_uuid(); legacy_version uuid:=gen_random_uuid();
        single_quote uuid:=gen_random_uuid(); single_version uuid:=gen_random_uuid();
        revision uuid:=gen_random_uuid(); proposed_lines jsonb; observed_lines jsonb; differences jsonb; plan jsonb;
        description_key text; weight_key text; new_line_id uuid:=gen_random_uuid(); manual_cargo uuid:=gen_random_uuid();
        review_id uuid:=gen_random_uuid(); second_cargo uuid; foreign_actor uuid:=gen_random_uuid(); before_events integer; before_signals integer;
      begin
        insert into public."cmp_Users" values(actor,actor,company,'active');
        insert into public."cmp_Offices" values(office,company);
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy") values(q,office,'draft',v,actor);
        lines:=jsonb_build_array(
          jsonb_build_object('id',c1,'description','Machinery','commodity','MACHINERY','packageQuantity',2,'packageType','Crates','grossWeightKg',1200.25,'netWeightKg',1100.5,'length',240.5,'width',80,'height',90,'lengthUnit','cm','volumeCbm',2.125678,'countryOfOrigin','gb','hsCode','8421','isHazardous',true,'chargeableWeightKg',1300.123),
          jsonb_build_object('id',c2,'description','Spare parts','packageQuantity',3,'packageType','Cartons','grossWeightKg',75,'isTemperatureControlled',true)
        );
        original_snapshot:=jsonb_build_object('quote',jsonb_build_object('mode','Sea','direction','Export','shipmentFacts',jsonb_build_object('cargoLines',lines,'goodsValue','60000','goodsValueCurrency','GBP')));
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted") values(v,q,original_snapshot,true);
        select "CusQuoteVersion_SnapshotJSON" into original_snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v;
        begin perform booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null); raise exception 'Unaccepted conversion allowed'; exception when invalid_parameter_value then null; end;
        update public."CusQuote_Header" set "CusQuoteHeader_LifecycleCode"='accepted' where "CusQuoteHeader_ID"=q;
        result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null); job:=(result->>'jobId')::uuid;
        if (select count(*) from public."Job_Cargo" where "JobCargo_JobID"=job)<>2 then raise exception 'Accepted lines collapsed'; end if;
        select "JobCargo_ID" into saved_cargo from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_SourceQuoteLineID"=c1;
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_ID"=saved_cargo and "JobCargo_SourceQuoteVersionID"=v
          and "JobCargo_Description"='Machinery' and "JobCargo_Commodity"='MACHINERY' and "JobCargo_PackageQty"=2
          and "JobCargo_GrossKilos"=1200.25 and "JobCargo_NettKilos"=1100.5 and "JobCargo_VolumeCBM"=2.125678
          and "JobCargo_Length"=240.5 and "JobCargo_Width"=80 and "JobCargo_Height"=90 and "JobCargo_LengthUnit"='cm'
          and "JobCargo_HSCode"='8421' and "JobCargo_CountryOfOriginCodeSnapshot"='GB' and "JobCargo_IsHazardous"
          and "JobCargo_CargoJSON"->>'chargeableWeightKg'='1300.123') then raise exception 'Typed cargo or compatibility measurement lost'; end if;
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_SourceQuoteLineID"=c2 and "JobCargo_LineNo"=2 and "JobCargo_IsTemperatureControlled") then raise exception 'Second line evidence lost'; end if;
        if exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_DeclaredValueAmount" is not null) then raise exception 'Shipment value duplicated or arbitrarily allocated'; end if;
        if (select "Job_SourceSnapshotJSON"#>>'{acceptedSnapshot,quote,shipmentFacts,goodsValue}' from public."Job_Header" where "Job_ID"=job)<>'60000' then raise exception 'Unallocated shipment value lost'; end if;
        -- Repeat acceptance/conversion must not reset operational edits.
        insert into public."Org_Master" select "Job_Customer" from public."Job_Header" where "Job_ID"=job;
        perform booking_api.save_booking(actor,job,jsonb_build_object('cargo',(
          select jsonb_agg("JobCargo_CargoJSON"||jsonb_build_object('id',"JobCargo_ID",'pieces',"JobCargo_Qty",'description',case when "JobCargo_ID"=saved_cargo then 'Operator correction' else "JobCargo_Description" end) order by "JobCargo_LineNo")
            from public."Job_Cargo" where "JobCargo_JobID"=job
        )));
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_ID"=saved_cargo and "JobCargo_SourceQuoteVersionID"=v and "JobCargo_SourceQuoteLineID"=c1 and "JobCargo_Length"=240.5 and not "JobCargo_IsDeleted") then raise exception 'Canonical save lost source identity or unexposed measurement'; end if;
        select count(*) into event_count from booking_api.events;
        result:=booking_api.convert_accepted_quote_before_sync_review_20260904(q,actor,null);
        if not (result->>'reused')::boolean or (result->>'jobId')::uuid<>job or (select count(*) from booking_api.events)<>event_count
          or (select "JobCargo_Description" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>'Operator correction' then raise exception 'Repeated conversion rewrote Booking'; end if;
        if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v)<>original_snapshot then raise exception 'Booking changed Quote'; end if;
        begin perform booking_api.insert_accepted_quote_cargo(job,v,actor); raise exception 'Initial helper replaced existing cargo'; exception when invalid_parameter_value then null; end;
        begin perform booking_api.insert_accepted_quote_cargo(job,wrong_version,actor); raise exception 'Wrong version accepted'; exception when invalid_parameter_value then null; end;
        begin update public."Job_Cargo" set "JobCargo_SourceQuoteLineID"=gen_random_uuid() where "JobCargo_ID"=saved_cargo; raise exception 'Orphan provenance allowed'; exception when foreign_key_violation then null; end;
        if cardinality(quote_api.cargo_booking_missing(jsonb_set(lines,'{0,grossWeightKg}','1200.123')))=0 then raise exception 'Silent weight rounding allowed'; end if;
        if cardinality(quote_api.cargo_booking_missing(jsonb_set(lines,'{0,commodity}',to_jsonb(repeat('A',51)))))=0 then raise exception 'Silent commodity truncation allowed'; end if;
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy") values(bad_quote,office,'accepted',bad_version,actor);
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted")
          values(bad_version,bad_quote,jsonb_set(original_snapshot,'{quote,shipmentFacts,cargoLines,0,grossWeightKg}','1200.123'),true);
        select count(*) into event_count from booking_api.events;
        begin perform booking_api.convert_accepted_quote_before_sync_review_20260904(bad_quote,actor,null); raise exception 'Lossy conversion permitted'; exception when invalid_parameter_value then null; end;
        if exists(select 1 from public."Job_Header" where "Job_SourceQuoteID"=bad_quote)
          or (select count(*) from booking_api.events)<>event_count then raise exception 'Rejected handover left partial Booking or event'; end if;
        -- Quotes without the structured key keep their existing conversion.
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy") values(legacy_quote,office,'accepted',legacy_version,actor);
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted")
          values(legacy_version,legacy_quote,'{"quote":{"mode":"Air","direction":"Import","shipmentFacts":{"knownCargo":"Legacy cargo","packageQuantity":5,"packageType":"Cartons","grossWeightKg":25,"goodsValue":1000,"goodsValueCurrency":"GBP"}}}',true);
        result:=booking_api.convert_accepted_quote_before_sync_review_20260904(legacy_quote,actor,null);
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=(result->>'jobId')::uuid and "JobCargo_Description"='Legacy cargo' and "JobCargo_PackageQty"=5 and "JobCargo_DeclaredValueAmount"=1000 and "JobCargo_SourceQuoteLineID" is null) then raise exception 'Legacy conversion changed'; end if;
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID","CusQuoteHeader_LifecycleCode","CusQuoteHeader_AcceptedVersionID","CusQuoteHeader_CreatedBy") values(single_quote,office,'accepted',single_version,actor);
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted")
          values(single_version,single_quote,jsonb_set(original_snapshot,'{quote,shipmentFacts,cargoLines}',jsonb_build_array(lines->0)),true);
        result:=booking_api.convert_accepted_quote_before_sync_review_20260904(single_quote,actor,null);
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=(result->>'jobId')::uuid and "JobCargo_DeclaredValueAmount"=60000 and "JobCargo_DeclaredValueCurrencyCodeSnapshot"='GBP') then raise exception 'Single-line goods value not retained'; end if;
        -- New revision: one conflicting description, one safe weight change,
        -- one removal and one addition. Operational-only cargo is not a target.
        insert into public."Job_Cargo" ("JobCargo_ID","JobCargo_JobID","JobCargo_LineNo","JobCargo_Description") values(manual_cargo,job,3,'Operator-added cargo');
        proposed_lines:=jsonb_build_array(jsonb_set(jsonb_set(lines->0,'{description}','"New customer description"'),'{grossWeightKg}','1250'),
          jsonb_build_object('id',new_line_id,'description','New customer goods','packageQuantity',1,'packageType','Cartons','grossWeightKg',20));
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","CusQuoteHeader_ID","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted","CusQuoteVersion_Number","CusQuoteVersion_IsCurrent")
          values(revision,q,jsonb_set(original_snapshot,'{quote,shipmentFacts,cargoLines}',proposed_lines),true,2,false);
        observed_lines:=booking_api.current_source_cargo_lines(job);
        if jsonb_array_length(observed_lines)<>2 then raise exception 'Operational-only cargo included in Quote-owned comparison'; end if;
        if booking_api.cargo_revision_differences(lines,observed_lines,lines)<>'[]'::jsonb then raise exception 'Booking-only edits created a Quote warning'; end if;
        if booking_api.cargo_revision_differences(lines,observed_lines,jsonb_build_array(lines->1,lines->0))<>'[]'::jsonb then raise exception 'Reordering compared wrong cargo'; end if;
        differences:=booking_api.cargo_revision_differences(lines,observed_lines,proposed_lines);
        description_key:='cargo:'||c1||':description'; weight_key:='cargo:'||c1||':grossWeightKg';
        if jsonb_array_length(differences)<>4 then raise exception 'Incorrect per-field cargo differences: %',differences; end if;
        if not exists(select 1 from jsonb_array_elements(differences) d where d->>'key'=description_key and (d->>'conflict')::boolean and d->>'bookingValue'='Operator correction') then raise exception 'Operator conflict lost'; end if;
        if not exists(select 1 from jsonb_array_elements(differences) d where d->>'key'=weight_key and not (d->>'conflict')::boolean) then raise exception 'Safe weight update incorrectly conflicts'; end if;
        if not exists(select 1 from jsonb_array_elements(differences) d where d->>'operation'='remove' and (d->>'requiresConfirmation')::boolean) then raise exception 'Removal needs review'; end if;
        begin perform booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array(weight_key),observed_lines); raise exception 'Unaccepted newer version planned'; exception when invalid_parameter_value then null; end;
        update public."CusQuote_Header" set "CusQuoteHeader_AcceptedVersionID"=revision where "CusQuoteHeader_ID"=q;
        update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode"='accepted' where "CusQuoteVersion_ID"=revision;
        plan:=booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array(weight_key),observed_lines);
        if plan#>>'{changes,0,values,description}'<>'Operator correction' or (plan#>>'{changes,0,values,grossWeightKg}')::numeric<>1250
          or (plan#>>'{changes,0,bookingCargoId}')::uuid<>saved_cargo then raise exception 'Selective plan overwrote unselected values or identity'; end if;
        plan:=booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array(description_key,weight_key,'cargo:'||c2||':line','cargo:'||new_line_id||':line'),observed_lines);
        if jsonb_array_length(plan->'changes')<>3 then raise exception 'Apply-all plan did not group fields by source identity'; end if;
        if exists(select 1 from jsonb_array_elements(plan->'changes') item where item->>'bookingCargoId'=manual_cargo::text) then raise exception 'Operational cargo targeted'; end if;
        -- Planning is read-only, even for explicit removal/addition selections.
        if (select count(*) from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted")<>3
          or (select "JobCargo_Description" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>'Operator correction' then raise exception 'Planning applied changes'; end if;
        begin perform booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array(weight_key,weight_key),observed_lines); raise exception 'Duplicate selection allowed'; exception when invalid_parameter_value then null; end;
        begin perform booking_api.plan_quote_cargo_revision(job,v,revision,'["charges"]',observed_lines); raise exception 'Non-cargo field allowed'; exception when invalid_parameter_value then null; end;
        begin perform booking_api.plan_quote_cargo_revision(job,wrong_version,revision,jsonb_build_array(weight_key),observed_lines); raise exception 'Stale baseline accepted'; exception when serialization_failure then null; end;
        update public."Job_Cargo" set "JobCargo_GrossKilos"=1234 where "JobCargo_ID"=saved_cargo;
        begin perform booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array(weight_key),observed_lines); raise exception 'Stale weight approval accepted'; exception when serialization_failure then null; end;
        observed_lines:=booking_api.current_source_cargo_lines(job);
        plan:=booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array(weight_key),observed_lines);
        if (plan#>>'{changes,0,values,grossWeightKg}')::numeric<>1250 then raise exception 'Refreshed conflict review cannot proceed'; end if;
        update public."Job_Cargo" set "JobCargo_IsDeleted"=true where "JobCargo_ID"=saved_cargo;
        differences:=booking_api.cargo_revision_differences(lines,booking_api.current_source_cargo_lines(job),proposed_lines);
        if not exists(select 1 from jsonb_array_elements(differences) d where d->>'sourceLineId'=c1::text and d->>'operation'='restore' and d->>'warningCode'='booking_cargo_removed') then raise exception 'Removed Booking line silently resurrected'; end if;
        observed_lines:=booking_api.current_source_cargo_lines(job);
        plan:=booking_api.plan_quote_cargo_revision(job,v,revision,jsonb_build_array('cargo:'||c1||':line'),observed_lines);
        if plan#>>'{changes,0,operation}'<>'restore' or plan#>'{changes,0,bookingCargoId}'<>'null'::jsonb then raise exception 'Restoration did not require an explicit new line plan'; end if;
        differences:=booking_api.cargo_revision_differences(lines,lines,jsonb_set(lines,'{0,commodity}','null'));
        if not exists(select 1 from jsonb_array_elements(differences) d where d->>'field'='commodity' and d->'newQuoteValue'='null'::jsonb) then raise exception 'Explicit field clear lost'; end if;
        differences:=booking_api.cargo_revision_differences(lines,jsonb_set(lines,'{0,description}',to_jsonb(repeat('Long Booking note ',500))),proposed_lines);
        if not exists(select 1 from jsonb_array_elements(differences) d where d->>'key'=description_key and length(d->>'bookingValue')>4000 and (d->>'conflict')::boolean) then raise exception 'Operational text was shortened or blocked during comparison'; end if;
        if has_function_privilege('service_role','booking_api.plan_quote_cargo_revision(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE')
          or has_function_privilege('authenticated','booking_api.current_source_cargo_lines(uuid)','EXECUTE') then raise exception 'Unwired internal cargo planner exposed'; end if;
        -- Exercise persistence with the real guarded function and a synthetic
        -- review row. Public review creation/token handling is a separate gate.
        update public."Job_Cargo" set "JobCargo_IsDeleted"=false where "JobCargo_ID"=saved_cargo;
        select "JobCargo_ID" into second_cargo from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_SourceQuoteLineID"=c2;
        insert into public."Job_CargoDangerousGoods" ("JobCargoDG_JobCargoID","JobCargoDG_UNNumber") values(second_cargo,'1234');
        observed_lines:=booking_api.current_source_cargo_lines(job);
        differences:=booking_api.cargo_revision_differences(lines,observed_lines,proposed_lines);
        insert into booking_api.quote_sync_reviews(review_id,company_id,job_id,quote_id,applied_version_id,proposed_version_id,differences)
          values(review_id,company,job,q,v,revision,differences);
        -- Sales can work on a later draft without revoking the accepted version
        -- which operations has not applied yet.
        update public."CusQuote_Header" set "CusQuoteHeader_LifecycleCode"='revised',"CusQuoteHeader_AcceptedVersionID"=null where "CusQuoteHeader_ID"=q;
        insert into public."CusQuote_Versions" ("CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted")
          values(q,3,jsonb_set(original_snapshot,'{quote,shipmentFacts,cargoLines}',proposed_lines),false);
        update public."Job_Header" set "Job_PendingQuoteVersionID"=revision,"Job_QuoteSyncStatus"='out_of_sync' where "Job_ID"=job;
        insert into public."cmp_Users" values(foreign_actor,foreign_actor,gen_random_uuid(),'active');
        select count(*) into before_events from booking_api.events;
        begin perform booking_api.apply_quote_cargo_fields(foreign_actor,job,review_id,jsonb_build_array(weight_key),observed_lines); raise exception 'Cross-workspace apply allowed'; exception when insufficient_privilege then null; end;
        begin perform booking_api.apply_quote_cargo_fields(gen_random_uuid(),job,review_id,jsonb_build_array(weight_key),observed_lines); raise exception 'Unauthorised apply allowed'; exception when insufficient_privilege then null; end;
        begin perform booking_api.apply_quote_cargo_fields(actor,job,review_id,'["charges"]',observed_lines); raise exception 'Cargo helper changed financial fields'; exception when invalid_parameter_value then null; end;
        if (select count(*) from booking_api.events)<>before_events then raise exception 'Rejected apply emitted success audit'; end if;
        insert into public."AI_DexterWatches" values(company,'booking_cargo','active',saved_cargo);
        select count(*) into before_signals from public."AI_DexterWatchSignals";
        result:=booking_api.apply_quote_cargo_fields(actor,job,review_id,jsonb_build_array(weight_key),observed_lines);
        if (select count(*) from public."AI_DexterWatchSignals")<>before_signals+1
          or not exists(select 1 from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceID"=saved_cargo and "AIDexterWatchSignal_CompanyID"=company
            and "AIDexterWatchSignal_NewJSON"->>'grossWeightKg'='1250.00') then raise exception 'Applied cargo change did not reach the existing event adapter'; end if;
        if (result->>'remainingFields')::integer<>3 or (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>1250
          or (select "JobCargo_Description" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>'Operator correction'
          or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>v then raise exception 'Partial application lost unselected state or prematurely advanced Quote'; end if;
        if not exists(select 1 from booking_api.events where metadata->>'reviewId'=review_id::text and metadata->'appliedFields'=jsonb_build_array(weight_key)
          and metadata ? 'beforeCargo' and metadata ? 'afterCargo' and metadata->>'quoteVersionId'=revision::text and actor_user_id=actor) then raise exception 'Exact cargo/version/actor audit absent'; end if;
        begin
          update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true,"CusQuoteVersion_StatusCode"='accepted' where "CusQuoteHeader_ID"=q and "CusQuoteVersion_Number"=3;
          perform booking_api.apply_quote_cargo_fields(actor,job,review_id,jsonb_build_array(description_key),observed_lines);
          raise exception 'Superseded accepted version was applied';
        exception when invalid_parameter_value then null; end;
        update public."Job_Cargo" set "JobCargo_GrossKilos"=1300 where "JobCargo_ID"=saved_cargo;
        select count(*) into before_events from booking_api.events;
        select count(*) into before_signals from public."AI_DexterWatchSignals";
        result:=booking_api.apply_quote_cargo_fields(actor,job,review_id,jsonb_build_array(weight_key),observed_lines);
        if not (result->>'reused')::boolean or (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>1300
          or (select count(*) from booking_api.events)<>before_events or (select count(*) from public."AI_DexterWatchSignals")<>before_signals then raise exception 'Retry reapplied an old approval or emitted another signal'; end if;
        update public."Job_Cargo" set "JobCargo_Description"='Further operational correction' where "JobCargo_ID"=saved_cargo;
        begin perform booking_api.apply_quote_cargo_fields(actor,job,review_id,jsonb_build_array(description_key),observed_lines); raise exception 'Stale description written'; exception when serialization_failure then null; end;
        observed_lines:=booking_api.current_source_cargo_lines(job);
        result:=booking_api.apply_quote_cargo_fields(actor,job,review_id,jsonb_build_array(description_key,'cargo:'||c2||':line','cargo:'||new_line_id||':line'),observed_lines);
        if (result->>'remainingFields')::integer<>0 or (select "Job_SourceQuoteVersionID" from public."Job_Header" where "Job_ID"=job)<>revision
          or (select "Job_QuoteSyncStatus" from public."Job_Header" where "Job_ID"=job)<>'in_sync'
          or (select status_code from booking_api.quote_sync_reviews r where r.review_id=(result->>'reviewId')::uuid)<>'applied' then raise exception 'Completed cargo review did not advance applied version'; end if;
        if (select "JobCargo_GrossKilos" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>1300
          or (select "JobCargo_Description" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>'New customer description'
          or (select "JobCargo_SourceQuoteVersionID" from public."Job_Cargo" where "JobCargo_ID"=saved_cargo)<>v then raise exception 'Selective application reset other values or original provenance'; end if;
        if not (select "JobCargo_IsDeleted" from public."Job_Cargo" where "JobCargo_ID"=second_cargo)
          or not exists(select 1 from public."Job_CargoDangerousGoods" where "JobCargoDG_JobCargoID"=second_cargo) then raise exception 'Cargo removal destroyed linked history'; end if;
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_JobID"=job and "JobCargo_SourceQuoteLineID"=new_line_id and "JobCargo_SourceQuoteVersionID"=revision and not "JobCargo_IsDeleted") then raise exception 'Selected addition missing'; end if;
        if not exists(select 1 from public."Job_Cargo" where "JobCargo_ID"=manual_cargo and "JobCargo_Description"='Operator-added cargo' and not "JobCargo_IsDeleted") then raise exception 'Operational cargo lost'; end if;
        if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v)<>original_snapshot then raise exception 'Persistence overwrote old Quote'; end if;
        if has_function_privilege('service_role','booking_api.apply_quote_cargo_fields(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') then raise exception 'Unwired apply helper exposed'; end if;
        if has_function_privilege('service_role','booking_api.insert_accepted_quote_cargo(uuid,uuid,uuid)','EXECUTE')
          or has_function_privilege('authenticated','quote_api.cargo_booking_missing(jsonb)','EXECUTE') then raise exception 'Internal cargo insertion exposed'; end if;
      end $handover_test$;
      ${quoteCargoReviewFixture(read, sqlFunction)}
      ${bookingShipmentValueFixture(read)}
      ${quoteRoutingModeReviewFixture(read, sqlFunction)}
      ${quoteSingleLegRoutingFixture(read)}
      -- Re-run the mixed-mode/reduction/rollback cases against the new projection.
      ${quoteRoutingModeReviewFixture(read, sqlFunction, false)}
      ${read('20260905195412_quote_overall_mode_route_authority.sql')}
      ${quoteOverallModeFixture()}
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
