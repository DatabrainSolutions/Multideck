import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { cargo, mapping, workspace, fixtureLines } from './quote-cargo-client-fixture.mjs'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const read = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const migration = read('20260905115938_quote_version_structured_cargo.sql')
const opening = read('20260905160621_quote_open_structured_cargo.sql')
const safety = read('20260905163327_quote_cargo_safety_summary.sql')
const lifecycle = read('20260903120100_quote_draft_version_lifecycle.sql')
const guardStart = lifecycle.indexOf('create or replace function quote_api.prevent_submitted_quote_version_mutation()')
const guardEnd = lifecycle.indexOf('-- Keep the original implementation', guardStart)
assert.ok(guardStart >= 0 && guardEnd > guardStart)
const guard = lifecycle.slice(guardStart, guardEnd)
const draftSave = read('20260904142000_enforce_quote_customer_identity.sql')

// Real new migration + existing immutable guard + existing draft-collapse
// implementation. The older broad save is an explicit fixture which creates
// the transient version; this is not the whole tenant save/acceptance API.
test('PostgreSQL: structured Quote cargo survives draft saves and immutable versions', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-quote-cargo-'))
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
      create schema quote_api;
      grant usage on schema quote_api to anon,authenticated,service_role;
      create table public."CusQuote_Header" (
        "CusQuoteHeader_ID" uuid primary key, "CusQuoteHeader_LifecycleCode" text default 'draft',
        "CusQuoteHeader_CustomerID" uuid, "CusQuoteHeader_IsDeleted" boolean default false
      );
      create table public."CusQuote_Versions" (
        "CusQuoteVersion_ID" uuid primary key default gen_random_uuid(),
        "Company_ID" uuid not null, "CusQuoteHeader_ID" uuid not null references public."CusQuote_Header",
        "CusQuoteVersion_Number" integer not null,
        "CusQuoteVersion_StatusCode" text default 'draft',
        "CusQuoteVersion_SnapshotJSON" jsonb not null,
        "CusQuoteVersion_IsCurrent" boolean not null default false,
        "CusQuoteVersion_CreatedAt" timestamptz default now(), "CusQuoteVersion_CreatedBy" uuid,
        "CusQuoteVersion_IsSubmitted" boolean not null default false,
        "CusQuoteVersion_SubmittedAt" timestamptz, "CusQuoteVersion_SubmittedBy" uuid,
        unique ("CusQuoteHeader_ID","CusQuoteVersion_Number")
      );
      create unique index current_version on public."CusQuote_Versions" ("CusQuoteHeader_ID") where "CusQuoteVersion_IsCurrent";
      create table public."CusQuote_Events" ("CusQuoteVersion_ID" uuid, "CusQuoteEvent_TypeCode" text);
      create table quote_api.customer_response_links (quote_id uuid, quote_version_id uuid);
      create table quote_api.customer_responses (quote_id uuid, quote_version_id uuid);
      create function quote_api.save_quote_legacy_20260903(actor uuid,quote_id uuid,payload jsonb)
      returns jsonb language plpgsql as $$
      declare version_id uuid; version_number integer; company uuid;
      begin
        -- The broad initial save, identities and numbering remain fixtures.
        -- The actual open action and draft-collapse/version projections execute.
        if quote_id is null then
          quote_id := gen_random_uuid();
          insert into public."CusQuote_Header" ("CusQuoteHeader_ID") values(quote_id);
        end if;
        select "Company_ID" into company from public."CusQuote_Versions" where "CusQuoteHeader_ID"=quote_id limit 1;
        company := coalesce(company, '11111111-1111-4111-8111-111111111111'::uuid);
        select coalesce(max("CusQuoteVersion_Number"),0)+1 into version_number from public."CusQuote_Versions" where "CusQuoteHeader_ID"=quote_id;
        update public."CusQuote_Versions" set "CusQuoteVersion_IsCurrent"=false where "CusQuoteHeader_ID"=quote_id;
        insert into public."CusQuote_Versions" ("Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsCurrent")
        values(company,quote_id,version_number,jsonb_build_object('quote',payload),true) returning "CusQuoteVersion_ID" into version_id;
        return jsonb_build_object('quoteId',quote_id,'versionId',version_id,'versionNumber',version_number);
      end $$;
      ${guard}
      ${draftSave}
      ${migration}
      create table cargo_link_fixture (
        version_id uuid, line_id uuid,
        foreign key (version_id,line_id) references quote_api.version_cargo_lines on delete cascade
      );
      do $test$
      declare
        quote_id uuid := gen_random_uuid(); company uuid := gen_random_uuid();
        customer uuid := gen_random_uuid(); actor uuid := gen_random_uuid();
        v1 uuid := gen_random_uuid(); v2 uuid; c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
        lines jsonb; result jsonb; snapshot jsonb; old_projection jsonb; invalid jsonb; changed jsonb;
      begin
        insert into public."CusQuote_Header" ("CusQuoteHeader_ID","CusQuoteHeader_CustomerID") values(quote_id,customer);
        lines := jsonb_build_array(
          jsonb_build_object('id',c1,'description','Machinery','packageQuantity','2','grossWeightKg','1200.50','length','230','lengthUnit','cm','countryOfOrigin','gb'),
          jsonb_build_object('id',c2,'description','Spare parts','packageQuantity',3,'grossWeightKg',75,'isHazardous',true)
        );
        insert into public."CusQuote_Versions" ("CusQuoteVersion_ID","Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsCurrent")
          values(v1,company,quote_id,1,jsonb_build_object('quote',jsonb_build_object('shipmentFacts',jsonb_build_object('cargoLines',lines))),true);
        if (select count(*) from quote_api.version_cargo_lines where version_id=v1) <> 2 then raise exception 'Second line lost'; end if;
        if not exists(select 1 from quote_api.version_cargo_lines where version_id=v1 and line_id=c1 and gross_weight_kg=1200.5 and length=230 and country_of_origin='GB') then raise exception 'Typed values missing'; end if;
        if not exists(select 1 from quote_api.version_cargo_lines where version_id=v1 and line_id=c2 and is_hazardous) then raise exception 'Safety flag lost'; end if;
        insert into cargo_link_fixture values(v1,c1);
        -- Same draft ID survives two saves and a reordering; transient rows cascade.
        lines := jsonb_build_array(lines->1,(lines->0)||' {"description":"Machinery revised"}'::jsonb);
        result := quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines',lines)));
        result := quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines',lines)));
        if (result->>'versionId')::uuid <> v1 or (select count(*) from public."CusQuote_Versions")<>1 or (select count(*) from quote_api.version_cargo_lines)<>2 then raise exception 'Draft history clutter or unstable identity'; end if;
        if not exists(select 1 from quote_api.version_cargo_lines where version_id=v1 and line_id=c2 and line_number=1) then raise exception 'Reordering failed'; end if;
        if not exists(select 1 from cargo_link_fixture where version_id=v1 and line_id=c1) then raise exception 'Save recreated cargo and lost linked records'; end if;
        -- A partially entered description may autosave, but cannot be submitted.
        changed := jsonb_set(lines,'{0,description}','null');
        perform quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines',changed)));
        begin
          update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true where "CusQuoteVersion_ID"=v1;
          raise exception 'Incomplete cargo submitted';
        exception when invalid_parameter_value then null; end;
        perform quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines',lines)));
        update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true,"CusQuoteVersion_SubmittedAt"=now(),"CusQuoteVersion_SubmittedBy"=actor where "CusQuoteVersion_ID"=v1;
        select "CusQuoteVersion_SnapshotJSON" into snapshot from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
        select jsonb_agg(to_jsonb(c) order by line_number) into old_projection from quote_api.version_cargo_lines c where version_id=v1;
        result := quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines',jsonb_build_array(lines->0))));
        v2 := (result->>'versionId')::uuid;
        if v2=v1 or (result->>'versionNumber')::integer<>2 then raise exception 'Revision did not create V2'; end if;
        if (select count(*) from quote_api.version_cargo_lines where version_id=v2)<>1 then raise exception 'Draft removal failed'; end if;
        update public."CusQuote_Versions" set "CusQuoteVersion_StatusCode"='accepted' where "CusQuoteVersion_ID"=v1;
        if (select "CusQuoteVersion_SnapshotJSON" from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1) <> snapshot
          or (select jsonb_agg(to_jsonb(c) order by line_number) from quote_api.version_cargo_lines c where version_id=v1) <> old_projection then raise exception 'Submitted evidence changed'; end if;
        begin
          update public."CusQuote_Versions" set "CusQuoteVersion_SnapshotJSON"='{}' where "CusQuoteVersion_ID"=v1;
          raise exception 'Submitted snapshot overwritten';
        exception when invalid_parameter_value then null; end;
        begin
          delete from public."CusQuote_Versions" where "CusQuoteVersion_ID"=v1;
          raise exception 'Submitted version deleted';
        exception when invalid_parameter_value then null; end;
        -- Reject malformed payloads atomically: the existing draft survives.
        for invalid in select value from jsonb_array_elements(jsonb_build_array(
          'null'::jsonb,'{}'::jsonb,jsonb_build_array(lines->0,lines->0),
          jsonb_build_array((lines->0)||'{"grossWeightKg":"NaN"}'),
          jsonb_build_array((lines->0)||'{"grossWeightKg":"Infinity"}'),
          jsonb_build_array((lines->0)||'{"grossWeightKg":-1}'),
          jsonb_build_array((lines->0)||'{"packageQuantity":1.5}'),
          jsonb_build_array((lines->0)||'{"isHazardous":"false"}'),
          jsonb_build_array((lines->0)||'{"countryOfOrigin":"England"}'),
          jsonb_build_array((lines->0)||'{"lengthUnit":"feet"}'),
          jsonb_build_array((lines->0)||'{"id":"not-an-id"}'),
          jsonb_build_array((lines->0)||'{"supplierCost":200}')
        )) loop
          begin
            perform quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines',invalid)));
            raise exception 'Invalid cargo accepted: %',invalid;
          exception when invalid_parameter_value then null; end;
          if (select count(*) from public."CusQuote_Versions")<>2 or (select count(*) from quote_api.version_cargo_lines where version_id=v2)<>1 then raise exception 'Rejected save changed draft'; end if;
        end loop;
        perform quote_api.save_quote(actor,quote_id,jsonb_build_object('customerId',customer,'shipmentFacts',jsonb_build_object('cargoLines','[]'::jsonb)));
        if exists(select 1 from quote_api.version_cargo_lines where version_id=v2) then raise exception 'Explicit clear failed'; end if;
        -- Existing legacy snapshots remain usable and unchanged, not split or guessed.
        insert into public."CusQuote_Versions" ("Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_SnapshotJSON","CusQuoteVersion_IsSubmitted")
          values(company,quote_id,3,'{"quote":{"shipmentFacts":{"packageQuantity":10}}}',true);
        if (select count(*) from quote_api.version_cargo_lines)<>2 then raise exception 'Invented legacy cargo'; end if;
        if has_table_privilege('authenticated','quote_api.version_cargo_lines','SELECT')
          or has_table_privilege('anon','quote_api.version_cargo_lines','SELECT')
          or has_table_privilege('service_role','quote_api.version_cargo_lines','UPDATE')
          or has_function_privilege('service_role','quote_api.project_version_cargo(uuid,jsonb)','EXECUTE')
          or has_function_privilege('authenticated','quote_api.normalise_cargo_lines(jsonb,boolean)','EXECUTE') then raise exception 'Cargo boundary exposed'; end if;
        if not (select relrowsecurity from pg_class where oid='quote_api.version_cargo_lines'::regclass) then raise exception 'RLS missing'; end if;
        if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='quote_api' and p.proname in ('validate_version_cargo','project_version_cargo','sync_version_cargo')
            and (not p.prosecdef or not coalesce('search_path=""'=any(p.proconfig),false))) then raise exception 'Unsafe trigger execution context'; end if;
      end $test$;
      set role authenticated;
      do $$begin
        begin perform * from quote_api.version_cargo_lines; raise exception 'Browser read bypass'; exception when insufficient_privilege then null; end;
      end $$;
      reset role;
      set role service_role;
      do $$begin
        perform * from quote_api.version_cargo_lines;
        begin delete from quote_api.version_cargo_lines; raise exception 'Independent writer bypass'; exception when insufficient_privilege then null; end;
      end $$;
      reset role;
    `)
    // Upgrade after the old-version tests so the migration is checked against
    // real existing snapshots, not only a fresh empty fixture schema.
    const psql = ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
    const oldSnapshots = run('psql', psql, 'select jsonb_agg("CusQuoteVersion_SnapshotJSON" order by "CusQuoteVersion_Number") from public."CusQuote_Versions";')
    run('psql', psql, opening)
    run('psql', psql, safety)
    assert.equal(run('psql', psql, 'select jsonb_agg("CusQuoteVersion_SnapshotJSON" order by "CusQuoteVersion_Number") from public."CusQuote_Versions";'), oldSnapshots)
    const actor = '22222222-2222-4222-8222-222222222222'
    const opened = JSON.parse(run('psql', psql, `select public.quote_workflow_open_quote('${actor}');`))
    const quoteId = opened.quoteId
    const versionId = opened.versionId
    const load = () => JSON.parse(run('psql', psql, `select "CusQuoteVersion_SnapshotJSON"->'quote'->'shipmentFacts' from public."CusQuote_Versions" where "CusQuoteVersion_ID"='${versionId}';`))
    const initial = load()
    assert.equal(initial.createdOnOpen, true)
    assert.equal(initial.cargoLines.length, 1)
    assert.equal(cargo.readQuoteCargoLines(initial.cargoLines)[0].description, '')
    const lines = fixtureLines()
    lines[0].id = initial.cargoLines[0].id
    lines[0].volumeCbm = '0.123456789012345678901234'
    const loaded = mapping.quoteRecordFromWorkspace(workspace(initial), null)
    const payload = mapping.quoteSavePayload({ ...loaded, cargoLines: lines }, [], null)
    const sqlLiteral = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
    const save = value => JSON.parse(run('psql', psql, `select quote_api.save_quote('${actor}', '${quoteId}', ${sqlLiteral(value)});`))
    assert.equal(save(payload).versionId, versionId, 'Opening and saving must retain the one mutable draft')
    const reloaded = mapping.quoteRecordFromWorkspace(workspace(load()), null)
    assert.deepEqual(reloaded.cargoLines, lines, 'Browser payload → actual normaliser/projection → reload must retain every field and exact precision')
    assert.equal(load().knownCargo, 'Hazardous; Temperature controlled')
    assert.equal(load().cargoCharacteristics, 'General cargo')
    // An older or non-UI caller cannot override typed flags with a stale label.
    save({ ...payload, shipmentFacts: { ...payload.shipmentFacts, knownCargo: 'General merchandise', cargoCharacteristics: 'Fragile' } })
    assert.equal(load().knownCargo, 'Hazardous; Temperature controlled; Fragile')
    assert.equal(load().cargoCharacteristics, 'Fragile')
    save({ ...payload, shipmentFacts: { ...payload.shipmentFacts, cargoCharacteristics: 'Sensitive consignment' } })
    assert.equal(load().knownCargo, 'Hazardous; Temperature controlled; Sensitive consignment')
    assert.equal(save(mapping.quoteSavePayload({ ...reloaded, cargoLines: [] }, [], null)).versionId, versionId)
    assert.deepEqual(load().cargoLines, [], 'Removing the final line must not revive a flat summary')
    assert.equal(load().knownCargo, 'General merchandise', 'Derived hazard must clear without changing a separate manual choice')
    run('psql', psql, `
      do $$ begin
        if has_function_privilege('service_role','quote_api.save_quote_before_cargo_safety_20260905(uuid,uuid,jsonb)','EXECUTE')
          or has_function_privilege('authenticated','quote_api.cargo_handling_summary(jsonb)','EXECUTE') then raise exception 'Cargo safety bypass exposed'; end if;
        if has_function_privilege('anon','public.quote_workflow_open_quote(uuid)','EXECUTE')
          or has_function_privilege('authenticated','public.quote_workflow_open_quote(uuid)','EXECUTE')
          or not has_function_privilege('service_role','public.quote_workflow_open_quote(uuid)','EXECUTE') then raise exception 'Unsafe open grants'; end if;
        begin
          update public."CusQuote_Versions" set "CusQuoteVersion_IsSubmitted"=true where "CusQuoteVersion_ID"='${versionId}';
          raise exception 'Empty draft was submitted';
        exception when invalid_parameter_value then null; end;
      end $$;
      set role authenticated;
      do $$ begin
        begin perform public.quote_workflow_open_quote('${actor}'); raise exception 'Browser bypass'; exception when insufficient_privilege then null; end;
      end $$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
