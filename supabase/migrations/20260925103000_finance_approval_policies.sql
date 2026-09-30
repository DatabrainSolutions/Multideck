begin;

insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable","WorkflowRecordType_Description","WorkflowRecordType_IsActive","WorkflowRecordType_SortOrder")
values('finance_approval_policy','Finance approval policy','FIN_ApprovalPolicies','Versioned legal-entity workflow approval policy.',true,129)
on conflict ("WorkflowRecordType_Code") do update set "WorkflowRecordType_Description"=excluded."WorkflowRecordType_Description","WorkflowRecordType_IsActive"=true;

-- Policy revisions are append-only. An absent policy always requires review.
create table public."FIN_ApprovalPolicies" (
  "FINApprovalPolicy_ID" uuid primary key default gen_random_uuid(),
  "FINApprovalPolicy_LegalEntityID" uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  "FINApprovalPolicy_WorkflowCode" text not null check ("FINApprovalPolicy_WorkflowCode" in (
    'document','cash','payment_run','purchase_order','supplier_match',
    'charge_correction','charge_case_resolution','recognition_mandate',
    'vat_control','period_close','opening_balance','opening_fx','bank_match'
  )),
  "FINApprovalPolicy_Revision" integer not null check ("FINApprovalPolicy_Revision">0),
  "FINApprovalPolicy_ModeCode" text not null check ("FINApprovalPolicy_ModeCode" in ('always_review','exception_review','automatic')),
  "FINApprovalPolicy_MaxAutoAmount" numeric(18,4) check ("FINApprovalPolicy_MaxAutoAmount">=0 and "FINApprovalPolicy_MaxAutoAmount"<1000000000000),
  "FINApprovalPolicy_MaxVariancePercent" numeric(9,4) check ("FINApprovalPolicy_MaxVariancePercent">=0 and "FINApprovalPolicy_MaxVariancePercent"<=100),
  "FINApprovalPolicy_Reason" text not null check (length(btrim("FINApprovalPolicy_Reason")) between 1 and 500),
  "FINApprovalPolicy_CreatedAt" timestamptz not null default now(),
  "FINApprovalPolicy_CreatedBy" uuid not null references public."cmp_Users"("User_ID"),
  constraint "UX_FIN_ApprovalPolicies_revision" unique ("FINApprovalPolicy_LegalEntityID","FINApprovalPolicy_WorkflowCode","FINApprovalPolicy_Revision"),
  constraint "CK_FIN_ApprovalPolicies_bounded" check ("FINApprovalPolicy_ModeCode"='always_review' or "FINApprovalPolicy_MaxAutoAmount" is not null)
);
create index "IX_FIN_ApprovalPolicies_latest" on public."FIN_ApprovalPolicies"("FINApprovalPolicy_LegalEntityID","FINApprovalPolicy_WorkflowCode","FINApprovalPolicy_Revision" desc);
alter table public."FIN_ApprovalPolicies" enable row level security;
revoke all on public."FIN_ApprovalPolicies" from public,anon,authenticated;
grant select,insert on public."FIN_ApprovalPolicies" to service_role;

create function public._multideck_finance_approval_policy_immutable() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  raise exception 'Approval policy revisions are immutable.' using errcode='42501';
end; $$;
revoke all on function public._multideck_finance_approval_policy_immutable() from public,anon,authenticated;
create trigger "TR_FIN_ApprovalPolicies_immutable" before update or delete on public."FIN_ApprovalPolicies"
for each row execute function public._multideck_finance_approval_policy_immutable();

create function public.multideck_finance_save_approval_policy(
  p_company_id uuid,p_user_id uuid,p_entity_id uuid,p_workflow text,p_mode text,
  p_max_auto_amount numeric,p_max_variance_percent numeric,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_revision integer; v_policy public."FIN_ApprovalPolicies"%rowtype;
begin
  perform public._multideck_journal_access(p_user_id,p_entity_id,'Finance.Configuration.Manage');
  if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive") then
    raise exception 'Approval policy entity is outside this workspace.' using errcode='42501';
  end if;
  if p_workflow not in ('document','cash','payment_run','purchase_order','supplier_match','charge_correction',
    'charge_case_resolution','recognition_mandate','vat_control','period_close','opening_balance','opening_fx','bank_match')
    or p_mode not in ('always_review','exception_review','automatic') then
    raise exception 'Choose a supported approval workflow and mode.' using errcode='22023';
  end if;
  if p_mode<>'always_review' and (p_max_auto_amount is null or p_max_auto_amount<0 or p_max_auto_amount>=1000000000000
    or p_max_auto_amount::text in ('NaN','Infinity','-Infinity') or p_max_auto_amount<>round(p_max_auto_amount,4)) then
    raise exception 'Automatic approval needs a finite base-currency amount limit.' using errcode='22023';
  end if;
  if p_max_variance_percent is not null and (p_max_variance_percent<0 or p_max_variance_percent>100
    or p_max_variance_percent::text in ('NaN','Infinity','-Infinity') or p_max_variance_percent<>round(p_max_variance_percent,4)) then
    raise exception 'The variance limit must be between zero and 100 percent.' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception 'Explain the approval policy change.' using errcode='22023';
  end if;
  -- Lock the entity to serialise policy revisions without changing a prior revision.
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id for update;
  select coalesce(max("FINApprovalPolicy_Revision"),0)+1 into v_revision
  from public."FIN_ApprovalPolicies" where "FINApprovalPolicy_LegalEntityID"=p_entity_id and "FINApprovalPolicy_WorkflowCode"=p_workflow;
  insert into public."FIN_ApprovalPolicies"("FINApprovalPolicy_LegalEntityID","FINApprovalPolicy_WorkflowCode",
    "FINApprovalPolicy_Revision","FINApprovalPolicy_ModeCode","FINApprovalPolicy_MaxAutoAmount",
    "FINApprovalPolicy_MaxVariancePercent","FINApprovalPolicy_Reason","FINApprovalPolicy_CreatedBy")
  values(p_entity_id,p_workflow,v_revision,p_mode,case when p_mode='always_review' then null else p_max_auto_amount end,
    case when p_mode='always_review' then null else p_max_variance_percent end,btrim(p_reason),p_user_id)
  returning * into v_policy;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,p_entity_id,'multideck-app','finance','public','FIN_ApprovalPolicies',
    'finance_approval_policy',v_policy."FINApprovalPolicy_ID",'save_approval_policy','Finance approval policy changed',
    jsonb_build_object('workflow',p_workflow,'mode',p_mode,'revision',v_revision,'maxAutoAmount',v_policy."FINApprovalPolicy_MaxAutoAmount",
      'maxVariancePercent',v_policy."FINApprovalPolicy_MaxVariancePercent",'reason',btrim(p_reason)));
  return jsonb_build_object('policyId',v_policy."FINApprovalPolicy_ID",'entityId',p_entity_id,'workflow',p_workflow,
    'mode',p_mode,'revision',v_revision,'maxAutoAmount',v_policy."FINApprovalPolicy_MaxAutoAmount",
    'maxVariancePercent',v_policy."FINApprovalPolicy_MaxVariancePercent");
end; $$;
revoke all on function public.multideck_finance_save_approval_policy(uuid,uuid,uuid,text,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_save_approval_policy(uuid,uuid,uuid,text,text,numeric,numeric,text) to service_role;

create function public.multideck_finance_approval_decision(
  p_company_id uuid,p_entity_id uuid,p_workflow text,p_amount numeric,p_context jsonb
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_policy public."FIN_ApprovalPolicies"%rowtype; v_reason text:='policy_missing'; v_auto boolean:=false;
  v_variance numeric; v_context_ok boolean:=false;
begin
  if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive") then
    raise exception 'Approval decision entity is outside this workspace.' using errcode='42501';
  end if;
  select * into v_policy from public."FIN_ApprovalPolicies"
  where "FINApprovalPolicy_LegalEntityID"=p_entity_id and "FINApprovalPolicy_WorkflowCode"=p_workflow
  order by "FINApprovalPolicy_Revision" desc limit 1;
  if found then
    v_reason:='review_required';
    if v_policy."FINApprovalPolicy_ModeCode"<>'always_review' then
      if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<0 then
        v_reason:='invalid_amount';
      elsif p_amount>v_policy."FINApprovalPolicy_MaxAutoAmount" then
        v_reason:='amount_limit';
      elsif jsonb_typeof(p_context) is distinct from 'object'
        or jsonb_typeof(p_context->'hardException') is distinct from 'boolean'
        or jsonb_typeof(p_context->'advisoryException') is distinct from 'boolean' then
        v_reason:='missing_exception_evidence';
      elsif p_context->>'hardException'='true' then
        v_reason:='hard_exception';
      elsif v_policy."FINApprovalPolicy_ModeCode"='exception_review' and p_context->>'advisoryException'='true' then
        v_reason:='advisory_exception';
      else
        v_context_ok:=true;
        if v_policy."FINApprovalPolicy_MaxVariancePercent" is not null then
          if coalesce(p_context->>'variancePercent','') !~ '^[0-9]+(\.[0-9]+)?$' then
            v_context_ok:=false; v_reason:='missing_variance_evidence';
          else
            v_variance:=(p_context->>'variancePercent')::numeric;
            if v_variance>v_policy."FINApprovalPolicy_MaxVariancePercent" then
              v_context_ok:=false; v_reason:='variance_limit';
            end if;
          end if;
        end if;
        if v_context_ok then v_auto:=true; v_reason:='within_policy'; end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('mode',coalesce(v_policy."FINApprovalPolicy_ModeCode",'always_review'),
    'canAuto',v_auto,'reason',v_reason,'revision',v_policy."FINApprovalPolicy_Revision",
    'policyId',v_policy."FINApprovalPolicy_ID");
end; $$;
revoke all on function public.multideck_finance_approval_decision(uuid,uuid,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_approval_decision(uuid,uuid,text,numeric,jsonb) to service_role;

create function public.multideck_finance_list_approval_policies(p_company_id uuid,p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_policies jsonb;
begin
  if not exists(select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive") then
    raise exception 'Approval policy entity is outside this workspace.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('policyId',policy."FINApprovalPolicy_ID",'entityId',policy."FINApprovalPolicy_LegalEntityID",
    'workflow',policy."FINApprovalPolicy_WorkflowCode",'mode',policy."FINApprovalPolicy_ModeCode",'revision',policy."FINApprovalPolicy_Revision",
    'maxAutoAmount',policy."FINApprovalPolicy_MaxAutoAmount",'maxVariancePercent',policy."FINApprovalPolicy_MaxVariancePercent",
    'reason',policy."FINApprovalPolicy_Reason",'createdAt',policy."FINApprovalPolicy_CreatedAt") order by policy."FINApprovalPolicy_WorkflowCode"),'[]'::jsonb)
  into v_policies from (
    select distinct on ("FINApprovalPolicy_WorkflowCode") * from public."FIN_ApprovalPolicies"
    where "FINApprovalPolicy_LegalEntityID"=p_entity_id
    order by "FINApprovalPolicy_WorkflowCode","FINApprovalPolicy_Revision" desc
  ) policy;
  return v_policies;
end; $$;
revoke all on function public.multideck_finance_list_approval_policies(uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_list_approval_policies(uuid,uuid) to service_role;

commit;
