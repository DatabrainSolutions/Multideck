begin;

-- A booked charge keeps its actual nominal for invoicing. Month-end estimates
-- must instead post to the accrued member of that charge's nominal group.
-- Keep the legacy branch only for entities that have not activated the new chart.
create or replace function public.multideck_finance_post_accrual_wip(
  p_company_id uuid,p_user_id uuid,p_run_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  v_run public."FIN_PeriodCloseRuns"%rowtype;
  v_period public."FIN_Periods"%rowtype;
  v_item public."FIN_PeriodCloseRunItems"%rowtype;
  v_charge public."FIN_JobChargePeriodAllocations"%rowtype;
  v_mapping public."FIN_ChargeNominalMappings"%rowtype;
  v_batch uuid; v_accrual uuid; v_wip uuid; v_line integer:=0; v_total numeric:=0;
  v_currency text; v_cost uuid; v_income uuid; v_accrual_control uuid; v_wip_control uuid;
  v_has_charge_rows boolean; v_new_chart boolean; v_charge_code_id uuid;
  v_group jsonb;
begin
  select run.* into v_run from public."FIN_PeriodCloseRuns" run
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=run."FINCloseRun_LegalEntityID"
    where run."FINCloseRun_ID"=p_run_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Accrual and WIP review not found.' using errcode='P0002'; end if;
  if v_run."FINCloseRun_StatusCode"<>'approved' then raise exception 'Approve this review before posting it.' using errcode='22023'; end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then
    raise exception 'The finance operator is outside this workspace.' using errcode='42501';
  end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=v_run."FINCloseRun_PeriodID" for update;
  if v_period."FINPeriod_StatusCode" not in ('open','soft_closed') then raise exception 'This management period is locked.' using errcode='22023'; end if;
  v_currency:=v_period."FINPeriod_BaseCurrencyCode";
  select exists(select 1 from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID"
    and "FINNom_Code"='1010.20.20' and "FINNom_IsActive") into v_new_chart;
  if not v_new_chart then
    select "FINNom_ID" into v_cost from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='5000' and "FINNom_IsActive" limit 1;
    select "FINNom_ID" into v_income from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='4000' and "FINNom_IsActive" limit 1;
    select "FINNom_ID" into v_accrual_control from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='2300' and "FINNom_IsActive" limit 1;
    select "FINNom_ID" into v_wip_control from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_run."FINCloseRun_LegalEntityID" and "FINNom_Code"='1400' and "FINNom_IsActive" limit 1;
    if v_cost is null or v_income is null or v_accrual_control is null or v_wip_control is null then
      raise exception 'Configure active legacy accrual and WIP nominals before posting.' using errcode='22023';
    end if;
  end if;
  select exists(select 1 from public."FIN_JobChargePeriodAllocations" allocation
    join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=allocation."FINChargePeriod_CloseRunItemID"
    where item."FINCloseItem_CloseRunID"=p_run_id) into v_has_charge_rows;
  if v_new_chart and not v_has_charge_rows then
    raise exception 'Rebuild this review with charge-level allocations before posting to the new chart.' using errcode='22023';
  end if;
  insert into public."FIN_PostingBatches"("FINPostBatch_Number","FINPostBatch_StatusCode","FINPostBatch_SourceTable","FINPostBatch_SourceID","FINPostBatch_PeriodID","FINPostBatch_LegalEntityID","FINPostBatch_DebitTotal","FINPostBatch_CreditTotal","FINPostBatch_CurrencyCodeSnapshot","FINPostBatch_PostedAt","FINPostBatch_PostedBy","FINPostBatch_CreatedBy")
    values('MA-'||v_period."FINPeriod_Code"||'-'||left(p_run_id::text,8),'posted','FIN_PeriodCloseRuns',p_run_id,v_period."FINPeriod_ID",v_run."FINCloseRun_LegalEntityID",0,0,v_currency,now(),p_user_id,p_user_id)
    returning "FINPostBatch_ID" into v_batch;
  if v_has_charge_rows then
    for v_charge in select allocation.* from public."FIN_JobChargePeriodAllocations" allocation
      join public."FIN_PeriodCloseRunItems" item on item."FINCloseItem_ID"=allocation."FINChargePeriod_CloseRunItemID"
      where item."FINCloseItem_CloseRunID"=p_run_id and (allocation."FINChargePeriod_ApprovedAccrual">0 or allocation."FINChargePeriod_ApprovedWIP">0)
      order by allocation."FINChargePeriod_JobID",allocation."FINChargePeriod_LineNoSnapshot"
    loop
      if v_new_chart then
        select "JobCostingLine_ChargeCodeID" into v_charge_code_id from public."Job_Costing_Lines"
          where "JobCostingLine_ID"=v_charge."FINChargePeriod_JobCostingLineID" for share;
        if v_charge_code_id is null then raise exception 'Assign a managed charge code to every job costing line before accrual posting.' using errcode='22023'; end if;
        select * into v_mapping from public."FIN_ChargeNominalMappings"
          where legal_entity_id=v_run."FINCloseRun_LegalEntityID" and charge_id=v_charge_code_id for share;
        if not found then raise exception 'Map every charge code to nominal groups before accrual posting.' using errcode='22023'; end if;
        if v_charge."FINChargePeriod_ApprovedAccrual">0 then
          if v_mapping.cost_group_id is null then raise exception 'Map this charge code to a cost nominal group.' using errcode='22023'; end if;
          v_group:=public._multideck_validate_nominal_group(v_run."FINCloseRun_LegalEntityID",v_mapping.cost_group_id,'cost');
          v_cost:=(v_group#>>'{accrued,id}')::uuid;
          v_accrual_control:=(v_group->>'control_account_id')::uuid;
        end if;
        if v_charge."FINChargePeriod_ApprovedWIP">0 then
          if v_mapping.revenue_group_id is null then raise exception 'Map this charge code to a revenue nominal group.' using errcode='22023'; end if;
          v_group:=public._multideck_validate_nominal_group(v_run."FINCloseRun_LegalEntityID",v_mapping.revenue_group_id,'revenue');
          v_income:=(v_group#>>'{accrued,id}')::uuid;
          v_wip_control:=(v_group->>'control_account_id')::uuid;
        end if;
      end if;
      if v_charge."FINChargePeriod_ApprovedAccrual">0 then
        insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_JobCostingLineID","FINAccrual_PeriodID","FINAccrual_StatusCode","FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount","FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID","FINAccrual_Description","FINAccrual_ApprovedAt","FINAccrual_ApprovedBy","FINAccrual_PostedAt","FINAccrual_PostedBy")
          values(v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobCostingLineID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_charge."FINChargePeriod_ExpectedCost",v_charge."FINChargePeriod_ApprovedAccrual",v_charge."FINChargePeriod_ApprovedAccrual",v_currency,p_user_id,v_charge."FINChargePeriod_CloseRunItemID",'Cost accrual · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_run."FINCloseRun_ApprovedAt",v_run."FINCloseRun_ApprovedBy",now(),p_user_id) returning "FINAccrual_ID" into v_accrual;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID")
          values(v_batch,v_line,case when v_new_chart then v_cost else coalesce(v_charge."FINChargePeriod_CostNominalAccountID",v_cost) end,v_accrual,'Accrued job cost · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_charge."FINChargePeriod_ApprovedAccrual",0,v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID")
          values(v_batch,v_line,v_accrual_control,v_accrual,'Accrued cost liability · '||v_charge."FINChargePeriod_DescriptionSnapshot",0,v_charge."FINChargePeriod_ApprovedAccrual",v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_total:=v_total+v_charge."FINChargePeriod_ApprovedAccrual";
      end if;
      if v_charge."FINChargePeriod_ApprovedWIP">0 then
        insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_JobCostingLineID","FINWIP_PeriodID","FINWIP_StatusCode","FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount","FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID","FINWIP_Description","FINWIP_ApprovedAt","FINWIP_ApprovedBy","FINWIP_PostedAt","FINWIP_PostedBy")
          values(v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobCostingLineID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_charge."FINChargePeriod_ExpectedRevenue",v_charge."FINChargePeriod_ApprovedWIP",v_charge."FINChargePeriod_ApprovedWIP",v_currency,p_user_id,v_charge."FINChargePeriod_CloseRunItemID",'Revenue WIP · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_run."FINCloseRun_ApprovedAt",v_run."FINCloseRun_ApprovedBy",now(),p_user_id) returning "FINWIP_ID" into v_wip;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID")
          values(v_batch,v_line,v_wip_control,v_wip,'Accrued income and WIP · '||v_charge."FINChargePeriod_DescriptionSnapshot",v_charge."FINChargePeriod_ApprovedWIP",0,v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_Dimension1ID","FINPostLine_JobID")
          values(v_batch,v_line,case when v_new_chart then v_income else coalesce(v_charge."FINChargePeriod_RevenueNominalAccountID",v_income) end,v_wip,'Recognised unbilled revenue · '||v_charge."FINChargePeriod_DescriptionSnapshot",0,v_charge."FINChargePeriod_ApprovedWIP",v_currency,v_charge."FINChargePeriod_JobID",v_charge."FINChargePeriod_JobID");
        v_total:=v_total+v_charge."FINChargePeriod_ApprovedWIP";
      end if;
    end loop;
  else
    -- Reviews without charge lines remain supported only on the legacy chart.
    for v_item in select * from public."FIN_PeriodCloseRunItems" where "FINCloseItem_CloseRunID"=p_run_id and ("FINCloseItem_ApprovedAccrual">0 or "FINCloseItem_ApprovedWIP">0) order by "FINCloseItem_JobID" loop
      if v_item."FINCloseItem_ApprovedAccrual">0 then
        insert into public."FIN_Accruals"("FINAccrual_JobID","FINAccrual_PeriodID","FINAccrual_StatusCode","FINAccrual_AccountingDate","FINAccrual_ExpectedAmount","FINAccrual_AccruedAmount","FINAccrual_LocalAccruedAmount","FINAccrual_CurrencyCodeSnapshot","FINAccrual_CreatedBy","FINAccrual_CloseRunItemID") values(v_item."FINCloseItem_JobID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_item."FINCloseItem_ExpectedCost",v_item."FINCloseItem_ApprovedAccrual",v_item."FINCloseItem_ApprovedAccrual",v_currency,p_user_id,v_item."FINCloseItem_ID") returning "FINAccrual_ID" into v_accrual;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_cost,v_accrual,'Legacy accrued job cost',v_item."FINCloseItem_ApprovedAccrual",0,v_currency,v_item."FINCloseItem_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_AccrualID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_accrual_control,v_accrual,'Legacy accrued cost liability',0,v_item."FINCloseItem_ApprovedAccrual",v_currency,v_item."FINCloseItem_JobID"); v_total:=v_total+v_item."FINCloseItem_ApprovedAccrual";
      end if;
      if v_item."FINCloseItem_ApprovedWIP">0 then
        insert into public."FIN_WIPItems"("FINWIP_JobID","FINWIP_PeriodID","FINWIP_StatusCode","FINWIP_AccountingDate","FINWIP_ExpectedAmount","FINWIP_WIPAmount","FINWIP_LocalWIPAmount","FINWIP_CurrencyCodeSnapshot","FINWIP_CreatedBy","FINWIP_CloseRunItemID") values(v_item."FINCloseItem_JobID",v_period."FINPeriod_ID",'posted',v_period."FINPeriod_EndDate",v_item."FINCloseItem_ExpectedRevenue",v_item."FINCloseItem_ApprovedWIP",v_item."FINCloseItem_ApprovedWIP",v_currency,p_user_id,v_item."FINCloseItem_ID") returning "FINWIP_ID" into v_wip;
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_wip_control,v_wip,'Legacy accrued income and WIP',v_item."FINCloseItem_ApprovedWIP",0,v_currency,v_item."FINCloseItem_JobID");
        v_line:=v_line+1; insert into public."FIN_PostingLines"("FINPostLine_BatchID","FINPostLine_LineNo","FINPostLine_NominalAccountID","FINPostLine_WIPID","FINPostLine_Description","FINPostLine_DebitAmount","FINPostLine_CreditAmount","FINPostLine_CurrencyCodeSnapshot","FINPostLine_JobID") values(v_batch,v_line,v_income,v_wip,'Legacy recognised unbilled revenue',0,v_item."FINCloseItem_ApprovedWIP",v_currency,v_item."FINCloseItem_JobID"); v_total:=v_total+v_item."FINCloseItem_ApprovedWIP";
      end if;
    end loop;
  end if;
  if v_total<=0 then raise exception 'This review has no approved accrual or WIP amounts to post.' using errcode='22023'; end if;
  update public."FIN_PostingBatches" set "FINPostBatch_DebitTotal"=v_total,"FINPostBatch_CreditTotal"=v_total where "FINPostBatch_ID"=v_batch;
  update public."FIN_PeriodCloseRunItems" set "FINCloseItem_StatusCode"='posted',"FINCloseItem_UpdatedAt"=now(),"FINCloseItem_UpdatedBy"=p_user_id where "FINCloseItem_CloseRunID"=p_run_id;
  update public."FIN_PeriodCloseRuns" set "FINCloseRun_StatusCode"='posted',"FINCloseRun_PostedAt"=now(),"FINCloseRun_PostedBy"=p_user_id,"FINCloseRun_PostingBatchID"=v_batch,"FINCloseRun_UpdatedAt"=now(),"FINCloseRun_UpdatedBy"=p_user_id,"FINCloseRun_ControlTotalsJSON"="FINCloseRun_ControlTotalsJSON"||jsonb_build_object('postedTotal',v_total,'postingBatchId',v_batch,'basis','job_charge_lines') where "FINCloseRun_ID"=p_run_id;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON") values('finance_lifecycle',p_user_id,v_run."FINCloseRun_LegalEntityID",'multideck-app','finance','public','FIN_PeriodCloseRuns','accrual_wip_review',p_run_id,'post_accrual_wip','Charge-level accrual and WIP journal posted',true,1,jsonb_build_object('postingBatchId',v_batch,'total',v_total,'currency',v_currency,'basis',case when v_new_chart then 'mapped_charge_groups' else 'job_charge_lines' end));
  return jsonb_build_object('runId',p_run_id,'status','posted','postingBatchId',v_batch,'total',v_total,'currency',v_currency,'basis',case when v_new_chart then 'mapped_charge_groups' else 'job_charge_lines' end);
end; $$;

revoke all on function public.multideck_finance_post_accrual_wip(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_post_accrual_wip(uuid,uuid,uuid) to service_role;

commit;
