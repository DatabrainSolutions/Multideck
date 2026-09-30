begin;

-- Bind the invoice-balance inventory and payment-event projection to the same
-- recorded Cash period. This is source material for the VAT-control bridge,
-- not a reconciled return or evidence of prior HMRC acceptance.
create function public.multideck_uk_vat_cash_control_source_inventory(
  p_actor uuid,p_entity uuid,p_period uuid,p_projection uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_registration public."FIN_LegalEntityComplianceRegistrations"%rowtype;
  v_inventory jsonb; v_integrity jsonb; v_preview jsonb; v_anomalies jsonb;
  v_context jsonb; v_digest text;
begin
  perform public._multideck_uk_vat_read_access(p_actor,p_entity);
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=p_period and legal_entity_id=p_entity and jurisdiction_code='GB'
      and scheme_code='cash' and reporting_currency='GBP';
  if not found then
    raise exception 'A UK Cash VAT period is required for this legal entity.' using errcode='42501';
  end if;
  select * into v_registration from public."FIN_LegalEntityComplianceRegistrations"
    where "FINComplianceReg_ID"=v_period.registration_id
      and "FINComplianceReg_LegalEntityID"=p_entity
      and "FINComplianceReg_ObligationID"=v_period.obligation_id
      and "FINComplianceReg_SettingsJSON"->>'schemeCode'='cash'
      and "FINComplianceReg_StatusCode" in
        ('configured','sandbox_verified','production_verified')
      and "FINComplianceReg_EffectiveFrom"<=v_period.start_date
      and ("FINComplianceReg_EffectiveTo" is null
        or "FINComplianceReg_EffectiveTo">=v_period.end_date);
  if not found then
    raise exception 'The Cash registration no longer covers this VAT period.' using errcode='22023';
  end if;
  v_integrity:=public.multideck_uk_vat_cash_projection_integrity(p_actor,p_entity,p_projection);
  if v_integrity->>'status' is distinct from 'current_verified_source_only'
    or v_integrity->>'startDate' is distinct from v_period.start_date::text
    or v_integrity->>'endDate' is distinct from v_period.end_date::text then
    raise exception 'A current Cash payment projection for the exact period is required.' using errcode='22023';
  end if;
  v_preview:=public.multideck_uk_vat_cash_nine_box_preview(p_actor,p_entity,p_projection);
  if v_preview->>'status' is distinct from 'preview_only_no_cash_return_effect'
    or v_preview->>'sourceFingerprint' is distinct from v_integrity->>'fingerprint'
    or v_preview->>'projectionId' is distinct from p_projection::text then
    raise exception 'The Cash nine-box preview does not match verified payment events.' using errcode='22023';
  end if;
  -- Preserve four-decimal PostgreSQL numerics as text across the JSON/JS
  -- boundary. The preview's browser-facing numbers may lose precision.
  v_preview:=v_preview||jsonb_build_object(
    'amountEncoding','decimal_strings',
    'sourceBoxesGbp',jsonb_build_object(
      '1',v_preview#>>'{sourceBoxesGbp,1}',
      '2',v_preview#>>'{sourceBoxesGbp,2}',
      '3',v_preview#>>'{sourceBoxesGbp,3}',
      '4',v_preview#>>'{sourceBoxesGbp,4}',
      '5',v_preview#>>'{sourceBoxesGbp,5}',
      '6',v_preview#>>'{sourceBoxesGbp,6}',
      '7',v_preview#>>'{sourceBoxesGbp,7}',
      '8',v_preview#>>'{sourceBoxesGbp,8}',
      '9',v_preview#>>'{sourceBoxesGbp,9}'));
  v_inventory:=public.multideck_uk_vat_cash_exit_invoice_inventory(
    p_actor,p_entity,v_registration."FINComplianceReg_EffectiveFrom",v_period.end_date);
  if v_inventory->>'truncated' is distinct from 'true'
    and (v_inventory->>'truncated' is distinct from 'false'
      or coalesce(v_inventory->>'sourceDigest','') !~ '^[a-f0-9]{64}$') then
    raise exception 'The Cash invoice inventory is incomplete.' using errcode='22023';
  end if;
  -- The legacy inventory is date bounded by invoice date. Audit invoices
  -- posted inside this Cash term but dated outside it so they cannot silently
  -- disappear from the timing bridge.
  select jsonb_build_object(
    'preEntryDatedPostedInvoices',count(*) filter (where
      document."FINDoc_DocumentDate"<v_registration."FINComplianceReg_EffectiveFrom"),
    'futureDatedPostedInvoices',count(*) filter (where
      document."FINDoc_DocumentDate">v_period.end_date),
    'missingPostingDates',count(*) filter (where document."FINDoc_NativePostedAt" is null),
    'digest',encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
      'id',document."FINDoc_ID",'type',document."FINDoc_TypeCode",
      'documentDate',document."FINDoc_DocumentDate",
      'postedAt',document."FINDoc_NativePostedAt",
      'batch',document."FINDoc_NativePostingBatchID")
      order by document."FINDoc_ID"),'[]'::jsonb)::text,'UTF8')),'hex'))
    into v_anomalies
  from public."FIN_Documents" document
  where document."FINDoc_LegalEntityID"=p_entity
    and document."FINDoc_TypeCode" in ('sl_invoice','pl_invoice')
    and document."FINDoc_NativePostingStatusCode"='posted'
    and (document."FINDoc_NativePostedAt" is null
      or (document."FINDoc_NativePostedAt" at time zone 'Europe/London')::date
        between v_registration."FINComplianceReg_EffectiveFrom" and v_period.end_date)
    and (document."FINDoc_DocumentDate"<v_registration."FINComplianceReg_EffectiveFrom"
      or document."FINDoc_DocumentDate">v_period.end_date
      or document."FINDoc_NativePostedAt" is null);
  v_context:=jsonb_build_object(
    'periodId',v_period.id,'legalEntityId',p_entity,
    'registrationId',v_registration."FINComplianceReg_ID",
    'schemeEntryDate',v_registration."FINComplianceReg_EffectiveFrom",
    'periodStart',v_period.start_date,'periodEnd',v_period.end_date,
    'projectionId',p_projection,'projectionFingerprint',v_integrity->>'fingerprint');
  v_digest:=case when v_inventory->>'truncated'='true' then null else
    encode(sha256(convert_to(jsonb_build_object(
      'context',v_context,'invoiceInventoryDigest',v_inventory->>'sourceDigest',
      'paymentProjectionFingerprint',v_integrity->>'fingerprint',
      'dateAnomalies',v_anomalies)::text,'UTF8')),'hex') end;
  return jsonb_build_object('context',v_context,
    'invoiceInventory',v_inventory,
    'paymentPreview',v_preview,
    'dateAnomalies',v_anomalies,
    'sourceDigest',v_digest,
    'truncated',v_inventory->>'truncated'='true',
    'status','cash_control_source_only',
    'returnReady',false);
end; $$;
revoke all on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_control_source_inventory(uuid,uuid,uuid,uuid)
  to service_role;

commit;
