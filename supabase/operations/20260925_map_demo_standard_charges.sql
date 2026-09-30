-- One-time Databrain Test mapping after installing Multideck's standard
-- charge identities. Run only in the MultiDeck demo project
-- aqtwypsuijxlnvtxpuxe. This leaves every existing finance mapping intact.
begin;

do $standard_demo_mapping$
declare
  v_entity uuid := 'a8e98266-f5f4-4620-b45a-e3d991a38209';
  v_actor uuid := 'c38b47bc-2ea6-472b-ae28-318a66abf0d5';
  v_code text;
  v_cost_code text;
  v_revenue_code text;
  v_charge uuid;
  v_cost uuid;
  v_revenue uuid;
begin
  if not exists(select 1 from public."cmp_LegalEntities"
    where "LegalEntity_ID"=v_entity and "LegalEntity_Name"='Databrain Test'
      and "LegalEntity_IsActive") then
    raise exception 'The Databrain Test legal entity was not found.' using errcode='22023';
  end if;
  perform public._multideck_journal_access(v_actor,v_entity,'Finance.Configuration.Manage');
  for v_code,v_cost_code,v_revenue_code in
    select * from (values
      ('MD-FREIGHT','FREIGHT_COST','FREIGHT_REVENUE'),
      ('MD-AGENCY','AGENCY_COST','AGENCY_REVENUE'),
      ('MD-PORT','PORT_COST','PORT_REVENUE'),
      ('MD-DOCUMENTATION','DOCUMENT_COST','DOCUMENT_REVENUE'),
      ('MD-WAREHOUSE','WAREHOUSE_COST','WAREHOUSE_REVENUE'),
      ('MD-TRANSPORT','TRANSPORT_COST','TRANSPORT_REVENUE'),
      ('MD-OTHER','OTHER_COST','OTHER_REVENUE')
    ) as x(code,cost_code,revenue_code)
  loop
    select "RATECharge_ID" into strict v_charge from public."RATE_ChargeCodes"
      where "RATECharge_Code"=v_code and "RATECharge_IsActive"
        and "RATECharge_MetadataJSON"#>>'{multideck,standard}'='true';
    select id into strict v_cost from public."FIN_NominalGroups"
      where legal_entity_id=v_entity and code=v_cost_code and kind='cost';
    select id into strict v_revenue from public."FIN_NominalGroups"
      where legal_entity_id=v_entity and code=v_revenue_code and kind='revenue';
    perform public._multideck_validate_nominal_group(v_entity,v_cost,'cost');
    perform public._multideck_validate_nominal_group(v_entity,v_revenue,'revenue');
    if not exists(select 1 from public."FIN_ChargeNominalMappings"
      where legal_entity_id=v_entity and charge_id=v_charge) then
      perform public.multideck_finance_nominal_structure(v_actor,v_entity,'map_charge',
        jsonb_build_object('chargeId',v_charge,'costGroupId',v_cost,
          'revenueGroupId',v_revenue,'version',0));
    end if;
  end loop;
end $standard_demo_mapping$;

commit;
