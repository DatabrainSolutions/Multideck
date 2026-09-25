begin;

-- The final-invoice automation switch does not authorise initial statutory
-- recognition. A separate two-person mandate binds the scope and service rule.
create table public."FIN_RecognitionMandates" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  policy_id uuid references public."FIN_CostPolicies"(id),
  cost_enabled boolean not null,
  revenue_enabled boolean not null,
  revenue_service_rule text,
  effective_date date not null,
  status text not null default 'proposed' check (status in ('proposed','active','paused')),
  prepared_by uuid not null references public."cmp_Users"("User_ID"),
  prepared_at timestamptz not null default now(),
  approved_by uuid references public."cmp_Users"("User_ID"),
  approved_at timestamptz,
  approval_reason text,
  paused_by uuid references public."cmp_Users"("User_ID"),
  paused_at timestamptz,
  pause_reason text,
  check (cost_enabled or revenue_enabled),
  check (not revenue_enabled or length(trim(revenue_service_rule)) between 10 and 2000),
  check ((status='proposed' and approved_by is null) or (status<>'proposed' and approved_by is not null and approved_by<>prepared_by))
);
create unique index fin_one_active_recognition_mandate on public."FIN_RecognitionMandates"(legal_entity_id) where status='active';
create index on public."FIN_RecognitionMandates"(legal_entity_id,prepared_at desc);

create table public."FIN_RevenueServiceEvidence" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  charge_id uuid not null references public."Job_Costing_Lines"("JobCostingLine_ID"),
  source_revision text not null,
  service_completed_on date not null,
  disputed boolean not null default false,
  reason text not null check (length(trim(reason)) between 10 and 2000),
  recorded_by uuid not null references public."cmp_Users"("User_ID"),
  recorded_at timestamptz not null default now()
);
create index on public."FIN_RevenueServiceEvidence"(legal_entity_id,charge_id,recorded_at desc,id);
alter table public."FIN_RecognitionMandates" enable row level security;
alter table public."FIN_RevenueServiceEvidence" enable row level security;
revoke all on public."FIN_RecognitionMandates",public."FIN_RevenueServiceEvidence" from public,anon,authenticated;
grant select,insert,update on public."FIN_RecognitionMandates" to service_role;
grant select,insert on public."FIN_RevenueServiceEvidence" to service_role;

create function public.multideck_finance_recognition_controls(p_actor uuid,p_entity uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare m public."FIN_RecognitionMandates"; p public."FIN_CostPolicies"; e public."FIN_RevenueServiceEvidence";
  v_reason text; v_charge uuid; v_source jsonb; v_date date; v_audit uuid;
begin
  perform public._multideck_journal_access(p_actor,p_entity,
    case when p_action='read' then 'Finance.Management.View'
      when p_action='record_revenue_evidence' then 'Finance.Management.Prepare'
      when p_action='propose' then 'Finance.Management.Prepare'
      else 'Finance.Management.Approve' end);
  if p_action not in ('read','propose','activate','pause','record_revenue_evidence') then
    raise exception 'Unknown recognition control action.' using errcode='22023'; end if;
  if p_action='read' then
    return jsonb_build_object('mandates',coalesce((select jsonb_agg(to_jsonb(x) order by prepared_at desc)
      from (select * from public."FIN_RecognitionMandates" where legal_entity_id=p_entity order by prepared_at desc limit 20) x),'[]'::jsonb),
      'canPrepare',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Prepare'),
      'canApprove',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Approve'),
      'canPost',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Post'),
      'actorId',p_actor);
  end if;
  v_reason:=trim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a reason of 10 to 2000 characters.' using errcode='22023'; end if;
  if p_action='record_revenue_evidence' then
    v_charge:=(p_input->>'chargeId')::uuid;
    v_source:=public._multideck_cost_source(p_entity,v_charge);
    v_date:=(p_input->>'serviceCompletedOn')::date;
    if v_date is null or v_date>current_date then raise exception 'Record an actual completed-service date.' using errcode='22023'; end if;
    insert into public."FIN_RevenueServiceEvidence"(legal_entity_id,charge_id,source_revision,service_completed_on,disputed,reason,recorded_by)
      values(p_entity,v_charge,md5(v_source::text),v_date,coalesce((p_input->>'disputed')::boolean,false),v_reason,p_actor)
      returning * into e;
    perform public._multideck_charge_lifecycle_enqueue(p_entity,v_charge,'service_evidence','FIN_RevenueServiceEvidence',e.id);
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_RevenueServiceEvidence','revenue_service_evidence',e.id,'record_evidence','Revenue service evidence recorded',v_reason,to_jsonb(e));
    return to_jsonb(e);
  end if;
  perform 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity for update;
  if p_action='propose' then
    if exists(select 1 from public."FIN_RecognitionMandates" where legal_entity_id=p_entity and status='active') then
      raise exception 'Pause the active recognition mandate before proposing a replacement.' using errcode='22023'; end if;
    v_date:=(p_input->>'effectiveDate')::date;
    if v_date is null or v_date::text is distinct from p_input->>'effectiveDate' then raise exception 'Choose an exact effective date.' using errcode='22023'; end if;
    if coalesce((p_input->>'costEnabled')::boolean,false) then
      select * into p from public."FIN_CostPolicies" where id=(p_input->>'policyId')::uuid and legal_entity_id=p_entity;
      if not found or p.approved_by is null or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>p.revision) then
        raise exception 'Approve the latest cost recognition policy first.' using errcode='22023'; end if;
      perform public._multideck_journal_access(p.approved_by,p_entity,'Finance.Management.Approve');
    end if;
    insert into public."FIN_RecognitionMandates"(legal_entity_id,policy_id,cost_enabled,revenue_enabled,revenue_service_rule,effective_date,prepared_by)
      values(p_entity,p.id,coalesce((p_input->>'costEnabled')::boolean,false),coalesce((p_input->>'revenueEnabled')::boolean,false),
        nullif(trim(p_input->>'revenueServiceRule'),''),v_date,p_actor) returning * into m;
  else
    select * into m from public."FIN_RecognitionMandates" where id=(p_input->>'id')::uuid and legal_entity_id=p_entity for update;
    if not found then raise exception 'Recognition mandate not found.' using errcode='P0002'; end if;
    if p_action='activate' then
      perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Post');
      if m.status<>'proposed' or m.prepared_by=p_actor then raise exception 'An independent colleague must activate a proposed mandate.' using errcode='42501'; end if;
      if m.cost_enabled then
        select * into p from public."FIN_CostPolicies" where id=m.policy_id and legal_entity_id=p_entity;
        if p.approved_by is null or exists(select 1 from public."FIN_CostPolicies" where legal_entity_id=p_entity and revision>p.revision) then
          raise exception 'Cost recognition policy changed; propose a new mandate.' using errcode='22023'; end if;
      end if;
      if not exists(select 1 from public."FIN_ChargeMappingCutovers" where legal_entity_id=p_entity and status='active' and effective_date<=m.effective_date) then
        raise exception 'Activate a charge mapping cutover for this mandate first.' using errcode='22023'; end if;
      update public."FIN_RecognitionMandates" set status='active',approved_by=p_actor,approved_at=now(),approval_reason=v_reason where id=m.id returning * into m;
      -- Existing qualifying charges must be evaluated; a policy change is an
      -- event and never silently backfills the ledger.
      perform public._multideck_charge_lifecycle_enqueue(p_entity,l."JobCostingLine_ID",'service_evidence','FIN_RecognitionMandates',m.id)
        from public."Job_Costing_Lines" l join public."Job_Header" j on j."Job_ID"=l."Job_ID" where j."Job_LegalEntityID"=p_entity;
    else
      if m.status<>'active' then raise exception 'Only an active mandate may be paused.' using errcode='22023'; end if;
      update public."FIN_RecognitionMandates" set status='paused',paused_by=p_actor,paused_at=now(),pause_reason=v_reason where id=m.id returning * into m;
    end if;
  end if;
  insert into public."FIN_CostControlAudit"(legal_entity_id,actor_id,action,record_id,snapshot)
    values(p_entity,p_actor,'recognition_'||p_action,m.id,to_jsonb(m)) returning id into v_audit;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID","AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_RecognitionMandates','cost_control',m.id,p_action,'Charge recognition mandate '||p_action,v_reason,to_jsonb(m));
  return to_jsonb(m);
end; $$;
revoke all on function public.multideck_finance_recognition_controls(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_recognition_controls(uuid,uuid,text,jsonb) to service_role;

commit;
