import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const migration = readFileSync(new URL('../migrations/20260925103000_finance_approval_policies.sql', import.meta.url), 'utf8')
const submissions = readFileSync(new URL('../migrations/20260925103100_finance_policy_document_cash_submission.sql', import.meta.url), 'utf8')
const dexter = readFileSync(new URL('../migrations/20260925104200_finance_approval_dexter_parity.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('entity-scoped approval policy defaults to review and audits bounded changes', () => {
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
    assert.match(reject(`set role authenticated; select public.multideck_finance_approval_decision('${id(2)}','${id(3)}','document',1,'{}');`), /permission denied/)
  } finally {
    if (started) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
