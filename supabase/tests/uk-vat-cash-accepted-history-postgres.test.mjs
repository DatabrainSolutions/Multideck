import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260925151500_uk_vat_cash_accepted_history_inventory.sql", import.meta.url), "utf8")
const pgBin = process.env.PG_TEST_BIN ?? "/opt/homebrew/opt/postgresql@17/bin"
const id = (last) => `00000000-0000-0000-0000-${String(last).padStart(12, "0")}`

test("Cash prior payment lines require an accepted matching return, receipt and exact event boxes", () => {
  const directory = mkdtempSync(join(tmpdir(), "multideck-cash-history-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(pgBin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  const inventory = () => JSON.parse(sql(`select public.multideck_uk_vat_cash_control_source_inventory('${id(1)}','${id(2)}','${id(3)}','${id(4)}')`))
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table public.test_source(payload jsonb not null);
      create table public."FIN_IndirectTaxPeriods" (id uuid primary key,legal_entity_id uuid,registration_id uuid,jurisdiction_code text,scheme_code text,start_date date,end_date date,status text,active_review_lock_id uuid);
      create table public."FIN_HmrcVatSubmissionAttempts" (id uuid primary key,period_id uuid,approval_id uuid,tenant_project_ref text,environment text,registration_id uuid,vrn text,period_key text,payload_body text,payload_sha256 text,status text,accepted_at timestamptz);
      create table public."FIN_IndirectTaxFilingApprovals" (id uuid primary key,period_id uuid,review_lock_id uuid,tenant_project_ref text,environment text,registration_id uuid,vrn text,period_key text,lock_fingerprint text);
      create table public."FIN_IndirectTaxPeriodReviewLocks" (id uuid primary key,period_id uuid,calculation_id uuid,source_digest text,lock_fingerprint text);
      create table public."FIN_IndirectTaxCalculations" (id uuid primary key,period_id uuid,calculation_version text,source_digest text,control_reconciliation jsonb);
      create table public."FIN_HmrcVatSubmissionReceipts" (id uuid primary key,attempt_id uuid,period_id uuid,tenant_project_ref text,payload_sha256 text);
      create table public."FIN_HmrcVatReturnReadbackChecks" (id uuid primary key,attempt_id uuid,period_id uuid,tenant_project_ref text,payload_sha256 text,result text);
      create table public."FIN_IndirectTaxPeriodReviewUnlocks" (lock_id uuid);
      create table public."FIN_IndirectTaxFilingApprovalRevocations" (approval_id uuid);
      create table public."FIN_IndirectTaxCashEventLines" (id uuid primary key,projection_id uuid,legal_entity_id uuid,allocation_id uuid,cash_id uuid,invoice_id uuid,line_id uuid,evidence_id uuid,treatment_review_id uuid,treatment_code text,payment_date date);
      create table public."FIN_IndirectTaxCashCalculationEventLines" (calculation_id uuid,period_id uuid,event_line_id uuid,box_number smallint);
      create function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
      returns jsonb language sql stable as $$ select payload from public.test_source limit 1 $$;
      insert into public.test_source values (jsonb_build_object(
        'truncated',false,'sourceDigest',repeat('a',64),
        'context',jsonb_build_object('legalEntityId','${id(2)}',
          'registrationId','${id(5)}','schemeEntryDate','2026-01-01',
          'periodStart','2026-04-01','periodEnd','2026-06-30'),
        'invoiceInventory',jsonb_build_object('invoices',jsonb_build_array(jsonb_build_object(
          'invoice_id','${id(20)}','document_type','sl_invoice',
          'lines',jsonb_build_array(jsonb_build_object(
            'lineId','${id(21)}','evidenceId','${id(24)}',
            'decisionId','${id(25)}','treatment','domestic_sale')),
          'allocation_sources',jsonb_build_array(jsonb_build_object(
            'allocationId','${id(22)}','cashId','${id(23)}',
            'paymentDate','2026-02-10','allocatedAt','2026-02-10T12:00:00Z',
            'cashPostedAt','2026-02-10T12:00:00Z')))))));
      insert into public."FIN_IndirectTaxPeriods" values
        ('${id(6)}','${id(2)}','${id(5)}','GB','cash','2026-01-01','2026-03-31','review_locked','${id(7)}'),
        ('${id(3)}','${id(2)}','${id(5)}','GB','cash','2026-04-01','2026-06-30','draft',null);
    `)
    sql(migration)
    let result = inventory()
    assert.equal(result.acceptedHistory.status, "blocked")
    assert.equal(result.acceptedHistory.unacceptedPeriods, 1)
    assert.equal(result.acceptedHistory.uncoveredSourceLines, 1)
    assert.equal(sql(`select has_function_privilege('authenticated','public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)','EXECUTE')`), "f")
    sql(`
      insert into public."FIN_IndirectTaxPeriodReviewLocks" values ('${id(7)}','${id(6)}','${id(8)}',repeat('b',64),repeat('c',64));
      insert into public."FIN_IndirectTaxCalculations" values ('${id(8)}','${id(6)}','uk-cash-v1',repeat('b',64),jsonb_build_object('cashProjectionId','${id(14)}'));
      insert into public."FIN_IndirectTaxFilingApprovals" values ('${id(9)}','${id(6)}','${id(7)}','tenant-ref','production','${id(5)}','123456789','A123',repeat('c',64));
      insert into public."FIN_HmrcVatSubmissionAttempts" values ('${id(10)}','${id(6)}','${id(9)}','tenant-ref','production','${id(5)}','123456789','A123','body',encode(sha256(convert_to('body','UTF8')),'hex'),'reconciliation_required',null);
    `)
    assert.equal(inventory().acceptedHistory.status, "blocked")
    sql(`update public."FIN_HmrcVatSubmissionAttempts" set status='accepted',accepted_at=now() where id='${id(10)}'`)
    assert.equal(inventory().acceptedHistory.status, "blocked")
    sql(`insert into public."FIN_HmrcVatSubmissionReceipts" values ('${id(11)}','${id(10)}','${id(6)}','tenant-ref',encode(sha256(convert_to('body','UTF8')),'hex'))`)
    result = inventory()
    assert.equal(result.acceptedHistory.unacceptedPeriods, 0)
    assert.equal(result.acceptedHistory.uncoveredSourceLines, 1)
    sql(`insert into public."FIN_IndirectTaxCashEventLines" values ('${id(12)}','${id(14)}','${id(2)}','${id(22)}','${id(23)}','${id(20)}','${id(21)}','${id(24)}','${id(25)}','domestic_sale','2026-02-10');
      insert into public."FIN_IndirectTaxCashCalculationEventLines" values
        ('${id(8)}','${id(6)}','${id(12)}',6),('${id(8)}','${id(6)}','${id(12)}',1)`)
    result = inventory()
    assert.equal(result.acceptedHistory.status, "accepted_history_matched")
    assert.equal(result.acceptedHistory.sourceLineCount, 1)
    assert.equal(result.acceptedHistory.periods[0].acceptanceKind, "receipt")
    assert.match(result.sourceDigest, /^[a-f0-9]{64}$/)
    assert.equal(result.returnReady, false)
    sql(`delete from public."FIN_HmrcVatSubmissionReceipts" where id='${id(11)}';
      update public."FIN_HmrcVatSubmissionAttempts" set status='accepted_readback' where id='${id(10)}';
      insert into public."FIN_HmrcVatReturnReadbackChecks" values
        ('${id(15)}','${id(10)}','${id(6)}','tenant-ref',
          encode(sha256(convert_to('body','UTF8')),'hex'),'matched')`)
    result = inventory()
    assert.equal(result.acceptedHistory.status, "accepted_history_matched")
    assert.equal(result.acceptedHistory.periods[0].acceptanceKind, "matched_readback")
    sql(`insert into public."FIN_IndirectTaxFilingApprovalRevocations" values ('${id(9)}')`)
    assert.equal(inventory().acceptedHistory.status, "blocked")
    sql(`delete from public."FIN_IndirectTaxFilingApprovalRevocations" where approval_id='${id(9)}'`)
    sql(`delete from public."FIN_IndirectTaxCashCalculationEventLines" where box_number=1`)
    assert.equal(inventory().acceptedHistory.status, "blocked")
    sql(`insert into public."FIN_IndirectTaxCashCalculationEventLines" values ('${id(8)}','${id(6)}','${id(12)}',1)`)
    sql(`update public."FIN_IndirectTaxPeriods" set legal_entity_id='${id(99)}' where id='${id(6)}'`)
    result = inventory()
    assert.equal(result.acceptedHistory.uncoveredDays, 90)
    assert.equal(result.acceptedHistory.status, "blocked")
    sql(`update public."FIN_IndirectTaxPeriods" set legal_entity_id='${id(2)}' where id='${id(6)}'`)
    sql(`update public.test_source set payload=jsonb_set(payload,'{context,periodStart}','"2026-01-01"'::jsonb)`)
    result = inventory()
    assert.equal(result.acceptedHistory.status, "accepted_history_matched")
    assert.equal(result.acceptedHistory.periodCount, 0)
    assert.equal(result.acceptedHistory.sourceLineCount, 0)
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
