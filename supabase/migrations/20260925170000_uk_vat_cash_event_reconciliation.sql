begin;

-- Cash VAT is reconciled per payment event. An invoice can have payments in
-- several returns, so its evidence_id cannot be the reconciliation key.
create table public."FIN_IndirectTaxCashEventReconciliations" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  calculation_id uuid not null,
  event_line_id uuid not null references public."FIN_IndirectTaxCashEventLines"(id) on delete restrict,
  projection_id uuid not null references public."FIN_IndirectTaxCashEventProjections"(id) on delete restrict,
  cash_id uuid not null references public."FIN_CashTransactions"("FINCash_ID") on delete restrict,
  allocation_id uuid not null references public."FIN_CashAllocations"("FINCashAlloc_ID") on delete restrict,
  invoice_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  invoice_line_id uuid not null references public."FIN_DocumentLines"("FINDocLine_ID") on delete restrict,
  evidence_id uuid not null references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  reconciled_at timestamptz not null default clock_timestamp(),
  reconciled_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (event_line_id),
  unique (allocation_id,invoice_line_id),
  foreign key (calculation_id,period_id)
    references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict
);
create index "IX_FIN_IndirectTaxCashEventReconciliations_period"
  on public."FIN_IndirectTaxCashEventReconciliations"(period_id,reconciled_at);
create index "IX_FIN_IndirectTaxCashEventReconciliations_invoice"
  on public."FIN_IndirectTaxCashEventReconciliations"(invoice_id);
create index "IX_FIN_IndirectTaxCashEventReconciliations_cash"
  on public."FIN_IndirectTaxCashEventReconciliations"(cash_id);
create index "IX_FIN_IndirectTaxCashEventReconciliations_evidence"
  on public."FIN_IndirectTaxCashEventReconciliations"(evidence_id);
create trigger indirect_tax_cash_event_reconciliation_immutable before update or delete
  on public."FIN_IndirectTaxCashEventReconciliations"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxCashEventReconciliations" enable row level security;
revoke all on public."FIN_IndirectTaxCashEventReconciliations"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCashEventReconciliations" to service_role;

create function public._multideck_uk_vat_cash_event_reconciliation_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_event public."FIN_IndirectTaxCashEventLines"%rowtype;
begin
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=new.period_id;
  select * into v_calculation from public."FIN_IndirectTaxCalculations"
    where id=new.calculation_id and period_id=new.period_id;
  select * into v_event from public."FIN_IndirectTaxCashEventLines"
    where id=new.event_line_id;
  if v_period.id is null or v_calculation.id is null or v_event.id is null
    or v_period.jurisdiction_code<>'GB' or v_period.scheme_code<>'cash'
    or v_period.status<>'draft' or v_calculation.calculation_version<>'uk-cash-v1'
    or v_calculation.source_digest<>new.source_digest
    or v_calculation.exceptions is distinct from '[]'::jsonb
    or v_calculation.revision<>(select max(revision)
      from public."FIN_IndirectTaxCalculations" where period_id=new.period_id)
    or v_calculation.control_reconciliation->>'cashProjectionId'
      is distinct from v_event.projection_id::text
    or v_event.legal_entity_id<>v_period.legal_entity_id
    or v_event.payment_date not between v_period.start_date and v_period.end_date
    or new.projection_id<>v_event.projection_id
    or new.cash_id<>v_event.cash_id
    or new.allocation_id<>v_event.allocation_id
    or new.invoice_id<>v_event.invoice_id
    or new.invoice_line_id<>v_event.line_id
    or new.evidence_id<>v_event.evidence_id
    or not exists(select 1 from public."FIN_IndirectTaxCashCalculationEventLines" box
      where box.calculation_id=new.calculation_id and box.period_id=new.period_id
        and box.event_line_id=new.event_line_id) then
    raise exception 'Cash VAT reconciliation requires the current matched payment event.' using errcode='22023';
  end if;
  new.reconciled_at:=clock_timestamp();
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_cash_event_reconciliation_guard()
  from public,anon,authenticated,service_role;
create trigger indirect_tax_cash_event_reconciliation_guard before insert
  on public."FIN_IndirectTaxCashEventReconciliations"
  for each row execute function public._multideck_uk_vat_cash_event_reconciliation_guard();

create function public.multideck_uk_vat_reconcile_cash_events(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_source_digest text,
  p_event_ids uuid[],p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_calculation public."FIN_IndirectTaxCalculations"%rowtype;
  v_event public."FIN_IndirectTaxCashEventLines"%rowtype;
  v_fresh jsonb; v_fresh_id uuid; v_event_id uuid;
  v_id uuid; v_at timestamptz; v_existing record;
  v_rows jsonb:='[]'::jsonb; v_inserted integer:=0;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_event_ids is null or cardinality(p_event_ids) not between 1 and 100
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
    or array_position(p_event_ids,null) is not null
    or (select count(distinct item) from unnest(p_event_ids) item)<>cardinality(p_event_ids) then
    raise exception 'Choose distinct Cash VAT events, a current draft and a reconciliation reason.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxCalculations" calculation on calculation.period_id=period.id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' and period.scheme_code='cash'
    for update of period;
  if not found then raise exception 'Cash VAT calculation was not found.' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  select * into v_calculation from public."FIN_IndirectTaxCalculations"
    where id=p_calculation;
  if v_period.status<>'draft' or v_calculation.calculation_version<>'uk-cash-v1'
    or v_calculation.source_digest<>p_source_digest
    or v_calculation.exceptions is distinct from '[]'::jsonb
    or v_calculation.revision<>(select max(revision)
      from public."FIN_IndirectTaxCalculations" where period_id=v_period.id)
    or coalesce(v_calculation.control_reconciliation->>'cashProjectionId','')
      !~ '^[a-f0-9-]{36}$' then
    raise exception 'Review the latest Cash VAT draft before reconciling payment events.' using errcode='22023';
  end if;
  if (select count(*) from public."FIN_IndirectTaxCashEventLines" event
      where event.id=any(p_event_ids) and event.legal_entity_id=p_entity
        and event.projection_id=(v_calculation.control_reconciliation->>'cashProjectionId')::uuid)
      <>cardinality(p_event_ids) then
    raise exception 'Every selected event must belong to this Cash VAT projection.' using errcode='22023';
  end if;
  -- These are the same source locks used by document writes, cash-date
  -- reviews and decision revisions. Take them before rebuilding the draft.
  for v_event_id in select distinct event.invoice_id
    from public."FIN_IndirectTaxCashEventLines" event
    where event.id=any(p_event_ids) order by event.invoice_id loop
    perform pg_advisory_xact_lock(hashtextextended('vat-source-document:'||v_event_id::text,0));
  end loop;
  for v_event_id in select distinct event.cash_id
    from public."FIN_IndirectTaxCashEventLines" event
    where event.id=any(p_event_ids) order by event.cash_id loop
    perform 1 from public."FIN_CashTransactions" cash
      where cash."FINCash_ID"=v_event_id and cash."FINCash_LegalEntityID"=p_entity
      for update;
    if not found then raise exception 'A selected Cash VAT payment is unavailable.' using errcode='42501'; end if;
  end loop;
  for v_event_id in select distinct event.evidence_id
    from public."FIN_IndirectTaxCashEventLines" event
    where event.id=any(p_event_ids) order by event.evidence_id loop
    perform pg_advisory_xact_lock(hashtextextended('vat-source-period:'||v_event_id::text,0));
  end loop;
  v_fresh:=public.multideck_uk_vat_calculate_cash_draft(p_actor,v_period.id,
    (v_calculation.control_reconciliation->>'cashProjectionId')::uuid);
  if v_fresh->>'sourceDigest' is distinct from p_source_digest
    or v_fresh->>'status' is distinct from 'cash_draft_only' then
    raise exception 'Cash VAT sources changed since the reviewed calculation.' using errcode='22023';
  end if;
  v_fresh_id:=(v_fresh->>'calculationId')::uuid;
  foreach v_event_id in array p_event_ids loop
    select * into v_event from public."FIN_IndirectTaxCashEventLines"
      where id=v_event_id and legal_entity_id=p_entity;
    if not exists(select 1 from public."FIN_IndirectTaxCashCalculationEventLines" box
      where box.calculation_id=v_fresh_id and box.period_id=v_period.id
        and box.event_line_id=v_event_id) then
      raise exception 'Cash VAT event % is absent from the current calculation.',v_event_id using errcode='22023';
    end if;
    insert into public."FIN_IndirectTaxCashEventReconciliations"(
      period_id,calculation_id,event_line_id,projection_id,cash_id,
      allocation_id,invoice_id,invoice_line_id,evidence_id,source_digest,
      reconciled_by,reason
    ) values(v_period.id,v_fresh_id,v_event.id,v_event.projection_id,v_event.cash_id,
      v_event.allocation_id,v_event.invoice_id,v_event.line_id,v_event.evidence_id,
      p_source_digest,p_actor,btrim(p_reason))
    on conflict do nothing
    returning id,reconciled_at into v_id,v_at;
    if v_id is null then
      select id,period_id,event_line_id,projection_id,source_digest,reconciled_at
        into v_existing
      from public."FIN_IndirectTaxCashEventReconciliations"
      where allocation_id=v_event.allocation_id and invoice_line_id=v_event.line_id;
      if v_existing.id is null or v_existing.period_id<>v_period.id
        or v_existing.event_line_id<>v_event.id
        or v_existing.projection_id<>v_event.projection_id
        or v_existing.source_digest<>p_source_digest then
        raise exception 'This payment event was VAT reconciled against a different Cash return source.' using errcode='22023';
      end if;
      v_id:=v_existing.id; v_at:=v_existing.reconciled_at;
    else
      v_inserted:=v_inserted+1;
    end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('eventId',v_event.id,
      'reconciliationId',v_id,'vatReconciledAt',v_at));
    v_id:=null;
  end loop;
  if v_inserted>0 then
    insert into public."Audit_Events"(
      "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
      "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
      "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
    ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
      'FIN_IndirectTaxCashEventReconciliations','uk_vat_cash_event_reconciliation',v_period.id,
      'reconcile_uk_vat_cash_events',btrim(p_reason),'UK Cash VAT payment events reconciled',
      jsonb_build_object('periodId',v_period.id,'calculationId',v_fresh_id,
        'sourceDigest',p_source_digest,'inserted',v_inserted,'eventIds',to_jsonb(p_event_ids)));
  end if;
  return jsonb_build_object('periodId',v_period.id,'calculationId',v_fresh_id,
    'sourceDigest',p_source_digest,'inserted',v_inserted,'events',v_rows,
    'status','cash_events_reconciled_no_return_lock');
end; $$;
revoke all on function public.multideck_uk_vat_reconcile_cash_events(uuid,uuid,uuid,text,uuid[],text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_reconcile_cash_events(uuid,uuid,uuid,text,uuid[],text)
  to service_role;

create function public.multideck_uk_vat_cash_event_reconciliations(
  p_actor uuid,p_entity uuid,p_period uuid,p_offset integer default 0,
  p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_total integer; v_items jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Choose a valid Cash VAT reconciliation page.' using errcode='22023';
  end if;
  if not exists(select 1 from public."FIN_IndirectTaxPeriods" period
      where period.id=p_period and period.legal_entity_id=p_entity
        and period.jurisdiction_code='GB' and period.scheme_code='cash') then
    raise exception 'Cash VAT period was not found in this legal entity.' using errcode='42501';
  end if;
  select count(*)::integer into v_total
  from public."FIN_IndirectTaxCashEventReconciliations" signed
  where signed.period_id=p_period;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',page.event_line_id,'paymentDate',page.payment_date,
    'cashId',page.cash_id,'allocationId',page.allocation_id,
    'invoiceId',page.invoice_id,'invoiceLineId',page.invoice_line_id,
    'evidenceId',page.evidence_id,'calculationId',page.calculation_id,
    'sourceDigest',page.source_digest,'reconciliationId',page.id,
    'vatReconciledAt',page.reconciled_at,'vatReconciledBy',page.reconciled_by,
    'reason',page.reason) order by page.payment_date,page.event_line_id),'[]'::jsonb)
    into v_items
  from (
    select signed.*,event.payment_date
    from public."FIN_IndirectTaxCashEventReconciliations" signed
    join public."FIN_IndirectTaxCashEventLines" event on event.id=signed.event_line_id
    where signed.period_id=p_period
    order by event.payment_date,signed.event_line_id
    limit p_limit offset p_offset
  ) page;
  return jsonb_build_object('periodId',p_period,'total',v_total,
    'offset',p_offset,'items',v_items);
end; $$;
revoke all on function public.multideck_uk_vat_cash_event_reconciliations(uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_event_reconciliations(uuid,uuid,uuid,integer,integer)
  to service_role;

-- Existing document and line triggers now recognise Cash event sign-off. A
-- later part payment may update operational outstanding balances only.
create or replace function public._multideck_vat_signed_document(p_document uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_document is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('vat-source-document:'||p_document::text,0));
  return exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=signed.evidence_id
    where evidence.source_document_id=p_document)
    or exists(select 1 from public."FIN_IndirectTaxCashEventReconciliations" signed
      where signed.invoice_id=p_document);
end; $$;

create or replace function public._multideck_indirect_tax_decision_period_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('vat-source-period:'||new.evidence_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxReconciliations" signed
      where signed.evidence_id=new.evidence_id)
    or exists(select 1 from public."FIN_IndirectTaxCashEventReconciliations" signed
      where signed.evidence_id=new.evidence_id) then
    raise exception 'A VAT-reconciled transaction cannot have its tax treatment changed; create a separate correction event.' using errcode='22023';
  end if;
  return new;
end; $$;

create function public._multideck_uk_vat_cash_reconciled_date_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public."FIN_IndirectTaxCashEventReconciliations" signed
      where signed.cash_id=new.cash_id) then
    raise exception 'A VAT-reconciled payment date cannot be changed; record a separate correction.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_cash_reconciled_date_guard()
  from public,anon,authenticated,service_role;
create trigger indirect_tax_cash_reconciled_date_guard before insert
  on public."FIN_IndirectTaxCashPaymentDateReviews"
  for each row execute function public._multideck_uk_vat_cash_reconciled_date_guard();

commit;
