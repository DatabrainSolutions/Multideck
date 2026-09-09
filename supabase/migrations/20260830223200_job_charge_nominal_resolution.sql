begin;

create or replace function public._multideck_finance_resolve_job_legal_entity(p_job_id uuid)
returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(job."Job_LegalEntityID", default_entity."LegalEntity_ID")
  from public."Job_Header" job
  left join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
  left join public."cmp_Users" creator on creator."User_ID"=job."Job_CreatedBy"
  left join lateral (
    select entity."LegalEntity_ID"
    from public."cmp_LegalEntities" entity
    where entity."Company_ID"=coalesce(office."Company_ID",creator."Company_ID")
      and entity."LegalEntity_IsActive"
    order by entity."LegalEntity_IsDefault" desc,entity."LegalEntity_CreatedAt",entity."LegalEntity_ID"
    limit 1
  ) default_entity on true
  where job."Job_ID"=p_job_id
$$;

create or replace function public._multideck_finance_resolve_nominal(
  p_legal_entity_id uuid,p_preferred_nominal_id uuid,p_default_code text
) returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
  select target."FINNom_ID"
  from public."FIN_NominalAccounts" target
  where target."FINNom_LegalEntityID"=p_legal_entity_id
    and target."FINNom_IsActive"
    and target."FINNom_Code"=coalesce(
      (select preferred."FINNom_Code" from public."FIN_NominalAccounts" preferred where preferred."FINNom_ID"=p_preferred_nominal_id),
      p_default_code
    )
  order by (target."FINNom_ID"=p_preferred_nominal_id) desc,target."FINNom_CreatedAt",target."FINNom_ID"
  limit 1
$$;

revoke all on function public._multideck_finance_resolve_job_legal_entity(uuid) from public,anon,authenticated;
revoke all on function public._multideck_finance_resolve_nominal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public._multideck_finance_resolve_job_legal_entity(uuid) to service_role;
grant execute on function public._multideck_finance_resolve_nominal(uuid,uuid,text) to service_role;

create or replace function public._multideck_finance_default_job_charge_nominals()
returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_entity uuid;
begin
  v_entity:=public._multideck_finance_resolve_job_legal_entity(new."Job_ID");
  if v_entity is not null then
    new."JobCostingLine_CostNominalAccountID":=public._multideck_finance_resolve_nominal(v_entity,new."JobCostingLine_CostNominalAccountID",'5000');
    new."JobCostingLine_RevenueNominalAccountID":=public._multideck_finance_resolve_nominal(v_entity,new."JobCostingLine_RevenueNominalAccountID",'4000');
  end if;
  return new;
end; $$;

drop trigger if exists "TR_FIN_default_job_charge_nominals" on public."Job_Costing_Lines";
create trigger "TR_FIN_default_job_charge_nominals"
before insert or update of "Job_ID","JobCostingLine_CostNominalAccountID","JobCostingLine_RevenueNominalAccountID"
on public."Job_Costing_Lines"
for each row execute function public._multideck_finance_default_job_charge_nominals();

create or replace function public._multideck_finance_remap_job_charge_nominals()
returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new."Job_LegalEntityID" is distinct from old."Job_LegalEntityID" and new."Job_LegalEntityID" is not null then
    update public."Job_Costing_Lines" line set
      "JobCostingLine_CostNominalAccountID"=public._multideck_finance_resolve_nominal(new."Job_LegalEntityID",line."JobCostingLine_CostNominalAccountID",'5000'),
      "JobCostingLine_RevenueNominalAccountID"=public._multideck_finance_resolve_nominal(new."Job_LegalEntityID",line."JobCostingLine_RevenueNominalAccountID",'4000')
    where line."Job_ID"=new."Job_ID";
  end if;
  return new;
end; $$;

drop trigger if exists "TR_FIN_remap_job_charge_nominals" on public."Job_Header";
create trigger "TR_FIN_remap_job_charge_nominals"
after update of "Job_LegalEntityID" on public."Job_Header"
for each row execute function public._multideck_finance_remap_job_charge_nominals();

update public."Job_Costing_Lines" line set
  "JobCostingLine_CostNominalAccountID"=public._multideck_finance_resolve_nominal(public._multideck_finance_resolve_job_legal_entity(line."Job_ID"),line."JobCostingLine_CostNominalAccountID",'5000'),
  "JobCostingLine_RevenueNominalAccountID"=public._multideck_finance_resolve_nominal(public._multideck_finance_resolve_job_legal_entity(line."Job_ID"),line."JobCostingLine_RevenueNominalAccountID",'4000')
where public._multideck_finance_resolve_job_legal_entity(line."Job_ID") is not null;

create or replace function public.multideck_finance_link_document_charge_lines(
  p_company_id uuid,p_user_id uuid,p_document_id uuid,p_lines jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v_document public."FIN_Documents"%rowtype; v_entry jsonb; v_line_id uuid; v_costing_line uuid; v_nominal uuid; v_count integer:=0;
begin
  select document.* into v_document
  from public."FIN_Documents" document
  join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=document."FINDoc_LegalEntityID"
  where document."FINDoc_ID"=p_document_id and entity."Company_ID"=p_company_id for update;
  if not found then raise exception 'Finance document not found.' using errcode='P0002'; end if;
  if v_document."FINDoc_StatusCode"<>'draft' or v_document."FINDoc_SourceJobID" is null then
    if v_document."FINDoc_SourceJobID" is null then return jsonb_build_object('documentId',p_document_id,'linkedCount',0); end if;
    raise exception 'Only a job-linked draft can change charge allocations.' using errcode='22023';
  end if;
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id and coalesce("User_AccessStatus",'active')='active') then raise exception 'The finance operator is outside this workspace.' using errcode='42501'; end if;
  if jsonb_typeof(p_lines)<>'array' then raise exception 'Charge allocations must be an array.' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_lines) loop
    select line."FINDocLine_ID" into v_line_id from public."FIN_DocumentLines" line
    where line."FINDocLine_DocumentID"=p_document_id and line."FINDocLine_LineNo"=(v_entry->>'lineNo')::integer;
    if v_line_id is null then raise exception 'Finance line % was not found.',v_entry->>'lineNo' using errcode='P0002'; end if;
    v_costing_line:=nullif(v_entry->>'jobCostingLineId','')::uuid;
    if v_costing_line is not null then
      select case when v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then line."JobCostingLine_RevenueNominalAccountID" else line."JobCostingLine_CostNominalAccountID" end
      into v_nominal from public."Job_Costing_Lines" line
      where line."JobCostingLine_ID"=v_costing_line and line."Job_ID"=v_document."FINDoc_SourceJobID";
      if not found then raise exception 'A selected charge line does not belong to this job.' using errcode='42501'; end if;
      v_nominal:=public._multideck_finance_resolve_nominal(
        v_document."FINDoc_LegalEntityID",v_nominal,
        case when v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then '4000' else '5000' end
      );
      if v_nominal is null then raise exception 'Assign a nominal code to the selected job charge before review.' using errcode='22023'; end if;
      if v_document."FINDoc_TypeCode" in ('sl_invoice','credit_note') then
        update public."Job_Costing_Lines" set "JobCostingLine_RevenueNominalAccountID"=v_nominal where "JobCostingLine_ID"=v_costing_line;
      else
        update public."Job_Costing_Lines" set "JobCostingLine_CostNominalAccountID"=v_nominal where "JobCostingLine_ID"=v_costing_line;
      end if;
    else v_nominal:=null;
    end if;
    update public."FIN_DocumentLineJobLinks" set "FINDocLineJob_JobCostingLineID"=v_costing_line,"FINDocLineJob_LinkTypeCode"=case when v_costing_line is null then 'source_job' else 'source_charge_line' end
    where "FINDocLineJob_DocumentID"=p_document_id and "FINDocLineJob_DocumentLineID"=v_line_id and "FINDocLineJob_JobID"=v_document."FINDoc_SourceJobID";
    update public."FIN_DocumentLines" set "FINDocLine_NominalAccountID"=v_nominal where "FINDocLine_ID"=v_line_id;
    if v_costing_line is not null then v_count:=v_count+1; end if;
  end loop;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_user_id,v_document."FINDoc_LegalEntityID",'multideck-app','finance','public','FIN_Documents',v_document."FINDoc_TypeCode",p_document_id,'link_job_charge_lines','Document lines linked to job charges',true,v_count,jsonb_build_object('linkedCount',v_count));
  return jsonb_build_object('documentId',p_document_id,'linkedCount',v_count);
end; $$;

revoke all on function public.multideck_finance_link_document_charge_lines(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_link_document_charge_lines(uuid,uuid,uuid,jsonb) to service_role;

commit;
