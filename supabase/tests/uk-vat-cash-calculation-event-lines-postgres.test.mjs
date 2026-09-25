import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260925134500_uk_vat_cash_calculation_event_lines.sql", import.meta.url), "utf8")
const pgBin = process.env.PG_BIN_PATH ?? "/opt/homebrew/opt/postgresql@17/bin"

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
        id uuid primary key,legal_entity_id uuid,jurisdiction_code text,scheme_code text,
        reporting_currency text,status text,start_date date,end_date date);
      create table public."FIN_IndirectTaxCalculations" (
        id uuid primary key,period_id uuid,unique(id,period_id));
      create table public."FIN_IndirectTaxCashEventProjections" (
        id uuid primary key,legal_entity_id uuid,start_date date,end_date date);
      create table public."FIN_IndirectTaxCashEventLines" (
        id uuid primary key,projection_id uuid,legal_entity_id uuid,cash_id uuid,
        payment_date date,treatment_code text,net_gbp numeric(18,4),vat_gbp numeric(18,4));
      create table public."FIN_CashTransactions" (
        "FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid,
        "FINCash_TypeCode" text,"FINCash_NativePostingStatusCode" text);
      create function public._multideck_indirect_tax_immutable()
      returns trigger language plpgsql as $$ begin
        raise exception 'Immutable';
      end; $$;
    `)
    sql(migration)
    const entity = "00000000-0000-0000-0000-000000000001"
    const period = "00000000-0000-0000-0000-000000000002"
    const calculation = "00000000-0000-0000-0000-000000000003"
    const projection = "00000000-0000-0000-0000-000000000004"
    const cash = "00000000-0000-0000-0000-000000000005"
    const event = "00000000-0000-0000-0000-000000000006"
    const secondEvent = "00000000-0000-0000-0000-000000000007"
    sql(`
      insert into public."FIN_IndirectTaxPeriods" values
        ('${period}','${entity}','GB','cash','GBP','draft','2026-01-01','2026-03-31');
      insert into public."FIN_IndirectTaxCalculations" values ('${calculation}','${period}');
      insert into public."FIN_IndirectTaxCashEventProjections" values
        ('${projection}','${entity}','2026-01-01','2026-03-31');
      insert into public."FIN_CashTransactions" values
        ('${cash}','${entity}','customer_receipt','posted');
      insert into public."FIN_IndirectTaxCashEventLines" values
        ('${event}','${projection}','${entity}','${cash}','2026-02-10','domestic_sale',100,20),
        ('${secondEvent}','${projection}','${entity}','${cash}','2026-02-11','domestic_sale',50,10);
      insert into public."FIN_IndirectTaxCashCalculationEventLines" values
        ('${calculation}','${period}','${event}',6,100),
        ('${calculation}','${period}','${event}',1,20);
    `)
    assert.equal(sql(`select count(*) from public."FIN_IndirectTaxCashCalculationEventLines"`), "2")
    assert.equal(sql(`select relrowsecurity from pg_class where oid='public."FIN_IndirectTaxCashCalculationEventLines"'::regclass`), "t")
    assert.equal(sql(`select has_table_privilege('service_role','public."FIN_IndirectTaxCashCalculationEventLines"','INSERT')`), "f")
    assert.equal(sql(`
      do $$ begin
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${secondEvent}',7,50);
          raise exception 'unsupported box was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${secondEvent}',4,10);
          raise exception 'unsupported input tax was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into public."FIN_IndirectTaxCashCalculationEventLines" values
            ('${calculation}','${period}','${secondEvent}',1,9);
          raise exception 'incorrect VAT amount was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          update public."FIN_IndirectTaxCashCalculationEventLines" set signed_amount=99
            where calculation_id='${calculation}' and box_number=6;
          raise exception 'immutable line changed';
        exception when raise_exception then null; end;
      end $$;
      select count(*)::text||':'||sum(signed_amount)::text
        from public."FIN_IndirectTaxCashCalculationEventLines";
    `), "2:120.0000")
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
