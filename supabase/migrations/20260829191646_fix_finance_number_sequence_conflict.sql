-- Finance sequence codes remain unique within a legal entity. Match the existing
-- partial unique index exactly so the atomic upsert can allocate the first and
-- every subsequent number without a 42P10 conflict-target error.

begin;

create or replace function public._multideck_finance_next_number(
  p_legal_entity_id uuid,
  p_record_type text
) returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sequence bigint;
  v_prefix text;
  v_code text;
begin
  if p_legal_entity_id is null then
    raise exception 'Choose a legal entity before allocating a finance number.' using errcode = '22023';
  end if;
  if p_record_type not in ('sl_invoice', 'credit_note', 'pl_invoice', 'debit_note', 'customer_receipt', 'supplier_payment') then
    raise exception 'Unknown finance record type.' using errcode = '22023';
  end if;

  v_prefix := case p_record_type
    when 'sl_invoice' then 'SI-'
    when 'credit_note' then 'CN-'
    when 'pl_invoice' then 'PI-'
    when 'debit_note' then 'DN-'
    when 'customer_receipt' then 'RCPT-'
    when 'supplier_payment' then 'PAY-'
  end;
  v_code := 'finance:' || p_legal_entity_id::text || ':' || p_record_type;

  insert into public."FIN_NumberSequences"(
    "FINSeq_Code", "FINSeq_Name", "FINSeq_LegalEntityID", "FINSeq_DocumentTypeCode", "FINSeq_Prefix", "FINSeq_NextNumber", "FINSeq_PaddingLength"
  ) values (
    v_code, v_prefix || 'sequence', p_legal_entity_id,
    case when p_record_type in ('sl_invoice', 'credit_note', 'pl_invoice', 'debit_note') then p_record_type else null end,
    v_prefix, 2, 6
  )
  on conflict ("FINSeq_LegalEntityID", "FINSeq_Code")
    where "FINSeq_LegalEntityID" is not null
  do update set
    "FINSeq_NextNumber" = public."FIN_NumberSequences"."FINSeq_NextNumber" + 1,
    "FINSeq_IsActive" = true
  returning "FINSeq_NextNumber" - 1 into v_sequence;

  return v_prefix || lpad(v_sequence::text, 6, '0');
end;
$$;

revoke all on function public._multideck_finance_next_number(uuid, text) from public, anon, authenticated;

comment on function public._multideck_finance_next_number(uuid, text) is
  'Atomically allocates a legal-entity-scoped finance number through the existing partial unique sequence key.';

commit;
