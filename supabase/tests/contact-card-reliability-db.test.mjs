import assert from "node:assert/strict"
import { execFile, execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { randomUUID } from "node:crypto"
import test from "node:test"

const exec = promisify(execFile)
const pgBin = process.env.PG_BIN || execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim()
const migrationUrl = new URL("../migrations/20260907201057_contact_card_visit_reliability.sql", import.meta.url)
const original = await readFile(new URL("../migrations/20260731212420_qr_contact_cards_supabase.sql", import.meta.url), "utf8")
const hardened = await readFile(new URL("../migrations/20260830230000_security_scan_high_risk_hardening.sql", import.meta.url), "utf8")
function table(name) {
  const start = original.indexOf(`create table public."${name}" (`)
  assert.ok(start >= 0, name)
  return original.slice(start, original.indexOf("\n);", start) + 4)
}
function rpc(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, name)
  return source.slice(start, source.indexOf("\n$$;", start) + 4)
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`

test("contact-card migration: real PostgreSQL concurrency, permissions and lifecycle", { timeout: 60_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "multideck-card-db-"))
  const data = join(directory, "data")
  const psqlArgs = ["-h", directory, "-p", "55438", "-d", "postgres", "-XAtq", "-v", "ON_ERROR_STOP=1"]
  let running = false
  const sql = async (query) => (await exec(join(pgBin, "psql"), [...psqlArgs, "-c", query])).stdout.trim()
  const anon = (query) => sql(`set role anon; ${query}`)
  try {
    await exec(join(pgBin, "initdb"), ["-D", data, "--auth=trust", "--no-locale", "--encoding=UTF8"])
    // A private Unix socket only: no exposed TCP listener or shared database.
    await exec(join(pgBin, "pg_ctl"), ["-D", data, "-l", join(directory, "server.log"), "-o", `-h '' -k ${directory} -p 55438`, "-w", "start"])
    running = true
    await sql(`
      create role anon; create role authenticated;
      create schema private;
      create table public."cmp_Company" ("Company_ID" uuid primary key);
      create table public."cmp_Users" ("User_ID" uuid primary key, "Company_ID" uuid);
      create table public."CRM_Leads" (
        "CRMLead_ID" uuid primary key default gen_random_uuid(), "CRMLead_SourceCode" text,
        "CRMLead_StatusCode" text, "CRMLead_RatingCode" text, "CRMLead_OwnerUserID" uuid,
        "CRMLead_CompanyName" text, "CRMLead_PersonName" text, "CRMLead_Email" text, "CRMLead_Phone" text,
        "CRMLead_MetadataJSON" jsonb, "CRMLead_CreatedBy" uuid, "CRMLead_UpdatedBy" uuid
      );
      ${["CRM_ContactCards", "CRM_ContactCardAutomations", "CRM_ContactCardScans", "CRM_ContactCardExchanges"].map(table).join("\n")}
      create table public."CRM_ContactCardAutomationRuns" (
        "AutomationRun_ID" uuid primary key default gen_random_uuid(), "ContactCard_ID" uuid,
        "AutomationRun_Status" text, "AutomationRun_IsTest" boolean default false,
        "AutomationRun_StartedAt" timestamptz default now()
      );
      -- Unrelated CRM actions are isolated here. We verify invocation count and
      -- transactionality, not provider delivery or field-mapping implementation.
      create function private.apply_contact_card_crm_field_mappings(uuid,uuid,jsonb) returns void language sql as 'select';
      create function public._multideck_contact_card_execute_automation(uuid,uuid,uuid,jsonb,boolean,boolean,uuid,integer)
      returns uuid language plpgsql as $$ declare run_id uuid; begin
        insert into public."CRM_ContactCardAutomationRuns" ("ContactCard_ID","AutomationRun_Status") values ($1,'skipped') returning "AutomationRun_ID" into run_id;
        return run_id;
      end; $$;
      ${rpc(hardened, "multideck_contact_card_record_scan")}
      ${rpc(original, "multideck_contact_card_mark_started")}
      revoke all on all tables in schema public from public, anon, authenticated;
      revoke all on all functions in schema public from public, anon, authenticated;
      grant execute on function public.multideck_contact_card_record_scan(text,text,text,text,text,text), public.multideck_contact_card_mark_started(uuid) to anon, authenticated;
    `)
    await sql(await readFile(migrationUrl, "utf8"))
    const company = randomUUID(), otherCompany = randomUUID(), owner = randomUUID(), otherOwner = randomUUID()
    const card = randomUUID(), otherCard = randomUUID(), draft = randomUUID()
    await sql(`insert into "cmp_Company" values (${quote(company)}),(${quote(otherCompany)});
      insert into "cmp_Users" values (${quote(owner)},${quote(company)}),(${quote(otherOwner)},${quote(otherCompany)});
      insert into "CRM_ContactCards" ("ContactCard_ID","Company_ID","Owner_User_ID","ContactCard_Slug","ContactCard_Label","ContactCard_Status") values
      (${quote(card)},${quote(company)},${quote(owner)},'test-a','Test A','published'),
      (${quote(otherCard)},${quote(otherCompany)},${quote(otherOwner)},'test-b','Test B','published'),
      (${quote(draft)},${quote(company)},${quote(owner)},'draft','Draft','draft');`)
    const scanQuery = (slug, request = randomUUID(), session = randomUUID()) => `select multideck_contact_card_record_scan_v2(${quote(slug)},'mobile','Safari','direct-scan',${quote(request)},${quote(session)})`
    const count = async (name) => Number(await sql(`select count(*) from "${name}"`))
    const totals = async () => JSON.parse(await sql(`select _multideck_contact_card_analytics(${quote(card)})->'totals'`))
    const input = { firstName: "Ada", lastName: "Lovelace", email: "ADA@example.com", company: "Example", phone: "", marketingConsent: false }
    const submit = (slug, scan, values = input) => anon(`select multideck_contact_card_submit_exchange(${quote(slug)},${scan ? quote(scan) : "null"},${quote(JSON.stringify(values))}::jsonb)`)

    await t.test("duplicate network requests create one visit and preserve separate people", async () => {
      const request = randomUUID(), session = randomUUID()
      const scans = await Promise.all(Array.from({ length: 8 }, () => anon(scanQuery("test-a", request, session))))
      assert.equal(new Set(scans).size, 1)
      assert.equal(await count("CRM_ContactCardScans"), 1)
      await anon(scanQuery("test-a", randomUUID(), session))
      await anon(scanQuery("test-a"))
      assert.equal((await totals()).scans, 3)
      assert.equal((await totals()).uniqueScans, 2)
    })
    await t.test("draft, missing, cross-card, expired and direct-table requests are denied", async () => {
      assert.equal(await anon(scanQuery("draft")), "")
      assert.equal(await anon(scanQuery("missing")), "")
      const otherScan = await anon(scanQuery("test-b"))
      await assert.rejects(submit("test-a", otherScan), /expired/)
      await assert.rejects(submit("test-a", null), /Reload/)
      const expired = await anon(scanQuery("test-a"))
      await sql(`update "CRM_ContactCardScans" set "Scan_At"=now()-interval '25 hours' where "Scan_ID"=${quote(expired)}`)
      await assert.rejects(submit("test-a", expired), /expired/)
      await assert.rejects(anon('select * from "CRM_ContactCardExchanges"'), /permission denied/)
      await assert.rejects(anon(`select _multideck_contact_card_analytics(${quote(card)})`), /permission denied/)
      await assert.rejects(sql(`set role authenticated; select _multideck_contact_card_analytics(${quote(otherCard)})`), /permission denied/)
    })
    await t.test("concurrent submissions and a lost-response retry create one new lead and one automation run", async () => {
      await sql(`insert into "CRM_Leads" ("CRMLead_Email","CRMLead_PersonName") values ('ada@example.com','Existing record')`)
      const scan = await anon(scanQuery("test-a"))
      const results = await Promise.all(Array.from({ length: 6 }, () => submit("test-a", scan)))
      assert.ok(results.every((result) => JSON.parse(result).outcome === "created"))
      await submit("test-a", scan)
      assert.equal(await count("CRM_Leads"), 2)
      assert.equal(await count("CRM_ContactCardExchanges"), 1)
      assert.equal(await count("CRM_ContactCardAutomationRuns"), 1)
      assert.equal(await sql(`select count(*) from "CRM_Leads" where "CRMLead_PersonName"='Existing record'`), "1")
      await assert.rejects(submit("test-a", scan, { ...input, firstName: "Different" }), /already been sent/)
    })
    await t.test("validation rejects malformed input, required phone and oversize values without side effects", async () => {
      const scan = await anon(scanQuery("test-a"))
      for (const invalid of [null, [], { ...input, email: "wrong" }, { ...input, firstName: "" }, { ...input, company: "x".repeat(256) }, { ...input, marketingConsent: "true" }, { ...input, lastName: {} }]) {
        await assert.rejects(submit("test-a", scan, invalid))
      }
      await sql(`update "CRM_ContactCards" set "ContactCard_PhoneField"='required' where "ContactCard_ID"=${quote(card)}`)
      await assert.rejects(submit("test-a", scan), /phone number/)
      assert.equal(await count("CRM_ContactCardExchanges"), 1)
      await sql(`update "CRM_ContactCards" set "ContactCard_PhoneField"='hidden' where "ContactCard_ID"=${quote(card)}`)
      await submit("test-a", scan, { ...input, phone: "discard-me", marketingConsent: true })
      assert.equal(await sql(`select "Exchange_Phone" || ':' || "Exchange_MarketingConsent" from "CRM_ContactCardExchanges" where "Scan_ID"=${quote(scan)}`), ":false")
    })
    await t.test("rate limits retain the same retry capability and analytics agree with committed rows", async () => {
      const scan = await anon(scanQuery("test-a"))
      await sql(`insert into "CRM_ContactCardScans" ("ContactCard_ID") select ${quote(card)} from generate_series(1,120)`)
      await assert.rejects(anon(scanQuery("test-a")), /too many requests/)
      // Existing scan capabilities are still usable after the scan limit.
      await submit("test-a", scan)
      const result = await totals()
      assert.equal(result.exchanges, 3)
      assert.equal(result.leadsCreated, 3)
      assert.equal(result.started, 3)
      assert.equal(result.scans, Number(await sql(`select count(*) from "CRM_ContactCardScans" where "ContactCard_ID"=${quote(card)}`)))
    })
    await t.test("a session converting twice is counted once in conversion, never above 100%", async () => {
      const session = randomUUID()
      // Use the other published card, whose scan limit has not been reached.
      for (let index = 0; index < 2; index++) await submit("test-b", await anon(scanQuery("test-b", randomUUID(), session)))
      const result = JSON.parse(await sql(`select _multideck_contact_card_analytics(${quote(otherCard)})->'totals'`))
      assert.equal(result.scans, 3)
      assert.equal(result.uniqueScans, 2)
      assert.equal(result.exchanges, 2)
      assert.equal(result.conversion, 0.5)
    })
    await t.test("submission limits reject new transactions, but allow a previous success to be confirmed", async () => {
      const scan = await anon(scanQuery("test-b"))
      const submitted = await anon(scanQuery("test-b"))
      await submit("test-b", submitted)
      await sql(`insert into "CRM_ContactCardExchanges" ("ContactCard_ID","Exchange_FirstName","Exchange_LastName","Exchange_Email","Exchange_Company","Exchange_Outcome")
        select ${quote(otherCard)},'Limit','Fixture','limit@example.com','Fixture','created' from generate_series(1,17)`)
      const before = await count("CRM_Leads")
      await assert.rejects(submit("test-b", scan), /too many submissions/)
      assert.equal(JSON.parse(await submit("test-b", submitted)).outcome, "created")
      assert.equal(await count("CRM_Leads"), before)
      await sql(`update "CRM_ContactCards" set "ContactCard_Status"='paused' where "ContactCard_ID"=${quote(otherCard)}`)
      assert.equal(await anon(scanQuery("test-b")), "")
      await assert.rejects(submit("test-b", scan), /not active/)
    })
  } finally {
    if (running) await exec(join(pgBin, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"])
    await rm(directory, { recursive: true, force: true })
  }
})
