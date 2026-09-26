begin;

-- This is a month-scoped accounting control. UK VAT return reviews have a
-- different period and cannot approve or substitute for this snapshot.
create table public."FIN_AccountingVatControlReviews" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  period_id uuid not null references public."FIN_Periods"("FINPeriod_ID"),
  source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
  inventory jsonb not null,
  prepared_by uuid not null references public."cmp_Users"("User_ID"),
  prepared_at timestamptz not null default now(),
  reason text not null check(length(btrim(reason)) between 10 and 2000)
);
create index on public."FIN_AccountingVatControlReviews"(legal_entity_id,period_id,prepared_at desc);
create table public."FIN_AccountingVatControlApprovals" (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public."FIN_AccountingVatControlReviews"(id),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID"),
  period_id uuid not null references public."FIN_Periods"("FINPeriod_ID"),
  source_digest text not null check(source_digest ~ '^[a-f0-9]{64}$'),
  approved_by uuid not null references public."cmp_Users"("User_ID"),
  approved_at timestamptz not null default now(),
  reason text not null check(length(btrim(reason)) between 10 and 2000)
);
create index on public."FIN_AccountingVatControlApprovals"(legal_entity_id,period_id,approved_at desc);
alter table public."FIN_AccountingVatControlReviews" enable row level security;
alter table public."FIN_AccountingVatControlApprovals" enable row level security;
revoke all on public."FIN_AccountingVatControlReviews",public."FIN_AccountingVatControlApprovals" from public,anon,authenticated;
grant select,insert on public."FIN_AccountingVatControlReviews",public."FIN_AccountingVatControlApprovals" to service_role;
create trigger accounting_vat_review_immutable before update or delete on public."FIN_AccountingVatControlReviews"
  for each row execute function public._multideck_accounting_close_immutable();
create trigger accounting_vat_approval_immutable before update or delete on public."FIN_AccountingVatControlApprovals"
  for each row execute function public._multideck_accounting_close_immutable();

create function public._multideck_accounting_vat_inventory_ready(p_inventory jsonb)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select coalesce(p_inventory->>'status'='ready_for_review'
    and p_inventory->>'sourceDigest' ~ '^[a-f0-9]{64}$'
    and p_inventory->>'unclassifiedLines'='0'
    and p_inventory->>'unreviewedCutoffDifferences'='0'
    and p_inventory->>'orphanEvidence'='0'
    and p_inventory->>'missingDocumentSources'='0'
    and case when jsonb_typeof(p_inventory->'issues')='array'
      then jsonb_array_length(p_inventory->'issues')=0 else false end,false);
$$;
revoke all on function public._multideck_accounting_vat_inventory_ready(jsonb) from public,anon,authenticated;
grant execute on function public._multideck_accounting_vat_inventory_ready(jsonb) to service_role;

create function public.multideck_finance_accounting_vat_control_status(p_actor uuid,p_entity uuid,p_period uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_country text; v_inventory jsonb; v_approval public."FIN_AccountingVatControlApprovals";
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.View');
  if not exists(select 1 from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity) then
    raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  select "LegalEntity_CountryCode" into v_country from public."cmp_LegalEntities" where "LegalEntity_ID"=p_entity;
  if v_country is distinct from 'GB' then
    return jsonb_build_object('status','unsupported_jurisdiction','periodId',p_period,'jurisdiction',v_country);
  end if;
  if to_regprocedure('public.multideck_uk_vat_accounting_period_inventory(uuid,uuid,uuid)') is null then
    return jsonb_build_object('status','unavailable','periodId',p_period,'jurisdiction','GB'); end if;
  execute 'select public.multideck_uk_vat_accounting_period_inventory($1,$2,$3)'
    into v_inventory using p_actor,p_entity,p_period;
  select approval.* into v_approval from public."FIN_AccountingVatControlApprovals" approval
    where approval.legal_entity_id=p_entity and approval.period_id=p_period
    order by approval.approved_at desc,approval.id desc limit 1;
  return jsonb_build_object('status',case
      when not public._multideck_accounting_vat_inventory_ready(v_inventory) then 'blocked'
      when v_approval.id is null then 'awaiting_approval'
      when v_approval.source_digest is distinct from v_inventory->>'sourceDigest' then 'stale'
      else 'verified' end,
    'periodId',p_period,'jurisdiction','GB','sourceDigest',v_inventory->>'sourceDigest',
    'approvalId',v_approval.id,'reviewId',v_approval.review_id,
    'inventoryStatus',v_inventory->>'status',
    'unclassifiedLines',v_inventory->'unclassifiedLines',
    'unreviewedCutoffDifferences',v_inventory->'unreviewedCutoffDifferences',
    'orphanEvidence',v_inventory->'orphanEvidence',
    'missingDocumentSources',v_inventory->'missingDocumentSources');
end; $$;
revoke all on function public.multideck_finance_accounting_vat_control_status(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_finance_accounting_vat_control_status(uuid,uuid,uuid) to service_role;

create function public.multideck_finance_accounting_vat_control(
  p_actor uuid,p_entity uuid,p_period uuid,p_action text,p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_Periods"; v_inventory jsonb; v_review public."FIN_AccountingVatControlReviews";
  v_approval public."FIN_AccountingVatControlApprovals"; v_reason text; v_status jsonb;
begin
  if p_action not in ('read','prepare','approve') then raise exception 'Unknown accounting VAT control action.' using errcode='22023'; end if;
  perform public._multideck_journal_access(p_actor,p_entity,case when p_action='read' then 'Finance.Management.View'
    when p_action='prepare' then 'Finance.Management.Prepare' else 'Finance.Management.Approve' end);
  if to_regprocedure('public.multideck_uk_vat_accounting_period_inventory(uuid,uuid,uuid)') is null
    or to_regprocedure('public._multideck_uk_vat_read_access(uuid,uuid)') is null
    or to_regprocedure('public._multideck_uk_vat_access(uuid,uuid)') is null then
    raise exception 'Monthly UK VAT source control is unavailable.' using errcode='22023'; end if;
  execute 'select public._multideck_uk_vat_read_access($1,$2)' using p_actor,p_entity;
  if p_action<>'read' then execute 'select public._multideck_uk_vat_access($1,$2)' using p_actor,p_entity; end if;
  select * into v_period from public."FIN_Periods" where "FINPeriod_ID"=p_period and "FINPeriod_LegalEntityID"=p_entity
    for update;
  if not found then raise exception 'Accounting period not found in this legal entity.' using errcode='P0002'; end if;
  execute 'select public.multideck_uk_vat_accounting_period_inventory($1,$2,$3)'
    into v_inventory using p_actor,p_entity,p_period;
  if p_action='read' then
    v_status:=public.multideck_finance_accounting_vat_control_status(p_actor,p_entity,p_period);
    return jsonb_build_object('inventory',v_inventory,'control',v_status,'actorId',p_actor,
      'canPrepare',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Prepare')
        and public._multideck_dexter_has_permission(p_actor,'Finance.Compliance.Manage'),
      'canApprove',public._multideck_dexter_has_permission(p_actor,'Finance.Management.Approve')
        and public._multideck_dexter_has_permission(p_actor,'Finance.Compliance.Manage'),
      'reviews',coalesce((select jsonb_agg(to_jsonb(review) order by prepared_at desc) from
        (select * from public."FIN_AccountingVatControlReviews" where legal_entity_id=p_entity and period_id=p_period
          order by prepared_at desc limit 20) review),'[]'::jsonb),
      'approvals',coalesce((select jsonb_agg(to_jsonb(approval) order by approved_at desc) from
        (select * from public."FIN_AccountingVatControlApprovals" where legal_entity_id=p_entity and period_id=p_period
          order by approved_at desc limit 20) approval),'[]'::jsonb));
  end if;
  if v_period."FINPeriod_StatusCode"<>'open' then raise exception 'The accounting period must be open for VAT sign-off.' using errcode='22023'; end if;
  if not public._multideck_accounting_vat_inventory_ready(v_inventory) then
    raise exception 'Resolve monthly VAT control exceptions before sign-off.' using errcode='22023'; end if;
  v_reason:=btrim(coalesce(p_input->>'reason',''));
  if length(v_reason) not between 10 and 2000 then raise exception 'Record a VAT control reason of 10 to 2000 characters.' using errcode='22023'; end if;
  if p_action='prepare' then
    insert into public."FIN_AccountingVatControlReviews"(legal_entity_id,period_id,source_digest,inventory,prepared_by,reason)
      values(p_entity,p_period,v_inventory->>'sourceDigest',v_inventory,p_actor,v_reason) returning * into v_review;
    insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
      "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
      values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingVatControlReviews',
        'accounting_vat_control',v_review.id,'prepare_accounting_vat_control','Accounting-period VAT control prepared',v_reason,
        jsonb_build_object('periodId',p_period,'sourceDigest',v_review.source_digest,'lineCount',v_inventory->'lineCount'));
    return to_jsonb(v_review);
  end if;
  select * into v_review from public."FIN_AccountingVatControlReviews" where id=(p_input->>'reviewId')::uuid
    and legal_entity_id=p_entity and period_id=p_period;
  if not found then raise exception 'Accounting VAT control review not found.' using errcode='P0002'; end if;
  if v_review.prepared_by=p_actor then raise exception 'A second authorised finance operator must approve the VAT control.' using errcode='42501'; end if;
  if v_review.source_digest is distinct from v_inventory->>'sourceDigest' or v_review.inventory is distinct from v_inventory then
    raise exception 'Monthly VAT control evidence changed; prepare a new review.' using errcode='40001'; end if;
  insert into public."FIN_AccountingVatControlApprovals"(review_id,legal_entity_id,period_id,source_digest,approved_by,reason)
    values(v_review.id,p_entity,p_period,v_review.source_digest,p_actor,v_reason) returning * into v_approval;
  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason","AuditEvent_MetadataJSON")
    values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public','FIN_AccountingVatControlApprovals',
      'accounting_vat_control',v_approval.id,'approve_accounting_vat_control','Accounting-period VAT control approved',v_reason,
      jsonb_build_object('periodId',p_period,'sourceDigest',v_approval.source_digest,'reviewId',v_review.id));
  return to_jsonb(v_approval);
end; $$;
revoke all on function public.multideck_finance_accounting_vat_control(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_finance_accounting_vat_control(uuid,uuid,uuid,text,jsonb) to service_role;

commit;
