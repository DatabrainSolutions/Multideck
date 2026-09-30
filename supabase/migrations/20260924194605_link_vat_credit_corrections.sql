begin;

-- An ordinary credit note is a new posted tax event. Link it to the invoice
-- it corrects without changing either immutable evidence row or classifying
-- an earlier filed return as erroneous.
create table public."FIN_IndirectTaxCreditLinks" (
  id uuid primary key default gen_random_uuid(),
  credit_evidence_id uuid not null unique references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  original_evidence_id uuid not null references public."FIN_IndirectTaxEvidence"(id) on delete restrict,
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  linked_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  linked_at timestamptz not null default now(),
  check (credit_evidence_id<>original_evidence_id)
);
create index "IX_FIN_IndirectTaxCreditLinks_original" on public."FIN_IndirectTaxCreditLinks"(original_evidence_id);
alter table public."FIN_IndirectTaxCreditLinks" enable row level security;
revoke all on public."FIN_IndirectTaxCreditLinks" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCreditLinks" to service_role;

create function public._multideck_vat_credit_link_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  raise exception 'A VAT credit link is immutable; record a separate correction.' using errcode='22023';
end; $$;
revoke all on function public._multideck_vat_credit_link_immutable() from public,anon,authenticated;
create trigger vat_credit_link_immutable before update or delete
  on public."FIN_IndirectTaxCreditLinks" for each row
  execute function public._multideck_vat_credit_link_immutable();

create function public._multideck_vat_credit_reversal_conflict()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.reverses_evidence_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'vat-credit-original:'||new.reverses_evidence_id::text,0));
  if exists(select 1 from public."FIN_IndirectTaxCreditLinks" linked
    where linked.original_evidence_id=new.reverses_evidence_id) then
    raise exception 'An invoice with linked credits cannot also receive an exact VAT reversal.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_vat_credit_reversal_conflict()
  from public,anon,authenticated;
create trigger vat_credit_reversal_conflict before insert
  on public."FIN_IndirectTaxEvidence" for each row
  execute function public._multideck_vat_credit_reversal_conflict();

create function public.multideck_uk_vat_link_credit(
  p_actor uuid,p_entity uuid,p_credit uuid,p_original uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_credit public."FIN_IndirectTaxEvidence"%rowtype;
  v_original public."FIN_IndirectTaxEvidence"%rowtype;
  v_credit_document public."FIN_Documents"%rowtype;
  v_original_document public."FIN_Documents"%rowtype;
  v_existing public."FIN_IndirectTaxCreditLinks"%rowtype;
  v_link uuid; v_at timestamptz; v_prior_net numeric; v_prior_tax numeric;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_credit is null or p_original is null or p_credit=p_original
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then
    raise exception 'Choose a credit line, its original invoice line and a reason.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vat-credit-original:'||p_original::text,0));
  select * into v_existing from public."FIN_IndirectTaxCreditLinks" where credit_evidence_id=p_credit;
  if found then
    if v_existing.legal_entity_id<>p_entity or v_existing.original_evidence_id<>p_original then
      raise exception 'This VAT credit is linked to another original.' using errcode='22023';
    end if;
    return jsonb_build_object('linkId',v_existing.id,'linkedAt',v_existing.linked_at,
      'creditEvidenceId',p_credit,'originalEvidenceId',p_original,'inserted',false);
  end if;
  select * into v_credit from public."FIN_IndirectTaxEvidence"
    where id=p_credit and legal_entity_id=p_entity and jurisdiction_code='GB'
      and source_kind='posted_document_line' and reverses_evidence_id is null;
  select * into v_original from public."FIN_IndirectTaxEvidence"
    where id=p_original and legal_entity_id=p_entity and jurisdiction_code='GB'
      and source_kind='posted_document_line';
  if v_credit.id is null or v_original.id is null then
    raise exception 'The VAT credit and original must be posted UK document lines in this legal entity.' using errcode='22023';
  end if;
  if exists(select 1 from public."FIN_IndirectTaxEvidence" exact_reversal
    where exact_reversal.reverses_evidence_id=p_original) then
    raise exception 'An exactly reversed invoice cannot receive an ordinary VAT credit link.' using errcode='22023';
  end if;
  select * into v_credit_document from public."FIN_Documents"
    where "FINDoc_ID"=v_credit.source_document_id and "FINDoc_LegalEntityID"=p_entity;
  select * into v_original_document from public."FIN_Documents"
    where "FINDoc_ID"=v_original.source_document_id and "FINDoc_LegalEntityID"=p_entity;
  if v_credit_document."FINDoc_NativePostingStatusCode"<>'posted'
    or v_original_document."FINDoc_NativePostingStatusCode"<>'posted'
    or (v_original_document."FINDoc_TypeCode",v_credit_document."FINDoc_TypeCode") not in
      (('sl_invoice','credit_note'),('pl_invoice','debit_note'))
    or v_credit_document."FINDoc_PartyOrgID" is distinct from v_original_document."FINDoc_PartyOrgID"
    or v_credit.currency_code<>v_original.currency_code
    or v_original.signed_net_amount<=0 or v_credit.signed_net_amount>=0
    or v_original.signed_tax_amount<0 or v_credit.signed_tax_amount>0
    or abs(v_credit.signed_net_amount)>v_original.signed_net_amount
    or abs(v_credit.signed_tax_amount)>v_original.signed_tax_amount then
    raise exception 'The credit does not match the original invoice, party, currency or remaining amount.' using errcode='22023';
  end if;
  select coalesce(sum(abs(credit.signed_net_amount)),0),
    coalesce(sum(abs(credit.signed_tax_amount)),0)
    into v_prior_net,v_prior_tax
  from public."FIN_IndirectTaxCreditLinks" linked
  join public."FIN_IndirectTaxEvidence" credit on credit.id=linked.credit_evidence_id
  where linked.original_evidence_id=p_original;
  if v_prior_net+abs(v_credit.signed_net_amount)>v_original.signed_net_amount
    or v_prior_tax+abs(v_credit.signed_tax_amount)>v_original.signed_tax_amount then
    raise exception 'The linked VAT credits exceed the original invoice line.' using errcode='22023';
  end if;
  insert into public."FIN_IndirectTaxCreditLinks"(
    credit_evidence_id,original_evidence_id,legal_entity_id,reason,linked_by
  ) values(p_credit,p_original,p_entity,btrim(p_reason),p_actor)
    returning id,linked_at into v_link,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON"
  ) values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxCreditLinks','indirect_tax_credit_link',v_link,
    'link_vat_credit',btrim(p_reason),'UK VAT credit linked to original invoice',
    jsonb_build_object('creditEvidenceId',p_credit,'originalEvidenceId',p_original));
  return jsonb_build_object('linkId',v_link,'linkedAt',v_at,
    'creditEvidenceId',p_credit,'originalEvidenceId',p_original,'inserted',true);
end; $$;
revoke all on function public.multideck_uk_vat_link_credit(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_link_credit(uuid,uuid,uuid,uuid,text)
  to service_role;

create function public.multideck_uk_vat_credit_candidates(
  p_actor uuid,p_entity uuid,p_credit uuid,p_search text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_credit public."FIN_IndirectTaxEvidence"%rowtype;
  v_document public."FIN_Documents"%rowtype; v_rows jsonb;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_credit is null or p_search is null or length(btrim(p_search)) not between 2 and 80 then
    raise exception 'Enter at least two characters of the original invoice number.' using errcode='22023';
  end if;
  select * into v_credit from public."FIN_IndirectTaxEvidence"
    where id=p_credit and legal_entity_id=p_entity and jurisdiction_code='GB'
      and source_kind='posted_document_line' and reverses_evidence_id is null;
  select * into v_document from public."FIN_Documents"
    where "FINDoc_ID"=v_credit.source_document_id and "FINDoc_LegalEntityID"=p_entity;
  if v_credit.id is null or v_document."FINDoc_NativePostingStatusCode"<>'posted'
    or v_document."FINDoc_TypeCode" not in ('credit_note','debit_note') then
    raise exception 'Choose a posted ordinary credit line in this UK legal entity.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'evidenceId',candidate.id,'documentId',candidate.document_id,
    'documentNumber',candidate.document_number,'documentDate',candidate.document_date,
    'lineId',candidate.line_id,'lineNo',candidate.line_no,
    'currencyCode',candidate.currency_code,'remainingNet',candidate.remaining_net,
    'remainingVat',candidate.remaining_vat,'vatReconciledAt',candidate.vat_reconciled_at
  ) order by candidate.document_date desc,candidate.document_id,candidate.line_id),'[]'::jsonb)
    into v_rows
  from (
    select original.id,document."FINDoc_ID" document_id,
      document."FINDoc_Number" document_number,
      document."FINDoc_DocumentDate" document_date,
      original.source_document_line_id line_id,source_line."FINDocLine_LineNo" line_no,
      original.currency_code,
      original.signed_net_amount-coalesce(used.net,0) remaining_net,
      original.signed_tax_amount-coalesce(used.tax,0) remaining_vat,
      signed.first_reconciled_at vat_reconciled_at
    from public."FIN_IndirectTaxEvidence" original
    join public."FIN_Documents" document
      on document."FINDoc_ID"=original.source_document_id
        and document."FINDoc_LegalEntityID"=p_entity
    join public."FIN_DocumentLines" source_line
      on source_line."FINDocLine_ID"=original.source_document_line_id
        and source_line."FINDocLine_DocumentID"=document."FINDoc_ID"
    left join lateral (
      select sum(abs(credit.signed_net_amount)) net,
        sum(abs(credit.signed_tax_amount)) tax
      from public."FIN_IndirectTaxCreditLinks" linked
      join public."FIN_IndirectTaxEvidence" credit on credit.id=linked.credit_evidence_id
      where linked.original_evidence_id=original.id
    ) used on true
    left join lateral (
      select min(reconciliation.reconciled_at) first_reconciled_at
      from public."FIN_IndirectTaxReconciliations" reconciliation
      where reconciliation.evidence_id=original.id
    ) signed on true
    where original.legal_entity_id=p_entity and original.jurisdiction_code='GB'
      and original.source_kind='posted_document_line'
      and document."FINDoc_NativePostingStatusCode"='posted'
      and document."FINDoc_TypeCode"=case v_document."FINDoc_TypeCode"
        when 'credit_note' then 'sl_invoice' else 'pl_invoice' end
      and document."FINDoc_PartyOrgID" is not distinct from v_document."FINDoc_PartyOrgID"
      and original.currency_code=v_credit.currency_code
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" exact_reversal
        where exact_reversal.reverses_evidence_id=original.id)
      and original.signed_net_amount-coalesce(used.net,0)>=abs(v_credit.signed_net_amount)
      and original.signed_tax_amount-coalesce(used.tax,0)>=abs(v_credit.signed_tax_amount)
      and position(lower(btrim(p_search)) in lower(coalesce(document."FINDoc_Number",'')))>0
    order by document."FINDoc_DocumentDate" desc,document."FINDoc_ID",original.source_document_line_id
    limit 20
  ) candidate;
  return jsonb_build_object('creditEvidenceId',p_credit,'candidates',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_credit_candidates(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_credit_candidates(uuid,uuid,uuid,text)
  to service_role;

-- Account drill-down keeps the same permissioned, bounded read and adds the
-- original invoice reference for an explicitly linked ordinary credit.
alter function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)
  rename to _multideck_uk_vat_account_with_reversals;
create function public.multideck_uk_vat_account(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_result jsonb; v_rows jsonb;
begin
  v_result:=public._multideck_uk_vat_account_with_reversals(
    p_actor,p_entity,p_calculation,p_offset,p_limit);
  select coalesce(jsonb_agg(item.value || jsonb_build_object(
      'credit_original_evidence_id',linked.original_evidence_id,
      'credit_original_document_id',original.source_document_id,
      'credit_original_document_number',document."FINDoc_Number",
      'credit_original_document_type',document."FINDoc_TypeCode",
      'credit_linked_at',linked.linked_at
    ) order by item.ordinality),'[]'::jsonb) into v_rows
  from jsonb_array_elements(v_result->'rows') with ordinality as item(value,ordinality)
  left join public."FIN_IndirectTaxCreditLinks" linked
    on linked.credit_evidence_id=(item.value->>'evidence_id')::uuid
      and linked.legal_entity_id=p_entity
  left join public."FIN_IndirectTaxEvidence" original
    on original.id=linked.original_evidence_id
      and original.legal_entity_id=p_entity and original.jurisdiction_code='GB'
  left join public."FIN_Documents" document
    on document."FINDoc_ID"=original.source_document_id
      and document."FINDoc_LegalEntityID"=p_entity;
  return jsonb_set(v_result,'{rows}',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)
  to service_role;

commit;
