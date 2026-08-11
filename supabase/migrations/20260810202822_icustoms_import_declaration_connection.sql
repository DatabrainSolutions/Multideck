begin;

insert into public."sys_CustomsFormOptions" (
  "CFO_CatalogCode", "CFO_Code", "CFO_Name", "CFO_Description",
  "CFO_Direction", "CFO_SortOrder", "CFO_IsActive"
) values
  ('procedure_code', '4000', 'Release to free circulation and home use', 'Standard import procedure for goods released to free circulation.', 'import', 10, true),
  ('procedure_code', '4200', 'Release with VAT relief for onward supply', 'Release to free circulation with VAT exemption for an onward supply.', 'import', 20, true),
  ('procedure_code', '5100', 'Inward processing', 'Placement of non-Union goods under inward processing.', 'import', 30, true),
  ('additional_procedure_code', '000', 'No additional procedure', 'No additional procedure applies.', 'import', 10, true),
  ('additional_procedure_code', 'C28', 'Returned goods relief', 'Additional procedure used by the documented iCustoms H1 example.', 'import', 20, true),
  ('previous_document_type', '355', 'Entry summary declaration', 'Previous document type used by the documented iCustoms H1 example.', 'import', 10, true)
on conflict ("CFO_CatalogCode", "CFO_Code", "CFO_Direction") do update set
  "CFO_Name" = excluded."CFO_Name",
  "CFO_Description" = excluded."CFO_Description",
  "CFO_SortOrder" = excluded."CFO_SortOrder",
  "CFO_IsActive" = true;

create or replace function public.save_customs_import_draft(
  p_declaration_id uuid,
  p_draft jsonb
)
returns table(
  declaration_id uuid,
  local_reference_number text,
  updated_at timestamptz
)
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_declaration_id uuid := p_declaration_id;
  v_reference text;
  v_updated_at timestamptz := clock_timestamp();
  v_affected integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to save a Customs draft.';
  end if;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception using errcode = '22023', message = 'A valid Customs draft is required.';
  end if;

  if coalesce(p_draft ->> 'direction', 'import') <> 'import' then
    raise exception using errcode = '22023', message = 'The saved declaration direction must be import.';
  end if;

  if jsonb_typeof(coalesce(p_draft -> 'items', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Customs draft items must be an array.';
  end if;

  if v_declaration_id is null then
    v_reference := 'MD-CDS-IM-'
      || to_char(v_updated_at at time zone 'UTC', 'YYYYMMDD')
      || '-'
      || lpad(nextval('public."Customs_DeclarationReferenceSeq"')::text, 4, '0');

    insert into public."Customs_Declarations" (
      "CUST_JurisdictionCode",
      "CUST_Direction",
      "CUST_DeclarationKind",
      "CUST_Status",
      "CUST_LocalReferenceNumber",
      "CUST_UCR",
      "CUST_TraderReference",
      "CUST_DeclarantIdentifierSnapshot",
      "CUST_ImporterIdentifierSnapshot",
      "CUST_ExporterIdentifierSnapshot",
      "CUST_RepresentativeIdentifierSnapshot",
      "CUST_CustomsOfficeOfEntry",
      "CUST_GoodsLocationCode",
      "CUST_CountryOfDispatchCodeSnapshot",
      "CUST_CountryOfDestinationCodeSnapshot",
      "CUST_TotalPackages",
      "CUST_GrossMass",
      "CUST_InvoiceAmount",
      "CUST_InvoiceCurrencyCodeSnapshot",
      "CUST_IncotermsCode",
      "CUST_GenericPayloadJSON",
      "CUST_SourceSnapshot",
      "CUST_CreatedAt",
      "CUST_CreatedBy",
      "CUST_UpdatedAt",
      "CUST_UpdatedBy"
    ) values (
      'GB',
      'import',
      'cds_import',
      'draft',
      v_reference,
      nullif(btrim(p_draft ->> 'ucn'), ''),
      nullif(btrim(p_draft ->> 'traderReference'), ''),
      nullif(btrim(p_draft ->> 'declarant'), ''),
      nullif(btrim(p_draft ->> 'importer'), ''),
      nullif(btrim(p_draft ->> 'exporter'), ''),
      nullif(btrim(p_draft ->> 'representative'), ''),
      nullif(btrim(p_draft ->> 'presentationOffice'), ''),
      nullif(btrim(p_draft ->> 'goodsLocationIdentifier'), ''),
      nullif(btrim(p_draft ->> 'exportCountry'), ''),
      nullif(btrim(p_draft ->> 'destinationCountry'), ''),
      case when coalesce(p_draft ->> 'totalPackages', '') ~ '^\d+$' then (p_draft ->> 'totalPackages')::integer end,
      case when coalesce(p_draft ->> 'totalGrossMass', '') ~ '^\d+(\.\d+)?$' then (p_draft ->> 'totalGrossMass')::numeric end,
      case when coalesce(p_draft ->> 'totalAmount', '') ~ '^\d+(\.\d+)?$' then (p_draft ->> 'totalAmount')::numeric end,
      nullif(btrim(p_draft ->> 'currency'), ''),
      nullif(btrim(p_draft ->> 'tradeTerms'), ''),
      p_draft,
      jsonb_build_object('source', 'multideck_app', 'item_count', jsonb_array_length(coalesce(p_draft -> 'items', '[]'::jsonb))),
      v_updated_at,
      v_user_id,
      v_updated_at,
      v_user_id
    )
    returning "CUST_id" into v_declaration_id;
  else
    update public."Customs_Declarations"
    set
      "CUST_UCR" = nullif(btrim(p_draft ->> 'ucn'), ''),
      "CUST_TraderReference" = nullif(btrim(p_draft ->> 'traderReference'), ''),
      "CUST_DeclarantIdentifierSnapshot" = nullif(btrim(p_draft ->> 'declarant'), ''),
      "CUST_ImporterIdentifierSnapshot" = nullif(btrim(p_draft ->> 'importer'), ''),
      "CUST_ExporterIdentifierSnapshot" = nullif(btrim(p_draft ->> 'exporter'), ''),
      "CUST_RepresentativeIdentifierSnapshot" = nullif(btrim(p_draft ->> 'representative'), ''),
      "CUST_CustomsOfficeOfEntry" = nullif(btrim(p_draft ->> 'presentationOffice'), ''),
      "CUST_GoodsLocationCode" = nullif(btrim(p_draft ->> 'goodsLocationIdentifier'), ''),
      "CUST_CountryOfDispatchCodeSnapshot" = nullif(btrim(p_draft ->> 'exportCountry'), ''),
      "CUST_CountryOfDestinationCodeSnapshot" = nullif(btrim(p_draft ->> 'destinationCountry'), ''),
      "CUST_TotalPackages" = case when coalesce(p_draft ->> 'totalPackages', '') ~ '^\d+$' then (p_draft ->> 'totalPackages')::integer end,
      "CUST_GrossMass" = case when coalesce(p_draft ->> 'totalGrossMass', '') ~ '^\d+(\.\d+)?$' then (p_draft ->> 'totalGrossMass')::numeric end,
      "CUST_InvoiceAmount" = case when coalesce(p_draft ->> 'totalAmount', '') ~ '^\d+(\.\d+)?$' then (p_draft ->> 'totalAmount')::numeric end,
      "CUST_InvoiceCurrencyCodeSnapshot" = nullif(btrim(p_draft ->> 'currency'), ''),
      "CUST_IncotermsCode" = nullif(btrim(p_draft ->> 'tradeTerms'), ''),
      "CUST_GenericPayloadJSON" = p_draft,
      "CUST_SourceSnapshot" = jsonb_build_object('source', 'multideck_app', 'item_count', jsonb_array_length(coalesce(p_draft -> 'items', '[]'::jsonb))),
      "CUST_Status" = 'draft',
      "CUST_UpdatedAt" = v_updated_at,
      "CUST_UpdatedBy" = v_user_id
    where "CUST_id" = v_declaration_id
      and "CUST_CreatedBy" = v_user_id
      and "CUST_Direction" = 'import'
      and "CUST_DeclarationKind" = 'cds_import'
      and "CUST_Status" = 'draft'
      and not "CUST_IsDeleted";

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = '42501', message = 'This Customs draft is unavailable or can no longer be edited.';
    end if;

    select "CUST_LocalReferenceNumber"
      into v_reference
    from public."Customs_Declarations"
    where "CUST_id" = v_declaration_id;

    delete from public."Customs_Items"
    where "CUSTI_CustomsID" = v_declaration_id;
  end if;

  insert into public."Customs_Items" (
    "CUSTI_CustomsID",
    "CUSTI_ItemNumber",
    "CUSTI_CommodityCode",
    "CUSTI_DescriptionOfGoods",
    "CUSTI_CountryOfOriginCodeSnapshot",
    "CUSTI_CountryOfDestinationCodeSnapshot",
    "CUSTI_NetMass",
    "CUSTI_GrossMass",
    "CUSTI_SupplementaryUnits",
    "CUSTI_ItemValueAmount",
    "CUSTI_ItemValueCurrencyCodeSnapshot",
    "CUSTI_ProcedureCode",
    "CUSTI_AdditionalProcedureCodesJSON",
    "CUSTI_ItemPayloadJSON"
  )
  select
    v_declaration_id,
    item.ordinality::integer,
    nullif(btrim(item.value ->> 'commodityCode'), ''),
    coalesce(item.value ->> 'description', ''),
    nullif(btrim(item.value ->> 'nonPreferentialOrigin'), ''),
    nullif(btrim(coalesce(item.value ->> 'destinationCountry', p_draft ->> 'destinationCountry')), ''),
    case when coalesce(item.value ->> 'netMass', '') ~ '^\d+(\.\d+)?$' then (item.value ->> 'netMass')::numeric end,
    case when coalesce(item.value ->> 'grossMass', '') ~ '^\d+(\.\d+)?$' then (item.value ->> 'grossMass')::numeric end,
    case when coalesce(item.value ->> 'tariffQuantity', '') ~ '^\d+(\.\d+)?$' then (item.value ->> 'tariffQuantity')::numeric end,
    case when coalesce(item.value ->> 'itemPrice', '') ~ '^\d+(\.\d+)?$' then (item.value ->> 'itemPrice')::numeric end,
    nullif(btrim(item.value ->> 'currency'), ''),
    nullif(btrim(item.value ->> 'procedureCode'), ''),
    case
      when nullif(btrim(item.value ->> 'additionalProcedureCode'), '') is null then '[]'::jsonb
      else jsonb_build_array(item.value ->> 'additionalProcedureCode')
    end,
    item.value
  from jsonb_array_elements(coalesce(p_draft -> 'items', '[]'::jsonb)) with ordinality as item(value, ordinality);

  return query
  select v_declaration_id, v_reference, v_updated_at;
end;
$$;

revoke all on function public.save_customs_import_draft(uuid, jsonb) from public, anon;
grant execute on function public.save_customs_import_draft(uuid, jsonb) to authenticated;
grant execute on function public.save_customs_import_draft(uuid, jsonb) to service_role;

comment on function public.save_customs_import_draft(uuid, jsonb) is
  'Atomically creates or updates an authenticated user-owned UK CDS import draft and all of its goods items.';

update public."ICUS_ApiConnections"
set "ICUSC_SettingsJSON" = coalesce("ICUSC_SettingsJSON", '{}'::jsonb)
  || jsonb_build_object(
    'jurisdiction', 'GB',
    'declarationKinds', jsonb_build_array('cds_export', 'cds_import'),
    'directions', jsonb_build_array('export', 'import'),
    'transport', 'xml'
  )
where "ICUSC_Environment" = 'sandbox'
  and "ICUSC_BaseURL" = 'https://ihub-tdr.customscloud.co';

-- Dexter chat and Watching for you already read and react to every owned row
-- in Customs_Declarations, so Import becomes visible through the same
-- tenant-safe domain and deterministic event adapter. Make that support clear
-- in the capability registry.
update public."sys_AIDexterDataDomains"
set
  "AIDexterDomain_Description" = 'The signed-in operator''s UK CDS export and import declaration drafts and filing evidence, including direction, status, references, destination, value, item count and the latest recorded iCustoms submission state.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customs_declarations';

update public."sys_AIDexterWatchCapabilities"
set
  "AIDexterWatchCapability_Description" = 'Status, reference, destination, value and recorded iCustoms submission changes for one exact UK CDS export or import declaration owned by the signed-in operator.',
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customs_declarations';

-- H1 creation and editing intentionally remain in the Customs workspace. The
-- structured party, valuation and complete goods-line contract is not exposed
-- as a Dexter write action; chat can read it and watches remain event-driven.

commit;
