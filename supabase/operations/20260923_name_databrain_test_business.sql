begin;

do $$
declare
  v_company constant uuid := 'a0ee9891-f144-48ff-980f-5eea3526a3fc';
  v_entity constant uuid := 'a8e98266-f5f4-4620-b45a-e3d991a38209';
  v_actor constant uuid := 'c38b47bc-2ea6-472b-ae28-318a66abf0d5';
  v_old_company text;
  v_old_entity text;
begin
  select "Company_Name" into v_old_company from public."cmp_Company"
    where "Company_ID"=v_company for update;
  select "LegalEntity_Name" into v_old_entity from public."cmp_LegalEntities"
    where "LegalEntity_ID"=v_entity and "Company_ID"=v_company and "LegalEntity_IsActive" for update;
  if v_old_company is distinct from 'Demo Organisation 021'
    or v_old_entity is distinct from 'Demo Organisation 021'
    or not exists (select 1 from public."cmp_Users" where "User_ID"=v_actor
      and "Company_ID"=v_company and "User_AccessStatus"='active') then
    raise exception 'The expected Databrain test business and active operator were not found.';
  end if;

  update public."cmp_Company" set "Company_Name"='Databrain Test'
    where "Company_ID"=v_company;
  update public."cmp_LegalEntities" set "LegalEntity_Name"='Databrain Test',
    "LegalEntity_UpdatedAt"=now(),"LegalEntity_UpdatedBy"=v_actor
    where "LegalEntity_ID"=v_entity and "Company_ID"=v_company;

  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason",
    "AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle',v_actor,v_entity,'multideck-app','finance','public',
    'cmp_Company','finance_configuration',v_company,
    'rename_business','Tenant business renamed to Databrain Test',
    'User-requested name for the Databrain test business',true,2,
    jsonb_build_object('previousCompanyName',v_old_company,'newCompanyName','Databrain Test',
      'previousLegalEntityName',v_old_entity,'newLegalEntityName','Databrain Test',
      'legalEntityId',v_entity)
  );
end $$;

commit;
