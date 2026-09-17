begin;
do $patch$
declare definition text;marker text:=$old$'contactId', contact."OrgContact_ID",$old$;
begin
 definition:=pg_get_functiondef('public.multideck_dexter_domain_customers(uuid,text,integer)'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review contact evidence projection';end if;
 definition:=replace(definition,marker,marker||$new$
        'recordId',contact."OrgContact_ID",'sourceTable','Org_Contacts',
        'organisationId',organisation."Org_id",'organisationName',organisation."Org_Name",
        'editVersion',(select p."CRMContact_EditVersion" from public."CRM_ContactProfiles" p where p."CRMContact_OrgContactID"=contact."OrgContact_ID" order by p."CRMContact_ID" limit 1),
        'role',(select p."CRMContact_RoleCode" from public."CRM_ContactProfiles" p where p."CRMContact_OrgContactID"=contact."OrgContact_ID" order by p."CRMContact_ID" limit 1),
        'jobTitle',(select p."CRMContact_MetadataJSON"->>'jobTitle' from public."CRM_ContactProfiles" p where p."CRMContact_OrgContactID"=contact."OrgContact_ID" order by p."CRMContact_ID" limit 1),
        'department',(select p."CRMContact_MetadataJSON"->>'department' from public."CRM_ContactProfiles" p where p."CRMContact_OrgContactID"=contact."OrgContact_ID" order by p."CRMContact_ID" limit 1),
$new$);
 execute definition;
end $patch$;
commit;
