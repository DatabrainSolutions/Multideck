import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const migrations = [
  new URL("../migrations/20260925130000_uk_vat_cash_exit_verified_context.sql", import.meta.url).pathname,
  new URL("../migrations/20260925131500_uk_vat_cash_exit_due_term_guard.sql", import.meta.url).pathname,
  new URL("../migrations/20260925133000_uk_vat_cash_exit_treatment_guard.sql", import.meta.url).pathname,
]

test("Cash exit inventory derives its dates from a final Cash period and consecutive Standard term", () => {
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const dir = mkdtempSync(join(tmpdir(), "uk-vat-cash-exit-context-"))
  const args = ["-X", "-qAt", "-h", dir, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
  let started = false
  const command = (name, input) => spawnSync(join(bin, name), name === "psql" ? args : input,
    { input: name === "psql" ? input : undefined, encoding: "utf8", timeout: 30000 })
  const sql = (statement) => {
    const result = command("psql", statement)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const reject = (statement, expected) => {
    const result = command("psql", statement)
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr, expected)
  }
  try {
    const init = command("initdb", ["-D", join(dir, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    assert.equal(init.status, 0, init.stderr)
    const start = command("pg_ctl", ["-D", join(dir, "data"), "-l", join(dir, "log"), "-o", `-k ${dir} -c listen_addresses=''`, "-w", "start"])
    assert.equal(start.status, 0, start.stderr)
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create function public._multideck_uk_vat_read_access(actor uuid,entity uuid)
      returns void language plpgsql as $$ begin
        if actor<>'${id(1)}' or entity<>'${id(2)}' then
          raise exception 'VAT access denied';
        end if;
      end $$;
      create table public."FIN_LocalisationPacks"(
        "FINLocPack_ID" uuid primary key,"FINLocPack_Code" text,"FINLocPack_CountryCode" text);
      create table public."FIN_ComplianceObligations"(
        "FINCompliance_ID" uuid primary key,"FINCompliance_PackID" uuid,
        "FINCompliance_Code" text,"FINCompliance_ObligationTypeCode" text);
      create table public."FIN_LegalEntityComplianceRegistrations"(
        "FINComplianceReg_ID" uuid primary key,"FINComplianceReg_LegalEntityID" uuid,
        "FINComplianceReg_ObligationID" uuid,"FINComplianceReg_StatusCode" text,
        "FINComplianceReg_FilingMethodCode" text,"FINComplianceReg_RegistrationReference" text,
        "FINComplianceReg_EffectiveFrom" date,"FINComplianceReg_EffectiveTo" date,
        "FINComplianceReg_SettingsJSON" jsonb,"FINComplianceReg_UpdatedAt" timestamptz);
      create table public."FIN_IndirectTaxPeriods"(
        id uuid primary key,legal_entity_id uuid,obligation_id uuid,registration_id uuid,
        jurisdiction_code text,scheme_code text,reporting_currency text,
        start_date date,end_date date,status text);
      create table public."FIN_Documents"(
        "FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid,
        "FINDoc_DocumentDate" date,"FINDoc_DueDate" date);
      create table public."FIN_IndirectTaxDecisions"(
        id uuid primary key,evidence_id uuid,tax_point date,treatment_code text);
      create function public.multideck_uk_vat_cash_exit_invoice_inventory(
        actor uuid,entity uuid,start_date date,exit_date date)
      returns jsonb language sql stable as $$ select jsonb_build_object(
        'startDate',start_date,'exitDate',exit_date,'truncated',false,
        'amountEncoding','decimal_strings','sourceDigest',repeat('a',64),
        'lineSourceIssueCount',0,
        'invoices',jsonb_build_array(jsonb_build_object(
          'invoice_id','${id(20)}','source_exception',false,
          'lines',jsonb_build_array(),'lineSourceIssueCount',0))) $$;
      insert into public."FIN_LocalisationPacks" values ('${id(10)}','gb-v1','GB');
      insert into public."FIN_ComplianceObligations" values
        ('${id(11)}','${id(10)}','gb-vat-mtd','indirect_tax');
      insert into public."FIN_LegalEntityComplianceRegistrations" values
        ('${id(12)}','${id(2)}','${id(11)}','configured','mtd_api','123456789',
          '2026-01-01','2026-03-31','{"schemeCode":"cash"}','2026-01-01 12:00Z'),
        ('${id(13)}','${id(2)}','${id(11)}','configured','mtd_api','123456789',
          '2026-04-01',null,'{"schemeCode":"standard"}','2026-01-02 12:00Z');
      insert into public."FIN_IndirectTaxPeriods" values
        ('${id(14)}','${id(2)}','${id(11)}','${id(12)}','GB','cash','GBP',
          '2026-01-01','2026-03-31','draft');
      insert into public."FIN_Documents" values
        ('${id(20)}','${id(2)}','2026-01-10','2026-02-10');`)
    for (const migration of migrations) {
      const apply = spawnSync(join(bin, "psql"), [...args, "-f", migration],
        { encoding: "utf8", timeout: 30000 })
      assert.equal(apply.status, 0, apply.stderr)
    }
    const call = `public.multideck_uk_vat_cash_exit_verified_inventory('${id(1)}','${id(2)}','${id(12)}','${id(14)}')`
    const result = JSON.parse(sql(`select ${call};`))
    assert.equal(result.startDate, "2026-01-01")
    assert.equal(result.exitDate, "2026-03-31")
    assert.equal(result.verifiedTransition.finalCashPeriodId, id(14))
    assert.equal(result.verifiedTransition.nextStandardRegistrationId, id(13))
    assert.equal(result.dueTermIssueCount, 0)
    assert.equal(result.lineTreatmentIssueCount, 0)
    assert.equal(result.invoices[0].due_within_six_months, true)
    assert.match(result.sourceDigest, /^[a-f0-9]{64}$/)
    assert.notEqual(result.sourceDigest, "a".repeat(64))
    sql(`update public."FIN_Documents" set "FINDoc_DueDate"='2026-08-11'
      where "FINDoc_ID"='${id(20)}';`)
    const ineligible = JSON.parse(sql(`select ${call};`))
    assert.equal(ineligible.dueTermIssueCount, 1)
    assert.equal(ineligible.invoices[0].source_exception, true)
    assert.notEqual(ineligible.sourceDigest, result.sourceDigest)
    sql(`update public."FIN_Documents" set "FINDoc_DueDate"='2026-02-10'
      where "FINDoc_ID"='${id(20)}';`)
    reject(`select public.multideck_uk_vat_cash_exit_verified_inventory('${id(4)}','${id(2)}','${id(12)}','${id(14)}');`, /VAT access denied/)
    reject(`select public.multideck_uk_vat_cash_exit_verified_inventory('${id(1)}','${id(3)}','${id(12)}','${id(14)}');`, /VAT access denied/)
    reject(`set role authenticated; select ${call};`, /permission denied/)
    sql(`update public."FIN_IndirectTaxPeriods" set end_date='2026-03-30' where id='${id(14)}';`)
    reject(`select ${call};`, /final Cash period must end/)
    sql(`update public."FIN_IndirectTaxPeriods" set end_date='2026-03-31' where id='${id(14)}';
      update public."FIN_LegalEntityComplianceRegistrations"
      set "FINComplianceReg_EffectiveFrom"='2026-04-02' where "FINComplianceReg_ID"='${id(13)}';`)
    reject(`select ${call};`, /consecutive Standard Accounting term/)
    sql(`update public."FIN_LegalEntityComplianceRegistrations"
      set "FINComplianceReg_EffectiveFrom"='2026-04-01',
        "FINComplianceReg_SettingsJSON"='{"schemeCode":"cash"}'
      where "FINComplianceReg_ID"='${id(13)}';`)
    reject(`select ${call};`, /consecutive Standard Accounting term/)
    sql(`update public."FIN_LegalEntityComplianceRegistrations"
      set "FINComplianceReg_SettingsJSON"='{"schemeCode":"standard"}',
        "FINComplianceReg_RegistrationReference"='987654321'
      where "FINComplianceReg_ID"='${id(13)}';`)
    reject(`select ${call};`, /consecutive Standard Accounting term/)
    sql(`update public."FIN_LegalEntityComplianceRegistrations"
      set "FINComplianceReg_RegistrationReference"='123456789'
      where "FINComplianceReg_ID"='${id(13)}';`)
    assert.equal(JSON.parse(sql(`select ${call};`)).sourceDigest, result.sourceDigest)
  } finally {
    if (started) spawnSync(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "-w", "stop"],
      { encoding: "utf8", timeout: 30000 })
    rmSync(dir, { recursive: true, force: true })
  }
})
