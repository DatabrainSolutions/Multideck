begin;

-- A posted job-linked invoice releases only the matching management adjustment.
-- Sales invoices reverse revenue WIP; purchase invoices reverse cost accruals.
-- Releases are progressive, idempotent and use local net values (VAT excluded).
create table public."FIN_AccrualWIPReleases" (
  "FINRelease_ID" uuid primary key default gen_random_uuid(),
  "FINRelease_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  "FINRelease_DocumentID" uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  "FINRelease_DocumentTypeCode" varchar(60) not null,
  "FINRelease_JobID" uuid not null references public."Job_Header"("Job_ID") on delete restrict,
  "FINRelease_CloseRunItemID" uuid references public."FIN_PeriodCloseRunItems"("FINCloseItem_ID") on delete set null,
  "FINRelease_AccrualID" uuid references public."FIN_Accruals"("FINAccrual_ID") on delete restrict,
  "FINRelease_WIPID" uuid references public."FIN_WIPItems"("FINWIP_ID") on delete restrict,
  "FINRelease_ReleaseKindCode" varchar(40) not null,
  "FINRelease_PeriodID" uuid not null references public."FIN_Periods"("FINPeriod_ID") on delete restrict,
  "FINRelease_PostingBatchID" uuid not null references public."FIN_PostingBatches"("FINPostBatch_ID") on delete restrict,
  "FINRelease_SourceAmount" numeric(18,4) not null,
  "FINRelease_LocalAmount" numeric(18,4) not null,
  "FINRelease_DocumentCurrencyCode" varchar(3) not null,
  "FINRelease_LocalCurrencyCode" varchar(3) not null,
  "FINRelease_TriggerCode" varchar(40) not null default 'document_posted',
  "FINRelease_ReleasedAt" timestamptz not null default now(),
  "FINRelease_ReleasedBy" uuid references public."cmp_Users"("User_ID") on delete set null,
  constraint "CK_FIN_AccrualWIPReleases_kind" check (
    ("FINRelease_ReleaseKindCode"='revenue_wip' and "FINRelease_WIPID" is not null and "FINRelease_AccrualID" is null and "FINRelease_DocumentTypeCode"='sl_invoice')
    or
    ("FINRelease_ReleaseKindCode"='cost_accrual' and "FINRelease_AccrualID" is not null and "FINRelease_WIPID" is null and "FINRelease_DocumentTypeCode"='pl_invoice')
  ),
  constraint "CK_FIN_AccrualWIPReleases_amounts" check ("FINRelease_SourceAmount">0 and "FINRelease_LocalAmount">0),
  constraint "CK_FIN_AccrualWIPReleases_currency" check ("FINRelease_DocumentCurrencyCode" ~ '^[A-Z]{3}$' and "FINRelease_LocalCurrencyCode" ~ '^[A-Z]{3}$'),
  unique ("FINRelease_DocumentID","FINRelease_AccrualID"),
  unique ("FINRelease_DocumentID","FINRelease_WIPID")
);

create index "IX_FIN_AccrualWIPReleases_document" on public."FIN_AccrualWIPReleases"("FINRelease_DocumentID","FINRelease_ReleasedAt");
create index "IX_FIN_AccrualWIPReleases_job" on public."FIN_AccrualWIPReleases"("FINRelease_JobID","FINRelease_ReleaseKindCode","FINRelease_ReleasedAt");
create index "IX_FIN_AccrualWIPReleases_run_item" on public."FIN_AccrualWIPReleases"("FINRelease_CloseRunItemID");

alter table public."FIN_AccrualWIPReleases" enable row level security;
revoke all on public."FIN_AccrualWIPReleases" from public,anon,authenticated;
grant select,insert,update,delete on public."FIN_AccrualWIPReleases" to service_role;

create or replace function public._multideck_finance_release_document_accrual_wip(
  p_document_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_document public."FIN_Documents"%rowtype;
  v_user uuid;
  v_period_id uuid;
  v_period public."FIN_Periods"%rowtype;
  v_batch uuid;
  v_job record;
  v_adjustment record;
  v_source_line record;
  v_available numeric;
  v_release numeric;
  v_source_amount numeric;
  v_line integer:=0;
  v_total numeric:=0;
  v_wip_total numeric:=0;
  v_accrual_total numeric:=0;
  v_kind text;
begin
  select * into v_document from public."FIN_Documents" where "FINDoc_ID"=p_document_id for update;
  if not found or v_document."FINDoc_PostingStatusCode"<>'posted' or v_document."FINDoc_TypeCode" not in ('sl_invoice','pl_invoice') then
    return jsonb_build_object('documentId',p_document_id,'released',false,'reason','not_applicable');
  end if;
  if v_document."FINDoc_LegalEntityID" is null or v_document."FINDoc_LocalNetAmount"<=0 then
    return jsonb_build_object('documentId',p_document_id,'released',false,'reason','no_positive_local_net_value');
  end if;
  if exists(select 1 from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=p_document_id) then
    select coalesce(sum(case when "FINRelease_ReleaseKindCode"='revenue_wip' then "FINRelease_LocalAmount" else 0 end),0),
           coalesce(sum(case when "FINRelease_ReleaseKindCode"='cost_accrual' then "FINRelease_LocalAmount" else 0 end),0)
    into v_wip_total,v_accrual_total from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=p_document_id;
    return jsonb_build_object('documentId',p_document_id,'released',true,'idempotent',true,'wipReleased',v_wip_total,'accrualReleased',v_accrual_total);
  end if;

  v_user:=coalesce(v_document."FINDoc_PostedBy",v_document."FINDoc_UpdatedBy",v_document."FINDoc_CreatedBy");
  v_kind:=case when v_document."FINDoc_TypeCode"='sl_invoice' then 'revenue_wip' else 'cost_accrual' end;

  for v_job in
    with linked as (
      select link."FINDocLineJob_JobID" job_id,round(abs(sum(link."FINDocLineJob_LocalNetAmount")),4) local_net
      from public."FIN_DocumentLineJobLinks" link
      where link."FINDocLineJob_DocumentID"=p_document_id and link."FINDocLineJob_JobID" is not null
      group by link."FINDocLineJob_JobID"
    )
    select job_id,local_net from linked where local_net>0
    union all
    select v_document."FINDoc_SourceJobID",round(abs(v_document."FINDoc_LocalNetAmount"),4)
    where v_document."FINDoc_SourceJobID" is not null and not exists(select 1 from linked)
  loop
    v_available:=v_job.local_net;
    if v_kind='revenue_wip' then
      for v_adjustment in
        select wip.*,item."FINCloseItem_CloseRunID",run."FINCloseRun_PostingBatchID"
        from public."FIN_WIPItems" wip
        join public."FIN_Periods" source_period on source_period."FINPeriod_ID"=wip."FINWIP_PeriodID" and source_period."FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"
        join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=wip."FINWIP_CloseRunItemID"
        join public."FIN_PeriodCloseRuns" run on run."FINCloseRun_ID"=item."FINCloseItem_CloseRunID"
        where wip."FINWIP_JobID"=v_job.job_id
          and wip."FINWIP_WIPAmount">wip."FINWIP_RelievedAmount"
          and wip."FINWIP_StatusCode" in ('posted','partially_reversed')
        order by wip."FINWIP_AccountingDate",wip."FINWIP_CreatedAt",wip."FINWIP_ID"
        for update of wip
      loop
        exit when v_available<=0;
        v_release:=least(v_available,v_adjustment."FINWIP_WIPAmount"-v_adjustment."FINWIP_RelievedAmount");
        if v_batch is null then
          v_period_id:=v_document."FINDoc_PeriodID";
          if v_period_id is not null then
            select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id and "FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID";
            if not found then v_period_id:=null; end if;
          end if;
          if v_period_id is null then
            v_period_id:=public._multideck_finance_ensure_period(v_document."FINDoc_LegalEntityID",to_char(v_document."FINDoc_AccountingDate",'YYYYMM'),v_user);
            select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id;
          end if;
          insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
          values('AUTO-REL-'||left(coalesce(v_document."FINDoc_Number",p_document_id::text),56),'posted','FIN_Documents',p_document_id,v_period_id,v_document."FINDoc_LegalEntityID",0,0,v_period."FINPeriod_BaseCurrencyCode",now(),v_user,v_user)
          returning "FINPostBatch_ID" into v_batch;
        end if;
        v_source_amount:=round(v_release/v_document."FINDoc_ExchangeRate",4);
        insert into public."FIN_AccrualWIPReleases"("FINRelease_LegalEntityID","FINRelease_DocumentID","FINRelease_DocumentTypeCode","FINRelease_JobID","FINRelease_CloseRunItemID","FINRelease_WIPID","FINRelease_ReleaseKindCode","FINRelease_PeriodID","FINRelease_PostingBatchID","FINRelease_SourceAmount","FINRelease_LocalAmount","FINRelease_DocumentCurrencyCode","FINRelease_LocalCurrencyCode","FINRelease_ReleasedBy")
        values(v_document."FINDoc_LegalEntityID",p_document_id,v_document."FINDoc_TypeCode",v_job.job_id,v_adjustment."FINWIP_CloseRunItemID",v_adjustment."FINWIP_ID",v_kind,v_period_id,v_batch,v_source_amount,v_release,v_document."FINDoc_CurrencyCodeSnapshot",v_period."FINPeriod_BaseCurrencyCode",v_user);
        for v_source_line in select line.* from public."FIN_PostingLines" line where line."FINPostLine_BatchID"=v_adjustment."FINCloseRun_PostingBatchID" and line."FINPostLine_WIPID"=v_adjustment."FINWIP_ID" order by line."FINPostLine_LineNo" loop
          v_line:=v_line+1;
          insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID")
          values(v_batch,v_line,v_source_line."FINPostLine_NominalAccountID",p_document_id,v_adjustment."FINWIP_ID",'Automatic WIP reversal for '||coalesce(v_document."FINDoc_Number",p_document_id::text),round(v_source_line."FINPostLine_CreditAmount"*v_release/v_adjustment."FINWIP_WIPAmount",4),round(v_source_line."FINPostLine_DebitAmount"*v_release/v_adjustment."FINWIP_WIPAmount",4),v_period."FINPeriod_BaseCurrencyCode",v_job.job_id);
        end loop;
        update public."FIN_WIPItems" set
          "FINWIP_RelievedAmount"="FINWIP_RelievedAmount"+v_release,
          "FINWIP_StatusCode"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then 'reversed' else 'partially_reversed' end,
          "FINWIP_ReversalPeriodID"=v_period_id,
          "FINWIP_ReversedAt"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then now() else "FINWIP_ReversedAt" end,
          "FINWIP_ReversedBy"=case when "FINWIP_RelievedAmount"+v_release>="FINWIP_WIPAmount" then v_user else "FINWIP_ReversedBy" end
        where "FINWIP_ID"=v_adjustment."FINWIP_ID";
        v_available:=v_available-v_release; v_total:=v_total+v_release; v_wip_total:=v_wip_total+v_release;
      end loop;
    else
      for v_adjustment in
        select accrual.*,item."FINCloseItem_CloseRunID",run."FINCloseRun_PostingBatchID"
        from public."FIN_Accruals" accrual
        join public."FIN_Periods" source_period on source_period."FINPeriod_ID"=accrual."FINAccrual_PeriodID" and source_period."FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID"
        join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=accrual."FINAccrual_CloseRunItemID"
        join public."FIN_PeriodCloseRuns" run on run."FINCloseRun_ID"=item."FINCloseItem_CloseRunID"
        where accrual."FINAccrual_JobID"=v_job.job_id
          and accrual."FINAccrual_AccruedAmount">accrual."FINAccrual_RelievedAmount"
          and accrual."FINAccrual_StatusCode" in ('posted','partially_reversed')
        order by accrual."FINAccrual_AccountingDate",accrual."FINAccrual_CreatedAt",accrual."FINAccrual_ID"
        for update of accrual
      loop
        exit when v_available<=0;
        v_release:=least(v_available,v_adjustment."FINAccrual_AccruedAmount"-v_adjustment."FINAccrual_RelievedAmount");
        if v_batch is null then
          v_period_id:=v_document."FINDoc_PeriodID";
          if v_period_id is not null then
            select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id and "FINPeriod_LegalEntityID"=v_document."FINDoc_LegalEntityID";
            if not found then v_period_id:=null; end if;
          end if;
          if v_period_id is null then
            v_period_id:=public._multideck_finance_ensure_period(v_document."FINDoc_LegalEntityID",to_char(v_document."FINDoc_AccountingDate",'YYYYMM'),v_user);
            select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id;
          end if;
          insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
          values('AUTO-REL-'||left(coalesce(v_document."FINDoc_Number",p_document_id::text),56),'posted','FIN_Documents',p_document_id,v_period_id,v_document."FINDoc_LegalEntityID",0,0,v_period."FINPeriod_BaseCurrencyCode",now(),v_user,v_user)
          returning "FINPostBatch_ID" into v_batch;
        end if;
        v_source_amount:=round(v_release/v_document."FINDoc_ExchangeRate",4);
        insert into public."FIN_AccrualWIPReleases"("FINRelease_LegalEntityID","FINRelease_DocumentID","FINRelease_DocumentTypeCode","FINRelease_JobID","FINRelease_CloseRunItemID","FINRelease_AccrualID","FINRelease_ReleaseKindCode","FINRelease_PeriodID","FINRelease_PostingBatchID","FINRelease_SourceAmount","FINRelease_LocalAmount","FINRelease_DocumentCurrencyCode","FINRelease_LocalCurrencyCode","FINRelease_ReleasedBy")
        values(v_document."FINDoc_LegalEntityID",p_document_id,v_document."FINDoc_TypeCode",v_job.job_id,v_adjustment."FINAccrual_CloseRunItemID",v_adjustment."FINAccrual_ID",v_kind,v_period_id,v_batch,v_source_amount,v_release,v_document."FINDoc_CurrencyCodeSnapshot",v_period."FINPeriod_BaseCurrencyCode",v_user);
        for v_source_line in select line.* from public."FIN_PostingLines" line where line."FINPostLine_BatchID"=v_adjustment."FINCloseRun_PostingBatchID" and line."FINPostLine_AccrualID"=v_adjustment."FINAccrual_ID" order by line."FINPostLine_LineNo" loop
          v_line:=v_line+1;
          insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_DocumentID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID")
          values(v_batch,v_line,v_source_line."FINPostLine_NominalAccountID",p_document_id,v_adjustment."FINAccrual_ID",'Automatic accrual reversal for '||coalesce(v_document."FINDoc_Number",p_document_id::text),round(v_source_line."FINPostLine_CreditAmount"*v_release/v_adjustment."FINAccrual_AccruedAmount",4),round(v_source_line."FINPostLine_DebitAmount"*v_release/v_adjustment."FINAccrual_AccruedAmount",4),v_period."FINPeriod_BaseCurrencyCode",v_job.job_id);
        end loop;
        update public."FIN_Accruals" set
          "FINAccrual_RelievedAmount"="FINAccrual_RelievedAmount"+v_release,
          "FINAccrual_StatusCode"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then 'reversed' else 'partially_reversed' end,
          "FINAccrual_ReversalPeriodID"=v_period_id,
          "FINAccrual_ReversedAt"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then now() else "FINAccrual_ReversedAt" end,
          "FINAccrual_ReversedBy"=case when "FINAccrual_RelievedAmount"+v_release>="FINAccrual_AccruedAmount" then v_user else "FINAccrual_ReversedBy" end
        where "FINAccrual_ID"=v_adjustment."FINAccrual_ID";
        v_available:=v_available-v_release; v_total:=v_total+v_release; v_accrual_total:=v_accrual_total+v_release;
      end loop;
    end if;
  end loop;

  if v_batch is null then
    return jsonb_build_object('documentId',p_document_id,'released',false,'reason','no_outstanding_adjustment');
  end if;

  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;

  update public."FIN_PeriodCloseRunItems" item set
    "FINCloseItem_StatusCode"=case when
      not exists(select 1 from public."FIN_WIPItems" w where w."FINWIP_CloseRunItemID"=item."FINCloseItem_ID" and w."FINWIP_WIPAmount">w."FINWIP_RelievedAmount")
      and not exists(select 1 from public."FIN_Accruals" a where a."FINAccrual_CloseRunItemID"=item."FINCloseItem_ID" and a."FINAccrual_AccruedAmount">a."FINAccrual_RelievedAmount")
      then 'reversed' else 'partially_reversed' end,
    "FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=v_user
  where item."FINCloseItem_ID" in (select "FINRelease_CloseRunItemID" from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=p_document_id);

  update public."FIN_PeriodCloseRuns" run set
    "FINCloseRun_ControlTotalsJSON"=run."FINCloseRun_ControlTotalsJSON"||jsonb_build_object('releasedWIP',totals.released_wip,'releasedAccrual',totals.released_accrual,'lastAutomaticReleaseDocumentId',p_document_id,'lastAutomaticReleaseBatchId',v_batch),
    "FINCloseRun_StatusCode"=case when totals.has_remaining then run."FINCloseRun_StatusCode" else 'reversed' end,
    "FINCloseRun_ReversedAt"=case when totals.has_remaining then run."FINCloseRun_ReversedAt" else now() end,
    "FINCloseRun_ReversedBy"=case when totals.has_remaining then run."FINCloseRun_ReversedBy" else v_user end,
    "FINCloseRun_ReversalBatchID"=case when totals.has_remaining then run."FINCloseRun_ReversalBatchID" else v_batch end,
    "FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=v_user
  from (
    select item."FINCloseItem_CloseRunID" run_id,
      coalesce(sum(release."FINRelease_LocalAmount") filter(where release."FINRelease_ReleaseKindCode"='revenue_wip'),0) released_wip,
      coalesce(sum(release."FINRelease_LocalAmount") filter(where release."FINRelease_ReleaseKindCode"='cost_accrual'),0) released_accrual,
      exists(select 1 from public."FIN_PeriodCloseRunItems" remaining_item left join public."FIN_WIPItems" remaining_wip on remaining_wip."FINWIP_CloseRunItemID"=remaining_item."FINCloseItem_ID" left join public."FIN_Accruals" remaining_accrual on remaining_accrual."FINAccrual_CloseRunItemID"=remaining_item."FINCloseItem_ID" where remaining_item."FINCloseItem_CloseRunID"=item."FINCloseItem_CloseRunID" and (coalesce(remaining_wip."FINWIP_WIPAmount"-remaining_wip."FINWIP_RelievedAmount",0)>0 or coalesce(remaining_accrual."FINAccrual_AccruedAmount"-remaining_accrual."FINAccrual_RelievedAmount",0)>0)) has_remaining
    from public."FIN_PeriodCloseRunItems" item
    join public."FIN_AccrualWIPReleases" release on release."FINRelease_CloseRunItemID"=item."FINCloseItem_ID"
    where item."FINCloseItem_CloseRunID" in (select affected."FINCloseItem_CloseRunID" from public."FIN_PeriodCloseRunItems" affected join public."FIN_AccrualWIPReleases" current_release on current_release."FINRelease_CloseRunItemID"=affected."FINCloseItem_ID" where current_release."FINRelease_DocumentID"=p_document_id)
    group by item."FINCloseItem_CloseRunID"
  ) totals where run."FINCloseRun_ID"=totals.run_id;

  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
  values('finance_lifecycle',v_user,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_document."FINDoc_TypeCode",p_document_id,case when v_kind='revenue_wip' then 'automatic_wip_reversal' else 'automatic_accrual_reversal' end,case when v_kind='revenue_wip' then 'Revenue WIP automatically reversed by AR invoice' else 'Cost accrual automatically reversed by AP invoice' end,true,1,jsonb_build_object('postingBatchId',v_batch,'wipReleased',v_wip_total,'accrualReleased',v_accrual_total,'localCurrency',v_period."FINPeriod_BaseCurrencyCode",'basis','local_net_excluding_tax'));

  return jsonb_build_object('documentId',p_document_id,'released',true,'postingBatchId',v_batch,'wipReleased',v_wip_total,'accrualReleased',v_accrual_total);
end; $$;
revoke all on function public._multideck_finance_release_document_accrual_wip(uuid) from public,anon,authenticated;
grant execute on function public._multideck_finance_release_document_accrual_wip(uuid) to service_role;

create or replace function public._multideck_finance_document_posted_release_trigger()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
  if new."FINDoc_PostingStatusCode"='posted'
     and new."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
     and (tg_op='INSERT' or old."FINDoc_PostingStatusCode" is distinct from new."FINDoc_PostingStatusCode") then
    perform public._multideck_finance_release_document_accrual_wip(new."FINDoc_ID");
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_document_posted_release_trigger() from public,anon,authenticated;
drop trigger if exists "TR_FIN_Documents_automatic_accrual_wip_release" on public."FIN_Documents";
create trigger "TR_FIN_Documents_automatic_accrual_wip_release"
after insert or update of "FINDoc_PostingStatusCode" on public."FIN_Documents"
for each row execute function public._multideck_finance_document_posted_release_trigger();

-- Manual review reversal must now reverse only the balance that has not already
-- been released by invoices. This prevents an invoice release being reversed twice.
create or replace function public.multideck_finance_reverse_accrual_wip(
  p_company_id uuid,p_user_id uuid,p_run_id uuid,p_reversal_period_code text,p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_run public."FIN_PeriodCloseRuns"%rowtype; v_period_id uuid; v_period public."FIN_Periods"%rowtype; v_batch uuid; v_line integer:=0; v_total numeric:=0; v_record record; v_source_line record; v_remaining numeric;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'Explain why this accrual and WIP journal is being reversed.' using errcode='22023'; end if;
  select run.* into v_run from public."FIN_PeriodCloseRuns" run join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINCloseRun_LegalEntityID" where run."FINCloseRun_ID"=p_run_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Accrual and WIP review not found.' using errcode='P0002'; end if;
  if v_run."FINCloseRun_StatusCode"<>'posted' or v_run."FINCloseRun_PostingBatchID" is null then raise exception 'Only a posted review can be reversed.' using errcode='22023'; end if;
  v_period_id:=public._multideck_finance_ensure_period(v_run."FINCloseRun_LegalEntityID",p_reversal_period_code,p_user_id);
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_period_id for update;
  if v_period."FINPeriod_StatusCode"<>'open' then raise exception 'Choose an open reversal period.' using errcode='22023'; end if;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy") values('REV-'||v_period."FINPeriod_Code"||'-'||left(p_run_id::text,8),'posted','FIN_PeriodCloseRuns',p_run_id,v_period_id,v_run."FINCloseRun_LegalEntityID",0,0,v_period."FINPeriod_BaseCurrencyCode",now(),p_user_id,p_user_id) returning "FINPostBatch_ID" into v_batch;
  for v_record in
    select 'accrual' kind,a."FINAccrual_ID" adjustment_id,a."FINAccrual_JobID" job_id,a."FINAccrual_AccruedAmount" original_amount,a."FINAccrual_RelievedAmount" relieved_amount
    from public."FIN_Accruals" a join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=a."FINAccrual_CloseRunItemID" where item."FINCloseItem_CloseRunID"=p_run_id and a."FINAccrual_AccruedAmount">a."FINAccrual_RelievedAmount"
    union all
    select 'wip',w."FINWIP_ID",w."FINWIP_JobID",w."FINWIP_WIPAmount",w."FINWIP_RelievedAmount"
    from public."FIN_WIPItems" w join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=w."FINWIP_CloseRunItemID" where item."FINCloseItem_CloseRunID"=p_run_id and w."FINWIP_WIPAmount">w."FINWIP_RelievedAmount"
    order by kind,adjustment_id
  loop
    v_remaining:=v_record.original_amount-v_record.relieved_amount;
    for v_source_line in select line.* from public."FIN_PostingLines" line where line."FINPostLine_BatchID"=v_run."FINCloseRun_PostingBatchID" and ((v_record.kind='accrual' and line."FINPostLine_AccrualID"=v_record.adjustment_id) or (v_record.kind='wip' and line."FINPostLine_WIPID"=v_record.adjustment_id)) order by line."FINPostLine_LineNo" loop
      v_line:=v_line+1;
      insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values(v_batch,v_line,v_source_line."FINPostLine_NominalAccountID",case when v_record.kind='accrual' then v_record.adjustment_id end,case when v_record.kind='wip' then v_record.adjustment_id end,'Reversal of remaining balance: '||coalesce(v_source_line."FINPostLine_Description",''),round(v_source_line."FINPostLine_CreditAmount"*v_remaining/v_record.original_amount,4),round(v_source_line."FINPostLine_DebitAmount"*v_remaining/v_record.original_amount,4),v_source_line."FINPostLine_CurrencyCodeSnapshot",v_record.job_id);
    end loop;
    if v_record.kind='accrual' then update public."FIN_Accruals" set "FINAccrual_StatusCode"='reversed',"FINAccrual_RelievedAmount"="FINAccrual_AccruedAmount","FINAccrual_ReversalPeriodID"=v_period_id,"FINAccrual_ReversedAt"=now(),"FINAccrual_ReversedBy"=p_user_id where "FINAccrual_ID"=v_record.adjustment_id;
    else update public."FIN_WIPItems" set "FINWIP_StatusCode"='reversed',"FINWIP_RelievedAmount"="FINWIP_WIPAmount","FINWIP_ReversalPeriodID"=v_period_id,"FINWIP_ReversedAt"=now(),"FINWIP_ReversedBy"=p_user_id where "FINWIP_ID"=v_record.adjustment_id; end if;
    v_total:=v_total+v_remaining;
  end loop;
  if v_total<=0 then raise exception 'This review has no remaining accrual or WIP balance to reverse.' using errcode='22023'; end if;
  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;
  update public."FIN_PeriodCloseRunItems" set "FINCloseItem_StatusCode"='reversed',"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=p_user_id where "FINCloseItem_CloseRunID"=p_run_id;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_StatusCode"='reversed',"FINCloseRun_ReversedAt"=now(),"FINCloseRun_ReversedBy"=p_user_id,"FINCloseRun_ReversalBatchID"=v_batch,"FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=p_user_id where "FINCloseRun_ID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,'reverse_accrual_wip','Remaining accrual and WIP journal reversed',btrim(p_reason),true,1,jsonb_build_object('reversalBatchId',v_batch,'periodCode',p_reversal_period_code,'remainingTotal',v_total));
  return jsonb_build_object('runId',p_run_id,'status','reversed','reversalBatchId',v_batch,'total',v_total);
end; $$;
revoke all on function public.multideck_finance_reverse_accrual_wip(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_reverse_accrual_wip(uuid,uuid,uuid,text,text) to service_role;

-- Dexter can inspect release evidence, while the release itself remains a
-- deterministic posting side effect and is never exposed as a chat write.
alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_document_release;
revoke all on function public._multideck_dexter_domain_finance_before_document_release(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_document_release(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(public._multideck_dexter_domain_finance_before_document_release(p_company_id,p_search,p_take)) value
    union all
    select jsonb_strip_nulls(jsonb_build_object(
      'recordId',release."FINRelease_ID",'recordKind','automatic_accrual_wip_release','releaseKind',release."FINRelease_ReleaseKindCode",
      'documentId',document."FINDoc_ID",'documentNumber',document."FINDoc_Number",'documentType',document."FINDoc_TypeCode",
      'jobReference',job."Job_Period"||'-'||job."Job_Number",'localAmount',release."FINRelease_LocalAmount",
      'localCurrency',release."FINRelease_LocalCurrencyCode",'postingBatchId',release."FINRelease_PostingBatchID",
      'evidence',jsonb_build_object('sourceTable','FIN_AccrualWIPReleases','sourceId',release."FINRelease_ID",'legalEntityId',release."FINRelease_LegalEntityID",'updatedAt',release."FINRelease_ReleasedAt")
    )),release."FINRelease_ReleasedAt"
    from public."FIN_AccrualWIPReleases" release
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=release."FINRelease_LegalEntityID"
    join public."FIN_Documents" document on document."FINDoc_ID"=release."FINRelease_DocumentID"
    join public."Job_Header" job on job."Job_ID"=release."FINRelease_JobID"
    where entity."Company_ID"=p_company_id and (nullif(btrim(p_search),'') is null or concat_ws(' ',document."FINDoc_Number",document."FINDoc_TypeCode",job."Job_Period",job."Job_Number",release."FINRelease_ReleaseKindCode") ilike '%'||btrim(p_search)||'%')
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb) from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe finance documents, cash, job management periods, accrual/WIP reviews, postings, automatic invoice-driven releases and reversal evidence.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven finance document, provider-sync, job-period, accrual/WIP review, automatic invoice-driven release, posting and reversal changes.',
  "AIDexterWatchCapability_FieldsJSON"=(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)||'["automaticWIPRelease","automaticAccrualRelease","releaseDocument","releasePostingBatch"]'::jsonb),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

commit;
