begin;

-- A strict, dated control snapshot. This is evidence for later approval, not
-- a period lock or authority to file; approval must revalidate both digests.
create table public."FIN_IndirectTaxControlReviews" (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  calculation_id uuid not null,
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  posting_digest text not null check (posting_digest ~ '^[a-f0-9]{64}$'),
  accounting_scope_digest text not null check (accounting_scope_digest ~ '^[a-f0-9]{64}$'),
  control_fingerprint text not null check (control_fingerprint ~ '^[a-f0-9]{64}$'),
  bridge_snapshot jsonb not null check (jsonb_typeof(bridge_snapshot)='object'),
  transaction_count integer not null check (transaction_count>=0),
  signed_transaction_count integer not null check (signed_transaction_count=transaction_count),
  reviewed_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  reviewed_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique (period_id,control_fingerprint),
  foreign key (calculation_id,period_id) references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict
);
create index "IX_FIN_IndirectTaxControlReviews_period" on public."FIN_IndirectTaxControlReviews"(period_id,reviewed_at desc);
create trigger indirect_tax_control_review_immutable before update or delete on public."FIN_IndirectTaxControlReviews"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxControlReviews" enable row level security;
revoke all on public."FIN_IndirectTaxControlReviews" from public,anon,authenticated;
grant select on public."FIN_IndirectTaxControlReviews" to service_role;

create function public.multideck_uk_vat_review_control(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_source_digest text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_fresh jsonb; v_account jsonb; v_inventory jsonb; v_bridge jsonb;
  v_fresh_id uuid; v_fingerprint text; v_review uuid; v_reviewed_at timestamptz;
  v_review_calculation uuid; v_inserted boolean:=false;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_source_digest is null or p_source_digest !~ '^[a-f0-9]{64}$'
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Review the current draft and enter a control reconciliation reason.' using errcode='22023';
  end if;
  select period.* into v_period from public."FIN_IndirectTaxPeriods" period
    join public."FIN_IndirectTaxCalculations" calculation on calculation.period_id=period.id
    where calculation.id=p_calculation and period.legal_entity_id=p_entity
      and period.jurisdiction_code='GB' for update of period;
  if not found then raise exception 'UK VAT calculation was not found.' using errcode='P0002'; end if;
  if v_period.status<>'draft' or not exists (
    select 1 from public."FIN_IndirectTaxCalculations" calculation
    where calculation.id=p_calculation and calculation.period_id=v_period.id
      and calculation.source_digest=p_source_digest
      and calculation.revision=(select max(latest.revision)
        from public."FIN_IndirectTaxCalculations" latest where latest.period_id=v_period.id)
  ) then
    raise exception 'Review the latest VAT draft before recording its control reconciliation.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat:'||p_entity::text,0));
  v_fresh:=public.multideck_uk_vat_calculate_draft(p_actor,v_period.id);
  if v_fresh->>'sourceDigest'<>p_source_digest
    or v_fresh#>>'{sourceLedger,status}'<>'matched' then
    raise exception 'VAT source or native posting changed; resolve the latest draft before control review.' using errcode='22023';
  end if;
  v_fresh_id:=(v_fresh->>'calculationId')::uuid;
  v_account:=public.multideck_uk_vat_account(p_actor,p_entity,v_fresh_id,0,1);
  if (v_account->>'totalTransactions')::integer<>(v_account->>'signedTransactions')::integer then
    raise exception 'Every VAT transaction needs a current dated sign-off before control review.' using errcode='22023';
  end if;
  v_inventory:=public.multideck_uk_vat_tax_posting_inventory(p_actor,p_entity,v_fresh_id,0,1);
  v_bridge:=v_inventory->'controlBridge';
  if (v_bridge->>'accountingCoverageExact')::boolean is not true
    or (v_inventory->>'unlinkedLines')::integer<>0
    or (v_inventory->>'nonGbpLines')::integer<>0
    or (v_inventory->>'taxLinesOffVatAccounts')::integer<>0
    or (v_bridge->>'expectedTaxPostingLines')::integer<>(v_bridge->>'linkedVatAccountTaxLines')::integer
    or (v_bridge->>'differenceGbp')::numeric<>0 then
    raise exception 'Resolve VAT-account differences, unlinked postings, currency and accounting-period scope before control review.' using errcode='22023';
  end if;
  v_fingerprint:=encode(sha256(convert_to(p_source_digest||
    (v_inventory->>'postingDigest')||(v_inventory->>'accountingScopeDigest')||
    v_bridge::text||(v_account->>'totalTransactions')||(v_account->>'signedTransactions'),'UTF8')),'hex');
  insert into public."FIN_IndirectTaxControlReviews"(
    period_id,calculation_id,source_digest,posting_digest,accounting_scope_digest,
    control_fingerprint,bridge_snapshot,transaction_count,signed_transaction_count,reviewed_by,reason
  ) values (v_period.id,v_fresh_id,p_source_digest,v_inventory->>'postingDigest',
    v_inventory->>'accountingScopeDigest',v_fingerprint,v_bridge,
    (v_account->>'totalTransactions')::integer,(v_account->>'signedTransactions')::integer,
    p_actor,btrim(p_reason))
  on conflict (period_id,control_fingerprint) do nothing
  returning id,reviewed_at,calculation_id into v_review,v_reviewed_at,v_review_calculation;
  if v_review is null then
    select id,reviewed_at,calculation_id into v_review,v_reviewed_at,v_review_calculation
    from public."FIN_IndirectTaxControlReviews"
    where period_id=v_period.id and control_fingerprint=v_fingerprint;
  else
    v_inserted:=true;
    insert into public."Audit_Events"(
      "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
      "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
      "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
    ) values ('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
      'FIN_IndirectTaxControlReviews','indirect_tax_control_review',v_review,
      'review_vat_control',btrim(p_reason),'UK VAT control review recorded',
      jsonb_build_object('periodId',v_period.id,'calculationId',v_fresh_id,
        'sourceDigest',p_source_digest,'postingDigest',v_inventory->>'postingDigest',
        'accountingScopeDigest',v_inventory->>'accountingScopeDigest',
        'controlFingerprint',v_fingerprint));
  end if;
  return jsonb_build_object('reviewId',v_review,'periodId',v_period.id,
    'calculationId',v_fresh_id,'reviewCalculationId',v_review_calculation,
    'sourceDigest',p_source_digest,'controlFingerprint',v_fingerprint,
    'reviewedAt',v_reviewed_at,'inserted',v_inserted,'bridge',v_bridge);
end; $$;
revoke all on function public.multideck_uk_vat_review_control(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_review_control(uuid,uuid,uuid,text,text) to service_role;

create function public.multideck_uk_vat_list_control_reviews(
  p_actor uuid,p_entity uuid,p_period uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  if not exists(select 1 from public."FIN_IndirectTaxPeriods" period
    where period.id=p_period and period.legal_entity_id=p_entity and period.jurisdiction_code='GB') then
    raise exception 'UK VAT period was not found.' using errcode='P0002';
  end if;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.reviewed_at desc,item.review_id desc),'[]'::jsonb)
    into v_rows from (
      select review.id review_id,review.calculation_id,review.source_digest,
        review.posting_digest,review.accounting_scope_digest,review.control_fingerprint,
        review.bridge_snapshot,review.transaction_count,review.signed_transaction_count,
        review.reviewed_by,review.reviewed_at,review.reason
      from public."FIN_IndirectTaxControlReviews" review
      where review.period_id=p_period order by review.reviewed_at desc,review.id desc limit 20
    ) item;
  return jsonb_build_object('periodId',p_period,'reviews',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_list_control_reviews(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_list_control_reviews(uuid,uuid,uuid) to service_role;

commit;
