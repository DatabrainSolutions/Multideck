begin;

do $$
declare
  v_entity uuid; v_company uuid; v_user uuid; v_job uuid; v_period uuid; v_run uuid; v_item uuid;
  v_original_batch uuid; v_wip uuid; v_accrual uuid; v_ar1 uuid; v_ar2 uuid; v_ap1 uuid; v_costing_line uuid; v_document_line uuid;
  v_result jsonb; v_value numeric; v_count integer;
begin
  select entity."LegalEntity_ID",entity."Company_ID" into v_entity,v_company from public."cmp_LegalEntities" entity order by entity."LegalEntity_CreatedAt" limit 1;
  select "User_ID" into v_user from public."cmp_Users" where "Company_ID"=v_company and coalesce("User_AccessStatus",'active')='active' limit 1;
  select job."Job_ID" into v_job from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where office."Company_ID"=v_company and not job."Job_IsDeleted" limit 1;
  if v_entity is null or v_user is null or v_job is null then raise exception 'The demo needs one legal entity, active user and job for this transactional verification.'; end if;

  update public."Job_Header" set "Job_LegalEntityID"=v_entity,"Job_Period"='202608' where "Job_ID"=v_job;
  select "JobCostingLine_ID" into v_costing_line from public."Job_Costing_Lines" where "Job_ID"=v_job order by "JobCostingLine_Number" limit 1;
  if v_costing_line is null then
    insert into public."Job_Costing_Lines"("Job_ID","JobCostingLine_Number","JobCostingLine_Description","JobCostingLine_CostAmountLocal","JobCostingLine_RevenueAmountLocal","JobCostingLine_CreatedBy") values(v_job,1,'Transactional charge line',80,100,v_user) returning "JobCostingLine_ID" into v_costing_line;
  end if;
  update public."Job_Costing_Lines" set "JobCostingLine_CostAmountLocal"=80,"JobCostingLine_RevenueAmountLocal"=100 where "JobCostingLine_ID"=v_costing_line;
  v_period:=public._multideck_finance_ensure_period(v_entity,'202608',v_user);
  insert into public."FIN_PeriodCloseRuns"("FINCloseRun_PeriodID","FINCloseRun_LegalEntityID","FINCloseRun_RunTypeCode","FINCloseRun_StatusCode","FINCloseRun_StartedBy","FINCloseRun_Reason","FINCloseRun_ControlTotalsJSON","FINCloseRun_UpdatedBy") values(v_period,v_entity,'month_end','posted',v_user,'Transactional automatic-release verification','{"proposedWIP":100,"proposedAccrual":80}'::jsonb,v_user) returning "FINCloseRun_ID" into v_run;
  insert into public."FIN_PeriodCloseRunItems"("FINCloseItem_CloseRunID","FINCloseItem_ItemTypeCode","FINCloseItem_SourceTable","FINCloseItem_SourceID","FINCloseItem_JobID","FINCloseItem_StatusCode","FINCloseItem_ApprovedWIP","FINCloseItem_ApprovedAccrual","FINCloseItem_CurrencyCodeSnapshot","FINCloseItem_UpdatedBy") values(v_run,'job_accrual_wip','Job_Header',v_job,v_job,'posted',100,80,'GBP',v_user) returning "FINCloseItem_ID" into v_item;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy") values('TEST-ORIGINAL','posted','FIN_PeriodCloseRuns',v_run,v_period,v_entity,180,180,'GBP',now(),v_user,v_user) returning "FINPostBatch_ID" into v_original_batch;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_PostingBatchID"=v_original_batch where "FINCloseRun_ID"=v_run;
  insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_JobCostingLineID","FINWIP_PeriodID","FINWIP_StatusCode","FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount","FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID","FINWIP_PostedAt","FINWIP_PostedBy") values(v_job,v_costing_line,v_period,'posted','2026-08-31',100,100,100,'GBP',v_user,v_item,now(),v_user) returning "FINWIP_ID" into v_wip;
  insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_StatusCode","FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount","FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID","FINAccrual_PostedAt","FINAccrual_PostedBy") values(v_job,v_costing_line,v_period,'posted','2026-08-31',80,80,80,'GBP',v_user,v_item,now(),v_user) returning "FINAccrual_ID" into v_accrual;
  insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values (v_original_batch,1,v_wip,'Original WIP asset',100,0,'GBP',v_job),(v_original_batch,2,v_wip,'Original WIP income',0,100,'GBP',v_job);
  insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID") values (v_original_batch,3,v_accrual,'Original accrued cost',80,0,'GBP',v_job),(v_original_batch,4,v_accrual,'Original accrual liability',0,80,'GBP',v_job);
  select count(*) into v_count from public."FIN_PostingLines" where "FINPostLine_BatchID"=v_original_batch and "FINPostLine_JobID"=v_job and "FINPostLine_Dimension1ID" is null;
  if v_count<>4 then raise exception 'Job-dimension routing expected 4 lines, got %',v_count; end if;

  insert into public."FIN_Documents"("FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_DocumentDate","FINDoc_AccountingDate","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_NetAmount","FINDoc_LocalNetAmount","FINDoc_GrossAmount","FINDoc_LocalGrossAmount","FINDoc_SourceJobID","FINDoc_PostingStatusCode","FINDoc_CreatedBy","FINDoc_UpdatedBy") values('sl_invoice','draft','TEST-AR-1',v_entity,'2026-08-30','2026-08-30','GBP',1,60,60,60,60,v_job,'draft',v_user,v_user) returning "FINDoc_ID" into v_ar1;
  insert into public."FIN_DocumentLines"("FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_Description","FINDocLine_Quantity","FINDocLine_UnitAmount","FINDocLine_NetAmount","FINDocLine_GrossAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalGrossAmount") values(v_ar1,1,'Matched AR charge',1,60,60,60,60,60) returning "FINDocLine_ID" into v_document_line;
  insert into public."FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LinkTypeCode","FINDocLineJob_NetAmount","FINDocLineJob_LocalNetAmount") values(v_ar1,v_document_line,v_job,v_costing_line,'source_charge_line',60,60);
  update public."FIN_Documents" set "FINDoc_StatusCode"='submitted',"FINDoc_PostingStatusCode"='posted',"FINDoc_PostedBy"=v_user where "FINDoc_ID"=v_ar1;
  select "FINWIP_RelievedAmount" into v_value from public."FIN_WIPItems" where "FINWIP_ID"=v_wip; if v_value<>60 then raise exception 'AR partial release expected 60, got %',v_value; end if;
  select "FINChargeProfit_RecognisedRevenue" into v_value from public."FIN_JobChargeProfitability" where "FINChargeProfit_JobCostingLineID"=v_costing_line; if v_value<>100 then raise exception 'AR reclassification changed recognised revenue to %',v_value; end if;
  select count(*) into v_count from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=v_ar1; if v_count<>1 then raise exception 'AR evidence expected once, got %',v_count; end if;
  perform public._multideck_finance_release_document_accrual_wip(v_ar1);
  select count(*) into v_count from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=v_ar1; if v_count<>1 then raise exception 'Idempotency failed, got %',v_count; end if;

  insert into public."FIN_Documents"("FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_DocumentDate","FINDoc_AccountingDate","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_NetAmount","FINDoc_LocalNetAmount","FINDoc_GrossAmount","FINDoc_LocalGrossAmount","FINDoc_SourceJobID","FINDoc_PostingStatusCode","FINDoc_CreatedBy","FINDoc_UpdatedBy") values('pl_invoice','draft','TEST-AP-1',v_entity,'2026-08-30','2026-08-30','GBP',1,50,50,50,50,v_job,'draft',v_user,v_user) returning "FINDoc_ID" into v_ap1;
  insert into public."FIN_DocumentLines"("FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_Description","FINDocLine_Quantity","FINDocLine_UnitAmount","FINDocLine_NetAmount","FINDocLine_GrossAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalGrossAmount") values(v_ap1,1,'Matched AP charge',1,50,50,50,50,50) returning "FINDocLine_ID" into v_document_line;
  insert into public."FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LinkTypeCode","FINDocLineJob_NetAmount","FINDocLineJob_LocalNetAmount") values(v_ap1,v_document_line,v_job,v_costing_line,'source_charge_line',50,50);
  update public."FIN_Documents" set "FINDoc_StatusCode"='submitted',"FINDoc_PostingStatusCode"='posted',"FINDoc_PostedBy"=v_user where "FINDoc_ID"=v_ap1;
  select "FINAccrual_RelievedAmount" into v_value from public."FIN_Accruals" where "FINAccrual_ID"=v_accrual; if v_value<>50 then raise exception 'AP partial release expected 50, got %',v_value; end if;
  select "FINChargeProfit_GrossProfit" into v_value from public."FIN_JobChargeProfitability" where "FINChargeProfit_JobCostingLineID"=v_costing_line; if v_value<>20 then raise exception 'Matched AR/AP reclassification changed gross profit to %',v_value; end if;

  insert into public."FIN_Documents"("FINDoc_TypeCode","FINDoc_StatusCode","FINDoc_Number","FINDoc_LegalEntityID","FINDoc_DocumentDate","FINDoc_AccountingDate","FINDoc_CurrencyCodeSnapshot","FINDoc_ExchangeRate","FINDoc_NetAmount","FINDoc_LocalNetAmount","FINDoc_GrossAmount","FINDoc_LocalGrossAmount","FINDoc_SourceJobID","FINDoc_PostingStatusCode","FINDoc_CreatedBy","FINDoc_UpdatedBy") values('sl_invoice','draft','TEST-AR-2',v_entity,'2026-08-30','2026-08-30','GBP',1,100,100,100,100,v_job,'draft',v_user,v_user) returning "FINDoc_ID" into v_ar2;
  insert into public."FIN_DocumentLines"("FINDocLine_DocumentID","FINDocLine_LineNo","FINDocLine_Description","FINDocLine_Quantity","FINDocLine_UnitAmount","FINDocLine_NetAmount","FINDocLine_GrossAmount","FINDocLine_LocalNetAmount","FINDocLine_LocalGrossAmount") values(v_ar2,1,'Matched AR charge remainder',1,100,100,100,100,100) returning "FINDocLine_ID" into v_document_line;
  insert into public."FIN_DocumentLineJobLinks"("FINDocLineJob_DocumentID","FINDocLineJob_DocumentLineID","FINDocLineJob_JobID","FINDocLineJob_JobCostingLineID","FINDocLineJob_LinkTypeCode","FINDocLineJob_NetAmount","FINDocLineJob_LocalNetAmount") values(v_ar2,v_document_line,v_job,v_costing_line,'source_charge_line',100,100);
  update public."FIN_Documents" set "FINDoc_StatusCode"='submitted',"FINDoc_PostingStatusCode"='posted',"FINDoc_PostedBy"=v_user where "FINDoc_ID"=v_ar2;
  select "FINWIP_RelievedAmount" into v_value from public."FIN_WIPItems" where "FINWIP_ID"=v_wip; if v_value<>100 then raise exception 'AR cap expected 100, got %',v_value; end if;
  select "FINRelease_LocalAmount" into v_value from public."FIN_AccrualWIPReleases" where "FINRelease_DocumentID"=v_ar2; if v_value<>40 then raise exception 'AR cap expected 40 release, got %',v_value; end if;

  v_result:=public.multideck_finance_reverse_accrual_wip(v_company,v_user,v_run,'202609','Verification of remaining balance only');
  if (v_result->>'total')::numeric<>30 then raise exception 'Manual remainder expected 30, got %',v_result->>'total'; end if;
  select "FINAccrual_RelievedAmount" into v_value from public."FIN_Accruals" where "FINAccrual_ID"=v_accrual; if v_value<>80 then raise exception 'Accrual final relief expected 80, got %',v_value; end if;
end $$;

rollback;
select 'automatic AR/AP release transaction passed' as verification;
