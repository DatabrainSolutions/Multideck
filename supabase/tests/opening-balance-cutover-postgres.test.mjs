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
const journal = read('migrations/20260918123733_general_ledger_journals.sql')
const access = journal.split('create function public._multideck_journal_access')[1].split('create function public.multideck_finance_journal')[0]
const enquiry = journal.slice(journal.indexOf('create function public.multideck_finance_gl_enquiry'), journal.indexOf('revoke all on function public.multideck_finance_gl_enquiry'))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const digest = 'a'.repeat(64)

test('CargoWise clean-ledger opening balances stage, approve, post once and agree with GL', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'opening-cutover-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding:'utf8', timeout:30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  const reject = (input, pattern) => {
    const result = spawnSync(join(bin,'psql'), args, {input,encoding:'utf8'})
    assert.notEqual(result.status, 0, input)
    assert.match(result.stderr, pattern)
  }
  const packageInput = (extra = {}) => ({
    sourceSystem:'CargoWise',sourceFileName:'closing-balance.xlsx',sourceSha256:digest,
    cutoffDate:'2026-08-31',baseCurrency:'GBP',openItems:[],
    evidence:{bank:'BANK-31-AUG',tax:'TAX-31-AUG',accrualWip:'WIP-31-AUG',sourceReconciliation:'CW-REPORT-41'},
    trialBalance:[{sourceRow:5,accountCode:'0010.00.00',debit:'100.2500',credit:'0'},
      {sourceRow:6,accountCode:'3000.00.00',debit:'0',credit:'100.2500'}],...extra,
  })
  const call = (action, input = {}, actor = 1, entity = 3) =>
    `select multideck_finance_opening_balances('${id(actor)}','${id(entity)}','${action}','${JSON.stringify(input)}');`
  try {
    run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8'])
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table permissions(actor uuid,permission text);
      create function _multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select exists(select 1 from permissions where actor=$1 and permission=$2)$$;
      ${['FIN_NominalAccounts','FIN_PostingBatches','FIN_PostingLines','FIN_Periods','Audit_Events','sys_WorkflowRecordTypes'].map(table).join('\n')}
      alter table "FIN_NominalAccounts" add primary key("FINNom_ID");
      alter table "FIN_PostingBatches" add primary key("FINPostBatch_ID");
      alter table "FIN_Periods" add primary key("FINPeriod_ID");
      alter table "sys_WorkflowRecordTypes" add primary key("WorkflowRecordType_Code");
      create function public._multideck_journal_access${access}
      create function _multideck_finance_mirror_state(uuid) returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean) language sql as $$select 'optional'::text,false,true$$;
      create function _multideck_finance_ensure_period(uuid,text,uuid) returns uuid language plpgsql as $$declare result uuid; begin
        select "FINPeriod_ID" into result from "FIN_Periods" where "FINPeriod_LegalEntityID"=$1 and "FINPeriod_Code"=$2;
        if result is null then insert into "FIN_Periods"("FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_BaseCurrencyCode")
          values($1,$2,$2,to_date($2||'01','YYYYMMDD'),(to_date($2||'01','YYYYMMDD')+interval '1 month - 1 day')::date,'GBP') returning "FINPeriod_ID" into result; end if;
        return result; end$$;
      ${enquiry}
      ${read('migrations/20260921072027_enforce_balanced_ledger_postings.sql')}
      ${read('migrations/20260925072611_immutable_committed_native_postings.sql')}
      ${read('migrations/20260925071153_opening_balance_gl_cutover.sql')}
      insert into "cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(5)}','${id(6)}','active'),('${id(7)}','${id(2)}','inactive');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}',true,'GBP'),('${id(9)}','${id(6)}',true,'EUR');
      insert into permissions values('${id(1)}','Finance.Configuration.Manage'),('${id(1)}','Finance.Management.View'),('${id(1)}','Finance.Management.Post'),('${id(4)}','Finance.Management.View'),('${id(4)}','Finance.Management.Post'),('${id(5)}','Finance.Management.Post');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_ReportCategoryCode","FINNom_IsControlAccount") values
        ('${id(10)}','${id(3)}','0010.00.00','Bank','Bank','asset',false),
        ('${id(11)}','${id(3)}','3000.00.00','Retained earnings','Equity','equity',false),
        ('${id(12)}','${id(3)}','6210.00.00','AR','Receivable','asset',true),
        ('${id(13)}','${id(9)}','FOREIGN','Foreign','Bank','asset',false);`)
    reject(call('stage',packageInput(),5),/access/)
    reject(call('stage',packageInput({baseCurrency:'EUR'})),/base currency/)
    reject(call('stage',packageInput({openItems:[{sourceId:'AR-1'}]})),/Open AR\/AP/)
    reject(call('stage',packageInput({trialBalance:[{sourceRow:1,accountCode:'6210.00.00',debit:'100',credit:'0'},{sourceRow:2,accountCode:'3000.00.00',debit:'0',credit:'100'}]})),/Open AR\/AP/)
    reject(call('stage',packageInput({trialBalance:[{sourceRow:1,accountCode:'FOREIGN',debit:'100',credit:'0'},{sourceRow:2,accountCode:'3000.00.00',debit:'0',credit:'100'}]})),/active nominal/)
    reject(call('stage',packageInput({trialBalance:[{sourceRow:1,accountCode:'0010.00.00',debit:'100',credit:'0'},{sourceRow:2,accountCode:'3000.00.00',debit:'0',credit:'99'}]})),/must balance/)
    const staged = JSON.parse(sql(call('stage',packageInput())))
    assert.equal(staged.status,'staged')
    assert.equal(sql('select count(*) from "FIN_OpeningBalanceRows";'),'2')
    reject(call('stage',packageInput()),/duplicate key/)
    reject(call('approve',{id:staged.id}),/second finance operator/)
    reject(call('approve',{id:staged.id},5),/access/)
    reject(call('post',{id:staged.id},4),/stages in order/)
    assert.equal(JSON.parse(sql(call('approve',{id:staged.id},4))).status,'approved')
    reject(`update "FIN_OpeningBalanceRows" set debit=1 where package_id='${staged.id}';`,/immutable/)
    reject(`update "FIN_OpeningBalancePackages" set source_file_name='changed' where id='${staged.id}';`,/cannot be changed/)
    const posted = JSON.parse(sql(call('post',{id:staged.id},4)))
    assert.equal(posted.status,'posted')
    assert.equal(sql('select count(*) from "FIN_PostingBatches";'),'1')
    assert.equal(sql('select count(*) from "FIN_PostingLines";'),'2')
    assert.equal(sql(`select "FINPostBatch_SourceTable" from "FIN_PostingBatches" where "FINPostBatch_ID"='${posted.posting_batch_id}';`),'FIN_OpeningBalancePackages')
    const bank = JSON.parse(sql(`select multideck_finance_gl_enquiry('${id(4)}','${id(3)}','202609','202609','${id(10)}',0);`))
    assert.equal(bank.closing,100.25)
    assert.equal(bank.rows[0].source,'FIN_OpeningBalancePackages')
    assert.match(bank.rows[0].description,/source row 5/)
    reject(`update "FIN_PostingLines" set "FINPostLine_Description"='changed' where "FINPostLine_BatchID"='${posted.posting_batch_id}';`,/immutable/)
    reject(`delete from "FIN_PostingLines" where "FINPostLine_BatchID"='${posted.posting_batch_id}';`,/immutable/)
    reject(`update "FIN_PostingBatches" set "FINPostBatch_Number"='changed' where "FINPostBatch_ID"='${posted.posting_batch_id}';`,/immutable/)
    assert.equal(JSON.parse(sql(call('read',{},4)))[0].rowCount,2)
    assert.equal(JSON.parse(sql(call('read',{id:staged.id},4)))[0].rows.length,2)
    reject(call('post',{id:staged.id},4),/stages in order/)
    for(const role of ['anon','authenticated']) {
      reject(`set role ${role}; select * from "FIN_OpeningBalancePackages";`,/permission denied/)
      reject(`set role ${role}; ${call('read')}`,/permission denied/)
    }
  } finally {
    if(started) spawnSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
