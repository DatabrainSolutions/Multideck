begin;

-- Applying an already posted credit to an already posted invoice changes only
-- their open subledger balances. Both original documents, VAT evidence and
-- native journals remain immutable. This is settlement evidence, not itself
-- a Cash Accounting tax event or permission to file a return.
create table public."FIN_IndirectTaxCreditApplications" (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid not null references public."cmp_LegalEntities"("LegalEntity_ID") on delete restrict,
  invoice_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  credit_id uuid not null references public."FIN_Documents"("FINDoc_ID") on delete restrict,
  accounting_period_id uuid not null references public."FIN_Periods"("FINPeriod_ID") on delete restrict,
  applied_on date not null,
  amount_gbp numeric(18,4) not null check(amount_gbp>0),
  invoice_outstanding_before_gbp numeric(18,4) not null check(invoice_outstanding_before_gbp>0),
  credit_outstanding_before_gbp numeric(18,4) not null check(credit_outstanding_before_gbp<0),
  request_key uuid not null unique,
  applied_by uuid not null references public."cmp_Users"("User_ID") on delete restrict,
  applied_at timestamptz not null default clock_timestamp(),
  reason text not null check(length(btrim(reason)) between 10 and 2000),
  check(invoice_id<>credit_id),
  check(amount_gbp<=invoice_outstanding_before_gbp and amount_gbp<=abs(credit_outstanding_before_gbp))
);
create index "IX_FIN_IndirectTaxCreditApplications_invoice"
  on public."FIN_IndirectTaxCreditApplications"(invoice_id,applied_at);
create index "IX_FIN_IndirectTaxCreditApplications_credit"
  on public."FIN_IndirectTaxCreditApplications"(credit_id,applied_at);
alter table public."FIN_IndirectTaxCreditApplications" enable row level security;
revoke all on public."FIN_IndirectTaxCreditApplications" from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCreditApplications" to service_role;
create trigger indirect_tax_credit_application_immutable before update or delete
  on public."FIN_IndirectTaxCreditApplications" for each row
  execute function public._multideck_indirect_tax_immutable();

create function public.multideck_uk_vat_apply_credit_to_invoice(
  p_actor uuid,p_entity uuid,p_invoice uuid,p_credit uuid,p_amount numeric,
  p_applied_on date,p_request_key uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_invoice public."FIN_Documents"%rowtype; v_credit public."FIN_Documents"%rowtype;
  v_existing public."FIN_IndirectTaxCreditApplications"%rowtype;
  v_period uuid; v_period_count integer; v_line_count integer; v_id uuid; v_at timestamptz;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Approve');
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_invoice is null or p_credit is null or p_invoice=p_credit
    or p_request_key is null or p_amount is null or p_amount<=0
    or p_amount::text in ('NaN','Infinity','-Infinity')
    or p_amount<>round(p_amount,4) or p_applied_on is null
    or p_applied_on>(clock_timestamp() at time zone 'Europe/London')::date
    or length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then
    raise exception 'Choose two posted GBP documents, a supported amount, application date and reason.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('uk-vat-credit-application:'||p_entity::text,0));
  select * into v_existing from public."FIN_IndirectTaxCreditApplications"
    where request_key=p_request_key;
  if found then
    if (v_existing.legal_entity_id,v_existing.invoice_id,v_existing.credit_id,
        v_existing.amount_gbp,v_existing.applied_on,v_existing.applied_by,v_existing.reason)
      is distinct from (p_entity,p_invoice,p_credit,p_amount,p_applied_on,p_actor,btrim(p_reason)) then
      raise exception 'This credit application request key belongs to another action.' using errcode='23505';
    end if;
    return jsonb_build_object('applicationId',v_existing.id,'appliedAt',v_existing.applied_at,
      'invoiceId',p_invoice,'creditId',p_credit,'amountGbp',p_amount,'inserted',false,
      'status','subledger_settlement_only_no_cash_vat_effect');
  end if;
  -- Lock both document rows in stable order before reading their balances.
  perform 1 from public."FIN_Documents" where "FINDoc_ID" in (p_invoice,p_credit)
    order by "FINDoc_ID" for update;
  select * into v_invoice from public."FIN_Documents" where "FINDoc_ID"=p_invoice;
  select * into v_credit from public."FIN_Documents" where "FINDoc_ID"=p_credit;
  if v_invoice."FINDoc_LegalEntityID" is distinct from p_entity
    or v_credit."FINDoc_LegalEntityID" is distinct from p_entity then
    raise exception 'The invoice and credit must belong to this legal entity.' using errcode='42501';
  end if;
  if v_invoice."FINDoc_NativePostingStatusCode"<>'posted'
    or v_credit."FINDoc_NativePostingStatusCode"<>'posted'
    or v_invoice."FINDoc_StatusCode" not in ('approved','submitted')
    or v_credit."FINDoc_StatusCode" not in ('approved','submitted')
    or (v_invoice."FINDoc_TypeCode",v_credit."FINDoc_TypeCode") not in
      (('sl_invoice','credit_note'),('pl_invoice','debit_note'))
    or v_invoice."FINDoc_PartyOrgID" is null
    or v_invoice."FINDoc_PartyOrgID" is distinct from v_credit."FINDoc_PartyOrgID"
    or v_invoice."FINDoc_CurrencyCodeSnapshot"<>'GBP'
    or v_credit."FINDoc_CurrencyCodeSnapshot"<>'GBP'
    or v_invoice."FINDoc_ExchangeRate"<>1 or v_credit."FINDoc_ExchangeRate"<>1
    or v_invoice."FINDoc_LocalOutstandingAmount" is distinct from v_invoice."FINDoc_OutstandingAmount"
    or v_credit."FINDoc_LocalOutstandingAmount" is distinct from v_credit."FINDoc_OutstandingAmount"
    or v_invoice."FINDoc_OutstandingAmount"<p_amount
    or v_credit."FINDoc_OutstandingAmount">-p_amount
    or p_applied_on<greatest(v_invoice."FINDoc_DocumentDate",v_credit."FINDoc_DocumentDate") then
    raise exception 'The posted invoice and credit do not have a matching GBP balance, party or date.' using errcode='22023';
  end if;
  if not exists(select 1 from public."FIN_PostingBatches" batch
      where batch."FINPostBatch_ID"=v_invoice."FINDoc_NativePostingBatchID"
        and batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted')
    or not exists(select 1 from public."FIN_PostingBatches" batch
      where batch."FINPostBatch_ID"=v_credit."FINDoc_NativePostingBatchID"
        and batch."FINPostBatch_LegalEntityID"=p_entity and batch."FINPostBatch_StatusCode"='posted') then
    raise exception 'Both documents need posted native journal evidence.' using errcode='22023';
  end if;
  if exists(select 1 from public."ACCI_Connections" connection
      where connection."ACCIC_LegalEntityID"=p_entity and connection."ACCIC_StatusCode"='active') then
    raise exception 'A linked accounting mirror needs a reviewed credit-application delivery adapter.' using errcode='22023';
  end if;
  select count(*)::integer,(array_agg(period."FINPeriod_ID"))[1]
    into v_period_count,v_period from public."FIN_Periods" period
    where period."FINPeriod_LegalEntityID"=p_entity
      and p_applied_on between period."FINPeriod_StartDate" and period."FINPeriod_EndDate"
      and period."FINPeriod_StatusCode"='open';
  if v_period_count<>1 then
    raise exception 'The credit application date needs one open accounting period.' using errcode='22023';
  end if;
  select count(*)::integer into v_line_count from public."FIN_DocumentLines" line
    where line."FINDocLine_DocumentID"=p_credit;
  if v_line_count=0 or exists(select 1 from public."FIN_DocumentLines" line
    where line."FINDocLine_DocumentID"=p_credit
      and not exists(select 1 from public."FIN_IndirectTaxEvidence" credit_evidence
        join public."FIN_IndirectTaxCreditLinks" link
          on link.credit_evidence_id=credit_evidence.id and link.legal_entity_id=p_entity
        join public."FIN_IndirectTaxEvidence" original
          on original.id=link.original_evidence_id
          and original.legal_entity_id=p_entity and original.source_document_id=p_invoice
        where credit_evidence.legal_entity_id=p_entity
          and credit_evidence.source_document_id=p_credit
          and credit_evidence.source_document_line_id=line."FINDocLine_ID"
          and credit_evidence.source_posting_batch_id=v_credit."FINDoc_NativePostingBatchID")) then
    raise exception 'Link every posted credit line to this original invoice before applying its balance.' using errcode='22023';
  end if;
  update public."FIN_Documents" set
    "FINDoc_OutstandingAmount"="FINDoc_OutstandingAmount"-p_amount,
    "FINDoc_LocalOutstandingAmount"="FINDoc_LocalOutstandingAmount"-p_amount,
    "FINDoc_UpdatedAt"=clock_timestamp(),"FINDoc_UpdatedBy"=p_actor
    where "FINDoc_ID"=p_invoice;
  update public."FIN_Documents" set
    "FINDoc_OutstandingAmount"="FINDoc_OutstandingAmount"+p_amount,
    "FINDoc_LocalOutstandingAmount"="FINDoc_LocalOutstandingAmount"+p_amount,
    "FINDoc_UpdatedAt"=clock_timestamp(),"FINDoc_UpdatedBy"=p_actor
    where "FINDoc_ID"=p_credit;
  insert into public."FIN_IndirectTaxCreditApplications"(
    legal_entity_id,invoice_id,credit_id,accounting_period_id,applied_on,amount_gbp,
    invoice_outstanding_before_gbp,credit_outstanding_before_gbp,request_key,applied_by,reason)
  values(p_entity,p_invoice,p_credit,v_period,p_applied_on,p_amount,
    v_invoice."FINDoc_OutstandingAmount",v_credit."FINDoc_OutstandingAmount",
    p_request_key,p_actor,btrim(p_reason)) returning id,applied_at into v_id,v_at;
  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Reason","AuditEvent_Title","AuditEvent_MetadataJSON")
  values('finance_lifecycle',p_actor,p_entity,'multideck-app','finance','public',
    'FIN_IndirectTaxCreditApplications','indirect_tax_credit_application',v_id,
    'apply_credit_to_invoice',btrim(p_reason),'Posted credit applied to invoice balance',
    jsonb_build_object('invoiceId',p_invoice,'creditId',p_credit,'amountGbp',p_amount,
      'appliedOn',p_applied_on,'accountingPeriodId',v_period));
  return jsonb_build_object('applicationId',v_id,'appliedAt',v_at,
    'invoiceId',p_invoice,'creditId',p_credit,'amountGbp',p_amount,'inserted',true,
    'status','subledger_settlement_only_no_cash_vat_effect');
end; $$;
revoke all on function public.multideck_uk_vat_apply_credit_to_invoice(
  uuid,uuid,uuid,uuid,numeric,date,uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_apply_credit_to_invoice(
  uuid,uuid,uuid,uuid,numeric,date,uuid,text) to service_role;

create function public.multideck_uk_vat_credit_application_source(
  p_actor uuid,p_entity uuid,p_credit uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_credit public."FIN_Documents"%rowtype;
  v_invoice public."FIN_Documents"%rowtype;
  v_line_count integer; v_linked_count integer; v_invoice_count integer;
  v_invoice_id uuid; v_history jsonb; v_mirror boolean;
begin
  perform public._multideck_journal_access(p_actor,p_entity,'Finance.Management.Approve');
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  select * into v_credit from public."FIN_Documents"
    where "FINDoc_ID"=p_credit and "FINDoc_LegalEntityID"=p_entity
      and "FINDoc_TypeCode" in ('credit_note','debit_note');
  if v_credit."FINDoc_ID" is null then
    raise exception 'This posted credit was not found in the legal entity.' using errcode='42501';
  end if;
  select count(*)::integer,count(distinct original.source_document_id)::integer,
    (array_agg(distinct original.source_document_id))[1]
    into v_linked_count,v_invoice_count,v_invoice_id
  from public."FIN_DocumentLines" line
  join public."FIN_IndirectTaxEvidence" credit_evidence
    on credit_evidence.legal_entity_id=p_entity
      and credit_evidence.source_document_id=p_credit
      and credit_evidence.source_document_line_id=line."FINDocLine_ID"
      and credit_evidence.source_posting_batch_id=v_credit."FINDoc_NativePostingBatchID"
  join public."FIN_IndirectTaxCreditLinks" link
    on link.credit_evidence_id=credit_evidence.id and link.legal_entity_id=p_entity
  join public."FIN_IndirectTaxEvidence" original
    on original.id=link.original_evidence_id and original.legal_entity_id=p_entity
  where line."FINDocLine_DocumentID"=p_credit;
  select count(*)::integer into v_line_count from public."FIN_DocumentLines"
    where "FINDocLine_DocumentID"=p_credit;
  select * into v_invoice from public."FIN_Documents"
    where "FINDoc_ID"=v_invoice_id and "FINDoc_LegalEntityID"=p_entity;
  select exists(select 1 from public."ACCI_Connections" connection
    where connection."ACCIC_LegalEntityID"=p_entity
      and connection."ACCIC_StatusCode"='active') into v_mirror;
  select coalesce(jsonb_agg(jsonb_build_object(
    'applicationId',application.id,'requestKey',application.request_key,
    'appliedOn',application.applied_on,
    'appliedAt',application.applied_at,'amountGbp',application.amount_gbp::text,
    'reason',application.reason,'appliedBy',application.applied_by)
    order by application.applied_at,application.id),'[]'::jsonb)
    into v_history
  from public."FIN_IndirectTaxCreditApplications" application
  where application.legal_entity_id=p_entity and application.credit_id=p_credit;
  return jsonb_build_object(
    'creditId',p_credit,'creditNumber',v_credit."FINDoc_Number",
    'creditDate',v_credit."FINDoc_DocumentDate",
    'creditOutstandingGbp',v_credit."FINDoc_OutstandingAmount"::text,
    'invoiceId',case when v_linked_count=v_line_count and v_invoice_count=1
      then v_invoice_id end,
    'invoiceNumber',case when v_linked_count=v_line_count and v_invoice_count=1
      then v_invoice."FINDoc_Number" end,
    'invoiceDate',case when v_linked_count=v_line_count and v_invoice_count=1
      then v_invoice."FINDoc_DocumentDate" end,
    'invoiceOutstandingGbp',case when v_linked_count=v_line_count and v_invoice_count=1
      then v_invoice."FINDoc_OutstandingAmount"::text end,
    'availableGbp',case when v_linked_count=v_line_count and v_invoice_count=1
      then greatest(0,least(v_invoice."FINDoc_OutstandingAmount",
        -v_credit."FINDoc_OutstandingAmount"))::text else '0' end,
    'lineCount',v_line_count,'linkedLineCount',v_linked_count,
    'activeAccountingMirror',v_mirror,'applications',v_history,
    'status',case
      when v_credit."FINDoc_NativePostingStatusCode"<>'posted'
        or v_credit."FINDoc_StatusCode" not in ('approved','submitted')
        or v_credit."FINDoc_CurrencyCodeSnapshot"<>'GBP'
        or v_credit."FINDoc_ExchangeRate"<>1
        or v_credit."FINDoc_LocalOutstandingAmount" is distinct from v_credit."FINDoc_OutstandingAmount"
        then 'unsupported_credit'
      when v_line_count=0 or v_linked_count<>v_line_count or v_invoice_count<>1
        then 'link_every_credit_line_to_one_invoice'
      when v_invoice."FINDoc_NativePostingStatusCode"<>'posted'
        or v_invoice."FINDoc_StatusCode" not in ('approved','submitted')
        or (v_invoice."FINDoc_TypeCode",v_credit."FINDoc_TypeCode") not in
          (('sl_invoice','credit_note'),('pl_invoice','debit_note'))
        or v_invoice."FINDoc_PartyOrgID" is null
        or v_invoice."FINDoc_PartyOrgID" is distinct from v_credit."FINDoc_PartyOrgID"
        or v_invoice."FINDoc_CurrencyCodeSnapshot"<>'GBP'
        or v_invoice."FINDoc_ExchangeRate"<>1
        or v_invoice."FINDoc_LocalOutstandingAmount" is distinct from v_invoice."FINDoc_OutstandingAmount"
        then 'unsupported_invoice'
      when v_mirror then 'accounting_mirror_requires_adapter'
      when v_invoice."FINDoc_OutstandingAmount"<=0
        or v_credit."FINDoc_OutstandingAmount">=0 then 'fully_applied'
      else 'ready' end);
end; $$;
revoke all on function public.multideck_uk_vat_credit_application_source(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_credit_application_source(uuid,uuid,uuid)
  to service_role;

commit;
