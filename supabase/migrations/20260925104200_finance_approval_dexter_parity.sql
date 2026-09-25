begin;

-- Preserve the existing Finance records and add the current, entity-scoped
-- policy revision as another source-backed read. Dexter cannot change policy.
alter function public.multideck_dexter_domain_finance(uuid,text,integer)
  rename to _multideck_dexter_domain_finance_before_approval_policy;
revoke all on function public._multideck_dexter_domain_finance_before_approval_policy(uuid,text,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_domain_finance_before_approval_policy(uuid,text,integer) to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select value,coalesce((value->'evidence'->>'updatedAt')::timestamptz,'2000-01-01'::timestamptz) updated_at
    from jsonb_array_elements(coalesce(public._multideck_dexter_domain_finance_before_approval_policy(p_company_id,p_search,p_take),'[]'::jsonb)) value
    union all
    select jsonb_build_object(
      'recordId',policy."FINApprovalPolicy_ID",'recordKind','approval_policy',
      'legalEntityId',policy."FINApprovalPolicy_LegalEntityID",'legalEntity',entity."LegalEntity_Name",
      'workflow',policy."FINApprovalPolicy_WorkflowCode",'mode',policy."FINApprovalPolicy_ModeCode",
      'revision',policy."FINApprovalPolicy_Revision",'maxAutoAmount',policy."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',policy."FINApprovalPolicy_MaxVariancePercent",'baseCurrency',entity."LegalEntity_BaseCurrencyCodeSnapshot",
      'reason',policy."FINApprovalPolicy_Reason",'createdAt',policy."FINApprovalPolicy_CreatedAt",
      'evidence',jsonb_build_object('sourceTable','FIN_ApprovalPolicies','sourceId',policy."FINApprovalPolicy_ID",
        'legalEntityId',policy."FINApprovalPolicy_LegalEntityID",'updatedAt',policy."FINApprovalPolicy_CreatedAt")
    ),policy."FINApprovalPolicy_CreatedAt"
    from (
      select distinct on ("FINApprovalPolicy_LegalEntityID","FINApprovalPolicy_WorkflowCode") *
      from public."FIN_ApprovalPolicies"
      order by "FINApprovalPolicy_LegalEntityID","FINApprovalPolicy_WorkflowCode","FINApprovalPolicy_Revision" desc
    ) policy
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=policy."FINApprovalPolicy_LegalEntityID"
    where entity."Company_ID"=p_company_id and entity."LegalEntity_IsActive"
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',entity."LegalEntity_Name",policy."FINApprovalPolicy_WorkflowCode",
        policy."FINApprovalPolicy_ModeCode",policy."FINApprovalPolicy_Reason",'finance approval policy') ilike '%'||btrim(p_search)||'%')
  )
  select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
  from (select value,updated_at from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) bounded
$$;
revoke all on function public.multideck_dexter_domain_finance(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid,text,integer) to service_role;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description"='Tenant-safe native finance, approvals, cash, operational accounting, current workflow approval policy and source evidence. Dexter cannot change statutory or approval policy settings.',
  "AIDexterDomain_UpdatedAt"=now()
where "AIDexterDomain_Code"='finance';
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Event-driven Finance changes, including entity approval policy revision and mode changes.',
  "AIDexterWatchCapability_FieldsJSON"=(coalesce("AIDexterWatchCapability_FieldsJSON",'[]'::jsonb)
    || '["approvalWorkflow","approvalMode","approvalRevision","maxAutoAmount","maxVariancePercent"]'::jsonb),
  "AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='finance';

create function public._multideck_dexter_finance_approval_policy_watch_change()
returns trigger language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_previous public."FIN_ApprovalPolicies"%rowtype;
begin
  select "Company_ID" into v_company from public."cmp_LegalEntities"
  where "LegalEntity_ID"=new."FINApprovalPolicy_LegalEntityID";
  if v_company is null or not exists(select 1 from public."AI_DexterWatches" watch
    join public."cmp_Users" owner on owner."User_ID"=watch."AIDexterWatch_OwnerUserID"
    where watch."AIDexterWatch_CompanyID"=v_company and watch."AIDexterWatch_CapabilityCode"='finance'
      and watch."AIDexterWatch_StatusCode"='active'
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID"=new."FINApprovalPolicy_LegalEntityID")
      and owner."Company_ID"=v_company and owner."User_AccessStatus"='active'
      and (public._multideck_dexter_has_permission(owner."User_ID",'Finance.Receivables.View')
        or public._multideck_dexter_has_permission(owner."User_ID",'Finance.Payables.View')))
  then return new; end if;
  select * into v_previous from public."FIN_ApprovalPolicies"
  where "FINApprovalPolicy_LegalEntityID"=new."FINApprovalPolicy_LegalEntityID"
    and "FINApprovalPolicy_WorkflowCode"=new."FINApprovalPolicy_WorkflowCode"
    and "FINApprovalPolicy_Revision"=new."FINApprovalPolicy_Revision"-1;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
    "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
  values(v_company,'finance','FIN_ApprovalPolicies',new."FINApprovalPolicy_LegalEntityID",
    case when v_previous."FINApprovalPolicy_ID" is null then '{}'::jsonb else jsonb_build_object(
      'approvalWorkflow',v_previous."FINApprovalPolicy_WorkflowCode",'approvalMode',v_previous."FINApprovalPolicy_ModeCode",
      'approvalRevision',v_previous."FINApprovalPolicy_Revision",'maxAutoAmount',v_previous."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',v_previous."FINApprovalPolicy_MaxVariancePercent") end,
    jsonb_build_object('approvalWorkflow',new."FINApprovalPolicy_WorkflowCode",'approvalMode',new."FINApprovalPolicy_ModeCode",
      'approvalRevision',new."FINApprovalPolicy_Revision",'maxAutoAmount',new."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',new."FINApprovalPolicy_MaxVariancePercent",'policyId',new."FINApprovalPolicy_ID"));
  return new;
end; $$;
revoke all on function public._multideck_dexter_finance_approval_policy_watch_change() from public,anon,authenticated;
create trigger "TR_FIN_ApprovalPolicies_dexter_watch" after insert on public."FIN_ApprovalPolicies"
for each row execute function public._multideck_dexter_finance_approval_policy_watch_change();

commit;
