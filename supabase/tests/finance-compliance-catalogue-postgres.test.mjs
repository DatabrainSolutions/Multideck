import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const source = readFileSync(new URL("../baseline/system-reference-data.sql", import.meta.url), "utf8")
const marker = "-- Finance jurisdiction catalogues are product reference data"
const catalogue = source.slice(source.indexOf(marker))
const vatReferenceCorrection = readFileSync(new URL("../migrations/20260924140115_correct_uk_vat_api_reference.sql", import.meta.url), "utf8")
const currentVatApi = "https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0"

test("fresh-tenant finance jurisdiction catalogue installs once and stays foundation-only", () => {
  assert.ok(source.includes(marker), "Missing finance reference catalogue")
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const directory = mkdtempSync(join(tmpdir(), "finance-compliance-catalogue-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create table "FIN_LocalisationPacks" (
        "FINLocPack_ID" uuid primary key default gen_random_uuid(),
        "FINLocPack_Code" text unique not null,
        "FINLocPack_Name" text not null,
        "FINLocPack_CountryCode" text not null,
        "FINLocPack_AccountingStandardCode" text not null,
        "FINLocPack_Version" integer not null,
        "FINLocPack_AuthorityName" text not null,
        "FINLocPack_ReportingCurrencyCode" text not null,
        "FINLocPack_ComplianceStatusCode" text not null,
        "FINLocPack_SourceURL" text not null,
        "FINLocPack_ReviewedAt" timestamptz,
        "FINLocPack_IsActive" boolean not null
      );
      create table "FIN_ComplianceObligations" (
        "FINCompliance_PackID" uuid not null references "FIN_LocalisationPacks"("FINLocPack_ID"),
        "FINCompliance_Code" text not null,
        "FINCompliance_Name" text not null,
        "FINCompliance_ObligationTypeCode" text not null,
        "FINCompliance_AuthorityName" text not null,
        "FINCompliance_FilingChannelCode" text not null,
        "FINCompliance_FrequencyCode" text not null,
        "FINCompliance_ReadinessStatusCode" text not null,
        "FINCompliance_SourceURL" text not null,
        "FINCompliance_EffectiveFrom" date not null,
        "FINCompliance_RequirementsJSON" jsonb not null,
        "FINCompliance_ReviewedAt" timestamptz,
        unique ("FINCompliance_PackID", "FINCompliance_Code")
      );
    `)
    sql(catalogue)
    sql(catalogue)
    assert.equal(sql(`select count(*) || ':' || count(distinct "FINLocPack_Code") from "FIN_LocalisationPacks"`), "4:4")
    assert.equal(sql(`select count(*) || ':' || count(distinct "FINCompliance_Code") from "FIN_ComplianceObligations"`), "12:12")
    assert.equal(sql(`select "FINCompliance_ReadinessStatusCode" || ':' || "FINCompliance_FilingChannelCode" || ':' || ("FINCompliance_RequirementsJSON"->>'payrollExcluded') from "FIN_ComplianceObligations" where "FINCompliance_Code"='gb-vat-mtd'`), "foundation:direct_api:true")
    assert.equal(sql(`select count(*) from "FIN_ComplianceObligations" where "FINCompliance_ReadinessStatusCode" <> 'foundation'`), "0")
    assert.equal(sql(`select "FINLocPack_SourceURL" from "FIN_LocalisationPacks" where "FINLocPack_Code"='gb-v1'`), currentVatApi)
    assert.equal(sql(`select "FINCompliance_SourceURL" from "FIN_ComplianceObligations" where "FINCompliance_Code"='gb-vat-mtd'`), currentVatApi)
    sql(`update "FIN_LocalisationPacks" set "FINLocPack_SourceURL"='https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0' where "FINLocPack_Code"='gb-v1';
      update "FIN_ComplianceObligations" set "FINCompliance_SourceURL"='https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0' where "FINCompliance_Code"='gb-vat-mtd';`)
    sql(vatReferenceCorrection)
    assert.equal(sql(`select "FINLocPack_SourceURL" from "FIN_LocalisationPacks" where "FINLocPack_Code"='gb-v1'`), currentVatApi)
    assert.equal(sql(`select "FINCompliance_SourceURL" from "FIN_ComplianceObligations" where "FINCompliance_Code"='gb-vat-mtd'`), currentVatApi)
    sql(`update "FIN_LocalisationPacks" set "FINLocPack_SourceURL"='https://tenant.example/uk-guidance' where "FINLocPack_Code"='gb-v1';
      update "FIN_ComplianceObligations" set "FINCompliance_SourceURL"='https://tenant.example/vat-guidance' where "FINCompliance_Code"='gb-vat-mtd';`)
    sql(vatReferenceCorrection)
    assert.equal(sql(`select "FINLocPack_SourceURL" from "FIN_LocalisationPacks" where "FINLocPack_Code"='gb-v1'`), "https://tenant.example/uk-guidance")
    assert.equal(sql(`select "FINCompliance_SourceURL" from "FIN_ComplianceObligations" where "FINCompliance_Code"='gb-vat-mtd'`), "https://tenant.example/vat-guidance")
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
