begin;

create or replace function public.multideck_finance_approval_decision(
  p_company_id uuid,p_entity_id uuid,p_workflow text,p_amount numeric,p_context jsonb
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_policy public."FIN_ApprovalPolicies"%rowtype; v_reason text:='policy_missing'; v_auto boolean:=false;
  v_variance numeric; v_context_ok boolean:=false;
begin
  -- Policy saves lock this row FOR UPDATE before appending a revision. Hold a
  -- compatible read lock until the governed transaction finishes, then read
  -- the latest committed revision after any concurrent save has committed.
  perform 1 from public."cmp_LegalEntities"
  where "LegalEntity_ID"=p_entity_id and "Company_ID"=p_company_id and "LegalEntity_IsActive"
  for share;
  if not found then
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

commit;
