import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { reportingDexterFixture } from "./reporting-dexter-fixture.mjs"

const bin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`
test("report queries, snapshots, permissions, version conflicts and schedules", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "reporting-db-"))
  const run = (cmd, args) => execFileSync(path.join(bin, cmd), args, { encoding: "utf8", stdio: "pipe" })
  const sql = input => execFileSync(path.join(bin, "psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", "55493", "-d", "postgres"], { input, encoding: "utf8", stdio: "pipe" })
  const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`
  let started = false
  try {
    run("initdb", ["-D", path.join(dir, "data"), "-A", "trust", "--no-locale"])
    run("pg_ctl", ["-D", path.join(dir, "data"), "-l", path.join(dir, "postgres.log"), "-o", `-k ${dir} -h '' -p 55493`, "-w", "start"])
    started = true
    sql(`create role authenticated; create role anon; create schema auth; create schema booking_api;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table "cmp_Company" ("Company_ID" uuid primary key);
      create table "cmp_Users" ("User_ID" uuid primary key,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table test_permissions(actor uuid, permission text);
      create function booking_api.has_permission(actor uuid,p text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.test_permissions where test_permissions.actor=$1 and permission=$2) $$;
      insert into "cmp_Company" values('${id(100)}'),('${id(200)}');
      insert into "cmp_Users" values('${id(1)}','${id(11)}','${id(100)}','active'),('${id(2)}','${id(12)}','${id(100)}','active'),('${id(3)}','${id(13)}','${id(200)}','active');
      insert into test_permissions select actor,permission from unnest(array['${id(11)}'::uuid,'${id(12)}'::uuid,'${id(13)}'::uuid]) actor cross join unnest(array['Bookings.Read','Finance.Receivables.View']) permission;`)
    sql(readFileSync(new URL("../migrations/20260907220000_reporting_workspace.sql", import.meta.url), "utf8"))
    // Replace only the operational source adapter. The production query, access,
    // save, run and schedule functions below execute unchanged in PostgreSQL.
    sql(`create table test_rows(company_id uuid,source text,row jsonb);
      create or replace function report_api.source_rows(actor uuid,source text) returns setof jsonb language sql stable security definer set search_path='' as $$
        select row from public.test_rows where company_id=(report_api.context(actor))."Company_ID" and test_rows.source=$2
      $$;`)
    sql(reportingDexterFixture())
    sql(readFileSync(new URL("../migrations/20260907225000_reporting_scope_and_preview.sql", import.meta.url), "utf8"))
    sql(readFileSync(new URL("../migrations/20260907231000_reporting_restore_and_links.sql", import.meta.url), "utf8"))
    sql(readFileSync(new URL("../migrations/20260907233000_reporting_action_schema.sql", import.meta.url), "utf8"))
    const rows = [
      { id: "a", reference: "A", customer: "North", created: "2026-07-01", date: "2026-07-01", currency: "GBP", net: 100, status: "open" },
      { id: "b", reference: "B", customer: "North", created: "2026-08-01", date: "2026-08-01", currency: "GBP", net: 150, status: "closed" },
      { id: "c", reference: "C", customer: "South", created: "2026-08-31", date: "2026-08-31", currency: "GBP", net: -20, status: "open" },
      { id: "d", reference: "D", customer: "South", created: "2026-08-31", date: "2026-08-31", currency: "EUR", net: 900, status: "open" },
      { id: "e", reference: "E", customer: "North", created: "2026-06-01", date: "2026-06-01", currency: "GBP", net: 50, status: "open" },
    ]
    for (const row of rows) for (const source of ["jobs", "sales"]) sql(`insert into test_rows values('${id(100)}','${source}',${literal(row)})`)
    sql(`insert into test_rows values('${id(200)}','jobs',${literal({ ...rows[0], reference: "SECRET" })})`)
    const call = (action, payload = {}, actor = id(11)) => JSON.parse(sql(`set role authenticated;set request.jwt.claim.sub='${actor}';select public.reporting_workspace('${action}',${literal(payload)})`).trim())
    const query = { source: "jobs", dateField: "created", period: { preset: "custom", start: "2026-07-01", end: "2026-08-31" }, columns: ["reference", "customer", "created"], mode: "rows", filters: [], filterMatch: "all", groupBy: "month", measure: "count", aggregation: "sum", currency: "", compare: "none", sort: { field: "created", direction: "asc" } }
    const definition = { version: 1, kind: "table", query }
    const preview = call("preview", { definition }).query
    assert.equal(preview.total, 4)
    assert.equal(preview.rows[0].reference, "A")
    assert.ok(!JSON.stringify(preview).includes("SECRET"))
    assert.ok(!("net" in preview.rows[0]))
    const filtered = call("preview", { definition: { ...definition, query: { ...query, filters: [{ field: "customer", op: "eq", value: "North" }, { field: "status", op: "eq", value: "closed" }] } } }).query
    assert.equal(filtered.total, 1)
    const finance = { ...query, source: "sales", dateField: "date", columns: ["reference", "net"], mode: "summary", measure: "net", currency: "GBP", compare: "previous" }
    const sales = call("preview", { definition: { version: 1, kind: "chart", query: finance } }).query
    assert.equal(sales.value, 230)
    assert.deepEqual(sales.rows.map(row => row.value), [100, 130])
    assert.equal(sales.comparison.value, 50)
    assert.equal(sales.comparison.percent, 360)
    assert.throws(() => call("preview", { definition: { ...definition, query: { ...finance, currency: "" } } }), /Choose one currency/)
    assert.throws(() => call("preview", { definition: { ...definition, query: { ...query, columns: ["net; drop table"] } } }), /column is unavailable/)
    assert.throws(() => call("preview", { definition: { ...definition, query: { ...query, filters: [{ field: "customer", op: "sql", value: "1=1" }] } } }), /supported filter/)
    const document = { version: 1, kind: "document", period: query.period, customer: "North", blocks: [{ id: "one", kind: "table", title: "Jobs", query: { ...query, filterMatch: "any", filters: [{ field: "status", op: "eq", value: "open" }, { field: "status", op: "eq", value: "closed" }] } }] }
    assert.equal(call("preview", { definition: document }).blocks[0].result.total, 2)
    const saved = call("save", { name: "Jobs", visibility: "private", definition })
    assert.equal(call("list").reports.length, 1)
    assert.equal(call("list", {}, id(12)).reports.length, 0)
    assert.equal(call("list", {}, id(13)).reports.length, 0)
    assert.throws(() => call("save", { ...saved, name: "Stolen" }, id(12)), /Only the report owner/)
    assert.throws(() => call("save", { ...saved, version: 0 }), /changed since you opened/)
    const shared = call("save", { ...saved, visibility: "workspace" })
    assert.equal(call("list", {}, id(12)).reports.length, 1)
    assert.equal(call("list", {}, id(13)).reports.length, 0)
    const captured = call("run", { id: saved.id, runId: id(80) })
    assert.equal(captured.status, "ready")
    assert.equal(call("run", { id: saved.id, runId: id(80) }).id, captured.id)
    sql(`update test_rows set row=jsonb_set(row,'{reference}','"Changed"') where row->>'id'='a'`)
    assert.equal(call("get_run", { id: captured.id }).snapshot.query.rows[0].reference, "A")
    assert.throws(() => call("get_run", { id: captured.id }, id(12)), /unavailable/)
    assert.throws(() => sql(`set role authenticated;select * from report_api.runs`), /permission denied/)
    assert.throws(() => sql(`set role anon;select public.reporting_workspace('list')`), /permission denied/)
    const schedule = call("schedule", { reportId: saved.id, frequency: "weekly", timezone: "Europe/London", localTime: "09:00", weekday: 1, monthday: 1 })
    assert.equal(schedule.paused, false)
    sql(`update report_api.schedules set next_run_at=now()-interval '1 minute'`)
    assert.equal(sql("select report_api.process_due()").trim(), "1")
    assert.equal(sql("select report_api.process_due()").trim(), "0")
    const currentSchedule = call("list").schedules[0]
    call("schedule", { id: schedule.id, reportId: saved.id, frequency: "weekly", timezone: "Europe/London", localTime: "09:00", weekday: 1, monthday: 1, paused: true, updatedAt: currentSchedule.updated_at })
    sql(`update report_api.schedules set next_run_at=now()-interval '1 minute'`)
    assert.equal(sql("select report_api.process_due()").trim(), "0")
    const dexter = (expression, actor = id(11)) => JSON.parse(sql(`set role authenticated;set request.jwt.claim.sub='${actor}';select ${expression}`).trim() || 'null')
    assert.equal(dexter("public.multideck_dexter_query_domain('reports',null,10)").data.length, 1)
    assert.equal(dexter("public.multideck_dexter_query_domain('report_sources',null,10)").data.length, 2)
    const watch = dexter(`public.multideck_dexter_create_watch('reports','Report changed','Saved definition','Watch report','${saved.id}','Jobs','{"field":"version","operator":"changed"}')`)
    assert.throws(() => dexter(`public.multideck_dexter_create_watch('reports','Foreign','No','No','${saved.id}','Jobs','{"field":"version","operator":"changed"}')`, id(12)), /report you own/)
    assert.throws(() => dexter(`public.multideck_dexter_create_watch('reports','Foreign','No','No','${saved.id}','Jobs','{"field":"version","operator":"changed"}')`, id(13)), /report you own/)
    const eventCount = () => Number(sql(`select count(*) from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_WatchID"='${watch.id}'`).trim())
    const revised = call("save", { ...shared, name: "Revised jobs" })
    assert.equal(eventCount(), 1)
    call("run", { id: saved.id, runId: id(82) })
    assert.equal(eventCount(), 1, "Run signals do not match version watches")
    dexter(`public.multideck_dexter_set_watch_status('${watch.id}','paused')`)
    const paused = call("save", { ...revised, name: "Paused edit" })
    assert.equal(eventCount(), 1)
    dexter(`public.multideck_dexter_set_watch_status('${watch.id}','active')`)
    call("save", { ...paused, name: "Resumed edit" })
    assert.equal(eventCount(), 2)
    assert.equal(dexter("public.multideck_dexter_list_watches()", id(12)).length, 0)
    sql(`insert into public."AI_DexterPreparedActions" values('${id(91)}','save_report','prepared',null)`)
    assert.throws(() => sql(`update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='executing'`), /explicit operator approval/)
    sql(`update public."AI_DexterPreparedActions" set "AIDexterPrepared_ApprovedAt"=now();update public."AI_DexterPreparedActions" set "AIDexterPrepared_Status"='executing'`)
    assert.throws(() => sql(`set role authenticated;select public.multideck_dexter_action_save_report('${id(100)}','${id(1)}','{}')`), /permission denied/)
    const zeroRange = { ...finance, period: { preset: "custom", start: "2025-01-01", end: "2025-12-31" }, groupBy: "day", compare: "none" }
    const dense = call("preview", { definition: { version: 1, kind: "chart", query: zeroRange } }).query
    assert.equal(dense.rows.length, 200)
    assert.equal(dense.total, 365)
    assert.equal(dense.truncated, true)
    call("archive", { id: saved.id })
    assert.equal(call("list").reports.length, 0)
    assert.equal(call("list").archivedReports.length, 1)
    assert.equal(call("list", {}, id(12)).archivedReports.length, 0)
    assert.equal(call("get_run", { id: captured.id }).status, "ready")
    assert.throws(() => call("restore", { id: saved.id }, id(12)), /Only the report owner/)
    call("restore", { id: saved.id })
    assert.equal(call("list").reports.length, 1)
    assert.equal(call("list").schedules[0].paused, true)
    sql(`delete from test_permissions where actor='${id(11)}' and permission='Bookings.Read'`)
    assert.throws(() => call("get_run", { id: captured.id }), /unavailable/)
    assert.throws(() => call("run", { id: shared.id, runId: id(81) }), /unavailable/)
    assert.equal(call("list").reports.length, 0)
    sql(`update "cmp_Users" set "User_AccessStatus"='deactivated' where "User_ID"='${id(2)}'`)
    assert.throws(() => call("list", {}, id(12)), /active Multideck account/)
  } finally {
    if (started) run("pg_ctl", ["-D", path.join(dir, "data"), "-m", "fast", "-w", "stop"])
    rmSync(dir, { recursive: true, force: true })
  }
})
