begin;
set local statement_timeout = '15s';

do $$
declare
  v_entity constant uuid := 'a8e98266-f5f4-4620-b45a-e3d991a38209';
  v_company constant uuid := 'a0ee9891-f144-48ff-980f-5eea3526a3fc';
  v_actor constant uuid := 'c38b47bc-2ea6-472b-ae28-318a66abf0d5';
  v_batches constant text[] := array['JN-2','JN-3','NATIVE-RCPT-000001','NATIVE-SI-000002','NATIVE-SI-000003'];
  v_before jsonb;
  v_journals jsonb;
  v_count integer;
begin
  if not exists (select 1 from public."cmp_Company" where "Company_ID"=v_company and "Company_Name"='Databrain Test')
    or not exists (select 1 from public."cmp_LegalEntities" where "LegalEntity_ID"=v_entity and "Company_ID"=v_company and "LegalEntity_Name"='Databrain Test' and "LegalEntity_IsActive")
    or not exists (select 1 from public."cmp_Users" where "User_ID"=v_actor and "Company_ID"=v_company and "User_AccessStatus"='active') then
    raise exception 'The expected Databrain Test legal entity and operator were not found.';
  end if;
  if exists (select 1 from public."Audit_Events" where "AuditEvent_LegalEntityID"=v_entity and "AuditEvent_Action"='rebuild_demo_nominals') then
    raise exception 'These demo postings have already been rebuilt.';
  end if;
  if (select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=v_entity and "FINPostBatch_StatusCode"='posted') <> 5
    or (select count(*) from public."FIN_PostingBatches" where "FINPostBatch_LegalEntityID"=v_entity and "FINPostBatch_StatusCode"='posted' and "FINPostBatch_Number"=any(v_batches)) <> 5 then
    raise exception 'The posted batch inventory has changed; review before rebuilding.';
  end if;

  create temporary table chart_rebuild_map on commit drop as
    select old."FINNom_ID" old_id,new."FINNom_ID" new_id,
      old."FINNom_Code" old_code,new."FINNom_Code" new_code,
      new."FINNom_Name" new_name
    from (values
      ('1000','6110.10.10'),('1100','6210.00.00'),('1300','6410.00.00'),
      ('4000','1010.10.10'),('5050','1200.20.10')
    ) m(old_code,new_code)
    join public."FIN_NominalAccounts" old on old."FINNom_LegalEntityID"=v_entity and old."FINNom_Code"=m.old_code
    join public."FIN_NominalAccounts" new on new."FINNom_LegalEntityID"=v_entity and new."FINNom_Code"=m.new_code
    where not old."FINNom_IsActive" and new."FINNom_IsActive"
      and old."FINNom_ReportCategoryCode"=new."FINNom_ReportCategoryCode";
  if (select count(*) from chart_rebuild_map)<>5 then
    raise exception 'The old-to-new nominal map is incomplete or changes financial statement classification.';
  end if;

  select count(*) into v_count
    from public."FIN_PostingLines" l
    join public."FIN_PostingBatches" b on b."FINPostBatch_ID"=l."FINPostLine_BatchID"
    join chart_rebuild_map m on m.old_id=l."FINPostLine_NominalAccountID"
    where b."FINPostBatch_LegalEntityID"=v_entity and b."FINPostBatch_Number"=any(v_batches);
  if v_count<>12 or (select count(*) from public."FIN_PostingLines" l
      join public."FIN_PostingBatches" b on b."FINPostBatch_ID"=l."FINPostLine_BatchID"
      where b."FINPostBatch_LegalEntityID"=v_entity and b."FINPostBatch_Number"=any(v_batches))<>12 then
    raise exception 'The demo posting lines changed or contain an unmapped nominal.';
  end if;

  select jsonb_agg(jsonb_build_object('batch',to_jsonb(b),'lines',(
    select jsonb_agg(to_jsonb(l) order by l."FINPostLine_LineNo")
    from public."FIN_PostingLines" l where l."FINPostLine_BatchID"=b."FINPostBatch_ID"
  )) order by b."FINPostBatch_Number") into v_before
  from public."FIN_PostingBatches" b
  where b."FINPostBatch_LegalEntityID"=v_entity and b."FINPostBatch_Number"=any(v_batches);
  select jsonb_agg(to_jsonb(j) order by j.number) into v_journals
    from public."FIN_Journals" j where j.legal_entity_id=v_entity and j.status='posted';
  if jsonb_array_length(coalesce(v_journals,'[]'::jsonb))<>2 then
    raise exception 'The posted journal inventory has changed.';
  end if;

  insert into public."Audit_Events"(
    "AuditEvent_EventTypeCode","AuditEvent_UserID","AuditEvent_LegalEntityID",
    "AuditEvent_SourceApp","AuditEvent_SourceModule","AuditEvent_SourceTableSchema",
    "AuditEvent_SourceTableName","AuditEvent_RecordTypeCode","AuditEvent_RecordID",
    "AuditEvent_Action","AuditEvent_Title","AuditEvent_Reason",
    "AuditEvent_HasFieldChanges","AuditEvent_ChangedFieldCount","AuditEvent_MetadataJSON"
  ) values (
    'finance_lifecycle',v_actor,v_entity,'multideck-app','finance','public',
    'FIN_PostingBatches','finance_configuration',v_entity,'rebuild_demo_nominals',
    'Databrain Test demo postings rebuilt on the freight chart',
    'One-time test-data nominal migration requested by the product owner; original posted values retained in audit',
    true,12,jsonb_build_object('beforePostingBatches',v_before,'beforePostedJournals',v_journals,
      'nominalMap',(select jsonb_agg(to_jsonb(m) order by old_code) from chart_rebuild_map m))
  );

  update public."FIN_PostingLines" l
    set "FINPostLine_NominalAccountID"=m.new_id
    from chart_rebuild_map m,public."FIN_PostingBatches" b
    where l."FINPostLine_NominalAccountID"=m.old_id
      and l."FINPostLine_BatchID"=b."FINPostBatch_ID"
      and b."FINPostBatch_LegalEntityID"=v_entity and b."FINPostBatch_Number"=any(v_batches);
  get diagnostics v_count = row_count;
  if v_count<>12 then raise exception 'Expected to rebuild exactly 12 posting lines, rebuilt %.',v_count; end if;

  update public."FIN_Journals" j set
    lines=(select jsonb_agg(jsonb_set(jsonb_set(line.value,'{accountId}',to_jsonb(m.new_id::text)),
      '{description}',to_jsonb(m.new_name)) order by line.ordinality)
      from jsonb_array_elements(j.lines) with ordinality line(value,ordinality)
      join chart_rebuild_map m on m.old_id=(line.value->>'accountId')::uuid),
    version=j.version+1
    where j.legal_entity_id=v_entity and j.status='posted' and j.number in (2,3);
  get diagnostics v_count = row_count;
  if v_count<>2 then raise exception 'Expected to rebuild exactly two posted journal source records, rebuilt %.',v_count; end if;
end $$;

commit;
