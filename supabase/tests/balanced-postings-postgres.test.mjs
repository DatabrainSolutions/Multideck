import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test('all posted ledger batches require complete balanced double entry at commit', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'posting-balance-'))
  let started = false
  const run = (cmd, args, input) => spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
  const ok = result => { assert.equal(result.status, 0, result.stderr); return result.stdout.trim() }
  const sql = input => run('psql', ['-X','-qAt','-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], input)
  const reject = input => { const r=sql(input); assert.notEqual(r.status,0); assert.match(r.stderr,/Journal must balance/); }
  const id = '00000000-0000-4000-8000-000000000001'
  const batch = (status='posted', debit=100, credit=100) => `insert into "FIN_PostingBatches"("FINPostBatch_ID","FINPostBatch_StatusCode","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal") values ('${id}','${status}',${debit},${credit});`
  const line = (n,d,c,account=`'${id}'`) => `insert into "FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DebitAmount","FINPostLine_CreditAmount") values ('${id}',${n},${account},${d},${c});`
  try {
    ok(run('initdb',['-D',join(dir,'data'),'-A','trust','-U','postgres','--no-locale','--no-sync','-E','UTF8']))
    ok(run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start'])); started=true
    const baseline=readFileSync(new URL('../baseline/public-schema.sql',import.meta.url),'utf8')
    for (const name of ['FIN_PostingBatches','FIN_PostingLines']) {
      const start=baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
      assert.ok(start>=0)
      ok(sql(baseline.slice(start,baseline.indexOf('\n);',start)+4)))
    }
    ok(sql('alter table "FIN_PostingBatches" add primary key("FINPostBatch_ID");'))
    const migration=readFileSync(new URL('../migrations/20260921072027_enforce_balanced_ledger_postings.sql',import.meta.url),'utf8')
    ok(sql(batch()))
    reject(`begin; ${migration} commit;`)
    ok(sql('delete from "FIN_PostingBatches";'))
    ok(sql(migration))
    ok(sql('create role authenticated;'))
    const denied=sql(`set role authenticated; select public._multideck_assert_balanced_posting('${id}');`)
    assert.notEqual(denied.status,0)
    assert.match(denied.stderr,/permission denied/)
    reject(batch())
    reject(`begin; ${batch()}${line(1,100,0)}commit;`)
    reject(`begin; ${batch()}${line(1,100,0)}${line(2,0,99)}commit;`)
    reject(`begin; ${batch('posted',99,99)}${line(1,100,0)}${line(2,0,100)}commit;`)
    for (const bad of [line(3,1,1),line(3,-1,-1),line(3,0,0),line(3,"'NaN'","'NaN'"),line(1,100,0,'null')]) {
      reject(`begin; ${batch()}${line(1,100,0)}${line(2,0,100)}${bad}commit;`)
    }
    assert.equal(ok(sql('select count(*) from "FIN_PostingBatches";')),'0')
    // A multi-nominal journal, including fractional amounts, is committed atomically.
    ok(sql(`begin; ${batch()}${line(1,60.1234,0)}${line(2,39.8766,0)}${line(3,0,100)}commit;`))
    reject('delete from "FIN_PostingLines" where "FINPostLine_LineNo"=1;')
    reject('update "FIN_PostingLines" set "FINPostLine_DebitAmount"=60 where "FINPostLine_LineNo"=1;')
    reject(`update "FIN_PostingLines" set "FINPostLine_BatchID"='00000000-0000-4000-8000-000000000002' where "FINPostLine_LineNo"=1;`)
    reject('update "FIN_PostingBatches" set "FINPostBatch_CreditTotal"=99;')
    assert.equal(ok(sql('select sum("FINPostLine_DebitAmount")=sum("FINPostLine_CreditAmount") from "FIN_PostingLines";')),'t')
    ok(sql('begin; delete from "FIN_PostingLines"; delete from "FIN_PostingBatches"; commit;'))
    // Incomplete drafts remain editable, but cannot be posted.
    ok(sql(`begin; ${batch('draft')}${line(1,100,0)}commit;`))
    reject('update "FIN_PostingBatches" set "FINPostBatch_StatusCode"=\'posted\';')
    ok(sql(`begin; ${line(2,0,100)}update "FIN_PostingBatches" set "FINPostBatch_StatusCode"='posted';commit;`))
  } finally {
    if(started) run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop'])
    rmSync(dir,{recursive:true,force:true})
  }
})
