import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260925134500_uk_vat_cash_calculation_event_lines.sql", import.meta.url), "utf8")
const cashDraftMigration = readFileSync(new URL("../migrations/20260925140000_uk_vat_cash_draft_calculation.sql", import.meta.url), "utf8")
const cashControlSourceMigration = readFileSync(new URL("../migrations/20260925141500_uk_vat_cash_control_source_inventory.sql", import.meta.url), "utf8")
const pgBin = process.env.PG_TEST_BIN ?? "/opt/homebrew/opt/postgresql@17/bin"

test("Cash calculation lines bind exact payment events and box amounts to one draft Cash period", () => {
  const directory = mkdtempSync(join(tmpdir(), "multideck-cash-calc-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(pgBin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table public."FIN_IndirectTaxPeriods" (
        id uuid primary key,legal_entity_id uuid,registration_id uuid,obligation_id uuid,
        jurisdiction_code text,scheme_code text,
        reporting_currency text,status text,start_date date,end_date date);
      create table public."FIN_IndirectTaxCalculations" (
        id uuid primary key default gen_random_uuid(),period_id uuid,revision integer,
        calculation_version text,source_digest text,registration_snapshot jsonb,
        box_totals jsonb,exceptions jsonb,control_reconciliation jsonb,calculated_by uuid,
        unique(id,period_id),unique(period_id,revision));
      create table public."FIN_IndirectTaxCashEventProjections" (
        id uuid primary key,legal_entity_id uuid,start_date date,end_date date,
        source_digest text);
      create table public."FIN_IndirectTaxCashEventLines" (
        id uuid primary key,projection_id uuid,legal_entity_id uuid,cash_id uuid,
        payment_date date,treatment_code text,net_gbp numeric(18,4),vat_gbp numeric(18,4));
      create table public."FIN_CashTransactions" (
        "FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid,
        "FINCash_TypeCode" text,"FINCash_NativePostingStatusCode" text);
      create table public."cmp_LegalEntities" (
        "LegalEntity_ID" uuid primary key,"LegalEntity_BaseCurrencyCodeSnapshot" text,
        "LegalEntity_CountryCode" text,"LegalEntity_IsActive" boolean);
      create table public."FIN_LegalEntityComplianceRegistrations" (
        "FINComplianceReg_ID" uuid primary key,
        "FINComplianceReg_LegalEntityID" uuid,"FINComplianceReg_ObligationID" uuid,
        "FINComplianceReg_StatusCode" text,"FINComplianceReg_SettingsJSON" jsonb,
        "FINComplianceReg_FilingMethodCode" text,
        "FINComplianceReg_RegistrationReference" text,
        "FINComplianceReg_EffectiveFrom" date,"FINComplianceReg_EffectiveTo" date,
        "FINComplianceReg_UpdatedAt" timestamptz);
      create function public._multideck_uk_vat_access(uuid,uuid)
      returns void language plpgsql as $$ begin return; end; $$;
      create function public._multideck_uk_vat_read_access(uuid,uuid)
      returns void language plpgsql as $$ begin return; end; $$;
      create table public."FIN_Documents" (
        "FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid,
        "FINDoc_TypeCode" text,"FINDoc_NativePostingStatusCode" text,
        "FINDoc_NativePostedAt" timestamptz,"FINDoc_DocumentDate" date,
        "FINDoc_NativePostingBatchID" uuid);
      create function public._multideck_indirect_tax_immutable()
      returns trigger language plpgsql as $$ begin
        raise exception 'Immutable';
      end; $$;
    `)
    sql(migration)
    sql(cashDraftMigration)
    const entity = "00000000-0000-0000-0000-000000000001"
    const period = "00000000-0000-0000-0000-000000000002"
    const actor = "00000000-0000-0000-0000-000000000003"
    const projection = "00000000-0000-0000-0000-000000000004"
    const cash = "00000000-0000-0000-0000-000000000005"
    const event = "00000000-0000-0000-0000-000000000006"
    const secondEvent = "00000000-0000-0000-0000-000000000007"
    const unprojectedEvent = "00000000-0000-0000-0000-000000000010"
    const foreignEvent = "00000000-0000-0000-0000-000000000011"
    const foreignEntity = "00000000-0000-0000-0000-000000000012"
    const registration = "00000000-0000-0000-0000-000000000008"
    const obligation = "00000000-0000-0000-0000-000000000009"
    sql(`
      insert into public."cmp_LegalEntities" values ('${entity}','GBP','GB',true);
      insert into public."FIN_LegalEntityComplianceRegistrations" values
        ('${registration}','${entity}','${obligation}','configured',
          '{"schemeCode":"cash"}'::jsonb,'mtd_api','123456789','2026-01-01',null,now());
      insert into public."FIN_IndirectTaxPeriods" values
        ('${period}','${entity}','${registration}','${obligation}',
          'GB','cash','GBP','draft','2026-01-01','2026-03-31');
      insert into public."FIN_IndirectTaxCashEventProjections" values
        ('${projection}','${entity}','2026-01-01','2026-03-31',repeat('b',64));
      insert into public."FIN_CashTransactions" values
        ('${cash}','${entity}','customer_receipt','posted');
      insert into public."FIN_IndirectTaxCashEventLines" values
        ('${event}','${projection}','${entity}','${cash}','2026-02-10','domestic_sale',100,20),
        ('${secondEvent}','${projection}','${entity}','${cash}','2026-02-11','domestic_sale',50,10);
    `)
    sql(`
      create function public.multideck_uk_vat_cash_nine_box_preview(uuid,uuid,uuid)
      returns jsonb language sql as $$ select jsonb_build_object(
        'status','preview_only_no_cash_return_effect',
        'projectionId','${projection}','legalEntityId','${entity}',
        'startDate','2026-01-01','endDate','2026-03-31',
        'sourceDigest',repeat('b',64),'sourceFingerprint',repeat('a',64),
        'eventLineCount',2,'excludedAllocationCount',0,
        'sourceBoxesGbp',jsonb_build_object('1',30,'4',0,'6',150,'7',0),
        'boxLines',jsonb_build_object(
          '1',jsonb_build_array(
            jsonb_build_object('eventId','${event}','box',1,'amountGbp',20),
            jsonb_build_object('eventId','${secondEvent}','box',1,'amountGbp',10)),
          '4','[]'::jsonb,
          '6',jsonb_build_array(
            jsonb_build_object('eventId','${event}','box',6,'amountGbp',100),
            jsonb_build_object('eventId','${secondEvent}','box',6,'amountGbp',50)),
          '7','[]'::jsonb)) $$;
      create function public.multideck_uk_vat_cash_projection_integrity(uuid,uuid,uuid)
      returns jsonb language sql as $$ select jsonb_build_object(
        'status','current_verified_source_only','startDate','2026-01-01',
        'endDate','2026-03-31','fingerprint',repeat('a',64)) $$;
      create function public.multideck_uk_vat_cash_exit_invoice_inventory(uuid,uuid,date,date)
      returns jsonb language sql as $$ select jsonb_build_object(
        'truncated',false,'sourceDigest',repeat('c',64),
        'invoices','[]'::jsonb,'invoiceCount',0) $$;
    `)
    sql(cashControlSourceMigration)
    assert.equal(sql(`select public.multideck_uk_vat_cash_control_source_inventory(
      '${actor}','${entity}','${period}','${projection}')#>>'{dateAnomalies,preEntryDatedPostedInvoices}'`), "0")
    assert.equal(sql(`select jsonb_typeof(public.multideck_uk_vat_cash_control_source_inventory(
      '${actor}','${entity}','${period}','${projection}')#>'{paymentPreview,sourceBoxesGbp,1}')`), "string")
    sql(`do $$ begin
      begin
        perform public.multideck_uk_vat_cash_control_source_inventory(
          '${actor}','${entity}','${period}',
          '00000000-0000-0000-0000-000000000099');
        raise exception 'unbound projection was accepted';
      exception when sqlstate '22023' then null; end;
    end $$;`)
    sql(`insert into public."FIN_Documents" values
      ('00000000-0000-0000-0000-000000000013','${entity}',
        'sl_invoice','posted','2026-02-01 12:00:00+00','2025-12-31',
        '00000000-0000-0000-0000-000000000014')`)
    assert.equal(sql(`select public.multideck_uk_vat_cash_control_source_inventory(
      '${actor}','${entity}','${period}','${projection}')#>>'{dateAnomalies,preEntryDatedPostedInvoices}'`), "1")
    const calculation = sql(`select public.multideck_uk_vat_calculate_cash_draft(
      '${actor}','${period}','${projection}')->>'calculationId'`)
    assert.equal(sql(`select count(*) from public."FIN_IndirectTaxCashCalculationEventLines"`), "4")
    assert.equal(sql(`select (box_totals->>'1')||':'||(box_totals->>'6')
      from public."FIN_IndirectTaxCalculations" where id='${calculation}'`), "30.00:150.00")
    sql(`insert into public."FIN_IndirectTaxCashEventLines" values
      ('${unprojectedEvent}','${projection}','${entity}','${cash}',
        '2026-02-12','domestic_sale',25,5),
      ('${foreignEvent}','${projection}','${foreignEntity}','${cash}',
        '2026-02-12','domestic_sale',25,5)`)
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public."FIN_IndirectTaxCashCalculationEventLines"'::regclass`), "t")
    assert.equal(sql(`select has_table_privilege('service_role','public."FIN_IndirectTaxCashCalculationEventLines"','INSERT')`), "f")
    sql(`
      do $$ begin
        begin
          update public."FIN_IndirectTaxPeriods" set scheme_code='standard'
            where id='${period}';
          perform public.multideck_uk_vat_calculate_cash_draft(
            '${actor}','${period}','${projection}');
          raise exception 'Standard period accepted Cash draft calculation';
        exception when sqlstate '22023' then null; end;
      end $$;
    `)
    assert.equal(sql(`
      do $$ begin
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${unprojectedEvent}',7,25);
          raise exception 'unsupported box was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${unprojectedEvent}',4,5);
          raise exception 'unsupported input tax was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${unprojectedEvent}',1,4);
          raise exception 'incorrect VAT amount was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${foreignEvent}',6,25);
          raise exception 'foreign payment event was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          update public."FIN_IndirectTaxCashCalculationEventLines" set signed_amount=99
            where calculation_id='${calculation}' and box_number=6;
          raise exception 'immutable line changed';
        exception when raise_exception then null; end;
      end $$;
      select count(*)::text||':'||sum(signed_amount)::text
        from public."FIN_IndirectTaxCashCalculationEventLines";
    `), "4:180.0000")
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
