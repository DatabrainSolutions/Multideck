begin;

-- Keep the existing bounded, permissioned VAT account read as the base. Add
-- only the original document identity for a verified reversal in the same
-- legal entity, so reviewers can follow a correction without raw metadata.
alter function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)
  rename to _multideck_uk_vat_account_base;

create function public.multideck_uk_vat_account(
  p_actor uuid,p_entity uuid,p_calculation uuid,p_offset integer default 0,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_result jsonb; v_rows jsonb;
begin
  v_result:=public._multideck_uk_vat_account_base(
    p_actor,p_entity,p_calculation,p_offset,p_limit);
  select coalesce(jsonb_agg(item.value || jsonb_build_object(
      'reverses_evidence_id',evidence.reverses_evidence_id,
      'original_document_id',original.source_document_id,
      'original_document_number',document."FINDoc_Number",
      'original_document_type',document."FINDoc_TypeCode",
      'original_vat_reconciled_at',signoff.first_reconciled_at
    ) order by item.ordinality),'[]'::jsonb) into v_rows
  from jsonb_array_elements(v_result->'rows') with ordinality as item(value,ordinality)
  left join public."FIN_IndirectTaxEvidence" evidence
    on evidence.id=(item.value->>'evidence_id')::uuid
      and evidence.legal_entity_id=p_entity and evidence.jurisdiction_code='GB'
  left join public."FIN_IndirectTaxEvidence" original
    on original.id=evidence.reverses_evidence_id
      and original.legal_entity_id=p_entity and original.jurisdiction_code='GB'
  left join public."FIN_Documents" document
    on document."FINDoc_ID"=original.source_document_id
      and document."FINDoc_LegalEntityID"=p_entity
  left join lateral (
    select min(signed.reconciled_at) first_reconciled_at
    from public."FIN_IndirectTaxReconciliations" signed
    where signed.evidence_id=original.id
  ) signoff on true;
  return jsonb_set(v_result,'{rows}',v_rows);
end; $$;
revoke all on function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_account(uuid,uuid,uuid,integer,integer)
  to service_role;

commit;
