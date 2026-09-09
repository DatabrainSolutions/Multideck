import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const bin = execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim()
test("notification recipients can change receipt state but cannot forge content or access another recipient", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "notification-db-"))
  const data = path.join(dir, "data")
  const run = (cmd, args) => execFileSync(path.join(bin, cmd), args, { encoding: "utf8", stdio: "pipe" })
  const sql = (input) => execFileSync(path.join(bin, "psql"), ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", "55491", "-d", "postgres"], { input, encoding: "utf8", stdio: "pipe" })
  let started = false
  try {
    run("initdb", ["-D", data, "-A", "trust", "--no-locale"])
    run("pg_ctl", ["-D", data, "-l", path.join(dir, "postgres.log"), "-o", `-k ${dir} -h '' -p 55491`, "-w", "start"])
    started = true
    sql(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table "cmp_Users" ("User_ID" uuid primary key, "Auth_User_ID" uuid);
      grant select on "cmp_Users" to authenticated;
      create table "Comm_Notifications" ("CommNotif_ID" uuid primary key, "CommNotif_UserID" uuid, "CommNotif_CreatedAt" timestamptz default now(), "CommNotif_Title" text, "CommNotif_MetadataJSON" jsonb, "CommNotif_StatusCode" text, "CommNotif_ReadAt" timestamptz, "CommNotif_DismissedAt" timestamptz, "CommNotif_ActionedAt" timestamptz);
      alter table "Comm_Notifications" enable row level security;
      grant all on "Comm_Notifications" to authenticated;
      insert into "cmp_Users" values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
      insert into "Comm_Notifications" ("CommNotif_ID","CommNotif_UserID","CommNotif_Title","CommNotif_StatusCode") values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Private update','unread');`)
    const baseline = readFileSync(new URL("../baseline/public-schema.sql", import.meta.url), "utf8")
    for (const name of ["Users can read their notifications", "Users can update their notification state"]) {
      const start = baseline.indexOf(`CREATE POLICY "${name}"`)
      assert.ok(start >= 0)
      sql(baseline.slice(start, baseline.indexOf(";", start) + 1))
    }
    sql(readFileSync(new URL("../migrations/20260907183422_notification_state_permissions.sql", import.meta.url), "utf8"))
    const asUser = (id, query) => sql(`set role authenticated; set request.jwt.claim.sub='${id}'; ${query}`)
    const owner = "10000000-0000-0000-0000-000000000001"
    assert.match(asUser(owner, 'select "CommNotif_Title" from "Comm_Notifications"'), /Private update/)
    assert.match(asUser(owner, `update "Comm_Notifications" set "CommNotif_StatusCode"='read',"CommNotif_ReadAt"=now() returning "CommNotif_StatusCode"`), /read/)
    assert.match(asUser(owner, 'update "Comm_Notifications" set "CommNotif_DismissedAt"=now() returning "CommNotif_ID"'), /20000000/)
    for (const query of [
      `update "Comm_Notifications" set "CommNotif_Title"='forged'`,
      `update "Comm_Notifications" set "CommNotif_MetadataJSON"='{"action_url":"https://evil.example"}'`,
      `update "Comm_Notifications" set "CommNotif_UserID"='00000000-0000-0000-0000-000000000002'`,
      'delete from "Comm_Notifications"', 'truncate "Comm_Notifications"',
      'insert into "Comm_Notifications" ("CommNotif_ID") values (gen_random_uuid())',
    ]) assert.throws(() => asUser(owner, query), /permission denied/)
    for (const other of ["10000000-0000-0000-0000-000000000002", "90000000-0000-0000-0000-000000000009"]) {
      assert.match(asUser(other, 'select count(*) from "Comm_Notifications"'), /\n0\n/)
      assert.match(asUser(other, `update "Comm_Notifications" set "CommNotif_StatusCode"='unread'`), /UPDATE 0/)
    }
    assert.throws(() => sql('set role anon; select * from "Comm_Notifications"'), /permission denied/)
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"])
    rmSync(dir, { recursive: true, force: true })
  }
})
