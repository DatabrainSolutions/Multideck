begin;
create function public.multideck_dexter_domain_customs_assessments(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(x.payload order by x.created_at desc,x.id desc),'[]'::jsonb) from (
    select a.id,a.created_at,jsonb_build_object('recordId',a.id,'declarationId',a.declaration_id,
      'sourceId',a.source_id,'calculationId',a.calculation_id,'createdAt',a.created_at,
      'adapterVersion',a.adapter_version,'evidence',a.evidence,'direction','import',
      'sourceType',case when d."CUST_JobID" is null then 'standalone' else 'job_related' end,
      'submissionFieldsChanged',false) payload
    from public."Customs_AssessmentComparisons" a join public."Customs_Declarations" d on d."CUST_id"=a.declaration_id
    where a.declaration_id::text=btrim(coalesce(p_search,''))
      and public.customs_declaration_current_user_authorised(a.declaration_id,false)
      and exists(select 1 from public."cmp_Users" actor where actor."Auth_User_ID"=auth.uid() and actor."Company_ID"=p_company_id)
    order by a.created_at desc,a.id desc limit greatest(1,least(coalesce(p_take,10),25))
  ) x;
$$;
revoke all on function public.multideck_dexter_domain_customs_assessments(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_customs_assessments(uuid,text,integer) to service_role;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_SortOrder","AIDexterDomain_IsActive","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_UpdatedAt")
values('customs_assessments','Customs assessment comparisons','Saved comparisons against the calculation linked at submission. Search requires the exact authorised declaration UUID. Includes evidence/source IDs, adapter version, exact differences and incomplete reasons. A matched estimate is not rule certification. No raw provider envelope or independent AI arithmetic.','multideck_dexter_domain_customs_assessments',27,true,'["Customs.Read"]',now())
on conflict("AIDexterDomain_Code") do update set "AIDexterDomain_Description"=excluded."AIDexterDomain_Description","AIDexterDomain_QueryFunction"=excluded."AIDexterDomain_QueryFunction","AIDexterDomain_IsActive"=true,"AIDexterDomain_RequiredPermissionsJSON"=excluded."AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_UpdatedAt"=now();

update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_FieldsJSON"=(select jsonb_agg(distinct value) from jsonb_array_elements(coalesce("AIDexterWatchCapability_FieldsJSON",'[]')||'["assessmentEvent"]'::jsonb)),"AIDexterWatchCapability_UpdatedAt"=now()
where "AIDexterWatchCapability_Code"='customs_declarations';

create function public._multideck_dexter_customs_assessment_watch_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare declaration public."Customs_Declarations"; company_id uuid;
begin
  select * into declaration from public."Customs_Declarations" where "CUST_id"=new.declaration_id;
  if not found or declaration."CUST_IsDeleted" then return new; end if;
  if declaration."CUST_JobID" is not null then
    select office."Company_ID" into company_id from public."Job_Header" job join public."cmp_Offices" office
      on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") where job."Job_ID"=declaration."CUST_JobID";
  else
    select actor."Company_ID" into company_id from public."cmp_Users" actor where actor."Auth_User_ID"=declaration."CUST_CreatedBy" order by actor."User_ID" limit 1;
  end if;
  if company_id is null then return new; end if;
  perform public._multideck_dexter_pause_unauthorised_customs_watches(company_id,new.declaration_id);
  if not exists(select 1 from public."AI_DexterWatches" w where w."AIDexterWatch_CompanyID"=company_id and w."AIDexterWatch_CapabilityCode"='customs_declarations' and w."AIDexterWatch_TargetID"=new.declaration_id and w."AIDexterWatch_StatusCode"='active') then return new; end if;
  insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode","AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
    values(company_id,'customs_declarations','Customs_AssessmentComparisons',new.declaration_id,'{}',jsonb_build_object('assessmentEvent',new.id,'sourceType',case when declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,'direction','import','updatedAt',new.created_at));
  return new;
end;
$$;
revoke all on function public._multideck_dexter_customs_assessment_watch_change() from public,anon,authenticated;
create trigger customs_assessment_watch_event after insert on public."Customs_AssessmentComparisons" for each row execute function public._multideck_dexter_customs_assessment_watch_change();

do $patch$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker:='watch."AIDexterWatch_RuleJSON"->>''field'' = ''calculationEvent''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review assessment repeat handling'; end if;
  definition:=replace(definition,marker,'watch."AIDexterWatch_RuleJSON"->>''field'' in (''calculationEvent'',''assessmentEvent'')');
  marker:='new."AIDexterWatchSignal_SourceTable" <> ''Customs_CalculationAudit''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review assessment watch permissions'; end if;
  definition:=replace(definition,marker,'new."AIDexterWatchSignal_SourceTable" not in (''Customs_CalculationAudit'',''Customs_AssessmentComparisons'')');
  marker:='if watch."AIDexterWatch_CapabilityCode" = ''customs_declarations''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review assessment notification wording'; end if;
  definition:=replace(definition,marker,$wording$
    if watch."AIDexterWatch_CapabilityCode"='customs_declarations' and v_field='assessmentEvent' then
      v_event_body:=coalesce(watch."AIDexterWatch_TargetLabel",'Your declaration') || ': an assessment comparison was recorded. Review the result and any differences.';
      v_changed:=jsonb_build_object('field',v_field,'sourceId',new."AIDexterWatchSignal_SourceID",'assessmentId',v_new);
    elsif watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'$wording$);
  execute definition;
end $patch$;
commit;
