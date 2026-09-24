-- One-time, entity-scoped demo cutover for the MultiDeck test project.
-- Run only after verifying the target project and the two identity assertions.
-- Historical postings remain immutable; this changes future posting defaults.
begin;

do $$
declare
  v_entity uuid;
  v_company uuid;
  v_actor uuid;
  v_template uuid;
  v_charge uuid;
  v_cost_group uuid;
  v_revenue_group uuid;
  v_group record;
  v_expected integer;
  v_result jsonb;
begin
  select e."LegalEntity_ID",e."Company_ID" into v_entity,v_company
    from public."cmp_LegalEntities" e
    where e."LegalEntity_Name"='Demo Organisation 021' and e."LegalEntity_IsActive";
  if v_entity is null or (select count(*) from public."cmp_LegalEntities" where "LegalEntity_Name"='Demo Organisation 021')<>1 then
    raise exception 'Expected exactly one active Demo Organisation 021.';
  end if;
  select "User_ID" into v_actor from public."cmp_Users"
    where "Company_ID"=v_company and lower("User_Email")='andrew@databrain.solutions' and "User_AccessStatus"='active';
  if v_actor is null then raise exception 'Expected the named active finance operator in the same company.'; end if;
  perform public._multideck_journal_access(v_actor,v_entity,'Finance.Configuration.Manage');
  select "FINChartTemplate_ID" into v_template from public."FIN_ChartTemplates"
    where "FINChartTemplate_Code"='freight-accrual-v1' and "FINChartTemplate_IsActive";
  if v_template is null then raise exception 'The freight actual/accrued chart template is missing.'; end if;
  select count(*) into v_expected from public."FIN_ChartTemplateAccounts"
    where "FINChartTemplateAccount_TemplateID"=v_template;
  if v_expected<>43 then raise exception 'Expected 43 reviewed starter nominals; found %.',v_expected; end if;

  insert into public."FIN_NominalAccounts"(
    "FINNom_Code","FINNom_Name","FINNom_AccountTypeCode","FINNom_ReportCategoryCode",
    "FINNom_LegalEntityID","FINNom_IsControlAccount","FINNom_ControlTypeCode",
    "FINNom_AllowManualPosting","FINNom_IsActive","FINNom_CreatedBy","FINNom_UpdatedBy")
  select t."FINChartTemplateAccount_Code",t."FINChartTemplateAccount_Name",
    t."FINChartTemplateAccount_TypeCode",t."FINChartTemplateAccount_CategoryCode",
    v_entity,t."FINChartTemplateAccount_IsControlAccount",
    case when t."FINChartTemplateAccount_IsControlAccount" then
      case t."FINChartTemplateAccount_Code"
        when '6110.10.10' then 'bank_gbp' when '6110.10.40' then 'bank_eur'
        when '6110.10.50' then 'bank_usd' when '6210.00.00' then 'trade_receivables'
        when '8210.00.00' then 'trade_payables' when '6240.00.00' then 'work_in_progress'
        when '8410.10.00' then 'job_cost_accrual' else 'balance_sheet_control' end
      else null end,
    not t."FINChartTemplateAccount_IsControlAccount",true,v_actor,v_actor
  from public."FIN_ChartTemplateAccounts" t
  where t."FINChartTemplateAccount_TemplateID"=v_template
  on conflict ("FINNom_LegalEntityID","FINNom_Code") do nothing;
  if (select count(*) from public."FIN_NominalAccounts"
      where "FINNom_LegalEntityID"=v_entity and "FINNom_Code" in
        (select "FINChartTemplateAccount_Code" from public."FIN_ChartTemplateAccounts"
         where "FINChartTemplateAccount_TemplateID"=v_template) and "FINNom_IsActive")<>v_expected then
    raise exception 'The active tenant chart does not match the template account count.';
  end if;

  for v_group in select * from (values
    ('FREIGHT_COST','Freight costs','cost','8410.10.00','1010.20.10','1010.20.20'),
    ('FREIGHT_REVENUE','Freight revenue','revenue','6240.00.00','1010.10.10','1010.10.20'),
    ('AGENCY_COST','Agency costs','cost','8410.10.00','1020.20.10','1020.20.20'),
    ('AGENCY_REVENUE','Agency revenue','revenue','6240.00.00','1020.10.10','1020.10.20'),
    ('PORT_COST','Port and terminal costs','cost','8410.10.00','1030.20.10','1030.20.20'),
    ('PORT_REVENUE','Port and terminal revenue','revenue','6240.00.00','1030.10.10','1030.10.20'),
    ('DOCUMENT_COST','Documentation costs','cost','8410.10.00','1040.20.10','1040.20.20'),
    ('DOCUMENT_REVENUE','Documentation revenue','revenue','6240.00.00','1040.10.10','1040.10.20'),
    ('WAREHOUSE_COST','Warehouse costs','cost','8410.10.00','1200.20.10','1200.20.20'),
    ('WAREHOUSE_REVENUE','Warehouse revenue','revenue','6240.00.00','1200.10.10','1200.10.20'),
    ('TRANSPORT_COST','Transport costs','cost','8410.10.00','1300.20.10','1300.20.20'),
    ('TRANSPORT_REVENUE','Transport revenue','revenue','6240.00.00','1300.10.10','1300.10.20'),
    ('OTHER_COST','Other service costs','cost','8410.10.00','1110.20.10','1110.20.20'),
    ('OTHER_REVENUE','Other service revenue','revenue','6240.00.00','1110.10.10','1110.10.20')
  ) as x(code,name,kind,control_code,actual_code,accrued_code) loop
    if not exists(select 1 from public."FIN_NominalGroups"
      where legal_entity_id=v_entity and code=v_group.code) then
      v_result:=public.multideck_finance_nominal_structure(v_actor,v_entity,'create_group',jsonb_build_object(
        'code',v_group.code,'name',v_group.name,'kind',v_group.kind,
        'controlAccountId',(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"=v_group.control_code),
        'actualAccountId',(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"=v_group.actual_code),
        'accruedAccountId',(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"=v_group.accrued_code)));
    end if;
  end loop;
  if (select count(*) from public."FIN_NominalGroups" where legal_entity_id=v_entity)<>14 then
    raise exception 'Expected 14 paired nominal groups.';
  end if;

  select "RATECharge_ID" into v_charge from public."RATE_ChargeCodes"
    where "RATECharge_Code"='MULTIDECK-DEMO' and "RATECharge_IsActive";
  if v_charge is null then raise exception 'The existing demo charge code is missing.'; end if;
  select id into v_cost_group from public."FIN_NominalGroups" where legal_entity_id=v_entity and code='FREIGHT_COST';
  select id into v_revenue_group from public."FIN_NominalGroups" where legal_entity_id=v_entity and code='FREIGHT_REVENUE';
  if not exists(select 1 from public."FIN_ChargeNominalMappings" where legal_entity_id=v_entity and charge_id=v_charge) then
    v_result:=public.multideck_finance_nominal_structure(v_actor,v_entity,'map_charge',jsonb_build_object(
      'chargeId',v_charge,'costGroupId',v_cost_group,'revenueGroupId',v_revenue_group,'version',0));
  end if;

  update public."FIN_BankAccounts" b set "FINBank_NominalAccountID"=n."FINNom_ID",
    "FINBank_UpdatedAt"=now(),"FINBank_UpdatedBy"=v_actor
  from public."FIN_NominalAccounts" n
  where b."FINBank_LegalEntityID"=v_entity and n."FINNom_LegalEntityID"=v_entity
    and n."FINNom_Code"=case b."FINBank_CurrencyCode"
      when 'GBP' then '6110.10.10' when 'EUR' then '6110.10.40'
      when 'USD' then '6110.10.50' else null end;
  if exists(select 1 from public."FIN_BankAccounts" b left join public."FIN_NominalAccounts" n
    on n."FINNom_ID"=b."FINBank_NominalAccountID"
    where b."FINBank_LegalEntityID"=v_entity and b."FINBank_IsActive"
      and n."FINNom_Code" is distinct from case b."FINBank_CurrencyCode"
        when 'GBP' then '6110.10.10' when 'EUR' then '6110.10.40'
        when 'USD' then '6110.10.50' else null end) then
    raise exception 'An active bank could not be mapped to its currency-specific nominal.';
  end if;

  update public."FIN_TaxCodes" t set
    "FINTax_OutputNominalID"=(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"='8310.00.00'),
    "FINTax_InputNominalID"=(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"='6310.00.00')
  where t."FINTax_LegalEntityID"=v_entity;

  -- Existing demo job estimates had generic old accounts and no managed code.
  -- The historical posted journal lines are not rewritten.
  update public."Job_Costing_Lines" j set
    "JobCostingLine_ChargeCodeID"=coalesce(j."JobCostingLine_ChargeCodeID",v_charge),
    "JobCostingLine_CostNominalAccountID"=(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"='1010.20.10'),
    "JobCostingLine_RevenueNominalAccountID"=(select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"='1010.10.10')
  from public."Job_Header" h
  where h."Job_ID"=j."Job_ID" and lower(h."Job_Status") not in ('draft','provisional')
    and public._multideck_finance_resolve_job_legal_entity(j."Job_ID")=v_entity
    and (j."JobCostingLine_CostNominalAccountID" is not null or j."JobCostingLine_RevenueNominalAccountID" is not null)
    and (j."JobCostingLine_CostNominalAccountID" is distinct from
       (select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"='1010.20.10')
      or j."JobCostingLine_RevenueNominalAccountID" is distinct from
       (select "FINNom_ID" from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and "FINNom_Code"='1010.10.10'));

  update public."FIN_NominalAccounts" set "FINNom_IsActive"=false,"FINNom_AllowManualPosting"=false,
    "FINNom_UpdatedAt"=now(),"FINNom_UpdatedBy"=v_actor
  where "FINNom_LegalEntityID"=v_entity and "FINNom_Code" !~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$'
    and "FINNom_IsActive";

  insert into public."Audit_Events"("AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema","AuditEvent_SourceTableName",
    "AuditEvent_RecordTypeCode","AuditEvent_RecordID","AuditEvent_Action","AuditEvent_Title",
    "AuditEvent_Reason","AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON")
  values('finance_lifecycle',v_actor,v_entity,'multideck-app','finance','public','FIN_NominalAccounts',
    'finance_configuration',v_entity,'activate_freight_chart','Freight actual/accrued chart activated',
    'Approved demo finance chart cutover; historical postings retained until linked sandbox entries are retired',
    true,43,jsonb_build_object('template','freight-accrual-v1','activeNominals',43,'nominalGroups',14,
      'legacyAccountsDisabled',(select count(*) from public."FIN_NominalAccounts" where "FINNom_LegalEntityID"=v_entity and not "FINNom_IsActive")));
end $$;

commit;
