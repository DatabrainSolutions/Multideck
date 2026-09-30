begin;

create function public.multideck_dexter_domain_accounting_vat_control(p_company_id uuid,p_search text,p_take integer)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with records as (
    select jsonb_build_object('recordId',review.id,'recordKind','accounting_vat_control_review',
      'status','prepared','periodId',review.period_id,'sourceDigest',review.source_digest,
      'lineCount',review.inventory->'lineCount','openingExcludedLines',review.inventory->'openingExcludedLines',
      'evidence',jsonb_build_object('sourceTable','FIN_AccountingVatControlReviews','sourceId',review.id,
        'legalEntityId',review.legal_entity_id,'updatedAt',review.prepared_at)) value,review.prepared_at updated_at
    from public."FIN_AccountingVatControlReviews" review
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=review.legal_entity_id
    join public."FIN_Periods" period on period."FINPeriod_ID"=review.period_id
    where entity."Company_ID"=p_company_id
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',period."FINPeriod_Code",period."FINPeriod_Name",review.id) ilike '%'||btrim(p_search)||'%')
    union all
    select jsonb_build_object('recordId',approval.id,'recordKind','accounting_vat_control_approval',
      'status','approved','periodId',approval.period_id,'reviewId',approval.review_id,
      'sourceDigest',approval.source_digest,
      'evidence',jsonb_build_object('sourceTable','FIN_AccountingVatControlApprovals','sourceId',approval.id,
        'legalEntityId',approval.legal_entity_id,'updatedAt',approval.approved_at)),approval.approved_at
    from public."FIN_AccountingVatControlApprovals" approval
    join public."cmp_LegalEntities" entity on entity."LegalEntity_ID"=approval.legal_entity_id
    join public."FIN_Periods" period on period."FINPeriod_ID"=approval.period_id
    where entity."Company_ID"=p_company_id
      and (nullif(btrim(p_search),'') is null or concat_ws(' ',period."FINPeriod_Code",period."FINPeriod_Name",approval.id) ilike '%'||btrim(p_search)||'%')
  ) select coalesce(jsonb_agg(value order by updated_at desc),'[]'::jsonb)
    from (select * from records order by updated_at desc limit greatest(1,least(coalesce(p_take,10),25))) limited;
$$;
revoke all on function public.multideck_dexter_domain_accounting_vat_control(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_accounting_vat_control(uuid,text,integer) to service_role;

insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON") values
  ('accounting_vat_control','Accounting-period VAT control',
    'Signed monthly accounting VAT review and approval evidence. A VAT return review is a separate control; a saved approval can become stale after source changes.',
    'multideck_dexter_domain_accounting_vat_control','["Finance.Management.View","Finance.Compliance.View"]','["financial_record"]');
insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name",
  "AIDexterWatchCapability_Description","AIDexterWatchCapability_FieldsJSON",
  "AIDexterWatchCapability_RequiredPermissionsJSON") values
  ('accounting_vat_control','Accounting-period VAT control',
    'A prepared or approved monthly VAT control is recorded for one accounting period. Source changes without a new record require an on-demand recheck.',
    '["status","sourceDigest"]','["Finance.Management.View","Finance.Compliance.View"]');

create function public._multideck_dexter_accounting_vat_control_watch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_company uuid; v_state jsonb;
begin
  select "Company_ID" into v_company from public."cmp_LegalEntities" where "LegalEntity_ID"=new.legal_entity_id;
  if tg_table_name='FIN_AccountingVatControlReviews' then
    v_state:=jsonb_build_object('status','prepared','sourceDigest',new.source_digest,'reviewId',new.id);
  else
    v_state:=jsonb_build_object('status','approved','sourceDigest',new.source_digest,'approvalId',new.id,'reviewId',new.review_id);
  end if;
  if v_company is not null and exists(select 1 from public."AI_DexterWatches" w
    join public."cmp_Users" u on u."User_ID"=w."AIDexterWatch_OwnerUserID"
    where w."AIDexterWatch_CompanyID"=v_company and u."Company_ID"=v_company and u."User_AccessStatus"='active'
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Management.View')
      and public._multideck_dexter_has_permission(u."User_ID",'Finance.Compliance.View')
      and w."AIDexterWatch_CapabilityCode"='accounting_vat_control' and w."AIDexterWatch_StatusCode"='active'
      and (w."AIDexterWatch_TargetID" is null or w."AIDexterWatch_TargetID"=new.period_id)) then
    insert into public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID","AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable","AIDexterWatchSignal_SourceID","AIDexterWatchSignal_OldJSON","AIDexterWatchSignal_NewJSON")
      values(v_company,'accounting_vat_control',tg_table_name,new.period_id,null,v_state);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_dexter_accounting_vat_control_watch() from public,anon,authenticated;
create trigger accounting_vat_review_dexter_watch after insert on public."FIN_AccountingVatControlReviews"
  for each row execute function public._multideck_dexter_accounting_vat_control_watch();
create trigger accounting_vat_approval_dexter_watch after insert on public."FIN_AccountingVatControlApprovals"
  for each row execute function public._multideck_dexter_accounting_vat_control_watch();

commit;
