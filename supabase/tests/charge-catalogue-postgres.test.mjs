import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const migration = readFileSync(new URL('migrations/20260923120000_charge_catalogue_applicability.sql', root), 'utf8')
const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const access = readFileSync(new URL('migrations/20260918123733_general_ledger_journals.sql', root), 'utf8')
  .split('create function public._multideck_journal_access')[1].split('create function public.multideck_finance_journal')[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('charge catalogue scopes, versions, permissions and audit are enforced by PostgreSQL', () => {
  assert.ok(baseline.includes(migration.trim()), 'Provisioning snapshot contains the charge catalogue migration')
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'charge-catalogue-'))
  let started = false
  const run = (cmd, args, input) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
  const sql = query => run('psql', args, query)
  const reject = (query, pattern) => {
    const result = spawnSync(join(bin, 'psql'), args, { input: query, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, pattern)
  }
  const input = (overrides = {}) => ({ code: 'FRT', name: 'Freight', category: 'freight', side: 'both', active: true,
    applicability: [{ recordKind: 'quote', direction: 'export', mode: 'sea' }], ...overrides })
  const call = (payload, actor = 1, entity = 3) => `select multideck_manage_charge_catalogue('${id(actor)}','${id(entity)}','${JSON.stringify(payload)}');`
  try {
    run('initdb', ['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8'])
    run('pg_ctl', ['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']); started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
      create table permissions(actor uuid,permission text);
      create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from permissions where actor=$1 and permission=$2)$$;
      create table "sys_RateChargeCategories"("RATECCAT_Code" text primary key);
      insert into "sys_RateChargeCategories" values('freight');
      ${table('RATE_ChargeCodes')}
      alter table "RATE_ChargeCodes" add primary key("RATECharge_ID");
      create function public._multideck_journal_access${access}
      ${migration}
      insert into "cmp_Users" values ('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(5)}','${id(6)}','active');
      insert into "cmp_LegalEntities" values ('${id(3)}','${id(2)}',true),('${id(9)}','${id(6)}',true);
      insert into permissions values ('${id(1)}','Finance.Configuration.Manage');`)
    reject(call(input(), 4), /access/)
    reject(call(input(), 5), /access/)
    reject(call(input(), 1, 9), /access/)
    reject(call(input({ applicability: [] })), /at least one/)
    reject(call(input({ applicability: [{ recordKind: 'quote', direction: 'invalid', mode: 'sea' }] })), /valid quote/)
    const created = JSON.parse(sql(call(input({ version: 0 }))))
    assert.equal(created.RATECharge_ScopeConfigured, true)
    assert.equal(sql('select count(*) from "RATE_ChargeApplicability"'), '1')
    reject(call(input({ id: created.RATECharge_ID, version: 0 })), /changed/)
    const updated = JSON.parse(sql(call(input({ id: created.RATECharge_ID, version: 1,
      applicability: [{ recordKind: 'booking', direction: 'import', mode: 'air' }] }))))
    assert.equal(updated.RATECharge_Version, 2)
    assert.equal(sql('select record_kind||\':\'||direction||\':\'||mode from "RATE_ChargeApplicability"'), 'booking:import:air')
    assert.equal(sql('select count(*) from "RATE_ChargeCatalogueAudit"'), '2')
    for (const role of ['anon', 'authenticated']) {
      reject(`set role ${role}; select * from "RATE_ChargeApplicability";`, /permission denied/)
      reject(`set role ${role}; ${call(input())}`, /permission denied/)
    }
    sql(`delete from permissions where actor='${id(1)}';`)
    reject(call(input({ id: created.RATECharge_ID, version: 2 })), /access/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
