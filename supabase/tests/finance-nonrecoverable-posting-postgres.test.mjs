import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260924110000_nonrecoverable_purchase_tax_posting.sql", import.meta.url), "utf8")

test("native purchase posting charges blocked input tax to purchase cost", () => {
  const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin"
  const directory = mkdtempSync(join(tmpdir(), "finance-blocked-tax-"))
  let started = false
  const run = (name, args, input) => {
    const result = spawnSync(join(bin, name), args, { input, encoding: "utf8", timeout: 30000 })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const sql = (input) => run("psql", ["-X", "-qAt", "-h", directory, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input)
  try {
    run("initdb", ["-D", join(directory, "data"), "-A", "trust", "-U", "postgres", "--no-locale", "--no-sync", "-E", "UTF8"])
    run("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "log"), "-o", `-k ${directory} -c listen_addresses=''`, "-w", "start"])
    started = true
    sql(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create table "cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"LegalEntity_BaseCurrencyCodeSnapshot" text not null);
      create table "FIN_Documents"(
        "FINDoc_ID" uuid primary key,"FINDoc_LegalEntityID" uuid not null,"FINDoc_StatusCode" text not null,
        "FINDoc_NativePostingStatusCode" text not null default 'draft',"FINDoc_NativePostingBatchID" uuid,
        "FINDoc_TypeCode" text not null,"FINDoc_Number" text,"FINDoc_AccountingDate" date not null,
        "FINDoc_LocalGrossAmount" numeric not null,"FINDoc_SourceJobID" uuid,"FINDoc_PeriodID" uuid,
        "FINDoc_NativePostedAt" timestamptz,"FINDoc_NativePostedBy" uuid,"FINDoc_PostingStatusCode" text,
        "FINDoc_PostedAt" timestamptz,"FINDoc_PostedBy" uuid,"FINDoc_IsLocked" boolean,
        "FINDoc_ExportStatusCode" text,"FINDoc_UpdatedAt" timestamptz,"FINDoc_UpdatedBy" uuid);
      create table "FIN_DocumentLines"(
        "FINDocLine_ID" uuid primary key,"FINDocLine_DocumentID" uuid not null,"FINDocLine_LineNo" integer not null,
        "FINDocLine_Description" text not null,"FINDocLine_LocalNetAmount" numeric not null,
        "FINDocLine_LocalTaxAmount" numeric not null,"FINDocLine_NominalAccountID" uuid,"FINDocLine_TaxCodeID" uuid,
        "FINDocLine_Dimension1ID" uuid,"FINDocLine_Dimension2ID" uuid);
      create table "FIN_TaxCodes"("FINTax_ID" uuid primary key,"FINTax_LegalEntityID" uuid not null,
        "FINTax_OutputNominalID" uuid,"FINTax_InputNominalID" uuid,"FINTax_IsRecoverable" boolean not null);
      create table "FIN_PostingBatches"(
        "FINPostBatch_ID" uuid primary key default gen_random_uuid(),"FINPostBatch_Number" text,
        "FINPostBatch_StatusCode" text,"FINPostBatch_SourceTable" text,"FINPostBatch_SourceID" uuid,
        "FINPostBatch_PeriodID" uuid,"FINPostBatch_LegalEntityID" uuid,"FINPostBatch_DebitTotal" numeric,
        "FINPostBatch_CreditTotal" numeric,"FINPostBatch_CurrencyCodeSnapshot" text,
        "FINPostBatch_PostedAt" timestamptz,"FINPostBatch_PostedBy" uuid,"FINPostBatch_CreatedBy" uuid);
      create table "FIN_PostingLines"(
        "FINPostLine_ID" uuid primary key default gen_random_uuid(),"FINPostLine_BatchID" uuid not null,
        "FINPostLine_LineNo" integer not null,"FINPostLine_NominalAccountID" uuid not null,
        "FINPostLine_DocumentID" uuid,"FINPostLine_DocumentLineID" uuid,"FINPostLine_Description" text,
        "FINPostLine_DebitAmount" numeric not null,"FINPostLine_CreditAmount" numeric not null,
        "FINPostLine_CurrencyCodeSnapshot" text,"FINPostLine_Dimension1ID" uuid,"FINPostLine_Dimension2ID" uuid,
        "FINPostLine_JobID" uuid);
      create table "Audit_Events"(
        "AuditEvent_EventTypeCode" text,"AuditEvent_UserID" uuid,"AuditEvent_LegalEntityID" uuid,
        "AuditEvent_SourceApp" text,"AuditEvent_SourceModule" text,"AuditEvent_SourceTableSchema" text,
        "AuditEvent_SourceTableName" text,"AuditEvent_RecordTypeCode" text,"AuditEvent_RecordID" uuid,
        "AuditEvent_Action" text,"AuditEvent_Title" text,"AuditEvent_HasFieldChanges" boolean,
        "AuditEvent_ChangedFieldCount" integer,"AuditEvent_MetadataJSON" jsonb);
      create function public._multideck_finance_mirror_state(uuid)
      returns table(mirror_mode text,active_connection boolean,native_ledger_enabled boolean)
      language sql as $$select 'disabled'::text,false,true$$;
      create function public._multideck_finance_ensure_period(uuid,text,uuid) returns uuid language sql
      as $$select '00000000-0000-0000-0000-000000000020'::uuid$$;
      create function public._multideck_finance_resolve_nominal(uuid,uuid,text) returns uuid language sql
      as $$select coalesce($2,case $3 when '2000' then '00000000-0000-0000-0000-000000000021'::uuid
        when '5000' then '00000000-0000-0000-0000-000000000022'::uuid
        when '1200' then '00000000-0000-0000-0000-000000000023'::uuid end)$$;
    `)
    sql(migration)
    assert.equal(sql(`
      do $test$
      declare e uuid:='00000000-0000-0000-0000-000000000001';
        actor uuid:='00000000-0000-0000-0000-000000000002';
        blocked uuid:='00000000-0000-0000-0000-000000000030';
        allowed uuid:='00000000-0000-0000-0000-000000000031';
        debit_note uuid:='00000000-0000-0000-0000-000000000032';
        result jsonb;
      begin
        insert into "cmp_LegalEntities" values(e,'GBP');
        insert into "FIN_TaxCodes" values
          ('00000000-0000-0000-0000-000000000040',e,null,'00000000-0000-0000-0000-000000000023',false),
          ('00000000-0000-0000-0000-000000000041',e,null,'00000000-0000-0000-0000-000000000023',true);
        insert into "FIN_Documents"("FINDoc_ID","FINDoc_LegalEntityID","FINDoc_StatusCode","FINDoc_TypeCode",
          "FINDoc_Number","FINDoc_AccountingDate","FINDoc_LocalGrossAmount") values
          (blocked,e,'approved','pl_invoice','BLOCKED','2026-07-15',60),
          (allowed,e,'approved','pl_invoice','ALLOWED','2026-07-15',120),
          (debit_note,e,'approved','debit_note','DEBIT','2026-07-15',30);
        insert into "FIN_DocumentLines"("FINDocLine_ID","FINDocLine_DocumentID","FINDocLine_LineNo",
          "FINDocLine_Description","FINDocLine_LocalNetAmount","FINDocLine_LocalTaxAmount",
          "FINDocLine_NominalAccountID","FINDocLine_TaxCodeID") values
          ('00000000-0000-0000-0000-000000000050',blocked,1,'Blocked purchase',50,10,
            '00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000040'),
          ('00000000-0000-0000-0000-000000000051',allowed,1,'Recoverable purchase',100,20,
            '00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000041'),
          ('00000000-0000-0000-0000-000000000052',debit_note,1,'Blocked debit note',25,5,
            '00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000040');
        result:=public._multideck_finance_post_document_native(blocked,actor);
        if result->>'status'<>'posted' or (result->>'debitTotal')::numeric<>60
          or (result->>'creditTotal')::numeric<>60 then
          raise exception 'blocked purchase journal was not balanced'; end if;
        if (select count(*) from "FIN_PostingLines" where "FINPostLine_DocumentID"=blocked
          and "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000022'
          and "FINPostLine_DebitAmount" in (50,10))<>2
          or exists(select 1 from "FIN_PostingLines" where "FINPostLine_DocumentID"=blocked
            and "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000023')
          or not exists(select 1 from "FIN_PostingLines" where "FINPostLine_DocumentID"=blocked
            and "FINPostLine_Description"='Nonrecoverable tax: Blocked purchase'
            and "FINPostLine_DebitAmount"=10) then
          raise exception 'blocked input tax was not charged to purchase cost'; end if;
        result:=public._multideck_finance_post_document_native(blocked,actor);
        if result->>'idempotent'<>'true' or (select count(*) from "FIN_PostingLines"
          where "FINPostLine_DocumentID"=blocked)<>3 then
          raise exception 'retry duplicated blocked purchase posting'; end if;
        perform public._multideck_finance_post_document_native(allowed,actor);
        if not exists(select 1 from "FIN_PostingLines" where "FINPostLine_DocumentID"=allowed
          and "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000023'
          and "FINPostLine_Description"='Tax: Recoverable purchase' and "FINPostLine_DebitAmount"=20) then
          raise exception 'recoverable input tax was not posted to its VAT account'; end if;
        perform public._multideck_finance_post_document_native(debit_note,actor);
        if not exists(select 1 from "FIN_PostingLines" where "FINPostLine_DocumentID"=debit_note
          and "FINPostLine_NominalAccountID"='00000000-0000-0000-0000-000000000022'
          and "FINPostLine_Description"='Nonrecoverable tax: Blocked debit note'
          and "FINPostLine_CreditAmount"=5) then
          raise exception 'blocked debit note did not reverse purchase cost'; end if;
      end $test$;
      select 'ok';
    `), "ok")
  } finally {
    if (started) run("pg_ctl", ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"])
    rmSync(directory, { recursive: true, force: true })
  }
})
