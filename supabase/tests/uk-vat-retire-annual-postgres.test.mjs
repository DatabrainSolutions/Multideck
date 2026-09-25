import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const migration = new URL("../migrations/20260925111000_uk_vat_retire_annual_new_setup.sql", import.meta.url).pathname
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

test("new UK Annual registrations and periods stop while historical records remain usable", () => {
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const dir = mkdtempSync(join(tmpdir(), "uk-vat-annual-retire-"))
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
      create table public."FIN_ComplianceObligations"("FINCompliance_ID" uuid primary key,"FINCompliance_Code" text not null);
      create table public."FIN_LegalEntityComplianceRegistrations"(
        "FINComplianceReg_ID" uuid primary key,"FINComplianceReg_ObligationID" uuid not null,
        "FINComplianceReg_StatusCode" text not null,"FINComplianceReg_SettingsJSON" jsonb not null);
      create table public."FIN_IndirectTaxPeriods"(
        id uuid primary key,jurisdiction_code text not null,scheme_code text not null,status text not null);
      insert into public."FIN_ComplianceObligations" values
        ('${id(1)}','gb-vat-mtd'),('${id(2)}','other-tax');
      insert into public."FIN_LegalEntityComplianceRegistrations" values
        ('${id(3)}','${id(1)}','configured','{"schemeCode":"annual"}'),
        ('${id(4)}','${id(1)}','not_configured','{"schemeCode":"annual"}');
      insert into public."FIN_IndirectTaxPeriods" values
        ('${id(5)}','GB','annual','draft');`)
    const apply = spawnSync(join(bin, "psql"), [...args, "-f", migration],
      { encoding: "utf8", timeout: 30000 })
    assert.equal(apply.status, 0, apply.stderr)
    reject(`insert into public."FIN_LegalEntityComplianceRegistrations" values
      ('${id(6)}','${id(1)}','configured','{"schemeCode":"annual"}');`, /no longer offered/)
    sql(`insert into public."FIN_LegalEntityComplianceRegistrations" values
      ('${id(7)}','${id(1)}','configured','{"schemeCode":"standard"}');`)
    reject(`update public."FIN_LegalEntityComplianceRegistrations" set
      "FINComplianceReg_SettingsJSON"='{"schemeCode":"annual"}' where "FINComplianceReg_ID"='${id(7)}';`, /no longer offered/)
    reject(`update public."FIN_LegalEntityComplianceRegistrations" set
      "FINComplianceReg_StatusCode"='configured' where "FINComplianceReg_ID"='${id(4)}';`, /no longer offered/)
    sql(`insert into public."FIN_LegalEntityComplianceRegistrations" values
      ('${id(12)}','${id(2)}','configured','{"schemeCode":"annual"}');`)
    reject(`update public."FIN_LegalEntityComplianceRegistrations" set
      "FINComplianceReg_ObligationID"='${id(1)}' where "FINComplianceReg_ID"='${id(12)}';`, /no longer offered/)
    reject(`insert into public."FIN_IndirectTaxPeriods" values
      ('${id(8)}','GB','annual','draft');`, /no longer offered/)
    sql(`update public."FIN_LegalEntityComplianceRegistrations" set
      "FINComplianceReg_StatusCode"='production_verified' where "FINComplianceReg_ID"='${id(3)}';
      update public."FIN_IndirectTaxPeriods" set status='review_locked' where id='${id(5)}';
      insert into public."FIN_LegalEntityComplianceRegistrations" values
        ('${id(9)}','${id(2)}','configured','{"schemeCode":"annual"}');
      insert into public."FIN_IndirectTaxPeriods" values
        ('${id(10)}','US','annual','draft');
      insert into public."FIN_IndirectTaxPeriods" values
        ('${id(11)}','GB','standard','draft');`)
    reject(`update public."FIN_IndirectTaxPeriods" set jurisdiction_code='GB'
      where id='${id(10)}';`, /no longer offered/)
    assert.equal(sql(`select "FINComplianceReg_StatusCode" from public."FIN_LegalEntityComplianceRegistrations"
      where "FINComplianceReg_ID"='${id(3)}';`), "production_verified")
    assert.equal(sql(`select status from public."FIN_IndirectTaxPeriods" where id='${id(5)}';`), "review_locked")
  } finally {
    if (started) spawnSync(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "-w", "stop"],
      { encoding: "utf8", timeout: 30000 })
    rmSync(dir, { recursive: true, force: true })
  }
})
