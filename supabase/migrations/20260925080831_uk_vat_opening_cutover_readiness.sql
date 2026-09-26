begin;

-- This replaces the deliberately false finance cutover hook only after the
-- additive VAT migration has installed capture, backfill, coverage and draft
-- calculation exclusions for marked historical opening documents.
create or replace function public._multideck_opening_vat_cutover_ready(
  p_entity uuid,p_package uuid
) returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
  select exists(select 1 from public."FIN_OpeningBalancePackages" package
    join public."cmp_LegalEntities" entity
      on entity."LegalEntity_ID"=package.legal_entity_id
      and entity."LegalEntity_CountryCode"='GB'
      and upper(entity."LegalEntity_BaseCurrencyCodeSnapshot")='GBP'
    where package.id=p_package and package.legal_entity_id=p_entity
      and package.package_kind='full_open_items' and package.status='approved'
      and package.approved_by is not null and package.approved_at is not null
      and package.source_items_count>0
      and package.source_items_count=(select count(*)
        from public."FIN_OpeningSourceItems" item where item.package_id=package.id)
      and not exists(select 1 from public."FIN_OpeningSourceItems" item
        where item.package_id=package.id
          and (coalesce(length(btrim(item.historical_vat_evidence_ref)),0)<3
            or (item.kind in ('customer_invoice','customer_credit',
                  'supplier_invoice','supplier_credit')
              and (item.operational_document_id is null or item.operational_cash_id is not null))
            or (item.kind in ('customer_receipt','supplier_payment')
              and (item.operational_cash_id is null or item.operational_document_id is not null)))));
$$;
revoke all on function public._multideck_opening_vat_cutover_ready(uuid,uuid)
  from public,anon,authenticated;

commit;
