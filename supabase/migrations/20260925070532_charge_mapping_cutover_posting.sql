begin;

-- A mapping is prepared and independently approved before it may govern new
-- postings. Historic documents retain the nominal selected at their cutover.
create table public."FIN_ChargeMappingCutovers" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  effective_date date not null,
  status text not null default 'proposed' check (status in ('proposed','approved','active')),
  mapping_snapshot jsonb not null check (jsonb_typeof(mapping_snapshot)='object'),
  proposed_by uuid not null references public."cmp_Users"("User_ID"),
  proposed_at timestamptz not null default now(),
  approved_by uuid references public."cmp_Users"("User_ID"),
  approved_at timestamptz,
  activated_by uuid references public."cmp_Users"("User_ID"),
  activated_at timestamptz,
  unique (legal_entity_id,effective_date)
);
create unique index fin_one_active_charge_cutover on public."FIN_ChargeMappingCutovers"(legal_entity_id) where status='active';
alter table public."FIN_ChargeMappingCutovers" enable row level security;
revoke all on public."FIN_ChargeMappingCutovers" from public,anon,authenticated;
grant select,insert,update on public."FIN_ChargeMappingCutovers" to service_role;

alter table public."FIN_DocumentLines"
  add column "FINDocLine_ChargeMappingCutoverID" uuid references public."FIN_ChargeMappingCutovers"(id),
  add column "FINDocLine_ChargeMappingGroupID" uuid references public."FIN_NominalGroups"(id),
  add column "FINDocLine_ChargeMappingVersion" integer,
  add column "FINDocLine_ChargeIDSnapshot" uuid,
  add column "FINDocLine_NominalCodeSnapshot" text;

insert into public."sys_WorkflowRecordTypes"("WorkflowRecordType_Code","WorkflowRecordType_Name","WorkflowRecordType_SourceTable","WorkflowRecordType_Description")
values ('charge_mapping_cutover','Charge mapping cutover','FIN_ChargeMappingCutovers','Independently approved effective date for charge to nominal posting')
on conflict ("WorkflowRecordType_Code") do nothing;

create function public._multideck_charge_cutover_snapshot(p_entity uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare m public."FIN_ChargeNominalMappings"; result jsonb:='{}'; cost jsonb; revenue jsonb;
begin
  for m in select * from public."FIN_ChargeNominalMappings" where legal_entity_id=p_entity order by charge_id for share loop
    cost:=null; revenue:=null;
    if m.cost_group_id is not null then cost:=public._multideck_validate_nominal_group(p_entity,m.cost_group_id,'cost'); end if;
    if m.revenue_group_id is not null then revenue:=public._multideck_validate_nominal_group(p_entity,m.revenue_group_id,'revenue'); end if;
    result:=result||jsonb_build_object(m.charge_id::text,jsonb_build_object('version',m.version,'cost',cost,'revenue',revenue));
  end loop;
  if result='{}'::jsonb then raise exception 'Map at least one charge code before proposing cutover.' using errcode='22023'; end if;
  return result;
end; $$;
revoke all on function public._multideck_charge_cutover_snapshot(uuid) from public,anon,authenticated;
grant execute on function public._multideck_charge_cutover_snapshot(uuid) to service_role;

create function public.multideck_finance_charge_mapping_cutover(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
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
    if exists(select 1 from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active') then
      raise exception 'This legal entity already has an active charge mapping cutover.' using errcode='22023';
    end if;
    effective:=(p_input->>'effectiveDate')::date;
    if effective is null or effective::text is distinct from p_input->>'effectiveDate' then
      raise exception 'Choose an exact cutover date in YYYY-MM-DD format.' using errcode='22023'; end if;
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
    if p_action='approve' then
      update public."FIN_ChargeMappingCutovers" set status='approved',approved_by=p_actor,approved_at=now() where id=c.id returning * into c;
    else
      if exists(select 1 from public."FIN_Documents" d
        join public."FIN_DocumentLines" l on l."FINDocLine_DocumentID"=d."FINDoc_ID"
        where d."FINDoc_LegalEntityID"=p_entity and d."FINDoc_AccountingDate">=c.effective_date
          and d."FINDoc_NativePostingStatusCode"='posted' and l."FINDocLine_ChargeID" is not null) then
        raise exception 'Posted charge documents exist on or after this cutover date; choose a later date and propose again.' using errcode='22023';
      end if;
      update public."FIN_ChargeMappingCutovers" set status='active',activated_by=p_actor,activated_at=now() where id=c.id returning * into c;
    end if;
  end if;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_ChargeMappingCutovers','charge_mapping_cutover',c.id,p_action,'Charge mapping cutover '||p_action,true,1,jsonb_build_object('effectiveDate',c.effective_date,'status',c.status,'mappingSnapshot',c.mapping_snapshot));
  return to_jsonb(c);
end; $$;
revoke all on function public.multideck_finance_charge_mapping_cutover(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_charge_mapping_cutover(uuid,uuid,text,jsonb) to service_role;

-- Approval is the last point before the existing native-posting trigger writes
-- a journal. Pin every charge's mapped actual nominal on the document line.
create function public._multideck_finance_pin_document_charge_mapping()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare cutover public."FIN_ChargeMappingCutovers"; line record; source_line public."FIN_DocumentLines";
  v_charge_id uuid; mapped public."FIN_ChargeNominalMappings"; group_id uuid; grp jsonb; account_id uuid; account_code text; side text;
begin
  if new."FINDoc_StatusCode"<>'approved' or old."FINDoc_StatusCode"='approved' then return new; end if;
  select * into cutover from public."FIN_ChargeMappingCutovers"
    where legal_entity_id=new."FINDoc_LegalEntityID" and status='active' and effective_date<=new."FINDoc_AccountingDate" for share;
  if not found then return new; end if;
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
    select * into mapped from public."FIN_ChargeNominalMappings"
      where legal_entity_id=new."FINDoc_LegalEntityID" and charge_id=v_charge_id for share;
    if not found then raise exception 'Map charge % to a nominal group before approval.',v_charge_id using errcode='22023'; end if;
    group_id:=case when side='revenue' then mapped.revenue_group_id else mapped.cost_group_id end;
    if group_id is null then raise exception 'Map charge % to a % nominal group before approval.',v_charge_id,side using errcode='22023'; end if;
    grp:=public._multideck_validate_nominal_group(new."FINDoc_LegalEntityID",group_id,side);
    account_id:=(grp#>>'{actual,id}')::uuid;
    account_code:=grp#>>'{actual,code}';
    update public."FIN_DocumentLines" set "FINDocLine_NominalAccountID"=account_id,
      "FINDocLine_ChargeMappingCutoverID"=cutover.id,"FINDocLine_ChargeMappingGroupID"=group_id,
      "FINDocLine_ChargeMappingVersion"=mapped.version,"FINDocLine_ChargeIDSnapshot"=v_charge_id,
      "FINDocLine_NominalCodeSnapshot"=account_code
      where "FINDocLine_ID"=line.id;
  end loop;
  return new;
end; $$;
revoke all on function public._multideck_finance_pin_document_charge_mapping() from public,anon,authenticated;
drop trigger if exists "TR_FIN_Documents_charge_mapping_on_approval" on public."FIN_Documents";
create trigger "TR_FIN_Documents_charge_mapping_on_approval"
before update of "FINDoc_StatusCode" on public."FIN_Documents"
for each row execute function public._multideck_finance_pin_document_charge_mapping();

commit;
