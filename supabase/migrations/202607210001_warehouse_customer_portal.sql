-- Customer-facing warehouse portal foundation. This migration is idempotent so it can
-- be applied safely to environments that already contain some portal reference data.

insert into public."sys_PortalAccessStatuses"
  ("PortalAccessStatus_Code", "PortalAccessStatus_Name", "PortalAccessStatus_Description", "PortalAccessStatus_IsFinal", "PortalAccessStatus_SortOrder")
values
  ('active', 'Active', 'Access is active.', false, 10),
  ('invited', 'Invited', 'The user has been invited but has not signed in yet.', false, 20),
  ('suspended', 'Suspended', 'Access has been temporarily suspended.', false, 30),
  ('revoked', 'Revoked', 'Access has been revoked.', true, 40)
on conflict ("PortalAccessStatus_Code") do nothing;

insert into public."sys_PortalInvitationStatuses"
  ("PortalInviteStatus_Code", "PortalInviteStatus_Name", "PortalInviteStatus_Description", "PortalInviteStatus_IsFinal", "PortalInviteStatus_SortOrder")
values
  ('invited', 'Invited', 'Invitation has been sent.', false, 10),
  ('accepted', 'Accepted', 'Invitation has been accepted.', true, 20),
  ('expired', 'Expired', 'Invitation has expired.', true, 30),
  ('revoked', 'Revoked', 'Invitation has been revoked.', true, 40)
on conflict ("PortalInviteStatus_Code") do nothing;

insert into public."sys_PortalAudienceTypes"
  ("PortalAudienceType_Code", "PortalAudienceType_Name", "PortalAudienceType_Description", "PortalAudienceType_DefaultRequiresMFA", "PortalAudienceType_SortOrder")
values ('customer', 'Customer', 'External customer users accessing their own organisation records.', false, 10)
on conflict ("PortalAudienceType_Code") do nothing;

insert into public."sys_PortalAuthProviders"
  ("PortalAuthProvider_Code", "PortalAuthProvider_Name", "PortalAuthProvider_Description", "PortalAuthProvider_IsExternal", "PortalAuthProvider_SortOrder")
values ('supabase', 'Supabase Auth', 'Supabase authenticated user identity.', true, 10)
on conflict ("PortalAuthProvider_Code") do nothing;

insert into public."sys_PortalSiteTypes"
  ("PortalSiteType_Code", "PortalSiteType_Name", "PortalSiteType_Description", "PortalSiteType_IsExternal", "PortalSiteType_SortOrder")
values ('warehouse_customer', 'Warehouse customer portal', 'Customer self-service warehouse access.', true, 10)
on conflict ("PortalSiteType_Code") do nothing;

insert into public."sys_PortalPermissionActions"
  ("PortalPermissionAction_Code", "PortalPermissionAction_Name", "PortalPermissionAction_Description", "PortalPermissionAction_IsWriteAction", "PortalPermissionAction_SortOrder")
values
  ('read', 'Read', 'View records in the assigned organisation.', false, 10),
  ('manage', 'Manage', 'Create and update records in the assigned organisation.', true, 20),
  ('create_inbound', 'Create inbound', 'Create inbound warehouse requests.', true, 30),
  ('create_outbound', 'Create outbound', 'Create outbound warehouse requests.', true, 40),
  ('cancel', 'Cancel', 'Cancel an unprocessed own order.', true, 50),
  ('upload', 'Upload', 'Upload supporting documents.', true, 60)
on conflict ("PortalPermissionAction_Code") do nothing;

insert into public."sys_PortalResourceTypes"
  ("PortalResourceType_Code", "PortalResourceType_Name", "PortalResourceType_Description", "PortalResourceType_DefaultRequiresExplicitShare", "PortalResourceType_IsSensitive", "PortalResourceType_SortOrder")
values
  ('warehouse_inventory', 'Warehouse inventory', 'Customer-owned warehouse balances and movements.', false, false, 100),
  ('warehouse_items', 'Warehouse items', 'Customer-owned SKU master records.', false, false, 110),
  ('warehouse_orders', 'Warehouse orders', 'Customer-owned inbound and outbound requests.', false, false, 120),
  ('warehouse_documents', 'Warehouse documents', 'Documents attached to customer warehouse requests.', false, true, 130),
  ('warehouse_users', 'Warehouse users', 'Customer organisation users with access to the warehouse portal.', false, true, 140)
on conflict ("PortalResourceType_Code") do nothing;

insert into public."sys_PortalUploadStatuses"
  ("PortalUploadStatus_Code", "PortalUploadStatus_Name", "PortalUploadStatus_Description", "PortalUploadStatus_IsFinal", "PortalUploadStatus_SortOrder")
values
  ('pending_review', 'Pending review', 'Uploaded and awaiting warehouse review.', false, 10),
  ('accepted', 'Accepted', 'Reviewed and accepted.', true, 20),
  ('rejected', 'Rejected', 'Reviewed and rejected.', true, 30)
on conflict ("PortalUploadStatus_Code") do nothing;

create table if not exists public."WMS_CustomerFacilityAccess" (
  "WMSCustomerFacilityAccess_ID" uuid primary key default gen_random_uuid(),
  "WMSCustomerFacilityAccess_CustomerOrgID" uuid not null references public."Org_Master"("Org_ID") on delete cascade,
  "WMSCustomerFacilityAccess_FacilityID" uuid not null references public."WMS_Facilities"("WMSFacility_ID") on delete cascade,
  "WMSCustomerFacilityAccess_IsActive" boolean not null default true,
  "WMSCustomerFacilityAccess_CreatedAt" timestamp with time zone not null default now(),
  "WMSCustomerFacilityAccess_CreatedBy" uuid null references public."cmp_Users"("User_ID") on delete set null,
  "WMSCustomerFacilityAccess_UpdatedAt" timestamp with time zone not null default now(),
  constraint "WMS_CustomerFacilityAccess_customer_facility_key" unique
    ("WMSCustomerFacilityAccess_CustomerOrgID", "WMSCustomerFacilityAccess_FacilityID")
);

create index if not exists "idx_WMS_CustomerFacilityAccess_facility"
  on public."WMS_CustomerFacilityAccess" ("WMSCustomerFacilityAccess_FacilityID")
  where "WMSCustomerFacilityAccess_IsActive";

alter table public."WMS_CustomerFacilityAccess" enable row level security;

drop policy if exists "Internal users can manage company customer facility access" on public."WMS_CustomerFacilityAccess";
create policy "Internal users can manage company customer facility access"
on public."WMS_CustomerFacilityAccess" for all to authenticated
using (
  exists (
    select 1
    from public."WMS_Facilities" facility
    join public."cmp_Offices" office on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
    join public."cmp_Users" app_user on app_user."Company_ID" = office."Company_ID"
    where facility."WMSFacility_ID" = "WMSCustomerFacilityAccess_FacilityID"
      and app_user."Auth_User_ID" = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public."WMS_Facilities" facility
    join public."cmp_Offices" office on office."Office_ID" = facility."WMSFacility_OrgOfficeID"
    join public."cmp_Users" app_user on app_user."Company_ID" = office."Company_ID"
    where facility."WMSFacility_ID" = "WMSCustomerFacilityAccess_FacilityID"
      and app_user."Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Portal users can read own customer facility access" on public."WMS_CustomerFacilityAccess";
create policy "Portal users can read own customer facility access"
on public."WMS_CustomerFacilityAccess" for select to authenticated
using (
  exists (
    select 1
    from public."Portal_ExternalIdentities" identity_link
    join public."Portal_Users" portal_user on portal_user."PortalUser_ID" = identity_link."PortalIdentity_PortalUserID"
    join public."Portal_UserOrganisations" user_org on user_org."PortalUserOrg_PortalUserID" = portal_user."PortalUser_ID"
    where identity_link."PortalIdentity_ExternalSubject" = (select auth.uid())::text
      and identity_link."PortalIdentity_StatusCode" = 'active'
      and portal_user."PortalUser_StatusCode" = 'active'
      and user_org."PortalUserOrg_StatusCode" = 'active'
      and user_org."PortalUserOrg_OrgID" = "WMSCustomerFacilityAccess_CustomerOrgID"
  )
);
