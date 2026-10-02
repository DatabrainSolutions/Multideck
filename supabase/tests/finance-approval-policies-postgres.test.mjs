import assert from 'node:assert/strict'
import test from 'node:test'
import { currentFunction } from './operational-access-source.mjs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const migration = readFileSync(new URL('../migrations/20260925103000_finance_approval_policies.sql', import.meta.url), 'utf8')
const submissions = readFileSync(new URL('../migrations/20260925103100_finance_policy_document_cash_submission.sql', import.meta.url), 'utf8')
const dexter = readFileSync(new URL('../migrations/20260925104200_finance_approval_dexter_parity.sql', import.meta.url), 'utf8')
const decisionLock = readFileSync(new URL('../migrations/20260926095252_finance_approval_decision_entity_lock.sql', import.meta.url), 'utf8')
const receivables = readFileSync(new URL('../migrations/20260929135845_receivables_exception_approvals.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('entity-scoped approval policy defaults to review and audits bounded changes', async () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const dir = mkdtempSync(join(tmpdir(), 'finance-approval-'))
  let started = false
  const run = (command, args, input, expected = 0) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, expected, result.stderr)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = statement => run('psql', args, statement)
  const reject = statement => {
    const result = spawnSync(join(bin, 'psql'), args, { input: statement, encoding: 'utf8', timeout: 30000 })
    assert.notEqual(result.status, 0)
    return result.stderr
  }
  const decision = (company, entity, amount, context = { hardException: false, advisoryException: false }) =>
    JSON.parse(sql(`select public.multideck_finance_approval_decision('${id(company)}','${id(entity)}','document',${amount},'${JSON.stringify(context)}');`))
  try {
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role;
      create table public."cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,"User_AccessStatus" text);
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean,"LegalEntity_Name" text,"LegalEntity_BaseCurrencyCodeSnapshot" text);
      create table public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code" text primary key,"WorkflowRecordType_Name" text,"WorkflowRecordType_SourceTable" text,"WorkflowRecordType_Description" text,"WorkflowRecordType_IsActive" boolean,"WorkflowRecordType_SortOrder" integer);
      create table public."FIN_Documents"("FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid,"FINDoc_TypeCode" text,"FINDoc_CurrencyCodeSnapshot" text,"FINDoc_LocalGrossAmount" numeric,"FINDoc_SourceKindCode" text,"FINDoc_StatusCode" text,"FINDoc_AccountingDate" date);
      create table public."FIN_CashTransactions"("FINCash_ID" uuid primary key,"FINCash_LegalEntityID" uuid,"FINCash_TypeCode" text,"FINCash_CurrencyCodeSnapshot" text,"FINCash_LocalAmount" numeric,"FINCash_UnallocatedAmount" numeric,"FINCash_StatusCode" text,"FINCash_AccountingDate" date);
      create table public."FIN_Periods"("FINPeriod_LegalEntityID" uuid,"FINPeriod_StartDate" date,"FINPeriod_EndDate" date,"FINPeriod_StatusCode" text);
      create table public."sys_AIDexterDataDomains"("AIDexterDomain_Code" text,"AIDexterDomain_Description" text,"AIDexterDomain_UpdatedAt" timestamptz);
      create table public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code" text,"AIDexterWatchCapability_Description" text,"AIDexterWatchCapability_FieldsJSON" jsonb,"AIDexterWatchCapability_UpdatedAt" timestamptz);
      create table public."AI_DexterWatches"("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_OwnerUserID" uuid,"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
      create table public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,"AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
      create table public."Audit_Events"("AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,"AuditEvent_LegalEntityID" uuid,
        "AuditEvent_SourceApp" text,"AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,"AuditEvent_SourceTableName" text,
        "AuditEvent_RecordTypeCode" text,"AuditEvent_RecordID" uuid,"AuditEvent_Action" text,"AuditEvent_Title" text,"AuditEvent_MetadataJSON" jsonb);
      create function public._multideck_journal_access(p_actor uuid,p_entity uuid,p_permission text) returns void language plpgsql as $$
      begin if not exists(select 1 from public."cmp_Users" u join public."cmp_LegalEntities" e on e."Company_ID"=u."Company_ID"
        where u."User_ID"=p_actor and e."LegalEntity_ID"=p_entity and u."User_AccessStatus"='active' and e."LegalEntity_IsActive")
        then raise exception 'No configuration access' using errcode='42501'; end if; end $$;
      create function public._multideck_finance_mirror_state(p_entity uuid) returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean)
        language sql as $$select 'disabled'::text,false,true$$;
      create function public._multideck_dexter_has_permission(p_actor uuid,p_permission text) returns boolean language sql stable as $$
        select exists(select 1 from public."cmp_Users" where "User_ID"=p_actor and "User_AccessStatus"='active')$$;
      create function public.multideck_dexter_domain_finance(uuid,text,integer) returns jsonb language sql stable as $$select '[]'::jsonb$$;
      create function public.multideck_finance_transition_document(p_company_id uuid,p_user_id uuid,p_document_id uuid,p_transition text,p_reason text) returns jsonb language plpgsql as $$
      declare v_entity uuid; v_status text; begin
        select "FINDoc_LegalEntityID" into v_entity from public."FIN_Documents" where "FINDoc_ID"=p_document_id;
        if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity and "Company_ID"=p_company_id) then raise exception 'Wrong entity'; end if;
        update public."FIN_Documents" set "FINDoc_StatusCode"=case when p_transition='request_review' then 'awaiting_approval' else 'approved' end
        where "FINDoc_ID"=p_document_id and "FINDoc_StatusCode"=case when p_transition='request_review' then 'draft' else 'awaiting_approval' end
        returning "FINDoc_StatusCode" into v_status;
        if v_status is null then raise exception 'Invalid transition'; end if;
        return jsonb_build_object('FINDoc_ID',p_document_id,'FINDoc_StatusCode',v_status);
      end $$;
      create function public.multideck_finance_transition_cash(p_company_id uuid,p_user_id uuid,p_cash_id uuid,p_transition text,p_reason text) returns jsonb language plpgsql as $$
      declare v_entity uuid; v_status text; begin
        select "FINCash_LegalEntityID" into v_entity from public."FIN_CashTransactions" where "FINCash_ID"=p_cash_id;
        if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity and "Company_ID"=p_company_id) then raise exception 'Wrong entity'; end if;
        update public."FIN_CashTransactions" set "FINCash_StatusCode"=case when p_transition='request_review' then 'awaiting_approval' else 'approved' end
        where "FINCash_ID"=p_cash_id and "FINCash_StatusCode"=case when p_transition='request_review' then 'draft' else 'awaiting_approval' end
        returning "FINCash_StatusCode" into v_status;
        if v_status is null then raise exception 'Invalid transition'; end if;
        return jsonb_build_object('FINCash_ID',p_cash_id,'FINCash_StatusCode',v_status);
      end $$;
      ${migration}
      ${submissions}
      ${dexter}
      ${decisionLock}
      insert into public."sys_AIDexterDataDomains" values('finance','Original',now());
      insert into public."sys_AIDexterWatchCapabilities" values('finance','Original','["status"]',now());
      insert into public."cmp_Users" values('${id(1)}','${id(2)}','active'),('${id(5)}','${id(6)}','active');
      insert into public."cmp_LegalEntities" values('${id(3)}','${id(2)}',true,'Entity A','GBP'),('${id(7)}','${id(6)}',true,'Entity B','GBP');
      insert into public."AI_DexterWatches" values('${id(2)}','${id(1)}','finance','active','${id(3)}'),('${id(6)}','${id(5)}','finance','active','${id(7)}');
      insert into public."FIN_Periods" values('${id(3)}','2026-09-01','2026-09-30','open');
      insert into public."FIN_Documents" values('${id(10)}','${id(3)}','sl_invoice','GBP',500,'job','draft','2026-09-25'),('${id(11)}','${id(3)}','sl_invoice','EUR',500,'job','draft','2026-09-25'),('${id(12)}','${id(3)}','credit_note','GBP',-200,'job','draft','2026-09-25'),('${id(13)}','${id(7)}','sl_invoice','GBP',100,'job','draft','2026-09-25'),('${id(14)}','${id(3)}','sl_invoice','GBP',100,'job','draft','2026-10-25');
      insert into public."FIN_CashTransactions" values('${id(20)}','${id(3)}','customer_receipt','GBP',100,0,'draft','2026-09-25'),('${id(21)}','${id(3)}','supplier_payment','GBP',100,100,'draft','2026-09-25'),('${id(22)}','${id(3)}','customer_receipt','GBP',100,0,'draft','2026-09-25');
      update public."cmp_LegalEntities" set "LegalEntity_IsActive"=true;`)
    assert.deepEqual(decision(2, 3, 100), { mode: 'always_review', canAuto: false, reason: 'policy_missing', revision: null, policyId: null })
    assert.match(reject(`select public.multideck_finance_approval_decision('${id(2)}','${id(7)}','document',1,'{}');`), /outside this workspace/)
    assert.match(reject(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(7)}','document','automatic',100,null,'Cross tenant');`), /No configuration access/)
    assert.match(reject(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','document','automatic',null,null,'Unbounded');`), /amount limit/)
    const first = JSON.parse(sql(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','document','exception_review',1000,5,'Bound low-risk invoices');`))
    assert.equal(first.revision, 1)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(2)}'`), '1')
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(6)}'`), '0')
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(2)}','approval policy',25);`))[0].recordKind, 'approval_policy')
    assert.deepEqual(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(6)}','approval policy',25);`)), [])
    assert.equal(decision(2, 3, 500, { hardException: false, advisoryException: false, variancePercent: 2 }).canAuto, true)
    assert.equal(decision(2, 3, 500, { hardException: false, advisoryException: true, variancePercent: 2 }).reason, 'advisory_exception')
    assert.equal(decision(2, 3, 1001, { hardException: false, advisoryException: false, variancePercent: 2 }).reason, 'amount_limit')
    assert.equal(decision(2, 3, 500, { hardException: false, advisoryException: false, variancePercent: 6 }).reason, 'variance_limit')
    assert.equal(decision(2, 3, 500, {}).reason, 'missing_exception_evidence')
    assert.match(reject(`update public."FIN_ApprovalPolicies" set "FINApprovalPolicy_MaxAutoAmount"=9999 where "FINApprovalPolicy_ID"='${first.policyId}';`), /immutable/)
    sql(`update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_CompanyID"='${id(2)}';`)
    const second = JSON.parse(sql(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','document','automatic',2000,null,'Increase bounded automation');`))
    assert.equal(second.revision, 2)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(2)}'`), '1')
    assert.equal(JSON.parse(sql(`select public.multideck_finance_list_approval_policies('${id(2)}','${id(3)}');`)).length, 1)
    assert.equal(decision(2, 3, 1500, { hardException: false, advisoryException: true }).canAuto, true)
    assert.equal(decision(2, 3, 1500, { hardException: true, advisoryException: false }).reason, 'hard_exception')
    assert.equal(sql('select count(*) from public."Audit_Events"'), '2')
    const submitDocument = number => JSON.parse(sql(`select public.multideck_finance_submit_document('${id(2)}','${id(1)}','${id(number)}','Submit');`))
    const reviewed = submitDocument(10)
    assert.equal(reviewed.FINDoc_StatusCode, 'approved')
    assert.equal(reviewed.approvalPolicyDecision.revision, 2)
    assert.equal(submitDocument(11).FINDoc_StatusCode, 'awaiting_approval')
    assert.equal(submitDocument(12).FINDoc_StatusCode, 'awaiting_approval')
    assert.equal(submitDocument(14).approvalPolicyDecision.reason, 'hard_exception')
    assert.match(reject(`select public.multideck_finance_submit_document('${id(2)}','${id(1)}','${id(13)}','Submit');`), /not found in this workspace/)
    const cashReview = JSON.parse(sql(`select public.multideck_finance_submit_cash('${id(2)}','${id(1)}','${id(20)}','Submit');`))
    assert.equal(cashReview.FINCash_StatusCode, 'awaiting_approval')
    sql(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','cash','exception_review',500,null,'Bound cash');`)
    const cashAuto = JSON.parse(sql(`select public.multideck_finance_submit_cash('${id(2)}','${id(1)}','${id(21)}','Submit');`))
    assert.equal(cashAuto.FINCash_StatusCode, 'awaiting_approval')
    const cashEligible = JSON.parse(sql(`select public.multideck_finance_submit_cash('${id(2)}','${id(1)}','${id(22)}','Submit');`))
    assert.equal(cashEligible.FINCash_StatusCode, 'approved')
    sql(`update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_CompanyID"='${id(2)}';`)
    sql(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','document','always_review',null,null,'Return to mandatory review');`)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${id(2)}'`), '2')
    const writer = spawn(join(bin, 'psql'), args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 })
    let writerOutput = '', writerError = ''
    writer.stderr.on('data', chunk => { writerError += chunk })
    const writerReady = new Promise((resolve, rejectReady) => {
      writer.stdout.on('data', chunk => {
        writerOutput += chunk
        if (writerOutput.includes('policy_saved')) resolve()
      })
      writer.once('error', rejectReady)
      writer.once('exit', code => {
        if (!writerOutput.includes('policy_saved')) rejectReady(new Error(`Policy writer exited ${code}: ${writerError}`))
      })
    })
    const writerDone = new Promise(resolve => writer.once('close', resolve))
    writer.stdin.write(`begin; select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','document','automatic',100,null,'Concurrent policy revision');\n\\echo policy_saved\n`)
    await writerReady
    assert.match(reject(`set lock_timeout='150ms'; select public.multideck_finance_approval_decision('${id(2)}','${id(3)}','document',50,'{"hardException":false,"advisoryException":false}');`), /canceling statement due to lock timeout/)
    writer.stdin.end('commit;\n')
    assert.equal(await writerDone, 0, writerError)
    const concurrentDecision = decision(2, 3, 50)
    assert.equal(concurrentDecision.revision, 4)
    assert.equal(concurrentDecision.canAuto, true)
    assert.match(reject(`set role authenticated; select public.multideck_finance_approval_decision('${id(2)}','${id(3)}','document',1,'{}');`), /permission denied/)
    // Apply the new migration after proving the existing fallback behaviour.
    sql(`
      alter table public."FIN_Documents" add column "FINDoc_SourceJobID" uuid,
        add column "FINDoc_MetadataJSON" jsonb default '{}';
      create table public."cmp_Offices"("Office_ID" uuid primary key,"Company_ID" uuid);
      create table public."Job_Header"("Job_ID" uuid primary key,"Job_LegalEntityID" uuid,"Job_Number" integer,"Job_Period" text,
        "Job_OfficeID" uuid,"Job_OrgOfficeID" uuid,"Job_IsDeleted" boolean default false);
      create table public."Job_Costing_Lines"("JobCostingLine_ID" uuid primary key,"Job_ID" uuid references public."Job_Header"("Job_ID"),
        "JobCostingLine_RevenueAmountLocal" numeric,"JobCostingLine_CostAmountLocal" numeric);
      create table public."FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID" uuid,"FINDocLineJob_JobID" uuid);
      ${currentFunction('public', '_multideck_dexter_evaluate_watch_signal').sql}
      ${receivables}
      insert into public."cmp_Offices" values('${id(30)}','${id(2)}'),('${id(31)}','${id(6)}');
      insert into public."Job_Header"("Job_ID","Job_LegalEntityID","Job_Number","Job_Period","Job_OfficeID") values
        ('${id(40)}','${id(3)}',40,'202609','${id(30)}'),
        ('${id(41)}','${id(3)}',41,'202609','${id(30)}'),
        ('${id(42)}','${id(3)}',42,'202609','${id(30)}'),
        ('${id(43)}','${id(3)}',43,'202609','${id(30)}'),
        ('${id(44)}','${id(7)}',44,'202609','${id(31)}'),
        ('${id(45)}','${id(3)}',45,'202609','${id(30)}'),
        ('${id(46)}','${id(3)}',46,'202609','${id(30)}');
      insert into public."Job_Costing_Lines" values
        ('${id(50)}','${id(40)}',1000,800),
        ('${id(51)}','${id(41)}',1000,1100),
        ('${id(52)}','${id(42)}',1000,1000),
        ('${id(53)}','${id(43)}',1000,null),
        ('${id(54)}','${id(44)}',999999,123),
        ('${id(55)}','${id(45)}',0,0);
    `)
    const saveAR = (amount, margin = 0, mode = 'exception_review') => JSON.parse(sql(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','receivables','${mode}',${amount},null,'Configure receivables exceptions',${margin});`))
    const draftAR = (number, { amount = 100, job = 40, type = 'sl_invoice', currency = 'GBP', companyEntity = 3 } = {}) => sql(`
      insert into public."FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_TypeCode","FINDoc_CurrencyCodeSnapshot",
        "FINDoc_LocalGrossAmount","FINDoc_SourceKindCode","FINDoc_StatusCode","FINDoc_AccountingDate","FINDoc_SourceJobID")
      values('${id(number)}','${id(companyEntity)}','${type}','${currency}',${amount},'${job === null ? 'manual' : 'job'}','draft','2026-09-25',${job === null ? 'null' : `'${id(job)}'`});`)
    draftAR(60, { type: 'credit_note', amount: -100 })
    assert.equal(submitDocument(60).FINDoc_StatusCode, 'awaiting_approval', 'Credit stays in legacy review until AR policy is explicitly saved')
    assert.match(reject(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','receivables','automatic',1000,null,'Unsafe mode',0);`), /exception review/)
    assert.match(reject(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','receivables','exception_review',1000,null,'Invalid margin',-1);`), /minimum expected job margin/)
    assert.match(reject(`select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','receivables','exception_review',1000,5,'Wrong benchmark',0);`), /expected job margin/)
    assert.match(reject(`select public.multideck_finance_save_approval_policy('${id(6)}','${id(5)}','${id(3)}','receivables','exception_review',1000,null,'Foreign user',0);`), /No configuration access/)
    const arPolicy = saveAR(1000)
    assert.equal(arPolicy.minExpectedMarginPercent, 0)
    const listed = JSON.parse(sql(`select public.multideck_finance_list_approval_policies('${id(2)}','${id(3)}');`))
    assert.equal(listed.find(policy => policy.workflow === 'receivables').maxAutoAmount, 1000)
    const chatPolicy = JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(2)}','approval policy',25);`)).find(policy => policy.workflow === 'receivables')
    assert.equal(chatPolicy.minExpectedMarginPercent, 0)
    assert.equal(chatPolicy.benchmark, 'expected_sales_and_costs')
    assert.equal(chatPolicy.recordId, arPolicy.policyId)
    assert.equal(JSON.parse(sql(`select public.multideck_dexter_domain_finance('${id(6)}','approval policy',25);`)).length, 0)
    draftAR(61)
    const partialInvoice = submitDocument(61)
    assert.equal(partialInvoice.FINDoc_StatusCode, 'approved', 'A small partial invoice uses the entire expected job, not invoice minus entire cost')
    assert.equal(partialInvoice.approvalPolicyDecision.jobs[0].expectedProfit, 200)
    assert.equal(partialInvoice.approvalPolicyDecision.jobs[0].expectedMarginPercent, 20)
    draftAR(62, { type: 'credit_note', amount: -200 })
    assert.equal(submitDocument(62).FINDoc_StatusCode, 'approved', 'Credit notes follow the same rules')
    draftAR(63, { amount: 1000 })
    assert.equal(submitDocument(63).FINDoc_StatusCode, 'approved', 'Exactly at threshold is allowed')
    draftAR(64, { type: 'credit_note', amount: -1000.01 })
    assert.equal(submitDocument(64).approvalPolicyDecision.reason, 'amount_limit', 'Absolute gross credit amount counts')
    draftAR(65, { job: 41 })
    const loss = submitDocument(65)
    assert.equal(loss.FINDoc_StatusCode, 'awaiting_approval')
    assert.ok(loss.approvalPolicyDecision.reasons.includes('expected_job_loss'))
    assert.equal(loss.approvalPolicyDecision.jobs[0].expectedProfit, -100)
    draftAR(66, { job: 42 })
    assert.equal(submitDocument(66).FINDoc_StatusCode, 'approved', 'Break-even is not a loss')
    draftAR(67, { job: 43 })
    assert.ok(submitDocument(67).approvalPolicyDecision.reasons.includes('expected_costing_incomplete'))
    draftAR(68, { job: 44 })
    const foreignJob = submitDocument(68)
    assert.ok(foreignJob.approvalPolicyDecision.reasons.includes('job_scope_unverified'))
    assert.equal(foreignJob.approvalPolicyDecision.jobs.length, 0, 'Foreign costing never leaks')
    draftAR(69, { job: 45 })
    assert.equal(submitDocument(69).FINDoc_StatusCode, 'approved', 'Zero sales and zero costs do not divide by zero')
    draftAR(70, { job: 46 })
    assert.ok(submitDocument(70).approvalPolicyDecision.reasons.includes('expected_costing_incomplete'))
    draftAR(71, { job: null })
    assert.equal(submitDocument(71).FINDoc_StatusCode, 'approved', 'Standalone documents have no invented job benchmark')
    draftAR(72, { currency: 'EUR' })
    assert.ok(submitDocument(72).approvalPolicyDecision.reasons.includes('foreign_currency_review'))
    draftAR(73)
    sql(`insert into public."FIN_DocumentLineJobLinks" values('${id(73)}','${id(41)}');`)
    assert.ok(submitDocument(73).approvalPolicyDecision.reasons.includes('expected_job_loss'), 'Each linked job is checked, not a net across jobs')
    draftAR(74, { companyEntity: 7, job: 44 })
    assert.match(reject(`select public.multideck_finance_submit_document('${id(2)}','${id(1)}','${id(74)}','Submit');`), /not found in this workspace/)
    const tighter = saveAR(1000, 25)
    draftAR(75)
    assert.ok(submitDocument(75).approvalPolicyDecision.reasons.includes('expected_margin_limit'))
    saveAR(1000, 20)
    draftAR(76)
    assert.equal(submitDocument(76).FINDoc_StatusCode, 'approved', 'Margin exactly at limit is allowed')
    draftAR(77, { type: 'pl_invoice' })
    assert.equal(submitDocument(77).approvalPolicyDecision.workflow, 'document', 'Payables keep the existing policy')
    assert.equal(JSON.parse(sql(`select "FINDoc_MetadataJSON"->'approvalPolicyDecision' from public."FIN_Documents" where "FINDoc_ID"='${id(65)}';`)).jobs[0].expectedProfit, -100)
    assert.equal(sql(`select count(*) from public."Audit_Events" where "AuditEvent_RecordID"='${id(65)}' and "AuditEvent_Action"='approval_exception';`), '1')
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_NewJSON"->>'policyId'='${tighter.policyId}' and ("AIDexterWatchSignal_NewJSON"->>'minExpectedMarginPercent')::numeric=25;`), '1')
    // Decision watches are deterministic, target-specific, and silent on unchanged evidence.
    sql(`update public."AI_DexterWatches" set "AIDexterWatch_TargetID"='${id(78)}' where "AIDexterWatch_CompanyID"='${id(2)}';`)
    draftAR(78, { job: 41, type: 'credit_note', amount: -10 })
    submitDocument(78)
    const signalCount = () => sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceID"='${id(78)}';`)
    assert.equal(signalCount(), '1')
    sql(`update public."FIN_Documents" set "FINDoc_MetadataJSON"="FINDoc_MetadataJSON" where "FINDoc_ID"='${id(78)}';`)
    assert.equal(signalCount(), '1')
    draftAR(79, { job: 41 })
    submitDocument(79)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceID"='${id(79)}';`), '0')
    sql(`update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused',"AIDexterWatch_TargetID"='${id(80)}' where "AIDexterWatch_CompanyID"='${id(2)}';`)
    draftAR(80, { job: 41 }); submitDocument(80)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceID"='${id(80)}';`), '0')
    sql(`update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active',"AIDexterWatch_TargetID"='${id(81)}' where "AIDexterWatch_CompanyID"='${id(2)}';`)
    draftAR(81, { job: 41 }); submitDocument(81)
    assert.equal(sql(`select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_SourceID"='${id(81)}';`), '1')
    sql(`update public."cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='${id(1)}';`)
    draftAR(82)
    assert.match(reject(`select public.multideck_finance_submit_document('${id(2)}','${id(1)}','${id(82)}','Submit');`), /No configuration access/)
    assert.match(reject(`set role authenticated; select public.multideck_finance_save_approval_policy('${id(2)}','${id(1)}','${id(3)}','receivables','exception_review',1000,null,'Direct client',0);`), /permission denied/)
    assert.match(reject(`set role anon; select public._multideck_receivables_expected_jobs('${id(2)}','${id(3)}','${id(61)}',0);`), /permission denied/)
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
