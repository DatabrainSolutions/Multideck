import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const access = read('migrations/20260918123733_general_ledger_journals.sql').split('create function public._multideck_journal_access')[1].split('create function public.multideck_finance_journal')[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('charge mapping cutover requires independent review and pins actual nominal through corrections', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'charge-cutover-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  const reject = (input, pattern) => {
    const result = spawnSync(join(bin, 'psql'), args, { input, encoding: 'utf8' })
    assert.notEqual(result.status, 0, input)
    assert.match(result.stderr, pattern)
  }
  const cutover = (action, input = {}, actor = 1, entity = 3) =>
    `select multideck_finance_charge_mapping_cutover('${id(actor)}','${id(entity)}','${action}','${JSON.stringify(input)}');`
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
      create table permissions(actor uuid,permission text);
      create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from permissions where actor=$1 and permission=$2)$$;
      ${['FIN_NominalAccounts','RATE_ChargeCodes','FIN_Documents','FIN_DocumentLines','FIN_DocumentLineJobLinks','Job_Costing_Lines','Audit_Events','sys_WorkflowRecordTypes'].map(table).join('\n')}
      alter table "FIN_NominalAccounts" add primary key("FINNom_ID");
      alter table "RATE_ChargeCodes" add primary key("RATECharge_ID");
      alter table "FIN_Documents" add primary key("FINDoc_ID");
      alter table "FIN_DocumentLines" add primary key("FINDocLine_ID");
      alter table "Job_Costing_Lines" add primary key("JobCostingLine_ID");
      alter table "sys_WorkflowRecordTypes" add primary key("WorkflowRecordType_Code");
      create function public._multideck_journal_access${access}
      ${read('migrations/20260922091752_nominal_groups_charge_relationships.sql')}
      ${read('migrations/20260925070532_charge_mapping_cutover_posting.sql')}
      insert into "cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(5)}','${id(6)}','active'),('${id(7)}','${id(2)}','inactive');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}',true),('${id(9)}','${id(6)}',true);
      insert into permissions values('${id(1)}','Finance.Configuration.Manage'),('${id(1)}','Finance.Management.View'),('${id(1)}','Finance.Management.Post'),('${id(4)}','Finance.Management.View'),('${id(4)}','Finance.Management.Post'),('${id(5)}','Finance.Management.Post');
      insert into "RATE_ChargeCodes"("RATECharge_ID","RATECharge_Code","RATECharge_Name","RATECharge_CategoryCode") values('${id(30)}','FRT','Freight','freight');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_ReportCategoryCode","FINNom_IsControlAccount") values
        ('${id(10)}','${id(3)}','5000','Actual cost','Cost of Goods Sold','direct_cost',false),
        ('${id(11)}','${id(3)}','5001','Accrued cost','Cost of Goods Sold','direct_cost',false),
        ('${id(12)}','${id(3)}','2300','Accrual control','Liability','liability',true),
        ('${id(13)}','${id(3)}','4000','Actual revenue','Income Account','income',false),
        ('${id(14)}','${id(3)}','4001','Accrued revenue','Income Account','income',false),
        ('${id(15)}','${id(3)}','1400','WIP control','Asset','asset',true),
        ('${id(16)}','${id(3)}','5099','Legacy cost','Cost of Goods Sold','direct_cost',false);`)
    const cost = JSON.parse(sql(`select multideck_finance_nominal_structure('${id(1)}','${id(3)}','create_group','${JSON.stringify({code:'COST',name:'Freight cost',kind:'cost',actualAccountId:id(10),accruedAccountId:id(11),controlAccountId:id(12)})}');`))
    const revenue = JSON.parse(sql(`select multideck_finance_nominal_structure('${id(1)}','${id(3)}','create_group','${JSON.stringify({code:'REV',name:'Freight revenue',kind:'revenue',actualAccountId:id(13),accruedAccountId:id(14),controlAccountId:id(15)})}');`))
    sql(`select multideck_finance_nominal_structure('${id(1)}','${id(3)}','map_charge','${JSON.stringify({chargeId:id(30),costGroupId:cost.id,revenueGroupId:revenue.id,version:0})}');`)
    reject(cutover('propose', {effectiveDate:'2026-09-01'}, 5), /access/)
    const plan = JSON.parse(sql(cutover('propose', {effectiveDate:'2026-09-01'})))
    reject(cutover('approve', {id:plan.id}), /second finance operator/)
    reject(cutover('activate', {id:plan.id}, 4), /stages in order/)
    reject(cutover('approve', {id:plan.id}, 5), /access/)
    sql(cutover('approve', {id:plan.id}, 4))
    sql(cutover('activate', {id:plan.id}, 4))
    assert.equal(JSON.parse(sql(cutover('read')))[0].status, 'active')
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_LegalEntityID","FINDoc_AccountingDate") values('${id(40)}','pl_invoice','${id(3)}','2026-09-05');
      insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_ChargeID","FINDocLine_Description","FINDocLine_NominalAccountID") values('${id(41)}','${id(40)}',1,'${id(30)}','Sea freight','${id(16)}');
      update "FIN_Documents" set "FINDoc_StatusCode"='approved' where "FINDoc_ID"='${id(40)}';`)
    assert.equal(sql(`select "FINDocLine_NominalAccountID" from "FIN_DocumentLines" where "FINDocLine_ID"='${id(41)}';`),id(10))
    assert.equal(sql(`select "FINDocLine_NominalCodeSnapshot" from "FIN_DocumentLines" where "FINDocLine_ID"='${id(41)}';`),'5000')
    assert.equal(sql(`select "FINDocLine_ChargeMappingVersion" from "FIN_DocumentLines" where "FINDocLine_ID"='${id(41)}';`),'1')
    sql(`update "FIN_ChargeNominalMappings" set cost_group_id=null where charge_id='${id(30)}';`)
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_LegalEntityID","FINDoc_AccountingDate","FINDoc_SourceTable","FINDoc_SourceID","FINDoc_MetadataJSON") values('${id(42)}','debit_note','${id(3)}','2026-09-06','FIN_Documents','${id(40)}','{"billingPartyCorrection":true}');
      insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_ChargeID","FINDocLine_Description") values('${id(43)}','${id(42)}',1,'${id(30)}','Reversal');
      update "FIN_Documents" set "FINDoc_StatusCode"='approved' where "FINDoc_ID"='${id(42)}';`)
    assert.equal(sql(`select "FINDocLine_NominalAccountID" from "FIN_DocumentLines" where "FINDocLine_ID"='${id(43)}';`),id(10))
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_LegalEntityID","FINDoc_AccountingDate") values('${id(44)}','pl_invoice','${id(3)}','2026-09-07');
      insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_ChargeID","FINDocLine_Description") values('${id(45)}','${id(44)}',1,'${id(30)}','Another freight');`)
    reject(`update "FIN_Documents" set "FINDoc_StatusCode"='approved' where "FINDoc_ID"='${id(44)}';`,/Map charge/)
    assert.equal(sql(`select "FINDoc_StatusCode" from "FIN_Documents" where "FINDoc_ID"='${id(44)}';`),'draft')
    for (const role of ['anon','authenticated']) {
      reject(`set role ${role}; select * from "FIN_ChargeMappingCutovers";`,/permission denied/)
      reject(`set role ${role}; ${cutover('read')}`,/permission denied/)
    }
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, {recursive:true,force:true})
  }
})
