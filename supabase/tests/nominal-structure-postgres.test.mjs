import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260922091752_nominal_groups_charge_relationships.sql')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const access = read('migrations/20260918123733_general_ledger_journals.sql').split('create function public._multideck_journal_access')[1].split('create function public.multideck_finance_journal')[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
test('nominal structure: persisted pairs, charge relationships, entity boundaries, revisions and immutable audit', () => {
  assert.ok(baseline.includes(migration.trim()), 'Provisioning snapshot contains the exact tested migration')
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'nominal-structure-')); let started = false
  const run = (cmd, args, input) => { const r = spawnSync(join(bin, cmd), args, {input,encoding:'utf8',timeout:30000}); assert.equal(r.status,0,r.stderr); return r.stdout.trim() }
  const args = ['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
  const sql = q => run('psql',args,q)
  const reject = (q,pattern) => { const r = spawnSync(join(bin,'psql'),args,{input:q,encoding:'utf8'}); assert.notEqual(r.status,0); assert.match(r.stderr,pattern) }
  const call = (action,input={},actor=1,entity=3) => `select multideck_finance_nominal_structure('${id(actor)}','${id(entity)}','${action}','${JSON.stringify(input)}');`
  const resolve = (actor=1,entity=3) => `select multideck_finance_resolve_charge_nominals('${id(actor)}','${id(entity)}','${id(30)}');`
  try {
    run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8'])
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']); started=true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
      create table permissions(actor uuid,permission text);
      create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from permissions where actor=$1 and permission=$2)$$;
      ${table('FIN_NominalAccounts')} ${table('RATE_ChargeCodes')}
      alter table "FIN_NominalAccounts" add primary key("FINNom_ID");
      alter table "RATE_ChargeCodes" add primary key("RATECharge_ID");
      create function public._multideck_journal_access${access}
      ${migration}
      insert into "cmp_Users" values ('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(5)}','${id(6)}','active'),('${id(7)}','${id(2)}','inactive'),('${id(8)}',null,'active');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}',true),('${id(9)}','${id(6)}',true);
      insert into permissions select u,'Finance.Management.View' from unnest(array['${id(1)}'::uuid,'${id(4)}','${id(5)}','${id(7)}','${id(8)}'])u;
      insert into permissions values('${id(1)}','Finance.Configuration.Manage');
      insert into "RATE_ChargeCodes"("RATECharge_ID","RATECharge_Code","RATECharge_Name","RATECharge_CategoryCode") values('${id(30)}','FRT','Freight','freight');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_ReportCategoryCode","FINNom_IsControlAccount") values
      ('${id(10)}','${id(3)}','1010.20.10','Freight actual','Cost of Goods Sold','direct_cost',false),
      ('${id(11)}','${id(3)}','1010.20.20','Freight accrued','Cost of Goods Sold','direct_cost',false),
      ('${id(12)}','${id(3)}','8410.10.00','Accrual control','Current Liability','liability',true),
      ('${id(13)}','${id(9)}','FOREIGN','Foreign expense','Expense Account','expense',false),
      ('${id(14)}','${id(3)}','1010.10.10','Freight revenue actual','Income Account','income',false),
      ('${id(15)}','${id(3)}','1010.10.20','Freight revenue accrued','Income Account','income',false),
      ('${id(16)}','${id(3)}','6240.00.00','WIP control','Current Asset','asset',true);`)
    const cost = {code:'1010.20.00',name:'Freight costs',kind:'cost',actualAccountId:id(10),accruedAccountId:id(11),controlAccountId:id(12)}
    reject(call('create_group',cost,4),/access/)
    for (const actor of [5,7,8]) reject(call('read',{},actor),/access/)
    reject(call('read',{},1,9),/access/)
    reject(resolve(),/Configure this charge code/)
    reject(call('create_group',{...cost,actualAccountId:id(13)}),/this legal entity/)
    reject(call('create_group',{...cost,actualAccountId:id(14)}),/correct kind/)
    reject(call('create_group',{...cost,controlAccountId:id(16)}),/balance-sheet/)
    reject(call('create_group',{...cost,accruedAccountId:id(10)}),/duplicate key/)
    assert.equal(sql('select count(*) from "FIN_NominalGroups"'),'0','failed groups roll back atomically')
    const g = JSON.parse(sql(call('create_group',cost)))
    assert.equal(g.actual.code,'1010.20.10'); assert.equal(g.accrued.code,'1010.20.20')
    const revenue = JSON.parse(sql(call('create_group',{code:'1010.10.00',name:'Freight revenue',kind:'revenue',actualAccountId:id(14),accruedAccountId:id(15),controlAccountId:id(16)})))
    const mapping = {chargeId:id(30),costGroupId:g.id,revenueGroupId:revenue.id,version:0}
    reject(call('map_charge',{...mapping,costGroupId:revenue.id}),/correct kind/)
    assert.equal(JSON.parse(sql(call('map_charge',mapping))).version,1)
    reject(call('map_charge',mapping),/changed/)
    const resolved = JSON.parse(sql(resolve(4)))
    assert.equal(resolved.cost.actual.id,id(10)); assert.equal(resolved.revenue.accrued.id,id(15))
    assert.equal(JSON.parse(sql(call('read',{},4))).members.length,4)
    sql(`update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='${id(1)}';`)
    assert.equal(JSON.parse(sql(call('read',{},4))).groups.length,2,'deactivated creator does not hide company data')
    sql(`update "FIN_NominalAccounts" set "FINNom_IsActive"=false where "FINNom_ID"='${id(11)}';`)
    reject(resolve(4),/active, non-control/)
    reject('update "FIN_NominalGroups" set name=\'Rewritten\';',/cannot be rewritten/)
    reject('delete from "FIN_NominalStructureAudit";',/cannot be rewritten/)
    assert.equal(sql('select count(*) from "FIN_NominalStructureAudit"'),'3')
    for (const role of ['anon','authenticated']) {
      reject(`set role ${role}; select * from "FIN_NominalGroups";`,/permission denied/)
      reject(`set role ${role}; ${call('read',{},4)}`,/permission denied/)
    }
    sql(`delete from permissions where actor='${id(4)}';`)
    reject(call('read',{},4),/access/)
  } finally {
    if(started) spawnSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
