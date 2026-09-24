import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const migration = read('migrations/20260922095716_explicit_nominal_report_classification.sql')
const baseline = read('baseline/public-schema.sql')
const table = baseline.match(/CREATE TABLE IF NOT EXISTS "public"\."FIN_NominalAccounts" \([\s\S]*?^\);/m)[0]
const administration = read('migrations/20260829165937_comprehensive_finance_administration.sql')
const start = administration.indexOf("  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'nominalAccounts'")
const end = administration.indexOf("  for v_item in select value from jsonb_array_elements(coalesce(p_settings->'banks'", start)
const nominalWriter = administration.slice(start, end)
test('real nominal writer and trigger preserve CargoWise codes and explicit BS/P&L categories', () => {
  assert.ok(baseline.includes(migration.trim()), 'Provisioning includes the exact tested classification migration')
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'nominal-category-')); let started = false
  const run = (cmd,args,input) => { const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000}); assert.equal(r.status,0,r.stderr); return r.stdout.trim() }
  const args=['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
  const sql=q=>run('psql',args,q)
  const entity='00000000-0000-4000-8000-000000000003'
  const save = rows => `select multideck_finance_save_administration(null,null,'${entity}','${JSON.stringify({nominalAccounts:rows})}',null);`
  const reject=(q,pattern)=>{const r=spawnSync(join(bin,'psql'),args,{input:q,encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,pattern)}
  try {
    run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8'])
    run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']); started=true
    // Use the actual administration nominal-write block, not an imitation. The
    // surrounding writer's authorisation is covered by finance access contracts.
    sql(`create role anon; create role authenticated; create role service_role;
      ${table}
      alter table "FIN_NominalAccounts" add primary key("FINNom_ID");
      create unique index on "FIN_NominalAccounts"("FINNom_LegalEntityID","FINNom_Code");
      create function public.multideck_finance_save_administration(p_company_id uuid,p_user_id uuid,p_legal_entity_id uuid,p_settings jsonb,p_reason text default null)
      returns jsonb language plpgsql as $$ declare v_item jsonb; v_code text; v_id uuid; v_row_count integer;
      begin ${nominalWriter}
      for v_item in select value from jsonb_array_elements(coalesce(p_settings->'banks','[]'::jsonb)) loop null; end loop;
      return '{}'; end; $$;
      ${migration}
      create trigger "TR_FIN_NominalAccounts_report_category" before insert or update of "FINNom_Code","FINNom_AccountTypeCode","FINNom_ReportCategoryCode" on "FIN_NominalAccounts" for each row execute function _multideck_finance_derive_report_category();`)
    sql(save([
      {code:'6240.00.00',name:'WIP control',accountTypeCode:'Current Asset',reportCategoryCode:'asset'},
      {code:'8410.10.00',name:'Accrual control',accountTypeCode:'Current Liability'},
      {code:'1010.10.20',name:'Accrued revenue',accountTypeCode:'Income Account'},
      {code:'0010.20.10',name:'Actual cost',accountTypeCode:'Cost of Goods Sold'},
      {code:'2100',name:'Output tax',accountTypeCode:'Tax',reportCategoryCode:'liability'},
    ]))
    const categories=JSON.parse(sql(`select jsonb_object_agg("FINNom_Code","FINNom_ReportCategoryCode") from "FIN_NominalAccounts";`))
    assert.deepEqual(categories,{'6240.00.00':'asset','8410.10.00':'liability','1010.10.20':'income','0010.20.10':'direct_cost','2100':'liability'})
    reject(save([{code:'TAX',name:'Unclassified tax',accountTypeCode:'Tax'}]),/explicit report category/)
    reject(save([{code:'INVALID',name:'Invalid category',accountTypeCode:'Bank',reportCategoryCode:'unknown'}]),/check constraint/)
    const wipId=sql(`select "FINNom_ID" from "FIN_NominalAccounts" where "FINNom_Code"='6240.00.00';`)
    sql(save([{id:wipId,code:'9999.00.00',name:'Renumbered WIP',accountTypeCode:'Current Asset'}]))
    assert.equal(sql(`select "FINNom_ReportCategoryCode" from "FIN_NominalAccounts" where "FINNom_ID"='${wipId}';`),'asset')
    sql(save([{id:wipId,code:'9999.00.00',name:'Explicitly corrected',accountTypeCode:'Current Asset',reportCategoryCode:'finance'}]))
    assert.equal(sql(`select "FINNom_ReportCategoryCode" from "FIN_NominalAccounts" where "FINNom_ID"='${wipId}';`),'finance')
    sql(save([{code:'9999.00.00',name:'Legacy client upsert',accountTypeCode:'Current Asset'}]))
    assert.equal(sql(`select "FINNom_ReportCategoryCode" from "FIN_NominalAccounts" where "FINNom_ID"='${wipId}';`),'finance','legacy upsert does not overwrite explicit category')
    sql(save([{code:'9999.00.00',name:'Reviewed category',accountTypeCode:'Current Asset',reportCategoryCode:'asset'}]))
    assert.equal(sql(`select "FINNom_ReportCategoryCode" from "FIN_NominalAccounts" where "FINNom_ID"='${wipId}';`),'asset')
    assert.equal(sql(`select count(*) from "FIN_NominalAccounts" where "FINNom_Code" in ('TAX','INVALID');`),'0')
  } finally {
    if(started)spawnSync(join(bin,'pg_ctl'),['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
