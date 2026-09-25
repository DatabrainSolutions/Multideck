begin;

-- Each approved snapshot applies from its accounting date. Later edits to the
-- editable charge map remain proposals until another independently reviewed
-- cutover becomes active. Older postings keep their original account evidence.
drop index public.fin_one_active_charge_cutover;

create or replace function public.multideck_finance_charge_mapping_cutover(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare c public."FIN_ChargeMappingCutovers"; snapshot jsonb; effective date;
begin
  perform public._multideck_journal_access(p_actor,p_entity,
    case when p_action='read' then 'Finance.Management.View'
      when p_action='propose' then 'Finance.Configuration.Manage'
      else 'Finance.Management.Post' end);
  if p_action='read' then
    return coalesce((select jsonb_agg(to_jsonb(x) order by proposed_at desc) from public."FIN_ChargeMappingCutovers" x where legal_entity_id=p_entity),'[]'::jsonb);
  end if;
  if p_action not in ('propose','approve','activate') then raise exception 'Unknown charge mapping cutover action.' using errcode='22023'; end if;
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  if p_action='propose' then
    effective:=(p_input->>'effectiveDate')::date;
    if effective is null or effective::text is distinct from p_input->>'effectiveDate' then
      raise exception 'Choose an exact cutover date in YYYY-MM-DD format.' using errcode='22023'; end if;
    if effective<=coalesce((select max(effective_date) from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active'),'-infinity'::date) then
      raise exception 'Choose a date after the latest active charge mapping cutover.' using errcode='22023'; end if;
    snapshot:=public._multideck_charge_cutover_snapshot(p_entity);
    insert into public."FIN_ChargeMappingCutovers"(legal_entity_id,effective_date,mapping_snapshot,proposed_by)
      values(p_entity,effective,snapshot,p_actor) returning * into c;
  else
    select * into c from public."FIN_ChargeMappingCutovers"
      where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
    if not found then raise exception 'Charge mapping cutover not found.' using errcode='P0002'; end if;
    if (p_action='approve' and c.status<>'proposed') or (p_action='activate' and c.status<>'approved') then
      raise exception 'Complete cutover stages in order.' using errcode='22023'; end if;
    if p_actor=c.proposed_by then raise exception 'A second finance operator must approve and activate this cutover.' using errcode='42501'; end if;
    snapshot:=public._multideck_charge_cutover_snapshot(p_entity);
    if snapshot is distinct from c.mapping_snapshot then raise exception 'Charge mapping changed; propose a new cutover plan.' using errcode='22023'; end if;
    if c.effective_date<=coalesce((select max(effective_date) from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active'),'-infinity'::date) then
      raise exception 'Choose a date after the latest active charge mapping cutover.' using errcode='22023'; end if;
    if p_action='approve' then
      update public."FIN_ChargeMappingCutovers" set status='approved',approved_by=p_actor,approved_at=now() where id=c.id returning * into c;
    else
      if exists(select 1 from public."FIN_Documents" d
        join public."FIN_DocumentLines" l on l."FINDocLine_DocumentID"=d."FINDoc_ID"
        where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate">=c.effective_date
          and d."FINDoc_NativePostingStatusCode"='posted'
          and (l."FINDocLine_ChargeID" is not null or exists(
            select 1 from public."FIN_DocumentLineJobLinks" link
              join public."Job_Costing_Lines" j on j."JobCostingLine_ID"=link."FINDocLineJob_JobCostingLineID"
              where link."FINDocLineJob_DocumentLineID"=l."FINDocLine_ID" and j."JobCostingLine_ChargeCodeID" is not null))) then
        raise exception 'Posted charge documents exist on or after this cutover date; choose a later date and propose again.' using errcode='22023';
      end if;
      if exists(select 1 from public."FIN_PostingBatches" b
        join public."FIN_Periods" p on p."FINPeriod_ID"=b."FINPostBatch_PeriodID"
        where b."FINPostBatch_LegalEntityID"=p_entity and b."FINPostBatch_StatusCode"='posted'
          and b."FINPostBatch_SourceTable"='FIN_PeriodCloseRuns' and p."FINPeriod_EndDate">=c.effective_date) then
        raise exception 'Posted accrual or WIP close journals exist on or after this cutover date; choose a later date.' using errcode='22023';
      end if;
      update public."FIN_ChargeMappingCutovers" set status='active',activated_by=p_actor,activated_at=now() where id=c.id returning * into c;
    end if;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeMappingCutovers','charge_mapping_cutover',c.id,p_action,'Charge mapping cutover '||p_action,true,1,jsonb_build_object('effectiveDate',c.effective_date,'status',c.status,'mappingSnapshot',c.mapping_snapshot));
  return to_jsonb(c);
end; $$;

create or replace function public._multideck_finance_pin_document_charge_mapping()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare cutover public."FIN_ChargeMappingCutovers"; line record; source_line public."FIN_DocumentLines";
  v_charge_id uuid; mapped jsonb; group_id uuid; grp jsonb; account_id uuid; account_code text; side text;
begin
  if new."FINDoc_StatusCode"<>'approved' or old."FINDoc_StatusCode"='approved' then return new; end if;
  select * into cutover from public."FIN_ChargeMappingCutovers"
    where legal_entity_id=new."FINDoc_LegalEntityID" and status='active' and effective_date<=new."FINDoc_AccountingDate"
    order by effective_date desc limit 1 for share;
  if not found then
    if exists(select 1 from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=new."FINDoc_LegalEntityID"
      and "FINNom_Code"='1010.20.20' and "FINNom_IsActive")
      and exists(select 1 from public."FIN_DocumentLines" l where l."FINDocLine_DocumentID"=new."FINDoc_ID"
        and (l."FINDocLine_ChargeID" is not null or exists(
          select 1 from public."FIN_DocumentLineJobLinks" link
            join public."Job_Costing_Lines" j on j."JobCostingLine_ID"=link."FINDocLineJob_JobCostingLineID"
            where link."FINDocLineJob_DocumentLineID"=l."FINDocLine_ID" and j."JobCostingLine_ChargeCodeID" is not null))) then
      raise exception 'Activate a reviewed dated charge mapping before approving this charge document.' using errcode='22023';
    end if;
    return new;
  end if;
  side:=case when new."FINDoc_TypeCode" in ('sl_invoice','credit_note') then 'revenue' else 'cost' end;
  for line in select l."FINDocLine_ID" id,l."FINDocLine_LineNo" line_no,l."FINDocLine_ChargeID" direct_charge,
      (select j."JobCostingLine_ChargeCodeID" from public."FIN_DocumentLineJobLinks" link
        join public."Job_Costing_Lines" j on j."JobCostingLine_ID"=link."FINDocLineJob_JobCostingLineID"
        where link."FINDocLineJob_DocumentLineID"=l."FINDocLine_ID" order by link."FINDocLineJob_JobCostingLineID" limit 1) job_charge
      from public."FIN_DocumentLines" l where l."FINDocLine_DocumentID"=new."FINDoc_ID" order by l."FINDocLine_LineNo" for update of l
  loop
    v_charge_id:=coalesce(line.direct_charge,line.job_charge);
    if v_charge_id is null then continue; end if;
    -- Billing-party corrections must reverse and replace the exact original
    -- posting account, even if today's charge mapping has changed.
    if new."FINDoc_SourceTable"='FIN_Documents' and new."FINDoc_SourceID" is not null
      and new."FINDoc_MetadataJSON"->>'billingPartyCorrection'='true' then
      select * into source_line from public."FIN_DocumentLines"
        where "FINDocLine_DocumentID"=new."FINDoc_SourceID" and "FINDocLine_LineNo"=line.line_no;
      if not found or source_line."FINDocLine_NominalAccountID" is null then
        raise exception 'Original correction line has no nominal account to reverse.' using errcode='22023'; end if;
      account_id:=source_line."FINDocLine_NominalAccountID";
      group_id:=source_line."FINDocLine_ChargeMappingGroupID";
      select "FINNom_Code" into account_code from public."FIN_NominalAccounts" where "FINNom_ID"=account_id and "FINNom_LegalEntityID"=new."FINDoc_LegalEntityID";
      if account_code is null then raise exception 'Original correction nominal is outside the legal entity.' using errcode='22023'; end if;
      update public."FIN_DocumentLines" set "FINDocLine_NominalAccountID"=account_id,
        "FINDocLine_ChargeMappingCutoverID"=source_line."FINDocLine_ChargeMappingCutoverID",
        "FINDocLine_ChargeMappingGroupID"=group_id,"FINDocLine_ChargeMappingVersion"=source_line."FINDocLine_ChargeMappingVersion",
        "FINDocLine_ChargeIDSnapshot"=coalesce(source_line."FINDocLine_ChargeIDSnapshot",v_charge_id),
        "FINDocLine_NominalCodeSnapshot"=coalesce(source_line."FINDocLine_NominalCodeSnapshot",account_code)
      where "FINDocLine_ID"=line.id;
      continue;
    end if;
    mapped:=cutover.mapping_snapshot->v_charge_id::text;
    if mapped is null then raise exception 'Map charge % in an approved cutover before approval.',v_charge_id using errcode='22023'; end if;
    group_id:=(mapped->side->>'id')::uuid;
    if group_id is null then raise exception 'Map charge % to a % nominal group before approval.',v_charge_id,side using errcode='22023'; end if;
    grp:=public._multideck_validate_nominal_group(new."FINDoc_LegalEntityID",group_id,side);
    if grp is distinct from mapped->side then
      raise exception 'The approved charge mapping account changed; propose a new dated cutover.' using errcode='22023';
    end if;
    account_id:=(grp#>>'{actual,id}')::uuid;
    account_code:=grp#>>'{actual,code}';
    update public."FIN_DocumentLines" set "FINDocLine_NominalAccountID"=account_id,
      "FINDocLine_ChargeMappingCutoverID"=cutover.id,"FINDocLine_ChargeMappingGroupID"=group_id,
      "FINDocLine_ChargeMappingVersion"=(mapped->>'version')::integer,"FINDocLine_ChargeIDSnapshot"=v_charge_id,
      "FINDocLine_NominalCodeSnapshot"=account_code
      where "FINDocLine_ID"=line.id;
  end loop;
  return new;
end; $$;

commit;
