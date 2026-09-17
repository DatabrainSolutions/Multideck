begin;
-- Legacy contacts can have a known employer without a known employment start date.
alter table public."CRM_ContactOrganisationAssignments" alter column "CRMContactOrg_StartedAt" drop not null;
do $patch$
declare definition text;marker text:=$old$  update public."CRM_ContactOrganisationAssignments"
  set "CRMContactOrg_IsCurrent" = false,$old$;
begin
 definition:=pg_get_functiondef('public.multideck_crm_transfer_contact(uuid,uuid,uuid,bigint,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review legacy contact employment transfer';end if;
 definition:=replace(definition,marker,$new$  -- Preserve the source employer when legacy data has no current history row.
  -- A record-created date is not evidence of an employment start date.
  insert into public."CRM_ContactOrganisationAssignments"(
    "CRMContactOrg_ContactID","CRMContactOrg_OrgID","CRMContactOrg_CompanyID",
    "CRMContactOrg_JobTitle","CRMContactOrg_Department","CRMContactOrg_RoleCode",
    "CRMContactOrg_StartedAt","CRMContactOrg_EndedAt","CRMContactOrg_IsCurrent","CRMContactOrg_CreatedBy"
  ) select p_contact_id,v_contact."Org_ID",source."CRMAccount_CompanyID",
    v_profile."CRMContact_MetadataJSON"->>'jobTitle',v_profile."CRMContact_MetadataJSON"->>'department',v_profile."CRMContact_RoleCode",
    null,v_started-1,false,p_actor_user_id
  from public."CRM_AccountProfiles" source where source."CRMAccount_OrgID"=v_contact."Org_ID" and not source."CRMAccount_IsDeleted"
    and not exists(select 1 from public."CRM_ContactOrganisationAssignments" existing where existing."CRMContactOrg_ContactID"=p_contact_id and existing."CRMContactOrg_IsCurrent")
  order by source."CRMAccount_ID" limit 1;
$new$||marker);
 execute definition;
end $patch$;
commit;
