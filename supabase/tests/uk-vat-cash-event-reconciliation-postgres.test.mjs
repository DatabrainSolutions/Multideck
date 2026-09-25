import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260925170000_uk_vat_cash_event_reconciliation.sql", import.meta.url), "utf8")
const bridgeGateMigration = readFileSync(new URL("../migrations/20260925173000_uk_vat_cash_bridge_signoff_gate.sql", import.meta.url), "utf8")
const sourceLockMigration = readFileSync(new URL("../migrations/20260924165621_lock_vat_reconciled_transactions.sql", import.meta.url), "utf8")
const pgBin = process.env.PG_TEST_BIN ?? "/opt/homebrew/opt/postgresql@17/bin"
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

test("Cash payment events receive immutable VAT reconciliation dates and lock their sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "multideck-cash-signoff-"))
  let started = false
  const run = (name, args, input, mustPass = true) => {
    const result = spawnSync(join(pgBin, name), args, { input, encoding: "utf8", timeout: 30_000 })
    if (mustPass) assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0, "Expected SQL to be rejected")
    return result.stdout.trim()
  }
  const args = ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
  const sql = input => run("psql", args, input)
  const denied = input => run("psql", args, input, false)
  const entity = id(1), foreign = id(2), actor = id(3), other = id(4), outsider = id(30)
  const period = id(5), projection = id(6), original = id(7), invoice = id(8)
  const line = id(9), evidence = id(10), cash = id(11), allocation = id(12), event = id(13)
  const secondCash = id(14), secondAllocation = id(15), secondEvent = id(16)
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create table public."cmp_Users"("User_ID" uuid primary key);
      create table public."FIN_IndirectTaxPeriods"(
        id uuid primary key, legal_entity_id uuid, jurisdiction_code text,
        scheme_code text, status text, start_date date, end_date date);
      create table public."FIN_IndirectTaxCalculations"(
        id uuid primary key, period_id uuid, revision integer,
        calculation_version text, source_digest text, exceptions jsonb,
        control_reconciliation jsonb, unique(id,period_id));
      create table public."FIN_IndirectTaxCashEventProjections"(id uuid primary key);
      create table public."FIN_CashTransactions"(
        "FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid);
      create table public."FIN_CashAllocations"("FINCashAlloc_ID" uuid primary key);
      create table public."FIN_Documents"("FINDoc_ID" uuid primary key,amount numeric);
      create table public."FIN_DocumentLines"(
        "FINDocLine_ID" uuid primary key,"FINDocLine_DocumentID" uuid);
      create table public."FIN_DocumentLineJobLinks"(
        "FINDocLineJob_DocumentID" uuid,"FINDocLineJob_DocumentLineID" uuid);
      create table public."FIN_PostingBatches"("FINPostBatch_ID" uuid primary key);
      create table public."FIN_PostingLines"(
        "FINPostLine_BatchID" uuid,"FINPostLine_DocumentID" uuid,
        "FINPostLine_DocumentLineID" uuid);
      create table public."FIN_IndirectTaxEvidence"(
        id uuid primary key,source_document_id uuid,source_posting_batch_id uuid);
      create table public."FIN_IndirectTaxReconciliations"(evidence_id uuid);
      create table public."FIN_IndirectTaxDecisions"(evidence_id uuid);
      create table public."FIN_IndirectTaxCashPaymentDateReviews"(cash_id uuid);
      create table public."FIN_IndirectTaxCashEventLines"(
        id uuid primary key,projection_id uuid,legal_entity_id uuid,cash_id uuid,
        allocation_id uuid,invoice_id uuid,line_id uuid,evidence_id uuid,
        payment_date date);
      create table public."FIN_IndirectTaxCashCalculationEventLines"(
        calculation_id uuid,period_id uuid,event_line_id uuid);
      create table public."Audit_Events"(
        "AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,
        "AuditEvent_LegalEntityID" uuid,"AuditEvent_SourceApp" text,
        "AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,
        "AuditEvent_SourceTableName" text,"AuditEvent_RecordTypeCode" text,
        "AuditEvent_RecordID" uuid,"AuditEvent_Action" text,
        "AuditEvent_Reason" text,"AuditEvent_Title" text,
        "AuditEvent_MetadataJSON" jsonb);
      create table public.test_current_source(digest text);
      create function public._multideck_indirect_tax_immutable()
      returns trigger language plpgsql as $$begin raise exception 'Immutable'; end$$;
      create function public._multideck_uk_vat_access(p_actor uuid,p_entity uuid)
      returns void language plpgsql as $$begin
        if p_actor<>'${actor}'::uuid or p_entity<>'${entity}'::uuid then
          raise exception 'Foreign or unpermitted caller' using errcode='42501';
        end if;
      end$$;
      create function public._multideck_uk_vat_read_access(p_actor uuid,p_entity uuid)
      returns void language plpgsql as $$begin
        if p_actor not in ('${actor}'::uuid,'${other}'::uuid)
          or p_entity<>'${entity}'::uuid then
          raise exception 'Foreign or unpermitted reader' using errcode='42501';
        end if;
      end$$;
      create function public.multideck_uk_vat_calculate_cash_draft(
        p_actor uuid,p_period uuid,p_projection uuid)
      returns jsonb language plpgsql as $$
      declare v_previous uuid; v_next uuid:=gen_random_uuid(); v_revision integer;
        v_digest text;
      begin
        select id,revision into v_previous,v_revision
          from public."FIN_IndirectTaxCalculations" where period_id=p_period
          order by revision desc limit 1;
        select digest into v_digest from public.test_current_source;
        insert into public."FIN_IndirectTaxCalculations"
          values(v_next,p_period,v_revision+1,'uk-cash-v1',v_digest,
            '[]'::jsonb,jsonb_build_object('cashProjectionId',p_projection));
        insert into public."FIN_IndirectTaxCashCalculationEventLines"
          select v_next,p_period,event_line_id
          from public."FIN_IndirectTaxCashCalculationEventLines"
          where calculation_id=v_previous;
        return jsonb_build_object('calculationId',v_next,
          'sourceDigest',v_digest,'status','cash_draft_only');
      end$$;
      insert into public."cmp_Users" values ('${actor}'),('${other}');
      insert into public."FIN_IndirectTaxPeriods" values
        ('${period}','${entity}','GB','cash','draft','2026-01-01','2026-03-31');
      insert into public."FIN_IndirectTaxCashEventProjections" values ('${projection}');
      insert into public."FIN_CashTransactions" values
        ('${cash}','${entity}'),('${secondCash}','${entity}');
      insert into public."FIN_CashAllocations" values ('${allocation}'),('${secondAllocation}');
      insert into public."FIN_Documents" values ('${invoice}',120);
      insert into public."FIN_DocumentLines" values ('${line}','${invoice}');
      insert into public."FIN_IndirectTaxEvidence" values ('${evidence}','${invoice}',null);
      insert into public."FIN_IndirectTaxCashEventLines" values
        ('${event}','${projection}','${entity}','${cash}','${allocation}',
          '${invoice}','${line}','${evidence}','2026-02-01'),
        ('${secondEvent}','${projection}','${entity}','${secondCash}','${secondAllocation}',
          '${invoice}','${line}','${evidence}','2026-03-01');
      insert into public."FIN_IndirectTaxCalculations" values
        ('${original}','${period}',1,'uk-cash-v1',repeat('a',64),'[]'::jsonb,
          jsonb_build_object('cashProjectionId','${projection}'));
      insert into public."FIN_IndirectTaxCashCalculationEventLines" values
        ('${original}','${period}','${event}'),
        ('${original}','${period}','${secondEvent}');
      insert into public.test_current_source values(repeat('a',64));
    `)
    sql(sourceLockMigration)
    sql(migration)
    sql(`create trigger test_decision_guard before insert on public."FIN_IndirectTaxDecisions"
      for each row execute function public._multideck_indirect_tax_decision_period_guard();`)
    const sign = (calculation, eventIds, signer = actor) => JSON.parse(sql(`
      select public.multideck_uk_vat_reconcile_cash_events(
        '${signer}','${entity}','${calculation}',repeat('a',64),
        array[${eventIds.map(value => `'${value}'`).join(",")}]::uuid[],
        'Reviewed posted Cash VAT payment event');`))
    const first = sign(original, [event])
    assert.equal(first.inserted, 1)
    assert.equal(first.events[0].eventId, event)
    assert.ok(first.events[0].vatReconciledAt)
    assert.equal(sql(`select public._multideck_vat_signed_document('${invoice}')`), "t")
    denied(`update public."FIN_Documents" set amount=121 where "FINDoc_ID"='${invoice}'`)
    denied(`update public."FIN_DocumentLines" set "FINDocLine_DocumentID"=null
      where "FINDocLine_ID"='${line}'`)
    assert.equal(sql(`select count(*) from public."Audit_Events"
      where "AuditEvent_Action"='reconcile_uk_vat_cash_events'`), "1")
    const repeated = sign(first.calculationId, [event])
    assert.equal(repeated.inserted, 0)
    assert.equal(repeated.events[0].vatReconciledAt, first.events[0].vatReconciledAt)
    const second = sign(repeated.calculationId, [secondEvent])
    assert.equal(second.inserted, 1, "A second part payment may be signed separately")
    assert.equal(sql(`select count(*) from public."FIN_IndirectTaxCashEventReconciliations"`), "2")
    const history = JSON.parse(sql(`select public.multideck_uk_vat_cash_event_reconciliations(
      '${actor}','${entity}','${period}',0,1)`))
    assert.equal(history.total, 2)
    assert.equal(history.items.length, 1)
    assert.equal(history.items[0].eventId, event)
    assert.equal(history.items[0].vatReconciledAt, first.events[0].vatReconciledAt)
    assert.equal(JSON.parse(sql(`select public.multideck_uk_vat_cash_event_reconciliations(
      '${other}','${entity}','${period}',0,100)`)).total, 2,
      "A permitted read-only colleague sees another operator's sign-off")
    denied(`select public.multideck_uk_vat_cash_event_reconciliations(
      '${actor}','${foreign}','${period}',0,100)`)
    denied(`select public.multideck_uk_vat_cash_event_reconciliations(
      '${outsider}','${entity}','${period}',0,100)`)
    denied(`insert into public."FIN_IndirectTaxCashPaymentDateReviews" values('${cash}')`)
    denied(`insert into public."FIN_IndirectTaxDecisions" values('${evidence}')`)
    denied(`update public."FIN_IndirectTaxCashEventReconciliations" set reason='changed'`)
    denied(`set role service_role;
      insert into public."FIN_IndirectTaxCashEventReconciliations"(id)
      values(gen_random_uuid())`)
    denied(`select public.multideck_uk_vat_reconcile_cash_events(
      '${other}','${entity}','${second.calculationId}',repeat('a',64),
      array['${event}']::uuid[],'Foreign operator should be denied')`)
    denied(`select public.multideck_uk_vat_reconcile_cash_events(
      '${actor}','${foreign}','${second.calculationId}',repeat('a',64),
      array['${event}']::uuid[],'Foreign entity should be denied')`)
    sql(`update public.test_current_source set digest=repeat('b',64)`)
    denied(`select public.multideck_uk_vat_reconcile_cash_events(
      '${actor}','${entity}','${second.calculationId}',repeat('a',64),
      array['${event}']::uuid[],'Changed source must be denied')`)
    assert.equal(sql(`select count(*) from public."FIN_IndirectTaxCashEventReconciliations"`), "2")
    sql(`update public.test_current_source set digest=repeat('a',64)`)
    sql(bridgeGateMigration)
    sql(`do $$begin
      begin
        perform public.multideck_uk_vat_reconcile_cash_events(
          '${actor}','${entity}','${second.calculationId}',repeat('a',64),
          array['${event}']::uuid[],'Bridge gate must block sign-off');
        raise exception 'Unreviewed Cash sign-off was allowed';
      exception when sqlstate '22023' then
        if sqlerrm not like 'Cash VAT event reconciliation requires the complete control bridge%' then
          raise;
        end if;
      end;
    end$$;`)
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
