import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('../', import.meta.url)
const marker = '-- A committed ledger posting must be a complete, balanced double-entry journal.'

test('daily Finance operations install on the tenant baseline and keep browser roles outside privileged records', () => {
  const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
  const directory = mkdtempSync(join(tmpdir(), 'finance-daily-'))
  const baseline = readFileSync(new URL('baseline/public-schema.sql', root), 'utf8')
  const boundary = baseline.indexOf(marker)
  assert.ok(boundary > 0)
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { input, encoding: 'utf8', timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })
    assert.equal(result.status, 0, `${name}: ${result.stderr}\n${result.stdout.slice(-1000)}`)
    return result.stdout.trim()
  }
  const args = ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
  const sql = input => run('psql', args, input)
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '--no-sync', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create role supabase_auth_admin; create role supabase_storage_admin;
      create role supabase_functions_admin; create role pgsodium_keyholder;
      create role pgsodium_keyiduser; create role pgsodium_keymaker;
      create schema auth; create schema storage; create schema vault; create schema extensions;
      create extension pg_trgm with schema extensions;
      create extension pgcrypto with schema extensions;
      create extension btree_gist;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
      create table auth.users(id uuid primary key);`)
    sql(baseline.slice(0, boundary))
    run('psql', [...args, '-f', new URL('migrations/20260918123733_general_ledger_journals.sql', root).pathname])
    sql(`set check_function_bodies=false;\n${baseline.slice(boundary)}`)
    const migrations = process.env.FINANCE_FULL_MIGRATIONS === '1'
      ? readdirSync(new URL('migrations/', root))
        .filter(name => name >= '20260925070431' && name.endsWith('.sql') && !/_(?:uk_vat|hmrc)_/.test(name)).sort()
      : ['20260925070458_finance_daily_operations.sql']
    for (const migration of migrations) {
      assert.ok(readFileSync(new URL(`migrations/${migration}`, root), 'utf8').trimEnd().toLowerCase().endsWith('commit;'),
        `${migration} must finish its transaction before installation`)
      run('psql', [...args, '-f', new URL(`migrations/${migration}`, root).pathname])
    }
    const installed = JSON.parse(sql(`select jsonb_build_object(
      'supplier_pos',to_regclass('public."FIN_SupplierPurchaseOrders"') is not null,
      'invoice_matches',to_regclass('public."FIN_SupplierInvoiceMatches"') is not null,
      'collection_actions',to_regclass('public."FIN_CollectionActions"') is not null,
      'payment_run_prepare',to_regprocedure('public.multideck_finance_prepare_payment_run(uuid,uuid,uuid,jsonb,date,numeric,text)') is not null,
      'payment_run_review',to_regprocedure('public.multideck_finance_review_payment_run(uuid,uuid,uuid,text,text)') is not null,
      'match_trigger',exists(select 1 from pg_trigger where tgname='TR_FIN_SupplierInvoiceMatches_validate' and not tgisinternal),
      'finance_watch',exists(select 1 from pg_trigger where tgname='TR_FIN_CollectionActions_watch' and not tgisinternal),
      'no_browser_po',not has_table_privilege('authenticated','public."FIN_SupplierPurchaseOrders"','SELECT'),
      'no_browser_match',not has_table_privilege('authenticated','public."FIN_SupplierInvoiceMatches"','INSERT'),
      'no_browser_payment',not has_function_privilege('authenticated','public.multideck_finance_prepare_payment_run(uuid,uuid,uuid,jsonb,date,numeric,text)','EXECUTE')
    );`))
    for (const [name, passed] of Object.entries(installed)) assert.equal(passed, true, `${name} is absent or unsafe`)
    assert.equal(sql(`
      set session_replication_role=replica;
      insert into public."cmp_Users"("User_ID","Company_ID","User_Email") values
        ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','maker@example.test'),
        ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','reviewer@example.test');
      insert into public."sys_AuditActorTypes"("AuditActorType_Code","AuditActorType_Name") values('user','User');
      insert into public."sys_AuditOutcomeStatuses"("AuditOutcomeStatus_Code","AuditOutcomeStatus_Name") values('success','Success');
      insert into public."sys_AuditEventTypes"("AuditEventType_Code","AuditEventType_Name") values('finance_lifecycle','Finance lifecycle');
      insert into public."sys_AuditSensitivityLevels"("AuditSensitivity_Code","AuditSensitivity_Name") values('normal','Normal');
      insert into public."sys_AuditRetentionClasses"("AuditRetentionClass_Code","AuditRetentionClass_Name") values('standard_7y','Standard');
      insert into public."sys_FinancePostingStatuses"("FINPOSTST_Code","FINPOSTST_Name") values
        ('draft','Draft'),('queued','Queued'),('processing','Processing'),('posted','Posted');
      insert into public."sys_FinanceCashTypes"("FINCASHT_Code","FINCASHT_Name") values('supplier_payment','Supplier payment');
      insert into public."sys_FinanceCashStatuses"("FINCASHST_Code","FINCASHST_Name") values
        ('draft','Draft'),('awaiting_approval','Awaiting approval'),('approved','Approved'),('submitted','Submitted'),('rejected','Rejected');
      insert into public."sys_FinanceAllocationStatuses"("FINALLOCST_Code","FINALLOCST_Name") values
        ('pending','Pending'),('allocated','Allocated');
      insert into public."sys_FinanceAuthorityActionTypes"("FINAUTHA_Code","FINAUTHA_Name") values('finance_cash_post','Finance cash posting');
      insert into public."sys_FinancePeriodStatuses"("FINPERST_Code","FINPERST_Name") values('open','Open');
      insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name") values('supplier_payment','Supplier payment');
      insert into public."cmp_LegalEntities"("LegalEntity_ID","Company_ID","LegalEntity_Name","LegalEntity_BaseCurrencyCodeSnapshot") values
        ('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000001','Entity A','GBP'),
        ('00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000002','Entity B','GBP');
      insert into public."FIN_NominalAccounts"("FINNom_LegalEntityID","FINNom_Code","FINNom_Name","FINNom_AccountTypeCode") values
        ('00000000-0000-0000-0000-000000000111','1000','Bank','Bank'),
        ('00000000-0000-0000-0000-000000000111','2000','Trade payables','Current Liability');
      insert into public."Org_Master"("Org_id","Org_Name","Org_BaseCurrency","Org_AccCode") values
        ('00000000-0000-0000-0000-000000000121','Supplier A','00000000-0000-0000-0000-000000000131','SUP-A'),
        ('00000000-0000-0000-0000-000000000122','Supplier B','00000000-0000-0000-0000-000000000131','SUP-B');
      insert into public."CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID") values
        ('00000000-0000-0000-0000-000000000121','00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000122','00000000-0000-0000-0000-000000000001');
      insert into public."FIN_SupplierPurchaseOrders"("FINPO_ID","FINPO_LegalEntityID","FINPO_SupplierOrgID","FINPO_Number","FINPO_CurrencyCode","FINPO_NetAmount","FINPO_Description","FINPO_StatusCode","FINPO_CreatedBy") values
        ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000121','PO-1','GBP',100,'Freight purchase','approved','00000000-0000-0000-0000-000000000101');
      insert into public."FIN_BankAccounts"("FINBank_ID","FINBank_Code","FINBank_Name","FINBank_LegalEntityID","FINBank_CurrencyCode") values
        ('00000000-0000-0000-0000-000000000161','BANK-A','Test bank','00000000-0000-0000-0000-000000000111','GBP');
      insert into public."FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_CurrencyCodeSnapshot","FINDoc_NetAmount","FINDoc_GrossAmount","FINDoc_OutstandingAmount") values
        ('00000000-0000-0000-0000-000000000151','pl_invoice','draft','PI-1','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000121','GBP',70,84,84),
        ('00000000-0000-0000-0000-000000000152','pl_invoice','draft','PI-2','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000121','GBP',40,48,48),
        ('00000000-0000-0000-0000-000000000153','pl_invoice','draft','PI-3','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000122','GBP',10,12,12),
        ('00000000-0000-0000-0000-000000000154','pl_invoice','draft','PI-4','00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000121','GBP',10,12,12);
      set session_replication_role=origin;
      do $test$ begin
        begin
          insert into public."FIN_SupplierMatchProposals"("FINMatchProposal_ID","FINMatchProposal_LegalEntityID","FINMatchProposal_DocumentID","FINMatchProposal_PurchaseOrderID","FINMatchProposal_Model","FINMatchProposal_PromptVersion","FINMatchProposal_SourceJSON","FINMatchProposal_ResultJSON","FINMatchProposal_CreatedBy")
          values('00000000-0000-0000-0000-000000000173','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000141','test-model','finance-po-match-v1',
            '{"document":{"updatedAt":"2000-01-01T00:00:00Z"},"purchaseOrder":{"updatedAt":null}}'::jsonb,'{"citations":[{"field":"invoice.netAmount"}]}'::jsonb,'00000000-0000-0000-0000-000000000101');
          raise exception 'Stale AI proposal was accepted';
        exception when sqlstate '22023' then null; end;
        begin
          insert into public."FIN_SupplierMatchProposals"("FINMatchProposal_ID","FINMatchProposal_LegalEntityID","FINMatchProposal_DocumentID","FINMatchProposal_PurchaseOrderID","FINMatchProposal_Model","FINMatchProposal_PromptVersion","FINMatchProposal_SourceJSON","FINMatchProposal_ResultJSON","FINMatchProposal_CreatedBy")
          select '00000000-0000-0000-0000-000000000174','00000000-0000-0000-0000-000000000112',document."FINDoc_ID",'00000000-0000-0000-0000-000000000141','test-model','finance-po-match-v1',
            jsonb_build_object('document',jsonb_build_object('updatedAt',document."FINDoc_UpdatedAt"),'purchaseOrder',jsonb_build_object('updatedAt',null)),
            '{"citations":[{"field":"invoice.netAmount"}]}'::jsonb,'00000000-0000-0000-0000-000000000101'
          from public."FIN_Documents" document where document."FINDoc_ID"='00000000-0000-0000-0000-000000000151';
          raise exception 'Foreign-entity AI proposal was accepted';
        exception when sqlstate '22023' then null; end;
      end $test$;
      insert into public."FIN_SupplierMatchProposals"("FINMatchProposal_ID","FINMatchProposal_LegalEntityID","FINMatchProposal_DocumentID","FINMatchProposal_PurchaseOrderID","FINMatchProposal_Model","FINMatchProposal_PromptVersion","FINMatchProposal_SourceJSON","FINMatchProposal_ResultJSON","FINMatchProposal_CreatedBy")
      select '00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000141','test-model','finance-po-match-v1',
        jsonb_build_object('document',jsonb_build_object('updatedAt',document."FINDoc_UpdatedAt"),'purchaseOrder',jsonb_build_object('updatedAt',po."FINPO_ReviewedAt")),
        '{"citations":[{"field":"invoice.netAmount"}]}'::jsonb,'00000000-0000-0000-0000-000000000101'
      from public."FIN_Documents" document cross join public."FIN_SupplierPurchaseOrders" po
      where document."FINDoc_ID"='00000000-0000-0000-0000-000000000151' and po."FINPO_ID"='00000000-0000-0000-0000-000000000141';
      update public."FIN_SupplierMatchProposals" set "FINMatchProposal_StatusCode"='rejected',"FINMatchProposal_ReviewedAt"=now(),"FINMatchProposal_ReviewedBy"='00000000-0000-0000-0000-000000000102',"FINMatchProposal_ReviewReason"='Source claim was a false positive' where "FINMatchProposal_ID"='00000000-0000-0000-0000-000000000171';
      do $test$ begin
        begin
          update public."FIN_SupplierMatchProposals" set "FINMatchProposal_ResultJSON"='{"citations":[]}'::jsonb where "FINMatchProposal_ID"='00000000-0000-0000-0000-000000000171';
          raise exception 'Reviewed AI evidence was mutable';
        exception when sqlstate '22023' then null; end;
      end $test$;
      do $test$ begin
        begin
          insert into public."FIN_SupplierInvoiceMatches"("FINPOMatch_PurchaseOrderID","FINPOMatch_DocumentID","FINPOMatch_NetAmount","FINPOMatch_EvidenceJSON","FINPOMatch_ReviewerNote","FINPOMatch_ApprovedBy") values
            ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000151',70,'{"proposalId":"00000000-0000-0000-0000-000000000171"}'::jsonb,'Rejected proposal','00000000-0000-0000-0000-000000000102');
          raise exception 'Rejected AI proposal was accepted';
        exception when sqlstate '22023' then null; end;
      end $test$;
      insert into public."FIN_SupplierMatchProposals"("FINMatchProposal_ID","FINMatchProposal_LegalEntityID","FINMatchProposal_DocumentID","FINMatchProposal_PurchaseOrderID","FINMatchProposal_Model","FINMatchProposal_PromptVersion","FINMatchProposal_SourceJSON","FINMatchProposal_ResultJSON","FINMatchProposal_CreatedBy")
      select '00000000-0000-0000-0000-000000000172','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000141','test-model','finance-po-match-v1',
        jsonb_build_object('document',jsonb_build_object('updatedAt',document."FINDoc_UpdatedAt"),'purchaseOrder',jsonb_build_object('updatedAt',po."FINPO_ReviewedAt")),
        '{"citations":[{"field":"invoice.netAmount"},{"field":"po.availableNet"}]}'::jsonb,'00000000-0000-0000-0000-000000000101'
      from public."FIN_Documents" document cross join public."FIN_SupplierPurchaseOrders" po
      where document."FINDoc_ID"='00000000-0000-0000-0000-000000000151' and po."FINPO_ID"='00000000-0000-0000-0000-000000000141';
      insert into public."FIN_SupplierInvoiceMatches"("FINPOMatch_PurchaseOrderID","FINPOMatch_DocumentID","FINPOMatch_NetAmount","FINPOMatch_EvidenceJSON","FINPOMatch_ReviewerNote","FINPOMatch_ApprovedBy") values
        ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000151',70,'{"proposalId":"00000000-0000-0000-0000-000000000172"}'::jsonb,'Checked source fields and net value','00000000-0000-0000-0000-000000000102');
      do $test$ declare rejected integer:=0; begin
        begin
          insert into public."FIN_SupplierInvoiceMatches"("FINPOMatch_PurchaseOrderID","FINPOMatch_DocumentID","FINPOMatch_NetAmount","FINPOMatch_EvidenceJSON","FINPOMatch_ReviewerNote","FINPOMatch_ApprovedBy") values
            ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000152',40,'{}','Too much','00000000-0000-0000-0000-000000000102');
        exception when others then rejected:=rejected+1; end;
        begin
          insert into public."FIN_SupplierInvoiceMatches"("FINPOMatch_PurchaseOrderID","FINPOMatch_DocumentID","FINPOMatch_NetAmount","FINPOMatch_EvidenceJSON","FINPOMatch_ReviewerNote","FINPOMatch_ApprovedBy") values
            ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000153',10,'{}','Wrong supplier','00000000-0000-0000-0000-000000000102');
        exception when others then rejected:=rejected+1; end;
        begin
          insert into public."FIN_SupplierInvoiceMatches"("FINPOMatch_PurchaseOrderID","FINPOMatch_DocumentID","FINPOMatch_NetAmount","FINPOMatch_EvidenceJSON","FINPOMatch_ReviewerNote","FINPOMatch_ApprovedBy") values
            ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000154',10,'{}','Wrong entity','00000000-0000-0000-0000-000000000102');
        exception when others then rejected:=rejected+1; end;
        if rejected<>3 then raise exception 'PO match must reject overmatched, wrong supplier and foreign entity invoices'; end if;
      end $test$;
      select count(*) from public."FIN_SupplierInvoiceMatches" where "FINPOMatch_DocumentID"='00000000-0000-0000-0000-000000000151'
        and (select "FINMatchProposal_StatusCode" from public."FIN_SupplierMatchProposals" where "FINMatchProposal_ID"='00000000-0000-0000-0000-000000000172')='approved';`), '1')
    assert.equal(sql(`
      set session_replication_role=replica;
      update public."FIN_Documents" set "FINDoc_StatusCode"='approved' where "FINDoc_ID"='00000000-0000-0000-0000-000000000151';
      set session_replication_role=origin;
      select public.multideck_finance_prepare_payment_run(
        '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000161',
        '["00000000-0000-0000-0000-000000000151"]'::jsonb,'2026-09-25',1,'Reviewed supplier invoice');
    `).length, 36)
    const prepared = JSON.parse(sql(`select jsonb_build_object(
      'runs',(select count(*) from public."FIN_PaymentRuns" where "FINPayRun_LegalEntityID"='00000000-0000-0000-0000-000000000111' and "FINPayRun_StatusCode"='awaiting_approval'),
      'items',(select count(*) from public."FIN_PaymentRunItems" where "FINPayRunItem_DocumentID"='00000000-0000-0000-0000-000000000151'),
      'cash',(select count(*) from public."FIN_CashTransactions" where "FINCash_PartyOrgID"='00000000-0000-0000-0000-000000000121' and "FINCash_StatusCode"='awaiting_approval')
    );`))
    assert.deepEqual(prepared, { runs: 1, items: 1, cash: 1 })
    assert.equal(sql(`
      do $test$ declare rejected integer:=0; begin
        begin perform public.multideck_finance_prepare_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000161','["00000000-0000-0000-0000-000000000151"]'::jsonb,'2026-09-25',1,'Duplicate pending run');
        exception when sqlstate '22023' then rejected:=rejected+1; end;
        begin perform public.multideck_finance_prepare_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000161','["00000000-0000-0000-0000-000000000151"]'::jsonb,'2026-09-25',1.2,'Wrong base currency rate');
        exception when sqlstate '22023' then rejected:=rejected+1; end;
        if rejected<>2 then raise exception 'Duplicate pending runs and wrong base-currency rates must fail'; end if;
      end $test$;
      select count(*) from public."FIN_PaymentRuns";
    `), '1')
    assert.equal(sql(`
      do $test$ declare v_run uuid; rejected integer:=0; begin
        select "FINPayRun_ID" into v_run from public."FIN_PaymentRuns" limit 1;
        begin perform public.multideck_finance_review_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101',v_run,'approved','Self approval');
        exception when others then rejected:=rejected+1; end;
        begin perform public.multideck_finance_review_payment_run('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000102',v_run,'approved','Foreign company');
        exception when others then rejected:=rejected+1; end;
        if rejected<>2 then raise exception 'Self and foreign-company payment reviews must fail'; end if;
        perform public.multideck_finance_review_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102',v_run,'approved','Second reviewer checked the supplier and allocation');
      end $test$;
      select count(*) from public."FIN_PaymentRuns" run
      join public."FIN_PaymentRunItems" item on item."FINPayRunItem_RunID"=run."FINPayRun_ID"
      join public."FIN_CashTransactions" cash on cash."FINCash_ID"=item."FINPayRunItem_CashID"
      where run."FINPayRun_StatusCode"='approved' and item."FINPayRunItem_StatusCode"='approved'
        and cash."FINCash_StatusCode"='approved' and cash."FINCash_NativePostingStatusCode"='posted';
    `), '1')
    assert.equal(sql(`
      set session_replication_role=replica;
      update public."FIN_Documents" set "FINDoc_StatusCode"='approved' where "FINDoc_ID"='00000000-0000-0000-0000-000000000152';
      set session_replication_role=origin;
      select public.multideck_finance_prepare_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000161','["00000000-0000-0000-0000-000000000152"]'::jsonb,'2026-09-25',1,'Review second invoice');
      select public.multideck_finance_review_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102',run."FINPayRun_ID",'rejected','Supplier account query')
      from public."FIN_PaymentRuns" run join public."FIN_PaymentRunItems" item on item."FINPayRunItem_RunID"=run."FINPayRun_ID" where item."FINPayRunItem_DocumentID"='00000000-0000-0000-0000-000000000152';
      select count(*) from public."FIN_PaymentRunItems" item join public."FIN_PaymentRuns" run on run."FINPayRun_ID"=item."FINPayRunItem_RunID"
      join public."FIN_CashTransactions" cash on cash."FINCash_ID"=item."FINPayRunItem_CashID"
      join public."FIN_Documents" document on document."FINDoc_ID"=item."FINPayRunItem_DocumentID"
      where item."FINPayRunItem_DocumentID"='00000000-0000-0000-0000-000000000152'
      and run."FINPayRun_StatusCode"='rejected' and cash."FINCash_StatusCode"='rejected' and document."FINDoc_OutstandingAmount"=48;
    `).split('\n').at(-1), '1')
    assert.equal(sql(`
      set session_replication_role=replica;
      update public."FIN_Documents" set "FINDoc_StatusCode"='approved' where "FINDoc_ID"='00000000-0000-0000-0000-000000000153';
      insert into public."FIN_Documents"("FINDoc_ID","FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_PartyOrgID","FINDoc_CurrencyCodeSnapshot","FINDoc_NetAmount","FINDoc_GrossAmount","FINDoc_OutstandingAmount")
      values('00000000-0000-0000-0000-000000000155','debit_note','approved','DN-1','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000122','GBP',-5,-6,-6);
      insert into public."FIN_CashTransactions"("FINCash_ID","FINCash_TypeCode","FINCash_StatusCode","FINCash_Number","FINCash_LegalEntityID","FINCash_BankAccountID","FINCash_PartyOrgID","FINCash_CurrencyCodeSnapshot","FINCash_Amount","FINCash_LocalAmount","FINCash_UnallocatedAmount","FINCash_LocalUnallocatedAmount")
      values('00000000-0000-0000-0000-000000000163','supplier_payment','approved','PAY-OPEN','00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000121','GBP',5,5,5,5);
      set session_replication_role=origin;
      do $test$ declare rejected integer:=0; begin
        begin perform public.multideck_finance_prepare_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000161','["00000000-0000-0000-0000-000000000153"]'::jsonb,'2026-09-25',1,'Ignore supplier credit');
        exception when sqlstate '22023' then rejected:=rejected+1; end;
        begin perform public.multideck_finance_prepare_payment_run('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000161','["00000000-0000-0000-0000-000000000152"]'::jsonb,'2026-09-25',1,'Ignore unapplied payment');
        exception when sqlstate '22023' then rejected:=rejected+1; end;
        if rejected<>2 then raise exception 'Unapplied supplier offsets must block payment runs'; end if;
      end $test$;
      select count(*) from public."FIN_PaymentRuns";
    `).split('\n').at(-1), '2')
    assert.equal(sql(`
      select count(*) from jsonb_array_elements(public.multideck_dexter_domain_finance_operations('00000000-0000-0000-0000-000000000001',null,25)) item
      where item->'source'->>'id'='00000000-0000-0000-0000-000000000141';
    `), '1')
    assert.equal(sql(`
      select count(*) from jsonb_array_elements(public.multideck_dexter_domain_finance_operations('00000000-0000-0000-0000-000000000002',null,25)) item
      where item->'source'->>'id'='00000000-0000-0000-0000-000000000141';
    `), '0')
    assert.equal(sql(`
      set session_replication_role=replica;
      insert into public."cmp_Company"("Company_ID","Company_Name") values
        ('00000000-0000-0000-0000-000000000001','Company A'),
        ('00000000-0000-0000-0000-000000000002','Company B');
      insert into public."AI_DexterWatches"("AIDexterWatch_ID","AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_RuleJSON") values
        ('00000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','finance_operations','PO changes','PO changes','Watch the supplier PO','{"field":"number","operator":"changed"}'),
        ('00000000-0000-0000-0000-000000000182','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000102','finance_operations','Other tenant','Other tenant','Watch finance','{"field":"number","operator":"changed"}');
      set session_replication_role=origin;
      alter table public."AI_DexterWatchSignals" disable trigger "TR_AI_DexterWatchSignals_evaluate";
      update public."FIN_SupplierPurchaseOrders" set "FINPO_Number"='PO-1A' where "FINPO_ID"='00000000-0000-0000-0000-000000000141';
      select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='finance_operations' and "AIDexterWatchSignal_CompanyID"='00000000-0000-0000-0000-000000000001';
    `).split('\n').at(-1), '1')
    assert.equal(sql(`
      update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"='00000000-0000-0000-0000-000000000181';
      update public."FIN_SupplierPurchaseOrders" set "FINPO_Number"='PO-1B' where "FINPO_ID"='00000000-0000-0000-0000-000000000141';
      select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='finance_operations';
    `).split('\n').at(-1), '1')
    assert.equal(sql(`
      update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"='00000000-0000-0000-0000-000000000181';
      update public."FIN_SupplierPurchaseOrders" set "FINPO_Number"='PO-1C' where "FINPO_ID"='00000000-0000-0000-0000-000000000141';
      select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CapabilityCode"='finance_operations' and "AIDexterWatchSignal_CompanyID"='00000000-0000-0000-0000-000000000001';
    `).split('\n').at(-1), '2')
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { encoding: 'utf8' })
    rmSync(directory, { recursive: true, force: true })
  }
})
