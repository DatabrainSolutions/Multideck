-- Fix warehouse customer invitations by matching the full unique key on
-- Portal_UserOrganisations. Also allow a retry to recover the Supabase Auth
-- identity created before an earlier portal upsert failed.
-- Dexter parity: this is a repair to the existing warehouse-user invitation
-- transaction, not a new readable domain or record-change capability. It adds no
-- new watch signal, and existing warehouse watches remain event-driven.

create or replace function public.warehouse_edge_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select auth_user.id
  from auth.users auth_user
  where lower(auth_user.email) = lower(trim(p_email))
  order by auth_user.created_at
  limit 1;
$$;

revoke all on function public.warehouse_edge_auth_user_id_by_email(text) from public,anon,authenticated;
grant execute on function public.warehouse_edge_auth_user_id_by_email(text) to service_role;

create or replace function public.warehouse_edge_portal_mutation(p_action text,p_customer_org_id uuid,p_portal_user_id uuid,p_payload jsonb,p_actor_user_id uuid,p_actor_portal_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user_id uuid:=p_portal_user_id; v_role_id uuid; v_site_id uuid; v_role_code text:=lower(trim(p_payload->>'roleCode')); v_email text:=lower(trim(p_payload->>'email')); v_facilities uuid[]; v_result jsonb; v_now timestamptz:=now(); v_invited boolean:=false;
begin
  if p_action in ('invite','update') and v_role_code not in ('warehouse_viewer','warehouse_operator','warehouse_customer_admin') then raise exception 'WMS400: Choose a valid warehouse customer role.'; end if;
  select "PortalSite_ID" into v_site_id from public."Portal_Sites" where "PortalSite_SiteTypeCode"='warehouse_customer' and "PortalSite_IsActive" and not "PortalSite_IsDeleted" order by "PortalSite_CreatedAt" limit 1;
  if v_site_id is null then
    v_site_id:=gen_random_uuid(); insert into public."Portal_Sites" ("PortalSite_ID","PortalSite_Code","PortalSite_Name","PortalSite_Description","PortalSite_SiteTypeCode","PortalSite_DefaultAudienceTypeCode","PortalSite_DefaultLanguageCode","PortalSite_DefaultTimeZone","PortalSite_AllowedAuthMethodsJSON","PortalSite_FieldPolicyJSON","PortalSite_FeatureFlagsJSON","PortalSite_IsActive","PortalSite_CreatedAt","PortalSite_CreatedBy","PortalSite_UpdatedAt","PortalSite_UpdatedBy","PortalSite_IsDeleted") values(v_site_id,'warehouse-'||replace(gen_random_uuid()::text,'-',''),'Warehouse customer portal','Customer self-service inventory and warehouse requests.','warehouse_customer','customer','en-GB','UTC','["password","magic_link"]','{}','{"warehouse":true}',true,v_now,p_actor_user_id,v_now,p_actor_user_id,false);
  end if;
  select "PortalRole_ID" into v_role_id from public."Portal_Roles" where "PortalRole_SiteID"=v_site_id and "PortalRole_Code"=v_role_code limit 1;
  if v_role_id is null and p_action in ('invite','update') then v_role_id:=gen_random_uuid(); insert into public."Portal_Roles" ("PortalRole_ID","PortalRole_SiteID","PortalRole_Code","PortalRole_Name","PortalRole_Description","PortalRole_AudienceTypeCode","PortalRole_IsSystemRole","PortalRole_IsEnabled","PortalRole_CreatedAt","PortalRole_CreatedBy") values(v_role_id,v_site_id,v_role_code,replace(initcap(replace(v_role_code,'_',' ')),'Warehouse Warehouse','Warehouse'),'Warehouse customer access.','customer',true,true,v_now,p_actor_user_id); end if;
  if p_action in ('invite','update') then
    insert into public."Portal_RolePermissions" ("PortalRolePerm_ID","PortalRolePerm_RoleID","PortalRolePerm_ResourceTypeCode","PortalRolePerm_ActionCode","PortalRolePerm_IsAllowed","PortalRolePerm_RequiresExplicitShare","PortalRolePerm_RequiresInternalReview","PortalRolePerm_FieldAllowListJSON","PortalRolePerm_FieldDenyListJSON","PortalRolePerm_CreatedAt")
    select gen_random_uuid(),v_role_id,grant_row.resource_code,grant_row.action_code,true,false,false,'[]','[]',v_now
    from (values
      ('warehouse_inventory','read','warehouse_viewer'),('warehouse_items','read','warehouse_viewer'),('warehouse_orders','read','warehouse_viewer'),
      ('warehouse_inventory','read','warehouse_operator'),('warehouse_items','read','warehouse_operator'),('warehouse_items','manage','warehouse_operator'),('warehouse_orders','read','warehouse_operator'),('warehouse_orders','create_inbound','warehouse_operator'),('warehouse_orders','create_outbound','warehouse_operator'),('warehouse_orders','cancel','warehouse_operator'),('warehouse_documents','upload','warehouse_operator'),
      ('warehouse_inventory','read','warehouse_customer_admin'),('warehouse_items','read','warehouse_customer_admin'),('warehouse_items','manage','warehouse_customer_admin'),('warehouse_orders','read','warehouse_customer_admin'),('warehouse_orders','create_inbound','warehouse_customer_admin'),('warehouse_orders','create_outbound','warehouse_customer_admin'),('warehouse_orders','cancel','warehouse_customer_admin'),('warehouse_documents','upload','warehouse_customer_admin'),('warehouse_users','manage','warehouse_customer_admin')
    ) grant_row(resource_code,action_code,role_code)
    where grant_row.role_code=v_role_code and not exists(select 1 from public."Portal_RolePermissions" existing where existing."PortalRolePerm_RoleID"=v_role_id and existing."PortalRolePerm_ResourceTypeCode"=grant_row.resource_code and existing."PortalRolePerm_ActionCode"=grant_row.action_code);
  end if;
  if p_action='invite' then
    if v_email is null or position('@' in v_email)=0 then raise exception 'WMS400: Enter a valid customer email address.'; end if;
    select "PortalUser_ID" into v_user_id from public."Portal_Users" where lower("PortalUser_Email")=v_email limit 1;
    if v_user_id is null then
      if nullif(p_payload->>'authUserId','') is null then raise exception 'WMS409: The Supabase invitation did not return a user identity.'; end if;
      v_user_id:=gen_random_uuid(); v_invited:=true;
      insert into public."Portal_Users" ("PortalUser_ID","PortalUser_DefaultSiteID","PortalUser_AudienceTypeCode","PortalUser_StatusCode","PortalUser_PrimaryOrgID","PortalUser_DisplayName","PortalUser_Email","PortalUser_PreferredLanguageCode","PortalUser_MFARequired","PortalUser_FailedLoginCount","PortalUser_ValidFrom","PortalUser_PreferencesJSON","PortalUser_CreatedAt","PortalUser_CreatedBy","PortalUser_UpdatedAt","PortalUser_UpdatedBy","PortalUser_IsDeleted") values(v_user_id,v_site_id,'customer','active',p_customer_org_id,coalesce(nullif(trim(p_payload->>'displayName'),''),v_email),v_email,'en-GB',false,0,v_now,'{}',v_now,p_actor_user_id,v_now,p_actor_user_id,false);
      insert into public."Portal_ExternalIdentities" ("PortalIdentity_ID","PortalIdentity_PortalUserID","PortalIdentity_AuthProviderCode","PortalIdentity_ExternalSubject","PortalIdentity_ExternalUsername","PortalIdentity_EmailSnapshot","PortalIdentity_StatusCode","PortalIdentity_MetadataJSON","PortalIdentity_CreatedAt","PortalIdentity_UpdatedAt") values(gen_random_uuid(),v_user_id,'supabase',p_payload->>'authUserId',v_email,v_email,'active','{}',v_now,v_now);
    end if;
  elsif p_action='revoke' then
    if v_user_id=p_actor_portal_user_id then raise exception 'WMS400: You cannot revoke your own portal access.'; end if;
    update public."Portal_UserOrganisations" set "PortalUserOrg_StatusCode"='revoked' where "PortalUserOrg_PortalUserID"=v_user_id and "PortalUserOrg_OrgID"=p_customer_org_id;
    update public."Portal_UserRoles" set "PortalUserRole_StatusCode"='revoked' where "PortalUserRole_PortalUserID"=v_user_id and "PortalUserRole_OrgID"=p_customer_org_id;
    return null;
  end if;
  if v_user_id is null then raise exception 'WMS400: This customer portal user does not exist.'; end if;
  insert into public."Portal_UserOrganisations" ("PortalUserOrg_ID","PortalUserOrg_PortalUserID","PortalUserOrg_OrgID","PortalUserOrg_AudienceTypeCode","PortalUserOrg_StatusCode","PortalUserOrg_IsPrimary","PortalUserOrg_CanManageOrgUsers","PortalUserOrg_FieldPolicyJSON","PortalUserOrg_CreatedAt","PortalUserOrg_CreatedBy") values(gen_random_uuid(),v_user_id,p_customer_org_id,'customer','active',true,v_role_code='warehouse_customer_admin','{}',v_now,p_actor_user_id) on conflict ("PortalUserOrg_PortalUserID","PortalUserOrg_OrgID","PortalUserOrg_AudienceTypeCode") do update set "PortalUserOrg_StatusCode"='active',"PortalUserOrg_CanManageOrgUsers"=excluded."PortalUserOrg_CanManageOrgUsers";
  update public."Portal_UserRoles" set "PortalUserRole_StatusCode"='revoked' where "PortalUserRole_PortalUserID"=v_user_id and "PortalUserRole_OrgID"=p_customer_org_id;
  insert into public."Portal_UserRoles" ("PortalUserRole_ID","PortalUserRole_PortalUserID","PortalUserRole_RoleID","PortalUserRole_SiteID","PortalUserRole_OrgID","PortalUserRole_StatusCode","PortalUserRole_ValidFrom","PortalUserRole_AssignedAt","PortalUserRole_AssignedBy") values(gen_random_uuid(),v_user_id,v_role_id,v_site_id,p_customer_org_id,'active',v_now,v_now,p_actor_user_id);
  if p_actor_user_id is not null and jsonb_typeof(p_payload->'facilityIds')='array' then
    select array_agg(value::uuid) into v_facilities from jsonb_array_elements_text(p_payload->'facilityIds'); if coalesce(array_length(v_facilities,1),0)=0 then raise exception 'WMS400: Choose at least one warehouse for this customer.'; end if;
    update public."WMS_CustomerFacilityAccess" set "WMSCustomerFacilityAccess_IsActive"=("WMSCustomerFacilityAccess_FacilityID"=any(v_facilities)),"WMSCustomerFacilityAccess_UpdatedAt"=v_now where "WMSCustomerFacilityAccess_CustomerOrgID"=p_customer_org_id;
    insert into public."WMS_CustomerFacilityAccess" ("WMSCustomerFacilityAccess_ID","WMSCustomerFacilityAccess_CustomerOrgID","WMSCustomerFacilityAccess_FacilityID","WMSCustomerFacilityAccess_IsActive","WMSCustomerFacilityAccess_CreatedAt","WMSCustomerFacilityAccess_CreatedBy","WMSCustomerFacilityAccess_UpdatedAt") select gen_random_uuid(),p_customer_org_id,f,true,v_now,p_actor_user_id,v_now from unnest(v_facilities) f on conflict ("WMSCustomerFacilityAccess_CustomerOrgID","WMSCustomerFacilityAccess_FacilityID") do update set "WMSCustomerFacilityAccess_IsActive"=true,"WMSCustomerFacilityAccess_UpdatedAt"=v_now;
  end if;
  select public.warehouse_edge_portal_users(p_customer_org_id) into v_result;
  select value into v_result from jsonb_array_elements(v_result) where value->>'id'=v_user_id::text limit 1;
  return case when p_action='invite' then jsonb_build_object('user',v_result,'invited',v_invited) else v_result end;
end; $$;

revoke all on function public.warehouse_edge_portal_mutation(text,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.warehouse_edge_portal_mutation(text,uuid,uuid,jsonb,uuid,uuid) to service_role;
