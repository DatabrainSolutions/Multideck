import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const authority = read('migrations/20260925073443_charge_recognition_authority.sql')
const recognition = read('migrations/20260925073708_charge_event_initial_recognition.sql')
const correction = read('migrations/20260925075054_reviewed_charge_lifecycle_corrections.sql')
const noBalanceResolution = read('migrations/20260925081349_finance_charge_case_no_balance_resolution.sql')
const baseline = read('baseline/public-schema.sql')
const table = name => baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?^\\);`, 'm'))?.[0]
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('approved service evidence posts one exact native recognition and blocks duplicates', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'event-recognition-'))
  let started = false
  const run = (cmd, args, input) => {
    const result = spawnSync(join(bin, cmd), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = statement => run('psql', args, statement)
  const reject = statement => {
    const result = spawnSync(join(bin, 'psql'), args, { input: statement, encoding: 'utf8', timeout: 30000 })
    assert.notEqual(result.status, 0)
    return result.stderr
  }
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table "cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table permissions(actor uuid,permission text);
      create function public._multideck_journal_access(p_actor uuid,p_entity uuid,p_permission text) returns void language plpgsql as $$
      begin if not exists(select 1 from "cmp_Users" u join "cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
        join permissions p on p.actor=u."User_ID" and p.permission=p_permission
        where u."User_ID"=p_actor and e."LegalEntity_ID"=p_entity and u."User_AccessStatus"='active') then
        raise exception 'No finance access' using errcode='42501'; end if; end $$;
      create function public._multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select true$$;
      create table "Job_Header"("Job_ID" uuid primary key,"Job_LegalEntityID" uuid,"Job_Status" text default 'active',"Job_IsDeleted" boolean default false);
      ${['Job_Costing_Lines','FIN_Documents','FIN_DocumentLineJobLinks','FIN_Accruals','FIN_WIPItems','FIN_Periods','FIN_PeriodCloseRuns','FIN_PeriodCloseRunItems','FIN_PostingBatches','FIN_PostingLines','FIN_NominalAccounts','Audit_Events'].map(table).join('\n')}
      ${['Job_Costing_Lines:JobCostingLine_ID','FIN_Accruals:FINAccrual_ID','FIN_WIPItems:FINWIP_ID','FIN_Periods:FINPeriod_ID','FIN_PeriodCloseRuns:FINCloseRun_ID','FIN_PeriodCloseRunItems:FINCloseItem_ID','FIN_PostingBatches:FINPostBatch_ID','FIN_Documents:FINDoc_ID','FIN_NominalAccounts:FINNom_ID'].map(value => { const [t,c] = value.split(':'); return `alter table "${t}" add primary key("${c}");` }).join('\n')}
      create table "FIN_CostPolicies"(id uuid primary key,legal_entity_id uuid,revision integer,approved_by uuid);
      create table "FIN_CostEvidence"(id uuid primary key,legal_entity_id uuid,charge_id uuid,service_completed_on date,source_revision text,disputed boolean,recorded_at timestamptz default now());
      alter table "FIN_CostEvidence" add column is_final boolean default false;
      create table "FIN_CostFinalisations"(charge_id uuid,status text);
      create table "FIN_CostControlAudit"(id uuid primary key default gen_random_uuid(),legal_entity_id uuid,actor_id uuid,action text,record_id uuid,snapshot jsonb);
      create table "FIN_ChargeMappingCutovers"(id uuid primary key,legal_entity_id uuid,status text,effective_date date,mapping_snapshot jsonb);
      create table "FIN_ChargeLifecycleQueue"(legal_entity_id uuid,charge_id uuid,source_revision bigint,status text,reason text,next_action text,amount_local numeric,attempted_revision bigint,attempted_at timestamptz,attempts integer default 0,event_types text[] default '{}',primary key(legal_entity_id,charge_id));
      create function public._multideck_charge_lifecycle_enqueue(p_entity uuid,p_charge uuid,p_event text,p_table text,p_id uuid) returns void language plpgsql as $$
      begin update "FIN_ChargeLifecycleQueue" set source_revision=source_revision+1,status='pending' where legal_entity_id=p_entity and charge_id=p_charge; end $$;
      create function public._multideck_cost_source(p_entity uuid,p_charge uuid) returns jsonb language sql stable as $$
        select jsonb_build_object('charge',to_jsonb(l),'job',jsonb_build_object('id',j."Job_ID",'status',j."Job_Status",'deleted',j."Job_IsDeleted"),
          'documents',coalesce((select jsonb_agg(jsonb_build_object('link',to_jsonb(k),'document',to_jsonb(d))) from "FIN_DocumentLineJobLinks" k
          join "FIN_Documents" d on d."FINDoc_ID"=k."FINDocLineJob_DocumentID" where k."FINDocLineJob_JobCostingLineID"=l."JobCostingLine_ID"),'[]'::jsonb))
        from "Job_Costing_Lines" l join "Job_Header" j on j."Job_ID"=l."Job_ID" where l."JobCostingLine_ID"=p_charge and j."Job_LegalEntityID"=p_entity $$;
      create function public._multideck_validate_nominal_group(uuid,uuid,text) returns jsonb language sql stable as $$
        select jsonb_build_object('id','${id(30)}','accrued',jsonb_build_object('id','${id(31)}'),
          'control_account_id','${id(32)}') $$;
      create function public._multideck_finance_mirror_state(uuid) returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean)
        language sql as $$select 'disabled'::text,false,true$$;
      ${authority}
      ${recognition}
      ${correction}
      ${noBalanceResolution}
      insert into "cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(4)}','${id(2)}','active'),('${id(9)}','${id(8)}','active');
      insert into "cmp_LegalEntities" values('${id(3)}','${id(2)}','GBP'),('${id(7)}','${id(8)}','GBP');
      insert into permissions select actor,permission from (values('${id(1)}'::uuid),('${id(4)}'::uuid)) actor(actor)
        cross join (values('Finance.Management.View'),('Finance.Management.Prepare'),('Finance.Management.Approve'),('Finance.Management.Post')) permission(permission);
      insert into "Job_Header"("Job_ID","Job_LegalEntityID") values('${id(10)}','${id(3)}'),('${id(11)}','${id(7)}');
      insert into "Job_Costing_Lines"("JobCostingLine_ID","Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_DomainCode","JobCostingLine_CostAmountLocal","JobCostingLine_RevenueAmountLocal","JobCostingLine_ChargeCodeID","JobCostingLine_CreatedBy")
        values('${id(20)}','${id(10)}',1,'Handling','freight',100,150,'${id(29)}','${id(1)}'),
          ('${id(21)}','${id(11)}',1,'Foreign','freight',200,300,'${id(29)}','${id(9)}');
      insert into "FIN_Periods"("FINPeriod_ID","FINPeriod_LegalEntityID","FINPeriod_Code","FINPeriod_Name","FINPeriod_StartDate","FINPeriod_EndDate","FINPeriod_BaseCurrencyCode")
        values('${id(40)}','${id(3)}',to_char(current_date,'YYYYMM'),'Current',date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,'GBP');
      insert into "FIN_CostPolicies" values('${id(41)}','${id(3)}',1,'${id(4)}');
      insert into "FIN_NominalAccounts"("FINNom_ID","FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode")
        values('${id(31)}','${id(3)}','5000','Accrued cost','expense'),('${id(32)}','${id(3)}','2300','Accrual control','liability');
      insert into "FIN_ChargeMappingCutovers" values('${id(42)}','${id(3)}','active',current_date-1,
        jsonb_build_object('${id(29)}',jsonb_build_object('cost',public._multideck_validate_nominal_group('${id(3)}','${id(30)}','cost'),
          'revenue',public._multideck_validate_nominal_group('${id(3)}','${id(30)}','revenue'))));
      insert into "FIN_ChargeLifecycleQueue" values('${id(3)}','${id(20)}',1,'pending',null,null,null,null,null,0);
      insert into "FIN_RecognitionMandates"(id,legal_entity_id,policy_id,cost_enabled,revenue_enabled,revenue_service_rule,effective_date,status,prepared_by,approved_by,approved_at,approval_reason)
        values('${id(43)}','${id(3)}','${id(41)}',true,true,'Recognise completed service confirmed by finance',current_date-1,'active','${id(1)}','${id(4)}',now(),'Approved scoped recognition mandate');
      insert into "FIN_CostEvidence"(id,legal_entity_id,charge_id,service_completed_on,source_revision,disputed)
        values('${id(44)}','${id(3)}','${id(20)}',current_date,md5(public._multideck_cost_source('${id(3)}','${id(20)}')::text),false);`)
    const post = (revision, kind) => `select public.multideck_charge_recognise_initial('${id(3)}','${id(20)}',${revision},'${kind}');`
    const cost = JSON.parse(sql(post(1,'cost')))
    assert.equal(cost.status, 'posted')
    assert.equal(cost.amountLocal, '100.0000')
    assert.equal(sql(`select "FINPostBatch_DebitTotal"="FINPostBatch_CreditTotal" from "FIN_PostingBatches" where "FINPostBatch_ID"='${cost.batchId}'`), 't')
    assert.equal(sql(`select count(*) from "FIN_PostingLines" where "FINPostLine_BatchID"='${cost.batchId}'`), '2')
    assert.equal(sql(`select source_revision from "FIN_ChargeLifecycleQueue" where charge_id='${id(20)}'`), '1')
    assert.equal(JSON.parse(sql(post(1,'cost'))).status, 'already_recognised')
    assert.match(reject(`insert into "FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_AccountingDate")
      values('${id(10)}','${id(20)}','${id(40)}',current_date);`), /already has event recognition/)
    assert.match(reject(`select public.multideck_charge_recognise_initial('${id(7)}','${id(20)}',1,'cost');`), /Charge event not found/)
    sql(`insert into "FIN_RevenueServiceEvidence"(legal_entity_id,charge_id,source_revision,service_completed_on,reason,recorded_by)
      values('${id(3)}','${id(20)}',md5(public._multideck_cost_source('${id(3)}','${id(20)}')::text),current_date,'Service completed and checked','${id(1)}');`)
    assert.equal(JSON.parse(sql(post(1,'revenue'))).status, 'posted')
    assert.equal(sql(`select count(*) from "FIN_ChargeEventRecognitions" where charge_id='${id(20)}'`), '2')
    const action = (actor, name, input) => `select public.multideck_finance_recognition_controls('${id(actor)}','${id(3)}','${name}','${JSON.stringify(input)}');`
    assert.match(reject(action(9,'read',{})), /No finance access/)
    assert.equal(JSON.parse(sql(action(1,'pause',{id:id(43),reason:'Pause completed service recognition'}))).status, 'paused')
    const proposal = JSON.parse(sql(action(1,'propose',{policyId:id(41),costEnabled:true,revenueEnabled:false,effectiveDate:new Date().toISOString().slice(0,10),reason:'Resume cost recognition after review'})))
    assert.equal(proposal.status, 'proposed')
    assert.match(reject(action(1,'activate',{id:proposal.id,reason:'Approve the new recognition mandate'})), /independent colleague/)
    assert.equal(JSON.parse(sql(action(4,'activate',{id:proposal.id,reason:'Approve the new recognition mandate'}))).status, 'active')
    sql(`update "Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=80 where "JobCostingLine_ID"='${id(20)}';
      insert into "FIN_CostEvidence"(id,legal_entity_id,charge_id,service_completed_on,source_revision,disputed)
        values('${id(45)}','${id(3)}','${id(20)}',current_date,md5(public._multideck_cost_source('${id(3)}','${id(20)}')::text),false);`)
    const correctionAction = (actor, kind, name, input) => `select public.multideck_finance_charge_correction('${id(actor)}','${id(3)}','${id(20)}','${kind}','${name}','${JSON.stringify(input)}');`
    const preview = JSON.parse(sql(correctionAction(1,'cost','read',{}))).snapshot
    assert.equal(preview.delta, -20)
    const reduction = JSON.parse(sql(correctionAction(1,'cost','prepare',{reason:'Reduce accrued cost after estimate revision'})))
    assert.match(reject(correctionAction(1,'cost','approve',{reviewId:reduction.id,reason:'Approve cost estimate correction'})), /independent finance operator/)
    const reduced = JSON.parse(sql(correctionAction(4,'cost','approve',{reviewId:reduction.id,reason:'Approve cost estimate correction'})))
    assert.equal(reduced.status, 'posted')
    assert.equal(reduced.delta, '-20.0000')
    assert.equal(sql(`select sum("FINAccrual_AccruedAmount"-"FINAccrual_RelievedAmount") from "FIN_Accruals" where "FINAccrual_JobCostingLineID"='${id(20)}'`), '80.0000')
    assert.match(reject(correctionAction(4,'cost','approve',{reviewId:reduction.id,reason:'Approve cost estimate correction'})), /No balance correction|independent finance operator/)
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID") values
      ('${id(61)}','pl_invoice','${id(3)}',null,'posted','${id(62)}'),
      ('${id(65)}','debit_note','${id(3)}',null,'posted','${id(66)}');
      insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LocalNetAmount") values
        ('${id(61)}','${id(63)}','${id(10)}','${id(20)}',60),('${id(65)}','${id(68)}','${id(10)}','${id(20)}',20);
      update "FIN_Accruals" set "FINAccrual_RelievedAmount"="FINAccrual_RelievedAmount"+60,"FINAccrual_StatusCode"='partially_reversed'
        where "FINAccrual_JobCostingLineID"='${id(20)}' and "FINAccrual_AccruedAmount"=100;
      insert into "FIN_CostEvidence"(id,legal_entity_id,charge_id,service_completed_on,source_revision,disputed)
        values('${id(69)}','${id(3)}','${id(20)}',current_date,md5(public._multideck_cost_source('${id(3)}','${id(20)}')::text),false);`)
    const creditPreview = JSON.parse(sql(correctionAction(1,'cost','read',{}))).snapshot
    assert.equal(creditPreview.actual, 40)
    assert.equal(creditPreview.current, 20)
    assert.equal(creditPreview.delta, 20)
    const staleCredit = JSON.parse(sql(correctionAction(1,'cost','prepare',{reason:'Restore cost after supplier debit note'})))
    sql(`update "FIN_ChargeLifecycleQueue" set source_revision=source_revision+1 where charge_id='${id(20)}';`)
    assert.match(reject(correctionAction(4,'cost','approve',{reviewId:staleCredit.id,reason:'Approve debit note restoration'})), /evidence changed/)
    const credit = JSON.parse(sql(correctionAction(1,'cost','prepare',{reason:'Restore cost after supplier debit note'})))
    sql(`update "FIN_Periods" set "FINPeriod_StatusCode"='locked' where "FINPeriod_ID"='${id(40)}';`)
    assert.match(reject(correctionAction(4,'cost','approve',{reviewId:credit.id,reason:'Approve debit note restoration'})), /Current accounting period must be open/)
    sql(`update "FIN_Periods" set "FINPeriod_StatusCode"='open' where "FINPeriod_ID"='${id(40)}';`)
    const restored = JSON.parse(sql(correctionAction(4,'cost','approve',{reviewId:credit.id,reason:'Approve debit note restoration'})))
    assert.equal(restored.status, 'posted')
    assert.equal(restored.delta, '20.0000')
    assert.equal(sql(`select sum("FINAccrual_AccruedAmount"-"FINAccrual_RelievedAmount") from "FIN_Accruals" where "FINAccrual_JobCostingLineID"='${id(20)}'`), '40.0000')
    assert.equal(sql(`select "FINPostBatch_DebitTotal"="FINPostBatch_CreditTotal" from "FIN_PostingBatches" where "FINPostBatch_ID"='${restored.postingBatchId}'`), 't')
    assert.match(reject(`select public.multideck_finance_charge_correction('${id(9)}','${id(3)}','${id(20)}','cost','read','{}');`), /No finance access/)
    sql(`insert into "FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_LegalEntityID","FINDoc_NativePostingStatusCode","FINDoc_NativePostingBatchID") values
      ('${id(71)}','sl_invoice','${id(3)}','posted','${id(72)}'),
      ('${id(75)}','credit_note','${id(3)}','posted','${id(76)}');
      insert into "FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LocalNetAmount") values
        ('${id(71)}','${id(73)}','${id(10)}','${id(20)}',100),('${id(75)}','${id(78)}','${id(10)}','${id(20)}',30);
      update "FIN_WIPItems" set "FINWIP_RelievedAmount"=100,"FINWIP_StatusCode"='partially_reversed'
        where "FINWIP_JobCostingLineID"='${id(20)}' and "FINWIP_WIPAmount"=150;
      insert into "FIN_RevenueServiceEvidence"(legal_entity_id,charge_id,source_revision,service_completed_on,reason,recorded_by)
        values('${id(3)}','${id(20)}',md5(public._multideck_cost_source('${id(3)}','${id(20)}')::text),current_date,'Billable service still complete','${id(1)}');`)
    const revenuePreview = JSON.parse(sql(correctionAction(1,'revenue','read',{}))).snapshot
    assert.equal(revenuePreview.actual, 70)
    assert.equal(revenuePreview.current, 50)
    assert.equal(revenuePreview.delta, 30)
    const revenueReview = JSON.parse(sql(correctionAction(1,'revenue','prepare',{reason:'Restore WIP after customer credit note'})))
    const revenueRestored = JSON.parse(sql(correctionAction(4,'revenue','approve',{reviewId:revenueReview.id,reason:'Approve customer credit restoration'})))
    assert.equal(revenueRestored.delta, '30.0000')
    assert.equal(sql(`select sum("FINWIP_WIPAmount"-"FINWIP_RelievedAmount") from "FIN_WIPItems" where "FINWIP_JobCostingLineID"='${id(20)}'`), '80.0000')
    sql(`insert into "FIN_CostEvidence"(id,legal_entity_id,charge_id,service_completed_on,source_revision,disputed)
      values('${id(79)}','${id(3)}','${id(20)}',current_date,md5(public._multideck_cost_source('${id(3)}','${id(20)}')::text),false);
      update "FIN_ChargeLifecycleQueue" set status='review',reason='Late source reviewed',source_revision=source_revision+1
      where charge_id='${id(20)}';`)
    const resolve = (actor, name, input) => `select public.multideck_finance_charge_case_resolution('${id(actor)}','${id(3)}','${id(20)}','${name}','${JSON.stringify(input)}');`
    const resolutionSnapshot = JSON.parse(sql(resolve(1,'read',{}))).snapshot
    assert.deepEqual(resolutionSnapshot.blockers, [])
    assert.equal(resolutionSnapshot.cost.delta, 0)
    assert.equal(resolutionSnapshot.revenue.delta, 0)
    const noBalanceReview = JSON.parse(sql(resolve(1,'prepare',{reason:'No balance changed after late source review'})))
    assert.match(reject(resolve(1,'approve',{reviewId:noBalanceReview.id,reason:'Approve no balance case outcome'})), /independent finance operator/)
    sql(`update "FIN_ChargeLifecycleQueue" set source_revision=source_revision+1 where charge_id='${id(20)}';`)
    assert.match(reject(resolve(4,'approve',{reviewId:noBalanceReview.id,reason:'Approve no balance case outcome'})), /evidence changed/)
    const freshReview = JSON.parse(sql(resolve(1,'prepare',{reason:'No balance changed after late source review'})))
    assert.equal(JSON.parse(sql(resolve(4,'approve',{reviewId:freshReview.id,reason:'Approve no balance case outcome'}))).status, 'approved')
    assert.equal(sql(`select status from "FIN_ChargeLifecycleQueue" where charge_id='${id(20)}'`), 'settled')
    assert.match(reject(resolve(4,'approve',{reviewId:freshReview.id,reason:'Approve no balance case outcome'})), /Resolve case blockers/)
    assert.match(reject(`select public.multideck_finance_charge_case_resolution('${id(9)}','${id(3)}','${id(20)}','read','{}');`), /No finance access/)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
  }
})
