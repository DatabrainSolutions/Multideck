-- Reviewable pipeline moves through the canonical CRM writer and existing
-- deterministic deal-stage events. No direct model table writes.
begin;
set local lock_timeout='5s';

create function public.multideck_dexter_domain_deal_move_state(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordId',d."CRMOppty_ID",'name',d."CRMOppty_Name",'sourceTable','CRM_Opportunities',
    'pipelineId',p."CRMPipeline_ID",'pipeline',p."CRMPipeline_Name",
    'stageId',s."CRMPipelineStage_ID",'stage',s."CRMPipelineStage_Name",
    'editVersion',d."CRMOppty_EditVersion",'status',d."CRMOppty_StatusCode",
    'probabilityPct',d."CRMOppty_ProbabilityPct",'expectedValue',d."CRMOppty_ExpectedValueAmount",
    'weightedValue',d."CRMOppty_WeightedValueAmount",'currency',d."CRMOppty_CurrencyCode",
    'sourceUrl','/crm/deals?record='||d."CRMOppty_ID")), '[]'::jsonb)
  from public."CRM_Opportunities" d
  join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID"
  join public."CRM_PipelineStages" s on s."CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID"
  where d."CRMOppty_ID"::text=lower(btrim(p_search))
    and public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",p_company_id);
$$;

create function public.multideck_dexter_domain_deal_stage_options(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(item order by pipeline_order,stage_order,id), '[]'::jsonb) from (
    select jsonb_build_object('recordId',s."CRMPipelineStage_ID",'sourceTable','CRM_PipelineStages',
      'name',s."CRMPipelineStage_Name",'pipelineId',p."CRMPipeline_ID",'pipeline',p."CRMPipeline_Name",
      'pipelineUpdatedAt',p."Updated_At",'updatedAt',s."Updated_At",
      'probabilityPct',s."CRMPipelineStage_ProbabilityPct",'entryRule',s."CRMPipelineStage_EntryRule",
      'isConversion',s."CRMPipelineStage_IsConversion") item,
      p."CRMPipeline_SortOrder" pipeline_order,s."CRMPipelineStage_SortOrder" stage_order,s."CRMPipelineStage_ID" id
    from public."CRM_PipelineStages" s join public."CRM_Pipelines" p on p."CRMPipeline_ID"=s."CRMPipeline_ID"
    where p."Company_ID"=p_company_id and s."Company_ID"=p_company_id and not p."Is_Deleted" and not s."Is_Deleted"
      and (nullif(btrim(p_search),'') is null or p."CRMPipeline_ID"::text=lower(btrim(p_search))
        or s."CRMPipelineStage_ID"::text=lower(btrim(p_search))
        or p."CRMPipeline_Name" ilike '%'||btrim(p_search)||'%' or s."CRMPipelineStage_Name" ilike '%'||btrim(p_search)||'%')
    order by p."CRMPipeline_SortOrder",s."CRMPipelineStage_SortOrder",s."CRMPipelineStage_ID"
    limit greatest(1,least(coalesce(p_take,10),25))
  ) selected;
$$;

-- Preserve the operator endpoint and mature stage/probability/history writer.
-- Enforce its write permission at the server boundary, including drag/drop.
create or replace function public.multideck_crm_move_deal_stage(p_deal_id uuid,p_pipeline_id uuid,p_pipeline_stage_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare ctx record;
begin
  select * into ctx from public._multideck_crm_context();
  if not exists(select 1 from public."cmp_Users" where "User_ID"=ctx.user_id and "Company_ID"=ctx.company_id and "User_AccessStatus"='active')
    or public._multideck_crm_has_permission(ctx.user_id,'CRM.Write') is not true then
    raise exception 'You do not have permission to move deals.' using errcode='42501';end if;
  if not public._multideck_crm_deal_is_operator_visible(p_deal_id,ctx.company_id) then
    raise exception 'Deal not found.' using errcode='P0002';end if;
  return public._multideck_crm_move_deal_stage_unfiltered_20260818(p_deal_id,p_pipeline_id,p_pipeline_stage_id);
end $$;

create function public.multideck_dexter_action_move_deal_stage(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid;deal public."CRM_Opportunities";stage public."CRM_PipelineStages";pipeline public."CRM_Pipelines";
  previous_sub text:=current_setting('request.jwt.claim.sub',true);result jsonb;
  target uuid;destination uuid;destination_pipeline uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id
    and "Company_ID"=p_company_id and "User_AccessStatus"='active';
  if actor is null or public._multideck_crm_has_permission(p_user_id,'CRM.Read') is not true
    or public._multideck_crm_has_permission(p_user_id,'CRM.Write') is not true then
    raise exception 'You do not have permission to move this deal.' using errcode='42501';end if;
  if jsonb_typeof(p_arguments) is distinct from 'object' or not(p_arguments ?& array[
    'target_id','pipeline_id','stage_id','expected_version','expected_stage_updated_at','expected_pipeline_updated_at','reason'])
    or exists(select 1 from jsonb_object_keys(p_arguments) k where k not in
      ('target_id','pipeline_id','stage_id','expected_version','expected_stage_updated_at','expected_pipeline_updated_at','reason','_document_evidence')) then
    raise exception 'Read the deal and destination stage before preparing this move.' using errcode='22023';end if;
  target:=(p_arguments->>'target_id')::uuid;destination:=(p_arguments->>'stage_id')::uuid;destination_pipeline:=(p_arguments->>'pipeline_id')::uuid;
  if (p_arguments->>'expected_version')::bigint is null or (p_arguments->>'expected_version')::bigint<1
    or nullif(btrim(p_arguments->>'expected_stage_updated_at'),'') is null
    or nullif(btrim(p_arguments->>'expected_pipeline_updated_at'),'') is null then
    raise exception 'Read the current deal and stage before requesting approval.' using errcode='22023';end if;
  if not public._multideck_crm_deal_is_operator_visible(target,p_company_id) then
    raise exception 'Deal not found.' using errcode='P0002';end if;
  select * into deal from public."CRM_Opportunities" where "CRMOppty_ID"=target for update;
  if deal."CRMOppty_EditVersion"<>(p_arguments->>'expected_version')::bigint then
    raise exception 'This deal changed after review. Ask Dexter to prepare the move again.' using errcode='P0001';end if;
  select * into pipeline from public."CRM_Pipelines" where "CRMPipeline_ID"=destination_pipeline and "Company_ID"=p_company_id and not "Is_Deleted" for share;
  if not found then raise exception 'Choose an active pipeline in this workspace.' using errcode='22023';end if;
  select * into stage from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=destination and "CRMPipeline_ID"=destination_pipeline and "Company_ID"=p_company_id and not "Is_Deleted" for share;
  if not found then raise exception 'Choose an active stage in that pipeline.' using errcode='22023';end if;
  if stage."Updated_At" is distinct from (p_arguments->>'expected_stage_updated_at')::timestamptz
    or pipeline."Updated_At" is distinct from (p_arguments->>'expected_pipeline_updated_at')::timestamptz then
    raise exception 'The destination stage changed after review. Ask Dexter to prepare the move again.' using errcode='P0001';end if;
  if stage."CRMPipelineStage_IsConversion" then
    raise exception 'Use the deal-won workflow for a conversion stage so customer activation is reviewed.' using errcode='22023';end if;
  if deal."CRMOppty_PipelineID"=destination_pipeline and deal."CRMOppty_PipelineStageID"=destination then
    raise exception 'This deal is already in that stage.' using errcode='22023';end if;
  -- Scoped impersonation of the approved actor for the legacy canonical writer.
  -- The service-only adapter rechecks actor/company/permissions above; restore
  -- the previous claim on both success and failure before returning.
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin
    result:=public.multideck_crm_move_deal_stage(target,destination_pipeline,destination);
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  exception when others then
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);raise;
  end;
  return jsonb_build_object('recordId',target,'name',deal."CRMOppty_Name",'pipeline',pipeline."CRMPipeline_Name",
    'stage',stage."CRMPipelineStage_Name",'probabilityPct',stage."CRMPipelineStage_ProbabilityPct",
    'sourceUrl','/crm/deals?record='||target,'result',result);
end $$;

revoke all on function public.multideck_dexter_domain_deal_move_state(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.multideck_dexter_domain_deal_stage_options(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.multideck_dexter_action_move_deal_stage(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_deal_move_state(uuid,text,integer),public.multideck_dexter_domain_deal_stage_options(uuid,text,integer),public.multideck_dexter_action_move_deal_stage(uuid,uuid,jsonb) to service_role;

insert into public."sys_AIDexterDataDomains" ("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON","AIDexterDomain_ScopeStrategy") values
('deal_move_state','Deal move review','Exact deal ID lookup with saved pipeline, stage, edit version and probability. Query before proposing a pipeline move.','multideck_dexter_domain_deal_move_state',31,true,'["CRM.Read"]','["business_record"]','canonical'),
('deal_stage_options','Pipeline stages','Active stages with pipeline identity, names, probability and review timestamps. Search by pipeline ID/name or stage ID/name. Conversion stages require the deal-won workflow.','multideck_dexter_domain_deal_stage_options',32,true,'["CRM.Read"]','["business_record"]','canonical');
insert into public."sys_AIDexterActions" ("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function","AIDexterAction_ParametersJSON","AIDexterAction_SortOrder","AIDexterAction_IsActive","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_ScopeStrategy","AIDexterAction_AlwaysRequiresApproval") values
('move_deal_stage','deals','Move deal','Move a deal to a reviewed active pipeline stage, updating stage probability and weighted value. Read deal_move_state and deal_stage_options first. Conversion stages use the deal-won workflow.','multideck_dexter_action_move_deal_stage','{"type":"object","properties":{"target_id":{"type":"string","description":"Exact deal recordId from deal_move_state."},"pipeline_id":{"type":"string","description":"Exact pipelineId from deal_stage_options."},"stage_id":{"type":"string","description":"Exact stage recordId from deal_stage_options."},"expected_version":{"type":"integer","minimum":1},"expected_stage_updated_at":{"type":"string"},"expected_pipeline_updated_at":{"type":"string"},"reason":{"type":"string"}},"required":["target_id","pipeline_id","stage_id","expected_version","expected_stage_updated_at","expected_pipeline_updated_at","reason"],"additionalProperties":false}',33,true,'["CRM.Read","CRM.Write"]','move_deal_stage','canonical',true);

-- One deal source adapter preserves the existing fields and adds pipeline/stage
-- identities. Moving between identically named stages still emits one signal.
create function public._multideck_dexter_deal_watch_snapshot(d public."CRM_Opportunities")
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('name',d."CRMOppty_Name",'stage',(select "CRMPipelineStage_Name" from public."CRM_PipelineStages" where "CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID"),
    'stageId',d."CRMOppty_PipelineStageID",'pipelineId',d."CRMOppty_PipelineID",
    'pipeline',(select "CRMPipeline_Name" from public."CRM_Pipelines" where "CRMPipeline_ID"=d."CRMOppty_PipelineID"),
    'status',d."CRMOppty_StatusCode",'expectedCloseDate',d."CRMOppty_ExpectedCloseDate",'probabilityPct',d."CRMOppty_ProbabilityPct",
    'expectedValue',d."CRMOppty_ExpectedValueAmount",'expectedMargin',d."CRMOppty_ExpectedMarginAmount",'nextActionDueAt',d."CRMOppty_NextActionDueAt");
$$;
create function public._multideck_dexter_deal_stage_signal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid;before_value jsonb:='{}';after_value jsonb;
begin
  select "Company_ID" into company from public."CRM_Pipelines" where "CRMPipeline_ID"=new."CRMOppty_PipelineID" and not "Is_Deleted";
  if company is null or not public._multideck_crm_deal_is_operator_visible(new."CRMOppty_ID",company) then return new;end if;
  if tg_op<>'INSERT' then before_value:=public._multideck_dexter_deal_watch_snapshot(old);end if;
  after_value:=public._multideck_dexter_deal_watch_snapshot(new);
  if before_value is distinct from after_value and exists(select 1 from public."AI_DexterWatches" w
    where w."AIDexterWatch_CompanyID"=company and w."AIDexterWatch_CapabilityCode"='deals'
      and w."AIDexterWatch_StatusCode"='active' and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new."CRMOppty_ID")) then
    insert into public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company,'deals',tg_table_name,new."CRMOppty_ID",before_value,after_value);
  end if;
  return new;
end $$;
revoke all on function public._multideck_dexter_deal_watch_snapshot(public."CRM_Opportunities"),public._multideck_dexter_deal_stage_signal() from public,anon,authenticated;
drop trigger if exists "TR_CRM_Opportunities_dexter_watch" on public."CRM_Opportunities";
create trigger "TR_CRM_Opportunities_dexter_watch" after insert or update on public."CRM_Opportunities"
for each row execute function public._multideck_dexter_deal_stage_signal();
update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description"='Pipeline, stage, probability, value and follow-up changes, including approved Dexter moves.',
  "AIDexterWatchCapability_FieldsJSON"=(select jsonb_agg(distinct value) from jsonb_array_elements("AIDexterWatchCapability_FieldsJSON"||'["pipeline","pipelineId","stageId"]'::jsonb))
where "AIDexterWatchCapability_Code"='deals';
commit;
