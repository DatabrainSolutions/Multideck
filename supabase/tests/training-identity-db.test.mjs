import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

let bin
try { bin = process.env.PG_BIN || execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim() } catch {}

test("training migration: identity, role/office sync, credential guards and service-only grants", { skip: !bin }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "multideck-training-db-"))
  const data = path.join(dir, "data")
  const run = (command, args) => execFileSync(path.join(bin, command), args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
  const sql = text => execFileSync(path.join(bin, "psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", "55489", "-d", "postgres"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
  let started = false
  try {
    run("initdb", ["-D", data, "-A", "trust", "--no-locale"])
    run("pg_ctl", ["-D", data, "-l", path.join(dir, "postgres.log"), "-o", `-k ${dir} -h '' -p 55489`, "-w", "start"])
    started = true
    sql(readFileSync(new URL("fixtures/training-identity.sql", import.meta.url), "utf8"))
    sql(readFileSync(new URL("../migrations/20260903170000_training_identity_bridge.sql", import.meta.url), "utf8"))
    // Empty configuration must preserve the main account lifecycle.
    sql(`insert into auth.users(id,email,encrypted_password) values ('00000000-0000-4000-8000-000000000001','main@example.invalid','main-hash');
      update auth.users set encrypted_password='updated-main-hash' where email='main@example.invalid';`)
    assert.match(sql(`select "User_Email" from "cmp_Users";`), /main@example.invalid/)
    sql(`delete from "cmp_Users";
      delete from auth.users;
      insert into "cmp_Company" values ('00000000-0000-4000-8000-000000000010');
      insert into "cmp_Offices" values ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010');
      insert into "sys_Permissions" values ('00000000-0000-4000-8000-000000000030','Quotes.Read');
      insert into training_configuration values (true,'https://main.supabase.co','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010');
      insert into training_office_links values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020');
      insert into auth.users(id,email,encrypted_password) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001@training.multideck.invalid','gotrue-random-password');
      update auth.users set raw_app_meta_data='{"training_main_project":"https://main.supabase.co"}' where id='00000000-0000-4000-8000-000000000001';
      insert into auth.identities values ('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001','email','{"email":"00000000-0000-4000-8000-000000000001@training.multideck.invalid"}');`)
    assert.match(sql(`select count(*) from "cmp_Users";`), /\n\s+0\n/)
    const profile = { authUserId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", email: "operator@example.invalid", firstName: "Test", lastName: "Operator", officeIds: ["00000000-0000-4000-8000-000000000021"] }
    const roles = [{ id: "00000000-0000-4000-8000-000000000040", name: "Operator", permissions: ["Quotes.Read"] }]
    const sync = (p = profile, r = roles, source = "https://main.supabase.co") => sql(`select sync_training_identity_v1('${source}','00000000-0000-4000-8000-000000000011','${JSON.stringify(p)}','${JSON.stringify(r)}');`)
    sync(); sync()
    assert.match(sql(`select count(*) as audit_rows from "Audit_Events";`), /\n\s+1\n/)
    assert.match(sql(`select "User_Email" from "cmp_Users";`), /operator@example.invalid/)
    assert.match(sql(`select encrypted_password is null as credentialless from auth.users;`), /\n t\n/)
    assert.match(sql(`select count(*) from "cmp_Users_Offices";`), /\n\s+1\n/)
    assert.throws(() => sync(profile, roles, "https://other.supabase.co"), /not configured as the paired/)
    assert.throws(() => sync({ ...profile, officeIds: ["00000000-0000-4000-8000-000000000022"] }), /Map the main offices/)
    assert.throws(() => sync(profile, [{ ...roles[0], permissions: ["Unknown.Permission"] }]), /missing a main workspace permission/)
    assert.throws(() => sync({ ...profile, userId: "00000000-0000-4000-8000-000000000003" }), /conflicts with an existing/)
    for (const statement of [
      `update auth.users set encrypted_password='attacker-hash'`,
      `update auth.users set email='attacker@example.invalid'`,
      `update auth.users set phone='+441111111111'`,
      `insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000050','real@example.invalid')`,
      `update auth.identities set provider='google'`,
      `insert into auth.mfa_factors(id,user_id) select gen_random_uuid(), id from auth.users`,
      `insert into auth.webauthn_credentials(id,user_id) select gen_random_uuid(), id from auth.users`,
      `delete from "cmp_Users_Roles"`,
      `update "cmp_Users" set "Company_ID"=null`,
    ]) assert.throws(() => sql(statement), /Main|Training/)
    sql(`update auth.users set last_sign_in_at=now(); update "cmp_Users" set "User_ThemeMode"='dark';`)
    sync({ ...profile, officeIds: [] }, [])
    assert.match(sql(`select count(*) from "cmp_Users_Roles";`), /\n\s+0\n/)
    assert.match(sql(`select count(*) from "cmp_Users_Offices";`), /\n\s+0\n/)
    assert.throws(() => sql(`set role authenticated; select * from training_configuration;`), /permission denied/)
    assert.throws(() => sql(`set role anon; select assert_training_pair_v1('https://main.supabase.co','00000000-0000-4000-8000-000000000011');`), /permission denied/)
  } finally {
    if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"])
    rmSync(dir, { recursive: true, force: true })
  }
})
