begin;

-- Preserve the reviewed prepared invoice/credit PDF as finance evidence and surface
-- only its safe catalogue identifiers through Dexter's existing tenant-scoped domain.
alter function public.multideck_dexter_domain_finance(uuid, text, integer)
  rename to _multideck_dexter_domain_finance_base;

revoke all on function public._multideck_dexter_domain_finance_base(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public._multideck_dexter_domain_finance_base(uuid, text, integer)
  to service_role;

create function public.multideck_dexter_domain_finance(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(
    case
      when entry.value ->> 'recordKind' = 'document'
        and document."FINDoc_MetadataJSON" ->> 'source' = 'supplier_document_intake'
      then entry.value || jsonb_build_object('sourceEvidence', jsonb_strip_nulls(jsonb_build_object(
        'kind', 'supplier_document_intake',
        'fileName', document."FINDoc_MetadataJSON" ->> 'sourceFileName',
        'sha256', document."FINDoc_MetadataJSON" ->> 'sourceSHA256',
        'storedObjectId', document."FINDoc_MetadataJSON" ->> 'sourceStoredObjectId',
        'extractionId', document."FINDoc_MetadataJSON" ->> 'sourceExtractionId'
      )))
      else entry.value
    end
    order by entry.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(public._multideck_dexter_domain_finance_base(p_company_id, p_search, p_take))
    with ordinality as entry(value, ordinality)
  left join public."FIN_Documents" document
    on document."FINDoc_ID" = nullif(entry.value ->> 'recordId', '')::uuid
    and entry.value ->> 'recordKind' = 'document';
$$;

revoke all on function public.multideck_dexter_domain_finance(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_finance(uuid, text, integer)
  to service_role;

update public."sys_AIDexterWatchCapabilities"
set "AIDexterWatchCapability_Description" = 'Event-driven finance document, retained supplier evidence, tax-readiness, receipt, payment, allocation, provider-sync, recovery and approved configuration changes.',
    "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'finance';

commit;
