begin;

-- Accountant review input, not a posted tax event or permission to file.
-- Each revision retains the exact source snapshot and rule version; a later
-- payment can produce a new proposal without changing the earlier record.
create table public."FIN_IndirectTaxInputTaxRepaymentProposals" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  period_id uuid not null references public."FIN_IndirectTaxPeriods"(id) on delete restrict,
  document_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  rule_version text not null check (rule_version='uk-input-tax-six-month-v2'),
  calculation_fingerprint text not null check (calculation_fingerprint ~ '^[a-f0-9]{64}$'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot)='object'),
  original_claimed_input_vat_gbp numeric(18,4) not null check (original_claimed_input_vat_gbp>0),
  gross_source_amount numeric(18,4) not null check (gross_source_amount>0),
  unpaid_at_first_date numeric(18,4) not null check (unpaid_at_first_date>0),
  unpaid_at_period_end numeric(18,4) not null check (unpaid_at_period_end>=0),
  proposed_repayment_gbp numeric(18,2) not null check (proposed_repayment_gbp>0),
  proposed_restoration_gbp numeric(18,2) not null check (proposed_restoration_gbp>=0),
  proposed_box4_delta_gbp numeric(18,2)
    generated always as (proposed_restoration_gbp-proposed_repayment_gbp) stored,
  prepared_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  prepared_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  unique(period_id,document_id,source_fingerprint)
);
create index "IX_FIN_IndirectTaxInputTaxRepaymentProposals_document"
  on public."FIN_IndirectTaxInputTaxRepaymentProposals"(legal_entity_id,document_id,prepared_at desc);
create trigger indirect_tax_input_tax_repayment_proposal_immutable before update or delete
  on public."FIN_IndirectTaxInputTaxRepaymentProposals"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxInputTaxRepaymentProposals" enable row level security;
revoke all on public."FIN_IndirectTaxInputTaxRepaymentProposals"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxInputTaxRepaymentProposals" to service_role;

create function public.multideck_uk_vat_prepare_first_input_tax_repayment(
  p_actor uuid,p_entity uuid,p_period uuid,p_document uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_snapshot jsonb; v_source_fingerprint text; v_calculation_fingerprint text;
  v_gross numeric; v_unpaid_first numeric; v_unpaid_end numeric;
  v_claimed numeric; v_repayment numeric; v_target_end numeric; v_restoration numeric;
  v_first_date date; v_id uuid; v_at timestamptz; v_inserted boolean:=false;
  v_version constant text:='uk-input-tax-six-month-v2';
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Explain the proposed six-month input VAT repayment.' using errcode='22023';
  end if;
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB'
      and status='draft' for share;
  if not found then
    raise exception 'Choose a draft UK VAT period in this legal entity.' using errcode='22023';
  end if;
  v_snapshot:=public.multideck_uk_vat_clawback_source_snapshot(
    p_actor,p_entity,p_period,p_document);
  if v_snapshot->>'status'<>'source_verified_only' then
    raise exception 'The supplier input VAT source was not verified.' using errcode='22023';
  end if;
  v_first_date:=(v_snapshot->>'firstPossibleRepaymentDate')::date;
  if v_first_date<v_period.start_date or v_first_date>v_period.end_date then
    raise exception 'The first six-month repayment belongs to another VAT period; review any earlier adjustment history.' using errcode='22023';
  end if;
  v_gross:=(v_snapshot->>'grossSourceAmount')::numeric;
  v_unpaid_first:=(v_snapshot->>'unpaidAtFirstDate')::numeric;
  v_unpaid_end:=(v_snapshot->>'unpaidAtPeriodEnd')::numeric;
  v_claimed:=(v_snapshot->>'originallyClaimedInputVatGbp')::numeric;
  if v_gross<=0 or v_unpaid_first<=0 or v_unpaid_first>v_gross
    or v_unpaid_end<0 or v_unpaid_end>v_unpaid_first or v_claimed<=0 then
    raise exception 'No valid unpaid input VAT existed at the six-month date.' using errcode='22023';
  end if;
  -- Notice 700/18, section 4: a negative Box 4 entry becomes due at six
  -- months. Later supplier payments in this same period restore input VAT.
  v_repayment:=trunc(v_claimed*v_unpaid_first/v_gross,2);
  v_target_end:=trunc(v_claimed*v_unpaid_end/v_gross,2);
  v_restoration:=v_repayment-v_target_end;
  if v_repayment<=0 or v_repayment>=10000000000000000 then
    raise exception 'The proposed input VAT repayment cannot be represented.' using errcode='22023';
  end if;
  if v_restoration<0 or v_restoration>v_repayment then
    raise exception 'Later supplier payments cannot be reconciled to the repayment.' using errcode='22023';
  end if;
  v_source_fingerprint:=v_snapshot->>'sourceFingerprint';
  v_calculation_fingerprint:=encode(sha256(convert_to(jsonb_build_object(
    'sourceFingerprint',v_source_fingerprint,'ruleVersion',v_version,
    'proposedRepaymentGbp',v_repayment,
    'proposedRestorationGbp',v_restoration)::text,'UTF8')),'hex');
  insert into public."FIN_IndirectTaxInputTaxRepaymentProposals"(
    legal_entity_id,period_id,document_id,source_fingerprint,rule_version,
    calculation_fingerprint,source_snapshot,original_claimed_input_vat_gbp,
    gross_source_amount,unpaid_at_first_date,unpaid_at_period_end,
    proposed_repayment_gbp,proposed_restoration_gbp,
    prepared_by,reason)
  values(p_entity,p_period,p_document,v_source_fingerprint,v_version,
    v_calculation_fingerprint,v_snapshot,v_claimed,v_gross,v_unpaid_first,
    v_unpaid_end,v_repayment,v_restoration,p_actor,btrim(p_reason))
  on conflict(period_id,document_id,source_fingerprint) do nothing
  returning id,prepared_at into v_id,v_at;
  if v_id is null then
    select id,prepared_at into v_id,v_at
    from public."FIN_IndirectTaxInputTaxRepaymentProposals"
    where period_id=p_period and document_id=p_document
      and source_fingerprint=v_source_fingerprint
      and legal_entity_id=p_entity
      and calculation_fingerprint=v_calculation_fingerprint;
    if v_id is null then
      raise exception 'The existing repayment proposal uses another calculation; review its rule version.' using errcode='22023';
    end if;
  else
    v_inserted:=true;
    insert into public."Audit_Events"(
      "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
      "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
      "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
      "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
    ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
      'FIN_IndirectTaxInputTaxRepaymentProposals','input_tax_repayment_proposal',v_id,
      'prepare_input_tax_repayment',btrim(p_reason),'UK input VAT repayment prepared',
      jsonb_build_object('periodId',p_period,'documentId',p_document,
        'sourceFingerprint',v_source_fingerprint,
        'calculationFingerprint',v_calculation_fingerprint,
        'proposedRepaymentGbp',v_repayment,
        'proposedRestorationGbp',v_restoration,
        'proposedBox4DeltaGbp',v_restoration-v_repayment));
  end if;
  return jsonb_build_object('proposalId',v_id,'periodId',p_period,
    'documentId',p_document,'ruleVersion',v_version,
    'sourceFingerprint',v_source_fingerprint,
    'calculationFingerprint',v_calculation_fingerprint,
    'proposedRepaymentGbp',v_repayment,
    'proposedRestorationGbp',v_restoration,
    'proposedBox4DeltaGbp',v_restoration-v_repayment,
    'preparedAt',v_at,'inserted',v_inserted,
    'status','awaiting_accountant_review_and_posting');
end; $$;
revoke all on function public.multideck_uk_vat_prepare_first_input_tax_repayment(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_prepare_first_input_tax_repayment(uuid,uuid,uuid,uuid,text)
  to service_role;

commit;
