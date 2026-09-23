begin;

-- Read-only rollout: use one database snapshot and exact decimal strings. No
-- existing estimate, accrual, posting, policy or supplier obligation is changed.
create function public.multideck_finance_cost_review(
  p_actor uuid, p_entity uuid, p_offset integer default 0, p_search text default ''
) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb; currency text;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_search is null or length(p_search)>120 then
    raise exception 'Invalid cost review page or search.' using errcode='22023';
  end if;
  select "LegalEntity_BaseCurrencyCodeSnapshot" into currency from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if currency is null or currency !~ '^[A-Z]{3}$' then raise exception 'Configure the legal entity base currency.' using errcode='22023'; end if;
  with scoped as materialized (
    select l.*,j."Job_Number",j."Job_Period",j."Job_Status",j."Job_IsDeleted"
    from public."Job_Costing_Lines" l
    join public."Job_Header" j on j."Job_ID"=l."Job_ID" and j."Job_LegalEntityID"=p_entity
    join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    join public."cmp_LegalEntities" e on e."LegalEntity_ID"=p_entity and e."Company_ID"=o."Company_ID"
    where (p_search='' or position(lower(p_search) in lower(coalesce(l."JobCostingLine_Description",'')||' '||j."Job_Period"||'-'||j."Job_Number"::text))>0)
  ), page as (
    select * from scoped order by "Job_Period" desc,"Job_Number" desc,"JobCostingLine_Number","JobCostingLine_ID" limit 100 offset p_offset
  ), evidence as (
    select l.*,a.actual,a.documents,a.has_credit,a.has_pending,a.has_wrong_supplier,
      b.balance,b.accrual_ids,b.invalid_balance,b.currency_mismatch,
      n."FINNom_Code" nominal_code,
      coalesce(n."FINNom_IsActive",false) and not coalesce(n."FINNom_IsControlAccount",true) nominal_valid
    from page l
    left join public."FIN_NominalAccounts" n on n."FINNom_ID"=l."JobCostingLine_CostNominalAccountID" and n."FINNom_LegalEntityID"=p_entity
    cross join lateral (
      select coalesce(sum(case when d."FINDoc_TypeCode"='debit_note' then -abs(link."FINDocLineJob_LocalNetAmount") else link."FINDocLineJob_LocalNetAmount" end)
        filter(where d."FINDoc_NativePostingStatusCode"='posted'),0) actual,
        coalesce(jsonb_agg(distinct d."FINDoc_ID") filter(where d."FINDoc_NativePostingStatusCode"='posted'),'[]'::jsonb) documents,
        coalesce(bool_or(d."FINDoc_TypeCode"='debit_note' or d."FINDoc_NativePostingStatusCode"='reversed'),false) has_credit,
        coalesce(bool_or(d."FINDoc_NativePostingStatusCode" not in ('posted','reversed')),false) has_pending,
        coalesce(bool_or(d."FINDoc_PartyOrgID" is distinct from l."JobCostingLine_SupplierID"),false) has_wrong_supplier
      from public."FIN_DocumentLineJobLinks" link
      join public."FIN_Documents" d on d."FINDoc_ID"=link."FINDocLineJob_DocumentID" and d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_TypeCode" in ('pl_invoice','debit_note')
      where link."FINDocLineJob_JobCostingLineID"=l."JobCostingLine_ID" and link."FINDocLineJob_JobID"=l."Job_ID"
    ) a
    cross join lateral (
      select coalesce(sum(ac."FINAccrual_AccruedAmount"-ac."FINAccrual_RelievedAmount") filter(where ac."FINAccrual_CurrencyCodeSnapshot"=currency),0) balance,
        coalesce(jsonb_agg(ac."FINAccrual_ID" order by ac."FINAccrual_ID"),'[]'::jsonb) accrual_ids,
        coalesce(bool_or(ac."FINAccrual_RelievedAmount"<0 or ac."FINAccrual_RelievedAmount">ac."FINAccrual_AccruedAmount"),false) invalid_balance,
        coalesce(bool_or(ac."FINAccrual_CurrencyCodeSnapshot" is distinct from currency),false) currency_mismatch
      from public."FIN_Accruals" ac
      join public."FIN_Periods" ap on ap."FINPeriod_ID"=ac."FINAccrual_PeriodID" and ap."FINPeriod_LegalEntityID"=p_entity
      where ac."FINAccrual_JobCostingLineID"=l."JobCostingLine_ID" and ac."FINAccrual_JobID"=l."Job_ID"
        and ac."FINAccrual_StatusCode" in ('posted','partially_reversed','reversed')
    ) b
  ), rows as (
    select jsonb_build_object(
      'id',"JobCostingLine_ID",'jobId',"Job_ID",'jobReference',"Job_Period"||'-'||"Job_Number",'lineNo',"JobCostingLine_Number",
      'chargeCodeId',"JobCostingLine_ChargeCodeID",'supplierId',"JobCostingLine_SupplierID",'description',"JobCostingLine_Description",'nominalCode',nominal_code,
      'currentEstimate',"JobCostingLine_CostAmountLocal"::text,'originalEstimate',null,
      'actualCost',actual::text,'openAccrual',case when currency_mismatch or invalid_balance then null else balance::text end,
      'remainingEstimate',case when "JobCostingLine_CostAmountLocal" is null or has_credit or actual<0 then null else greatest("JobCostingLine_CostAmountLocal"-actual,0)::text end,
      'favourableVariance',case when "JobCostingLine_CostAmountLocal" is null then null else ("JobCostingLine_CostAmountLocal"-actual)::text end,
      'sourceDocumentIds',documents,'sourceAccrualIds',accrual_ids,
      'reasons',to_jsonb(array_remove(array[
        case when "JobCostingLine_CostAmountLocal" is null then 'Cost estimate missing' end,
        case when "JobCostingLine_CostAmountLocal"<0 then 'Negative estimate requires review' end,
        case when "Job_IsDeleted" or "Job_Status" in ('cancelled','draft','provisional') then 'Job eligibility requires review' end,
        case when has_credit or actual<0 then 'Credit or reversal requires review' end,
        case when has_pending then 'Linked documents not yet posted' end,
        case when has_wrong_supplier then 'Supplier match requires review' end,
        case when not nominal_valid then 'Cost nominal requires review' end,
        case when currency_mismatch then 'Accrual currency requires review' end,
        case when invalid_balance then 'Accrual balance requires review' end,
        case when actual>"JobCostingLine_CostAmountLocal" then 'Actual cost exceeds estimate' end,
        case when actual>0 then 'Confirm partial or final invoice' else 'Awaiting matched invoice' end
      ],null))) value,"Job_Period","Job_Number","JobCostingLine_Number","JobCostingLine_ID"
    from evidence
  )
  select jsonb_build_object('mode','review_only','asOf',statement_timestamp(),'currency',currency,'offset',p_offset,'pageSize',100,
    'total',(select count(*) from scoped),
    'rows',coalesce((select jsonb_agg(value order by "Job_Period" desc,"Job_Number" desc,"JobCostingLine_Number","JobCostingLine_ID") from rows),'[]'::jsonb)) into result;
  return result;
end; $$;
revoke all on function public.multideck_finance_cost_review(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_cost_review(uuid,uuid,integer,text) to service_role;

comment on function public.multideck_finance_cost_review(uuid,uuid,integer,text) is 'Read-only lifetime job-charge cost review. No finalisation authority, age-based release or automatic posting. Exact decimal strings; finance view permission and company/entity isolation required.';
commit;
