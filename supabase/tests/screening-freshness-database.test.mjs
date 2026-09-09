import assert from "node:assert/strict"
import { execFile, execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import test from "node:test"

const read = name => readFileSync(new URL(name, import.meta.url), "utf8")
const old = read("../migrations/20260819100000_party_screening_ofsi.sql")
const controls = read("../migrations/20260820082034_platform_screening_controls.sql")
let bin
try { bin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim() } catch { /* explicitly skipped below */ }

for (const mode of ['legacy', 'active-legacy', 'active-uksl']) {
test(`automatic screening migration and lifecycle (${mode}) in a disposable PostgreSQL cluster`, { skip: !bin || !existsSync(join(bin, "initdb")), timeout: 60_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "screening-db-test-"))
  const data = join(directory, "data")
  const psqlArgs = ["-h", directory, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"]
  const sql = input => execFileSync(join(bin, "psql"), psqlArgs, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
  let started = false
  try {
    execFileSync(join(bin, "initdb"), ["-D", data, "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "pipe" })
    // Unix socket only, confined to this fresh directory; no existing database or TCP listener.
    execFileSync(join(bin, "pg_ctl"), ["-D", data, "-l", join(directory, "server.log"), "-o", `-h '' -k ${directory}`, "start"], { stdio: "pipe" })
    started = true
    let schema = `create role anon; create role authenticated; create role service_role;
      create schema extensions; create extension pg_trgm with schema extensions;
      create table "cmp_Company"("Company_ID" uuid primary key);
      create table "cmp_Users"("User_ID" uuid primary key);
      create table "Org_Master"("Org_id" uuid primary key);
      create table "sys_AIDexterDataDomains"("AIDexterDomain_Code" text, "AIDexterDomain_Description" text);
      create table "sys_AIDexterActions"("AIDexterAction_Code" text, "AIDexterAction_Description" text);
      create table "sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text, "AIDexterWatchCapability_Description" text);
      create table "AI_DexterWatches"("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
      create table "AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,"AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
    `
    schema += old.slice(old.indexOf('create table if not exists public."sys_ScreeningListSources"'), old.indexOf('alter table public."sys_ScreeningListSources" enable'))
    schema += old.slice(old.indexOf("create or replace function public.cmp_normalize_screening_name"), old.indexOf("create or replace function public.cmp_screening_list_status"))
    schema += controls.slice(controls.indexOf('alter table public."CMP_ScreeningChecks"'), controls.indexOf('update public."CMP_ScreeningChecks"'))
    schema += 'alter table "CMP_ScreeningMatches" add column "ScreeningMatch_ListingNotes" text;'
    const signalStart = controls.indexOf("create or replace function public._multideck_dexter_screening_signal()")
    schema += controls.slice(signalStart, controls.indexOf("$$;", signalStart) + 3)
    schema += `create trigger screening_snapshot_test after insert or update of "ScreeningListSnapshot_StatusCode" on "sys_ScreeningListSnapshots" for each row execute function public._multideck_dexter_screening_signal();
      create trigger screening_result_test after insert on "CMP_ScreeningChecks" for each row execute function public._multideck_dexter_screening_signal();
      insert into "sys_ScreeningListSources" ("ScreeningListSource_Code","ScreeningListSource_Name","ScreeningListSource_Publisher","ScreeningListSource_DownloadUrl") values ('uk_ofsi_consolidated','OFSI','OFSI','https://old.invalid');`
    if (mode !== 'legacy') schema = schema.replace('https://old.invalid', 'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv')
    if (mode === 'active-uksl') schema = schema.replaceAll('uk_ofsi_consolidated', 'uk_sanctions_list')
    sql(schema)
    sql(read(mode === 'legacy' ? "../migrations/20260903120000_screening_automatic_freshness.sql" : "../migrations/20260906082224_screening_active_source_freshness.sql"))
    const run = promisify(execFile)
    const claims = await Promise.all([1,2].map(() => run(join(bin, "psql"), [...psqlArgs, "-c", "select public.cmp_claim_screening_refresh(gen_random_uuid());"], { encoding: "utf8" })))
    assert.deepEqual(claims.map(result => result.stdout.trim()).sort(), ["acquired", "busy"])
    sql('update "sys_ScreeningListSources" set "ScreeningListSource_RefreshToken"=null,"ScreeningListSource_RefreshExpiresAt"=null,"ScreeningListSource_LastAttemptAt"=null;')
    const lifecycle = read("./screening-freshness-database.sql")
    sql(mode === 'active-uksl' ? lifecycle.replaceAll('uk_ofsi_consolidated', 'uk_sanctions_list') : lifecycle)
  } finally {
    if (started) execFileSync(join(bin, "pg_ctl"), ["-D", data, "stop", "-m", "immediate"], { stdio: "pipe" })
    rmSync(directory, { recursive: true, force: true })
  }
})
}
